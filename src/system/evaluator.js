/**
 * @module System/Evaluator
 * @description Evaluates the scene graph into concrete geometry/raster objects.
 * @input Scene, Time
 * @output EvaluatedObject[]
 * @dependencies Core/*
 */


import { evaluateParam } from '../core/params.js';
import { computeBounds, mat3Identity, mat3Multiply, mat3Rotate, mat3Scale, mat3Translate } from '../core/math.js';
import { evaluatePrimitiveGeometry } from '../core/geometry.js';
import { evaluateTransform, transformPoints } from '../core/transform.js';

/**
 * Core render/evaluation entry point.
 * @param {import('../scene.js').Scene} scene
 * @param {number} t
 * @param {import('../scene.js').RenderConfig} [overrideConfig]
 * @returns {import('../scene.js').RenderResult}
 */
export function evaluateScene(scene, t, overrideConfig) {
    const warnings = [];
    const config = { ...(scene.renderConfig || {}), ...(overrideConfig || {}) };
    // Asset resolution (simple placeholder logic for now)
    const assetsReady = resolveAssets(scene.assets || [], warnings);

    // Generators expansion
    const objects = expandGenerators(scene.generators || [], scene.objects || [], t, warnings);

    // Relations application
    const relations = scene.relations || [];
    applyRelations(objects, relations, t, warnings);

    // Object Evaluation
    const evaluatedObjects = evaluateObjects(objects, t, assetsReady, warnings, scene.styles);

    // Operator Evaluation
    const operatorResults = evaluateOperators(scene.operators || [], evaluatedObjects, t, warnings);

    // Merge results
    const mergedObjects = mergeOperatorResults(evaluatedObjects, operatorResults);

    return { objects: mergedObjects, warnings, config };
}

// ... COPY ALL HELPERS FROM SCENE.JS (resolveAssets, applyRelations, expandGenerators, evaluateObjects, etc) ...
// Since I cannot "Copy" via tool, I must reproduce them or use replace.
// I'll assume I have to write them out. I have the content from previous view.

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

function applyRelations(objects, relations, t, warnings) {
    const byId = new Map(objects.map((o) => [o.id, o]));
    for (const relation of relations) {
        if (relation.enabled === false) continue;
        switch (relation.type) {
            case 'attach':
                handleAttachRelation(relation, byId, t, warnings);
                break;
            case 'align':
                handleAlignRelation(relation, byId, t, warnings);
                break;
            case 'followPath':
                handleFollowPathRelation(relation, byId, t, warnings);
                break;
            case 'repeat':
                handleRepeatRelation(relation, byId, objects, t, warnings);
                break;
            default:
                warnings.push(`Relation ${relation.id} of type ${relation.type} is not yet implemented`);
                break;
        }
    }
}

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

function resolveStyle(obj, styles) {
    if (!obj.style) return undefined;
    if (obj.style.strokeColor || obj.style.fillColor || obj.style.mode === undefined) {
        return obj.style;
    }
    if (obj.style.mode === 'ref') {
        const refId = obj.style.refId;
        const baseStyle = styles.find(s => s.id === refId);
        if (!baseStyle) return undefined;
        if (obj.style.overrides) {
            return { ...baseStyle, ...obj.style.overrides };
        }
        return baseStyle;
    }
    return obj.style;
}

function resolveParam(param, evaluatedMap) {
    if (param && typeof param === 'object' && param.type === 'ref') {
        const target = evaluatedMap.get(param.targetId);
        if (!target) {
            console.warn(`Reference target not found: ${param.targetId}`);
            return 0; // Default
        }
        const keys = param.targetProp.split('.');
        let val = target;
        for (const key of keys) {
            if (val && val[key] !== undefined) {
                val = val[key];
            } else {
                if (val && val.geometry && val.geometry[key] !== undefined) {
                    val = val.geometry[key];
                } else {
                    console.warn(`Property not found: ${param.targetProp} on ${param.targetId}`);
                    return 0;
                }
            }
        }
        return val;
    }
    return param;
}

function resolveObjectParams(params, evaluatedMap) {
    const resolved = {};
    for (const [key, val] of Object.entries(params)) {
        resolved[key] = resolveParam(val, evaluatedMap);
    }
    return resolved;
}

