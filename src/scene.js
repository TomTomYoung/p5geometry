import { evaluateParam } from './params.js';
import { computeBounds, mat3Identity, mat3Multiply, mat3Rotate, mat3Scale, mat3Translate } from './math.js';
import { evaluatePrimitiveGeometry } from './geometry.js';
import { evaluateTransform, transformPoints } from './transform.js';

/**
 * Scene model and render-time evaluation.
 */

/** @typedef {{id:string, kind:'font'|'image'|'palette', source:string, loadState?:'pending'|'ready'|'error', metadata?:object}} Asset */

/** @typedef {{strokeColor?: string, strokeWidth?: number, fillColor?: string, fillEnabled?: boolean, blendMode?: string, alpha?: number, join?: string, cap?: string}} StyleSpec */

/** @typedef {{type:'attach', id:string, targets:{parentId:string, childId:string}, params:{offset?: import('./params.js').Param<{x:number,y:number}>, inheritRotation?: boolean, inheritScale?: boolean}, enabled?: boolean}} AttachRelation */
/** @typedef {{type:'align', id:string, targets:{aId:string, bId:string}, params:{anchor?: 'center'|'topLeft'|'baseline'}, enabled?: boolean}} AlignRelation */
/** @typedef {{type:'followPath', id:string, targets:{objectId:string, pathId:string}, params:{u: import('./params.js').Param<number>, tangentAlign?: boolean}, enabled?: boolean}} FollowPathRelation */
/** @typedef {{type:'repeat', id:string, targets:{objectId:string}, params:{count:number, deltaTransform?: import('./transform.js').TransformSpec, indexParam?: import('./params.js').Param<number>}, enabled?: boolean}} RepeatRelation */
/** @typedef {{type:'tile', id:string, targets:{unitCellId:string, latticeId:string}, params?: object, enabled?: boolean}} TileRelation */

/** @typedef {AttachRelation|AlignRelation|FollowPathRelation|RepeatRelation|TileRelation} Relation */

/** @typedef {{id:string, type:'instance', inputIds:string[], params:{transforms:Array<import('./transform.js').TransformSpec>}, seed?: number, outputIds?: string[]}} InstanceGenerator */
/** @typedef {{id:string, type:'grid', params:{a:{x:number,y:number}, b:{x:number,y:number}, range:{i:[number,number], j:[number,number]}, cellTransform?: import('./transform.js').TransformSpec}, outputIds?: string[]}} GridGenerator */
/** @typedef {{id:string, type:'radial', params:{count:number, radius:number, angleRange:[number,number], center?:{x:number,y:number}}, outputIds?: string[]}} RadialGenerator */
/** @typedef {{id:string, type:'subdivide', params:{}, outputIds?: string[]}} SubdivideGenerator */

/** @typedef {InstanceGenerator|GridGenerator|RadialGenerator|SubdivideGenerator} Generator */

/** @typedef {{id:string, type:'affine', inputRefs:string[], params:{transform: import('./transform.js').TransformSpec, mode?: 'geometry'|'raster'}, outputRef:string, enabled?: boolean, cachePolicy?:'none'|'perT'|'manual', stageName?:string}} AffineOperator */
/** @typedef {{id:string, type:'rasterize', inputRefs:string[], params:{resolution?:{width:number,height:number}, aa?:number, threshold?:number}, outputRef:string, enabled?: boolean, cachePolicy?:'none'|'perT'|'manual', stageName?:string}} RasterizeOperator */
/** @typedef {{id:string, type:'threshold', inputRefs:string[], params:{threshold:number, mode?:'luma'|'alpha'}, outputRef:string, enabled?: boolean, cachePolicy?:'none'|'perT'|'manual', stageName?:string}} ThresholdOperator */
/** @typedef {{id:string, type:'erode'|'dilate', inputRefs:string[], params:{radius:number, iterations?:number, kernel?:'diamond'|'square'}, outputRef:string, enabled?: boolean, cachePolicy?:'none'|'perT'|'manual', stageName?:string}} MorphOperator */
/** @typedef {{id:string, type:'boolean', inputRefs:string[], params:{operation:'union'|'intersect'|'diff'}, outputRef:string, enabled?: boolean, cachePolicy?:'none'|'perT'|'manual', stageName?:string}} BooleanOperator */

