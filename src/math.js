/**
 * Basic 2D math helpers used throughout the geometry renderer.
 * The module is intentionally dependency-free to make the evaluation logic
 * runnable in restricted environments.
 */

/** @typedef {{x:number, y:number}} Vec2 */

/** @typedef {[number, number, number, number, number, number, number, number, number]} Mat3 */

/**
 * @returns {Mat3}
 */
export function mat3Identity() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/**
 * Multiplies two 3x3 matrices (column-major order).
 * @param {Mat3} a
 * @param {Mat3} b
 * @returns {Mat3}
 */
export function mat3Multiply(a, b) {
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
}

/**
 * Applies a 3x3 matrix to a 2D vector (homogeneous coordinates with w=1).
 * @param {Mat3} m
 * @param {Vec2} v
 * @returns {Vec2}
 */
export function applyMat3(m, v) {
  return {
    x: m[0] * v.x + m[3] * v.y + m[6],
    y: m[1] * v.x + m[4] * v.y + m[7],
  };
}

/**
 * Creates a translation matrix.
 * @param {number} tx
 * @param {number} ty
 * @returns {Mat3}
 */
export function mat3Translate(tx, ty) {
  return [1, 0, 0, 0, 1, 0, tx, ty, 1];
}

/**
 * Creates a scaling matrix.
 * @param {number} sx
 * @param {number} sy
 * @returns {Mat3}
 */
export function mat3Scale(sx, sy) {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1];
}

/**
 * Creates a rotation matrix (radians).
 * @param {number} angle
 * @returns {Mat3}
 */
export function mat3Rotate(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/**
 * Creates a shear matrix.
 * @param {number} shx
 * @param {number} shy
 * @returns {Mat3}
 */
export function mat3Shear(shx, shy) {
  return [1, shy, 0, shx, 1, 0, 0, 0, 1];
}

/**
 * Computes a bounding box for a list of points.
 * @param {Vec2[]} points
 * @returns {{min: Vec2, max: Vec2} | null}
 */
export function computeBounds(points) {
  if (!points.length) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Linearly interpolates between two numbers.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Normalizes an angle to the range [-PI, PI].
 * @param {number} angle
 * @returns {number}
 */
export function normalizeAngle(angle) {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}
