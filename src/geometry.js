import { computeBounds } from './math.js';
import { transformPoints, evaluateTransform } from './transform.js';

/**
 * Geometry evaluation utilities.
 */

/**
 * @typedef {'point'|'line'|'polyline'|'polygon'|'rect'|'circle'} PrimitiveKind
 */

/**
 * @typedef {{type:'point'}} PointGeometry
 * @typedef {{type:'line', points:[{x:number,y:number},{x:number,y:number}]}} LineGeometry
 * @typedef {{type:'polyline'|'polygon', points:Array<{x:number,y:number}>}} PathGeometry
 * @typedef {{type:'rect', width:number, height:number, cornerRadius?:number}} RectGeometry
 * @typedef {{type:'circle', radius:number}} CircleGeometry
 * @typedef {PointGeometry|LineGeometry|PathGeometry|RectGeometry|CircleGeometry} GeometrySpec
 */

/**
 * @typedef {{strokeColor?: string, strokeWidth?: number, fillColor?: string, fillEnabled?: boolean, blendMode?: string, alpha?: number, join?: string, cap?: string}} StyleSpec
 */

/**
 * @typedef {{id:string, kind:'primitive', name?:string, geometry: GeometrySpec, transform?: import('./transform.js').TransformSpec, style?: StyleSpec, visibility?: boolean, tags?: string[]}} PrimitiveObject
 */

/**
 * @typedef {{fontAssetId:string, char:string, size:number, outlineMode:'vector'|'raster', vectorQuality?:number, rasterAA?:number}} GlyphGeometry
 * @typedef {{fontAssetId:string, text:string, size:number, layout?: object, glyphMode?:'glyph'|'text'}} TextRunGeometry
 * @typedef {{id:string, kind:'text', name?:string, geometry: GlyphGeometry|TextRunGeometry, transform?: import('./transform.js').TransformSpec, style?: StyleSpec, visibility?: boolean, tags?: string[]}} TextObject
 */

/**
 * @typedef {{baseObjectIds:string[], cellVectors:[{x:number,y:number},{x:number,y:number}], cellBounds?: {min:{x:number,y:number}, max:{x:number,y:number}}}} UnitCell
 * @typedef {{unitCellId:string, repeatRange:{i:[number,number], j:[number,number]}, transformPerCell?: import('./transform.js').TransformSpec, clipping?: boolean}} LatticeSpec
 * @typedef {{sourceObjectId:string, instanceTransform?: import('./transform.js').TransformSpec}} TileInstanceSpec
 * @typedef {{id:string, kind:'pattern', name?:string, geometry: UnitCell|LatticeSpec|TileInstanceSpec, transform?: import('./transform.js').TransformSpec, style?: StyleSpec, visibility?: boolean, tags?: string[]}} PatternObject
 */

/**
 * @typedef {{id:string, kind:'composite', name?:string, geometry:{type:'group', childIds:string[]} | {type:'instance', sourceId:string}, transform?: import('./transform.js').TransformSpec, style?: StyleSpec, visibility?: boolean, tags?: string[]}} CompositeObject
 */

/**
 * @typedef {PrimitiveObject|TextObject|PatternObject|CompositeObject} SceneObject
 */

/**
 * @typedef {{type:'geometry', geometry: EvaluatedGeometry}|{type:'raster', raster: EvaluatedRaster}} EvaluationResult
 */

/**
 * @typedef {{type:'point'|'line'|'polyline'|'polygon'|'rect'|'circle', points:Array<{x:number,y:number}>, bounds: {min:{x:number,y:number}, max:{x:number,y:number}}|null}} EvaluatedGeometry
 */

/**
 * @typedef {{width:number, height:number, pixels:Uint8ClampedArray, channel:'alpha'|'luma', meta?: object}} EvaluatedRaster
 */

/**
 * Evaluates a primitive geometry into world space.
 * @param {GeometrySpec} geometry
 * @param {import('./transform.js').TransformSpec|undefined} transform
 * @param {number} t
 * @returns {EvaluatedGeometry}
 */
export function evaluatePrimitiveGeometry(geometry, transform, t) {
  const basePoints = geometryToPoints(geometry);
  const worldPoints = transformPoints(evaluateTransform(transform, t), basePoints);
  const bounds = computeBounds(worldPoints);
  return {
    type: geometry.type,
    points: worldPoints,
    bounds,
  };
}

/**
 * Converts a geometry spec to a list of points in local coordinates.
 * @param {GeometrySpec} geometry
 * @returns {Array<{x:number,y:number}>}
 */
export function geometryToPoints(geometry) {
  switch (geometry.type) {
    case 'point':
      return [{ x: 0, y: 0 }];
    case 'line':
      return geometry.points;
    case 'polyline':
    case 'polygon':
      return geometry.points;
    case 'rect': {
      const { width, height } = geometry;
      const x0 = -width / 2;
      const y0 = -height / 2;
      const x1 = width / 2;
      const y1 = height / 2;
      return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ];
    }
    case 'circle': {
      // Approximate the circle with 32 points for evaluation purposes.
      const steps = 32;
      const points = [];
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        points.push({ x: Math.cos(angle) * geometry.radius, y: Math.sin(angle) * geometry.radius });
      }
      return points;
    }
    default:
      throw new Error(`Unsupported geometry type ${(/** @type {{type:string}} */ (geometry)).type}`);
  }
}