/** @typedef {AffineOperator|RasterizeOperator|ThresholdOperator|MorphOperator|BooleanOperator} Operator */

/** @typedef {{width?: number, height?: number, background?: string, transparent?: boolean}} RenderConfig */

/**
 * @typedef {import('./geometry.js').SceneObject & {style?: StyleSpec}} SceneObject
 */

/**
 * @typedef {{objects: SceneObject[], relations?: Relation[], generators?: Generator[], operators?: Operator[], assets?: Asset[], renderConfig?: RenderConfig, timeline?: {t:number}}} Scene
 */

/**
 * @typedef {{objectId:string, geometry?: import('./geometry.js').EvaluatedGeometry, raster?: import('./geometry.js').EvaluatedRaster, style?: StyleSpec, warnings?: string[]}} EvaluatedObject
 */

/**
 * @typedef {{objects: EvaluatedObject[], warnings: string[], config: RenderConfig}} RenderResult
 */

/**
 * Core render entry point following the specification outline.
 * @param {Scene} scene
 * @param {number} t
 * @param {RenderConfig} [overrideConfig]
 * @returns {RenderResult}
 */
export function renderScene(scene, t, overrideConfig) {
  const warnings = [];
  const config = { ...(scene.renderConfig || {}), ...(overrideConfig || {}) };
  const assetsReady = resolveAssets(scene.assets || [], warnings);
  const objects = expandGenerators(scene.generators || [], scene.objects || [], t, warnings);
  const relations = scene.relations || [];
  applyRelations(objects, relations, t, warnings);
  const evaluatedObjects = evaluateObjects(objects, t, assetsReady, warnings);
  const operatorResults = evaluateOperators(scene.operators || [], evaluatedObjects, t, warnings);
  const mergedObjects = mergeOperatorResults(evaluatedObjects, operatorResults);
  return { objects: mergedObjects, warnings, config };
}

/**
 * Marks assets as ready/placeholder; no network fetch to keep environment safe.
 * @param {Asset[]} assets
 * @param {string[]} warnings
 * @returns {Record<string, Asset>}
 */
function resolveAssets(assets, warnings) {
  const map = {};
  for (const asset of assets) {
    if (asset.loadState === 'error') {
      warnings.push(`Asset ${asset.id} failed to load`);
    }
    map[asset.id] = { ...asset, loadState: asset.loadState || 'ready' };
  }
  return map;
}

/**
 * Applies relations to mutate object transforms or derived geometry.
 * @param {SceneObject[]} objects
 * @param {Relation[]} relations
 * @param {number} t
 * @param {string[]} warnings
 */
function applyRelations(objects, relations, t, warnings) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const relation of relations) {
    if (relation.enabled === false) continue;
    switch (relation.type) {
      case 'attach':
        handleAttachRelation(/** @type {AttachRelation} */(relation), byId, t, warnings);
        break;
      case 'align':
        handleAlignRelation(/** @type {AlignRelation} */(relation), byId, t, warnings);
        break;
      case 'followPath':
        handleFollowPathRelation(/** @type {FollowPathRelation} */(relation), byId, t, warnings);
        break;
      case 'repeat':
        handleRepeatRelation(/** @type {RepeatRelation} */(relation), byId, objects, t, warnings);
        break;
      default:
        warnings.push(`Relation ${relation.id} of type ${relation.type} is not yet implemented`);
        break;
    }
  }
}

/**
 * Expands generators into concrete objects (handful of minimal implementations).
 * @param {Generator[]} generators
 * @param {SceneObject[]} baseObjects
 * @param {number} t
 * @param {string[]} warnings
 * @returns {SceneObject[]}
 */
