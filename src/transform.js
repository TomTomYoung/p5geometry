import { applyMat3, mat3Identity, mat3Multiply, mat3Rotate, mat3Scale, mat3Shear, mat3Translate } from './math.js';
import { evaluateParam } from './params.js';

/**
 * @typedef {{translate?: import('./params.js').Param<{x:number,y:number}>|null, rotate?: import('./params.js').Param<number>|null, scale?: import('./params.js').Param<{x:number,y:number}|number>|null, shear?: import('./params.js').Param<{x:number,y:number}>|null, matrix?: import('./params.js').Param<import('./math.js').Mat3>|null}} TransformSpec
 */

/**
 * Evaluates a TransformSpec into a Mat3 for the given time.
 * The order follows translate → rotate → scale → shear → matrix.
 * @param {TransformSpec|undefined} spec
 * @param {number} t
 * @returns {import('./math.js').Mat3}
 */
export function evaluateTransform(spec, t) {
  if (!spec) return mat3Identity();
  const operations = [];
  if (spec.translate) {
    const tr = evaluateParam(spec.translate, t);
    operations.push(mat3Translate(tr.x, tr.y));
  }
  if (spec.rotate) {
    const angle = evaluateParam(spec.rotate, t);
    operations.push(mat3Rotate(angle));
  }
  if (spec.scale) {
    const scaleParam = evaluateParam(spec.scale, t);
    const sx = typeof scaleParam === 'number' ? scaleParam : scaleParam.x;
    const sy = typeof scaleParam === 'number' ? scaleParam : scaleParam.y;
    operations.push(mat3Scale(sx, sy));
  }
  if (spec.shear) {
    const sh = evaluateParam(spec.shear, t);
    operations.push(mat3Shear(sh.x, sh.y));
  }
  if (spec.matrix) {
    operations.push(evaluateParam(spec.matrix, t));
  }
  return operations.reduce(mat3Multiply, mat3Identity());
}

/**
 * Applies a transform to all points.
 * @param {import('./math.js').Mat3} matrix
 * @param {Array<{x:number, y:number}>} points
 * @returns {Array<{x:number, y:number}>}
 */
export function transformPoints(matrix, points) {
  return points.map((p) => applyMat3(matrix, p));
}