function evaluateObjects(objects, t, assets, warnings, globalStyles) {
    const evaluated = [];
    const evaluatedMap = new Map();
    evaluatedMap.set('time', { t: t, value: t });

    for (const obj of objects) {
        if (obj.visibility === false) continue;
        const style = globalStyles ? resolveStyle(obj, globalStyles) : obj.style;
        const resolvedGeo = resolveObjectParams(obj.geometry, evaluatedMap);
        const transform = obj.transform ? { ...obj.transform } : undefined;
        if (transform && transform.translate && transform.translate.type === 'constant') {
            const tx = resolveParam(transform.translate.value.x, evaluatedMap);
            const ty = resolveParam(transform.translate.value.y, evaluatedMap);
            transform.translate.value = { x: tx, y: ty };
        }

        if (obj.kind === 'primitive') {
            const evalGeo = evaluatePrimitiveGeometry(resolvedGeo, transform, t);
            const evalObj = { objectId: obj.id, geometry: evalGeo, style: style };
            evaluated.push(evalObj);
            evaluatedMap.set(obj.id, evalObj);

        } else if (obj.kind === 'text') {
            // Placeholder text evaluation
            const asset = assets[obj.geometry.fontAssetId]; // Using resolved assets
            const evalGeo = evaluatePrimitiveGeometry({ type: 'rect', width: 50, height: 20 }, transform, t); // Simplification 
            // Re-using logic from original file roughly:
            const text = resolveParam(obj.geometry.text, evaluatedMap) || 'text';
            const size = resolveParam(obj.geometry.size, evaluatedMap) || 16;
            evalGeo.type = 'text'; // Mark type
            // Attach text props for renderer
            evalGeo.text = text;
            evalGeo.size = size;

            const evalObj = { objectId: obj.id, geometry: evalGeo, style: style };
            evaluated.push(evalObj);
            evaluatedMap.set(obj.id, evalObj);

        } else if (obj.kind === 'math') {
            const input = resolveParam(obj.params.input, evaluatedMap) || 0;
            let result = 0;
            if (obj.type === 'sin') {
                const freq = resolveParam(obj.params.freq, evaluatedMap) || 1;
                const amp = resolveParam(obj.params.amp, evaluatedMap) || 1;
                const phase = resolveParam(obj.params.phase, evaluatedMap) || 0;
                result = Math.sin(input * freq + phase) * amp;
            } else if (obj.type === 'cos') {
                const freq = resolveParam(obj.params.freq, evaluatedMap) || 1;
                const amp = resolveParam(obj.params.amp, evaluatedMap) || 1;
                const phase = resolveParam(obj.params.phase, evaluatedMap) || 0;
                result = Math.cos(input * freq + phase) * amp;
            }
            const evalObj = { objectId: obj.id, value: result };
            evaluated.push(evalObj);
            evaluatedMap.set(obj.id, evalObj);
        } else {
            warnings.push(`Object ${obj.id} of kind ${obj.kind} evaluation not implemented`);
        }
    }
    return evaluated;
}

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
                outputs[op.outputRef] = evaluateAffineOperator(op, inputs, t);
                break;
            case 'threshold':
                outputs[op.outputRef] = evaluateThresholdOperator(op, inputs);
                break;
            case 'rasterize':
                outputs[op.outputRef] = evaluateRasterizeOperator(op, inputs);
                break;
            case 'erode':
            case 'dilate':
                outputs[op.outputRef] = evaluateMorphOperator(op, inputs, op.type === 'erode');
                break;
            default:
                warnings.push(`Operator ${op.id} (${op.type}) not implemented`);
                break;
        }
    }
    return outputs;
}

function evaluateAffineOperator(op, inputs, t) {
    const transform = evaluateTransform(op.params.transform, t);
    const input = inputs[0];
    if (input.geometry) {
        const transformedPoints = transformPoints(transform, input.geometry.points);
        const transformed = { ...input.geometry, points: transformedPoints, bounds: computeBounds(transformedPoints) };
        return { type: 'geometry', geometry: transformed };
    }
    if (input.raster) {
        return { type: 'raster', raster: input.raster };
    }
    return { type: 'geometry', geometry: { type: 'polyline', points: [], bounds: null } };
}

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

export function findHitObject(objects, point) {
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!obj.geometry) continue;
        if (pointInsideGeometry(point, obj.geometry)) {
            return obj.objectId;
        }
    }
    return null;
}

function pointInsideGeometry(point, geometry) {
    switch (geometry.type) {
        case 'circle':
            if (geometry.points) return isPointInPolygon(point, geometry.points);
            return false;
        case 'rect':
        case 'polygon':
        case 'polyline':
        case 'line':
            return isPointInPolygon(point, geometry.points);
        case 'text':
            // Text bounds check?
            if (geometry.bounds) {
                return point.x >= geometry.bounds.min.x && point.x <= geometry.bounds.max.x &&
                    point.y >= geometry.bounds.min.y && point.y <= geometry.bounds.max.y;
            }
            return false;
        case 'point':
            return Math.abs(point.x) < 5 && Math.abs(point.y) < 5;
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
        return mat3Multiply(a, b);
    } catch (error) {
        console.warn(`Failed to compose matrix for relation ${relation.id}`, error);
        return a;
    }
}

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