function expandGenerators(generators, baseObjects, t, warnings) {
  const objects = [...baseObjects];
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const generator of generators) {
    switch (generator.type) {
      case 'instance':
        expandInstanceGenerator(generator, byId, objects, t, warnings);
        break;
      case 'grid':
        expandGridGenerator(generator, byId, objects, t, warnings);
        break;
      case 'radial':
        expandRadialGenerator(generator, byId, objects, t, warnings);
        break;
      default:
        warnings.push(`Generator ${generator.id} (${generator.type}) not implemented`);
        break;
    }
  }
  return objects;
}

function expandInstanceGenerator(generator, byId, objects, t, warnings) {
  const sourceId = generator.inputIds[0];
  const source = byId.get(sourceId);
  if (!source) {
    warnings.push(`InstanceGenerator ${generator.id} missing source ${sourceId}`);
    return;
  }
  if (!generator.params?.transforms || generator.params.transforms.length === 0) {
    warnings.push(`InstanceGenerator ${generator.id} has no transforms`);
    return;
  }
  const baseMatrix = evaluateTransform(source.transform, t);
  generator.params.transforms.forEach((tr, index) => {
    const instMatrix = evaluateTransform(tr, t);
    const composed = mat3Multiply(baseMatrix, instMatrix);
    const clone = cloneObject(source, `${source.id}__inst_${generator.id}_${index}`);
    clone.transform = { matrix: { type: 'constant', value: composed } };
    clone.generatedBy = generator.id;
    objects.push(clone);
    byId.set(clone.id, clone);
  });
}

function expandGridGenerator(generator, byId, objects, t, warnings) {
  if (!generator.params || !generator.params.a || !generator.params.b || !generator.params.range) {
    warnings.push(`GridGenerator ${generator.id} missing required params`);
    return;
  }
  const sourceId = generator.params?.sourceId || generator.inputIds?.[0];
  const source = sourceId ? byId.get(sourceId) : undefined;
  if (!source) {
    warnings.push(`GridGenerator ${generator.id} missing source`);
    return;
  }
  const { a, b, range, cellTransform } = generator.params;
  const baseMatrix = evaluateTransform(source.transform, t);
  const cellBase = cellTransform ? evaluateTransform(cellTransform, t) : mat3Identity();
  for (let i = range.i[0]; i <= range.i[1]; i += 1) {
    for (let j = range.j[0]; j <= range.j[1]; j += 1) {
      const translate = evaluateTransform(
        { translate: { type: 'constant', value: { x: a.x * i + b.x * j, y: a.y * i + b.y * j } } },
        t,
      );
      const composed = mat3Multiply(baseMatrix, mat3Multiply(translate, cellBase));
      const clone = cloneObject(source, `${source.id}__grid_${generator.id}_${i}_${j}`);
      clone.transform = { matrix: { type: 'constant', value: composed } };
      clone.generatedBy = generator.id;
      objects.push(clone);
      byId.set(clone.id, clone);
    }
  }
}

function expandRadialGenerator(generator, byId, objects, t, warnings) {
  if (!generator.params || typeof generator.params.count !== 'number' || typeof generator.params.radius !== 'number') {
    warnings.push(`RadialGenerator ${generator.id} missing count or radius`);
    return;
  }
  const sourceId = generator.params?.sourceId || generator.inputIds?.[0];
  const source = sourceId ? byId.get(sourceId) : undefined;
  if (!source) {
    warnings.push(`RadialGenerator ${generator.id} missing source`);
    return;
  }
  const { count, radius, angleRange, center = { x: 0, y: 0 } } = generator.params;
  const baseMatrix = evaluateTransform(source.transform, t);
  const [start, end] = angleRange || [0, Math.PI * 2];
  const step = count > 1 ? (end - start) / (count - 1) : 0;
  for (let i = 0; i < count; i += 1) {
    const angle = start + step * i;
    const translate = {
      translate: {
        type: 'constant',
        value: { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius },
      },
    };
    const instMat = evaluateTransform(translate, t);
    const composed = mat3Multiply(baseMatrix, instMat);
    const clone = cloneObject(source, `${source.id}__radial_${generator.id}_${i}`);
    clone.transform = { matrix: { type: 'constant', value: composed } };
    clone.generatedBy = generator.id;
    objects.push(clone);
    byId.set(clone.id, clone);
  }
}

