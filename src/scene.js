import { evaluateParam } from './core/params.js';
import { computeBounds, mat3Identity, mat3Multiply, mat3Rotate, mat3Scale, mat3Translate } from './core/math.js';
import { evaluatePrimitiveGeometry } from './core/geometry.js';
import { evaluateTransform, transformPoints } from './core/transform.js';
import { topologicalSort, detectsCycle } from './core/graph.js';

/**
 * Scene model and render-time evaluation.
 */

// ... (typedefs unchanged) ...

// ... (renderScene unchanged except imports) ...

// ... (helpers) ...

/**
 * Returns a flat list of objects sorted by Rank (Execution Order).
 * @param {Scene} scene
 * @returns {SceneObject[]}
 */
export function getSortedExecutionOrder(scene) {
  const getId = (o) => o.id;

  const getDependencies = (obj) => {
    const inputs = [];
    // Check Generators inputs
    const gen = scene.generators ? scene.generators.find(g => g.outputIds && g.outputIds.includes(obj.id)) : null;
    if (gen && gen.inputIds) {
      inputs.push(...gen.inputIds);
    }
    // Future: Check property refs
    return inputs;
  };

  return topologicalSort(scene.objects, getId, getDependencies);
}

/**
 * Validates if connection A -> B is valid (Cycle check).
 * @param {Scene} scene
 * @param {string} inputId
 * @param {string} targetId
 * @returns {boolean}
 */
export function validateConnection(scene, inputId, targetId) {
  const getDependenciesById = (id) => {
    const obj = scene.objects.find(o => o.id === id);
    if (!obj) return [];

    const inputs = [];
    const gen = scene.generators ? scene.generators.find(g => g.outputIds && g.outputIds.includes(id)) : null;
    if (gen && gen.inputIds) {
      inputs.push(...gen.inputIds);
    }
    return inputs;
  };

  // Check if adding dependency Target depends on Input (inputId -> targetId) creates a cycle.
  // detectsCycle returns TRUE if cycle detected.
  return !detectsCycle(inputId, targetId, getDependenciesById);
}

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
// Helpers for sorting/validation kept here as they operate on Scene structure.
// Rendering logic moved to system/evaluator.js.