function cloneObject(object, newId) {
  const clone = JSON.parse(JSON.stringify(object));
  clone.id = newId;
  return clone;
}

/**
 * @param {AttachRelation} relation
 * @param {Map<string, SceneObject>} byId
 * @param {number} t
 * @param {string[]} warnings
 */
function handleAttachRelation(relation, byId, t, warnings) {
  const parent = byId.get(relation.targets.parentId);
  const child = byId.get(relation.targets.childId);
  if (!parent || !child) {
    warnings.push(`Attach relation ${relation.id} missing parent/child`);
    return;
  }
  const parentMatrix = evaluateTransform(parent.transform, t);
  const offset = relation.params.offset ? evaluateParam(relation.params.offset, t) : { x: 0, y: 0 };
  const offsetMat = evaluateTransform({ translate: { type: 'constant', value: offset } }, t);
  const effectiveParent = composeInheritedParent(parentMatrix, relation.params);
  child.transform = { matrix: { type: 'constant', value: matMultiplySafe(effectiveParent, offsetMat, relation) } };
}

/**
 * @param {AlignRelation} relation
 * @param {Map<string, SceneObject>} byId
 * @param {number} t
 * @param {string[]} warnings
 */
function handleAlignRelation(relation, byId, t, warnings) {
  const a = byId.get(relation.targets.aId);
  const b = byId.get(relation.targets.bId);
  if (!a || !b) {
    warnings.push(`Align relation ${relation.id} missing targets`);
    return;
  }
  if (a.kind !== 'primitive' || b.kind !== 'primitive') {
    warnings.push(`Align relation ${relation.id} currently supports primitive objects only`);
    return;
  }
  const aEval = evaluatePrimitiveGeometry(a.geometry, a.transform, t);
  const bEval = evaluatePrimitiveGeometry(b.geometry, b.transform, t);
  if (!aEval.bounds || !bEval.bounds) return;
  const anchor = relation.params.anchor || 'center';
  const aAnchor = anchorPoint(aEval.bounds, anchor);
  const bAnchor = anchorPoint(bEval.bounds, anchor);
  const delta = { x: bAnchor.x - aAnchor.x, y: bAnchor.y - aAnchor.y };
  const current = evaluateTransform(a.transform, t);
  const offsetMat = evaluateTransform({ translate: { type: 'constant', value: delta } }, t);
  a.transform = { matrix: { type: 'constant', value: matMultiplySafe(current, offsetMat, relation) } };
}

/**
 * @param {FollowPathRelation} relation
 * @param {Map<string, SceneObject>} byId
 * @param {number} t
 * @param {string[]} warnings
 */
function handleFollowPathRelation(relation, byId, t, warnings) {
  const obj = byId.get(relation.targets.objectId);
  const path = byId.get(relation.targets.pathId);
  if (!obj || !path) {
    warnings.push(`FollowPath relation ${relation.id} missing object or path`);
    return;
  }
  if (path.kind !== 'primitive' || (path.geometry.type !== 'polyline' && path.geometry.type !== 'polygon')) {
    warnings.push(`FollowPath ${relation.id} requires a polyline/polygon path`);
    return;
  }
  const pathEval = evaluatePrimitiveGeometry(path.geometry, path.transform, t);
  if (!pathEval.points.length) return;
  const u = evaluateParam(relation.params.u, t);
  const clampedU = Math.max(0, Math.min(1, u));
  const targetPoint = pointAlongPath(pathEval.points, clampedU);
  const baseTransform = evaluateTransform(obj.transform, t);
  let composed = baseTransform;
  if (relation.params.tangentAlign) {
    const direction = tangentDirection(pathEval.points, clampedU);
    const angle = Math.atan2(direction.y, direction.x);
    composed = mat3Multiply(composed, mat3Rotate(angle));
  }
  const translate = evaluateTransform({ translate: { type: 'constant', value: targetPoint } }, t);
  composed = matMultiplySafe(composed, translate, relation);
  obj.transform = { matrix: { type: 'constant', value: composed } };
}

/**
 * @param {RepeatRelation} relation
 * @param {Map<string, SceneObject>} byId
 * @param {SceneObject[]} objects
 * @param {number} t
 * @param {string[]} warnings
 */
function handleRepeatRelation(relation, byId, objects, t, warnings) {
  const obj = byId.get(relation.targets.objectId);
  if (!obj) {
    warnings.push(`Repeat relation ${relation.id} missing target`);
    return;
  }
  const count = Math.max(1, relation.params.count || 1);
  const delta = relation.params.deltaTransform ? evaluateTransform(relation.params.deltaTransform, t) : mat3Identity();
  let current = evaluateTransform(obj.transform, t);
  for (let i = 1; i < count; i += 1) {
    current = mat3Multiply(current, delta);
    const clone = cloneObject(obj, `${obj.id}__repeat_${relation.id}_${i}`);
    clone.transform = { matrix: { type: 'constant', value: current } };
    clone.generatedBy = relation.id;
    objects.push(clone);
    byId.set(clone.id, clone);
  }
}

function composeInheritedParent(parentMatrix, params) {
  const inheritRotation = params.inheritRotation !== false;
  const inheritScale = params.inheritScale !== false;
  if (inheritRotation && inheritScale) return parentMatrix;
  const tx = parentMatrix[6];
  const ty = parentMatrix[7];
  const baseTranslate = mat3Translate(tx, ty);
  if (!inheritRotation && !inheritScale) {
    return baseTranslate;
  }
  const sx = Math.hypot(parentMatrix[0], parentMatrix[1]) || 1;
  const sy = Math.hypot(parentMatrix[3], parentMatrix[4]) || 1;
  const angle = Math.atan2(parentMatrix[1], parentMatrix[0]);
  let composed = baseTranslate;
  if (inheritRotation) {
    composed = mat3Multiply(composed, mat3Rotate(angle));
  }
  if (inheritScale) {
    composed = mat3Multiply(composed, mat3Scale(sx, sy));
  }
  return composed;
}

function anchorPoint(bounds, anchor) {
  switch (anchor) {
    case 'topLeft':
      return { x: bounds.min.x, y: bounds.min.y };
    default:
      return { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  }
}

function pointAlongPath(points, u) {
  if (points.length === 1) return points[0];
  const segments = points.length - 1;
  const scaled = u * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const localT = scaled - idx;
  const p0 = points[idx];
  const p1 = points[idx + 1];
  return { x: p0.x + (p1.x - p0.x) * localT, y: p0.y + (p1.y - p0.y) * localT };
}

function tangentDirection(points, u) {
  if (points.length === 1) return { x: 1, y: 0 };
  const segments = points.length - 1;
  const scaled = u * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const nextIdx = Math.min(idx + 1, points.length - 1);
  const p0 = points[idx];
  const p1 = points[nextIdx];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

/**
 * @param {SceneObject[]} objects
 * @param {number} t
 * @param {Record<string, Asset>} assets
 * @param {string[]} warnings
 * @returns {EvaluatedObject[]}
 */
function evaluateObjects(objects, t, assets, warnings) {
  const evaluated = [];
  for (const obj of objects) {
    if (obj.visibility === false) continue;
    if (obj.kind === 'primitive') {
      evaluated.push({ objectId: obj.id, geometry: evaluatePrimitiveGeometry(obj.geometry, obj.transform, t), style: obj.style });
    } else if (obj.kind === 'text') {
      const asset = assets[obj.geometry.fontAssetId];
      if (!asset || asset.loadState !== 'ready') {
        warnings.push(`Text object ${obj.id} missing font asset ${obj.geometry.fontAssetId}`);
        continue;
      }
      // Represent text as a bounding box placeholder using rect geometry.
      const size = obj.geometry.size || 16;
      const length = 'text' in obj.geometry ? obj.geometry.text.length : 1;
      const placeholder = evaluatePrimitiveGeometry({ type: 'rect', width: size * 0.6 * length, height: size }, obj.transform, t);
      evaluated.push({ objectId: obj.id, geometry: placeholder, style: obj.style, warnings: ['Text rendering placeholder'] });
    } else {
      warnings.push(`Object ${obj.id} of kind ${obj.kind} evaluation not implemented`);
    }
  }
  return evaluated;
}

/**
 * Calculates the rank of each object in the scene based on dependencies.
 * Rank 0: No dependencies (Constants).
 * Rank N: Max(Dependency Ranks) + 1.
 * @param {Scene} scene
 * @returns {Map<string, number>} Map of object ID to Rank
 */
export function calculateGraphRanks(scene) {
  const ranks = new Map();
  const processing = new Set(); // For cycle detection

  // Helper to get inputs of an object (this logic needs to be robust for all types)
  function getInputs(obj) {
    const inputs = [];
    // 1. Generators (if the object IS a generator or produced by one? Currently objects are just objects)
    // Wait, generators in this architecture are separate entities that Produce objects.
    // But for v0.9 simplified, let's assume objects might verify references in their properties.
    // For now, let's look at Generators list and see if this object is an output.
    // Actually, the dependency graph is mainly for Generators and Operators.
    // Objects themselves are mostly data unless they reference others.

    // Let's check Generators inputs
    const gen = scene.generators ? scene.generators.find(g => g.outputIds && g.outputIds.includes(obj.id)) : null;
    if (gen && gen.inputIds) {
      inputs.push(...gen.inputIds);
    }

    // Also check direct property references (Phase 4), but for now mainly Generators.
    return inputs;
  }

  function visit(id) {
    if (ranks.has(id)) return ranks.get(id);
    if (processing.has(id)) {
      console.warn(`Cycle detected involving object ${id}`);
      return Infinity; // Cycle detected
    }

    processing.add(id);

    const obj = scene.objects.find(o => o.id === id);
    if (!obj) {
      processing.delete(id);
      return 0; // External or missing? Treat as 0 for now.
    }

    const inputIds = getInputs(obj);
    let maxRank = -1;

    for (const inputId of inputIds) {
      const r = visit(inputId);
      if (r > maxRank) maxRank = r;
    }

    const rank = maxRank + 1;
    ranks.set(id, rank);
    processing.delete(id);
    return rank;
  }

  for (const obj of scene.objects) {
    visit(obj.id);
  }

  return ranks;
}

/**
 * Returns a flat list of objects sorted by Rank (Execution Order).
 * @param {Scene} scene
 * @returns {SceneObject[]}
 */
export function getSortedExecutionOrder(scene) {
  const ranks = calculateGraphRanks(scene);

  // Sort logic: Rank ascending. Stable sort for same rank.
  // Create a copy to sort
  const sorted = [...scene.objects].sort((a, b) => {
    const ra = ranks.get(a.id) || 0;
    const rb = ranks.get(b.id) || 0;
    return ra - rb;
  });

  return sorted;
}

/**
 * Validates if connection A -> B is valid (Cycle check).
 * @param {Scene} scene
 * @param {string} inputId
 * @param {string} targetId
 * @returns {boolean}
 */
export function validateConnection(scene, inputId, targetId) {
  // Determine ranks if we were to connect.
  // Actually, simpler: Does targetId (or its dependents) depend on inputId?
  // If targetId is an ancestor of inputId, then inputId->targetId creates a cycle.

  // Perform a reverse search from inputId: does it reach targetId?
  // Wait, we want to connect Input -> Target.
  // Cycle happens if Target reaches Input.

  // Build adjacency list for traversal
  const adj = new Map();
  // Populate adj from generators
  if (scene.generators) {
    for (const gen of scene.generators) {
      if (!gen.outputIds) continue;
      for (const outId of gen.outputIds) {
        // Out depends on In
        if (!adj.has(outId)) adj.set(outId, []);
        // Add inputs as parents (dependency)
        // Actually let's track "Depends On" (Child -> Parent)
        // outId -> [inId1, inId2...]
        if (gen.inputIds) {
          adj.get(outId).push(...gen.inputIds);
        }
      }
    }
  }

  // BFS/DFS from inputId? No, we want to know if Target depends on Input. 
  // Wait, if we add Input -> Target.
  // Cycle if Target is ALREADY an ancestor of Input.
  // Check if Input depends on Target.

  const visited = new Set();
  const stack = [inputId]; // Start from Input

  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr === targetId) return false; // Found Target in Input's ancestry

    if (visited.has(curr)) continue;
    visited.add(curr);

    const parents = adj.get(curr) || [];
    for (const p of parents) {
      stack.push(p);
    }
  }

  return true;
}

/**
 * @param {Operator[]} operators
 * @param {EvaluatedObject[]} objects
 * @param {number} t
 * @param {string[]} warnings
 * @returns {Record<string, import('./geometry.js').EvaluationResult>}
 */
function evaluateOperators(operators, objects, t, warnings) {
  const outputs = {};
  const byId = new Map(objects.map((o) => [o.objectId, o]));
  for (const op of operators) {
    if (op.enabled === false) continue;
    const inputs = op.inputRefs.map((ref) => outputs[ref] || byId.get(ref));
    if (inputs.some((i) => !i)) {
      warnings.push(`Operator ${op.id} missing inputs`);
      continue;
    }
    switch (op.type) {
      case 'affine':
        outputs[op.outputRef] = evaluateAffineOperator(/** @type {AffineOperator} */(op), inputs, t);
        break;
      case 'threshold':
        outputs[op.outputRef] = evaluateThresholdOperator(/** @type {ThresholdOperator} */(op), inputs);
        break;
      case 'rasterize':
        outputs[op.outputRef] = evaluateRasterizeOperator(/** @type {RasterizeOperator} */(op), inputs);
        break;
      case 'erode':
      case 'dilate':
        outputs[op.outputRef] = evaluateMorphOperator(/** @type {MorphOperator} */(op), inputs, op.type === 'erode');
        break;
      default:
        warnings.push(`Operator ${op.id} (${op.type}) not implemented`);
        break;
    }
  }
  return outputs;
}

/**
 * @param {AffineOperator} op
 * @param {any[]} inputs
 * @param {number} t
 * @returns {import('./geometry.js').EvaluationResult}
 */
function evaluateAffineOperator(op, inputs, t) {
  const transform = evaluateTransform(op.params.transform, t);
  const input = inputs[0];
  if (input.geometry) {
    const transformedPoints = transformPoints(transform, input.geometry.points);
    const transformed = { ...input.geometry, points: transformedPoints, bounds: computeBounds(transformedPoints) };
    return { type: 'geometry', geometry: transformed };
  }
  if (input.raster) {
    return { type: 'raster', raster: input.raster }; // placeholder for raster transforms
  }
  return { type: 'geometry', geometry: { type: 'polyline', points: [], bounds: null } };
}

/**
 * @param {ThresholdOperator} op
 * @param {any[]} inputs
 * @returns {import('./geometry.js').EvaluationResult}
 */
function evaluateThresholdOperator(op, inputs) {
  const input = inputs[0];
  if (!input.raster) return input;
  const { width, height, pixels } = input.raster;
  const out = new Uint8ClampedArray(pixels.length);
  const threshold = op.params.threshold;
  for (let i = 0; i < pixels.length; i += 1) {
    out[i] = pixels[i] >= threshold ? 255 : 0;
  }
  return { type: 'raster', raster: { width, height, pixels: out, channel: 'alpha' } };
}

/**
 * @param {RasterizeOperator} op
 * @param {any[]} inputs
 * @returns {import('./geometry.js').EvaluationResult}
 */
function evaluateRasterizeOperator(op, inputs) {
  const input = inputs[0];
  if (!input.geometry) return input;
  const bounds = input.geometry.bounds || { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
  const width = op.params.resolution?.width || 64;
  const height = op.params.resolution?.height || 64;
  const pixels = new Uint8ClampedArray(width * height);
  const minX = bounds.min.x;
  const minY = bounds.min.y;
  const maxX = bounds.max.x;
  const maxY = bounds.max.y;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const wx = minX + ((maxX - minX) * x) / Math.max(1, width - 1);
      const wy = minY + ((maxY - minY) * y) / Math.max(1, height - 1);
      const inside = pointInsideGeometry({ x: wx, y: wy }, input.geometry);
      pixels[y * width + x] = inside ? 255 : 0;
    }
  }
  return { type: 'raster', raster: { width, height, pixels, channel: 'alpha', meta: { source: input.geometry.type } } };
}

/**
 * @param {MorphOperator} op
 * @param {any[]} inputs
 * @param {boolean} erode
 * @returns {import('./geometry.js').EvaluationResult}
 */
function evaluateMorphOperator(op, inputs, erode) {
  const input = inputs[0];
  if (!input.raster) return input;
  const { width, height, pixels } = input.raster;
  const out = new Uint8ClampedArray(pixels.length);
  const radius = Math.max(1, Math.floor(op.params.radius));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let extreme = erode ? 255 : 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const value = pixels[ny * width + nx];
          if (erode) extreme = Math.min(extreme, value);
          else extreme = Math.max(extreme, value);
        }
      }
      out[y * width + x] = extreme;
    }
  }
  return { type: 'raster', raster: { width, height, pixels: out, channel: input.raster.channel } };
}

function pointInsideGeometry(point, geometry) {
  switch (geometry.type) {
    case 'circle':
      return isPointInPolygon(point, geometry.points);
    case 'rect':
    case 'polygon':
    case 'polyline':
    case 'line':
      return isPointInPolygon(point, geometry.points);
    case 'point':
      return Math.abs(point.x) < 1e-6 && Math.abs(point.y) < 1e-6;
    default:
      return false;
  }
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function matMultiplySafe(a, b, relation) {
  try {
    return [
      a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
      a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
      a[2] * b[0] + a[5] * b[1] + a[8] * b[2],
      a[0] * b[3] + a[3] * b[4] + a[6] * b[5],
      a[1] * b[3] + a[4] * b[4] + a[7] * b[5],
      a[2] * b[3] + a[5] * b[4] + a[8] * b[5],
      a[0] * b[6] + a[3] * b[7] + a[6] * b[8],
      a[1] * b[6] + a[4] * b[7] + a[7] * b[8],
      a[2] * b[6] + a[5] * b[7] + a[8] * b[8],
    ];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to compose matrix for relation ${relation.id}`, error);
    return a;
  }
}

/**
 * @param {EvaluatedObject[]} baseObjects
 * @param {Record<string, import('./geometry.js').EvaluationResult>} operatorResults
 * @returns {EvaluatedObject[]}
 */
function mergeOperatorResults(baseObjects, operatorResults) {
  const merged = [...baseObjects];
  for (const [id, result] of Object.entries(operatorResults)) {
    const existing = merged.find((o) => o.objectId === id);
    if (existing) {
      if (result.type === 'geometry') existing.geometry = result.geometry;
      else existing.raster = result.raster;
    } else {
      merged.push({ objectId: id, geometry: result.type === 'geometry' ? result.geometry : undefined, raster: result.type === 'raster' ? result.raster : undefined });
    }
  }
  return merged;
}
