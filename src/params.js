import { lerp } from './math.js';

/**
 * Param evaluation utilities.
 * A Param can be constant, a set of keyframes, or an expression string.
 * The expression flavor is intentionally conservative and only supports
 * a limited whitelist of Math functions to avoid unsafe eval usage.
 */

/** @typedef {'constant'|'keyframes'|'expr'} ParamType */

/**
 * @template T
 * @typedef {{type:'constant', value:T}} ParamConstant
 */

/**
 * @template T
 * @typedef {{type:'keyframes', keyframes:Array<{t:number, value:T}>, interpolation?:'step'|'linear'|'smooth', extrapolation?:'clamp'|'repeat'}} ParamKeyframes
 */

/**
 * @template T
 * @typedef {{type:'expr', expr:string}} ParamExpr
 */

/** @template T
 * @typedef {ParamConstant<T>|ParamKeyframes<T>|ParamExpr<T>} Param
 */

/**
 * Evaluates a Param at the given time value.
 * @template T
 * @param {Param<T>} param
 * @param {number} t
 * @returns {T}
 */
export function evaluateParam(param, t) {
  if (!param) throw new Error('Param is required');
  switch (param.type) {
    case 'constant':
      return /** @type {ParamConstant<T>} */ (param).value;
    case 'keyframes':
      return evaluateKeyframes(/** @type {ParamKeyframes<T>} */ (param), t);
    case 'expr':
      return evaluateExpr(/** @type {ParamExpr<T>} */ (param), t);
    default:
      throw new Error(`Unknown param type ${(/** @type {{type: string}} */ (param)).type}`);
  }
}

/**
 * @template T
 * @param {ParamKeyframes<T>} param
 * @param {number} t
 * @returns {T}
 */
function evaluateKeyframes(param, t) {
  const { keyframes, interpolation = 'linear', extrapolation = 'clamp' } = param;
  if (!keyframes.length) throw new Error('Keyframes must not be empty');
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (t <= first.t) {
    return extrapolation === 'repeat' ? valueAtRepeatedTime(keyframes, t) : first.value;
  }
  if (t >= last.t) {
    return extrapolation === 'repeat' ? valueAtRepeatedTime(keyframes, t) : last.value;
  }
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].t < t) {
    i += 1;
  }
  const k0 = keyframes[i];
  const k1 = keyframes[i + 1];
  const span = k1.t - k0.t;
  const localT = span === 0 ? 0 : (t - k0.t) / span;
  if (interpolation === 'step') return k0.value;
  if (interpolation === 'smooth') {
    const smoothT = localT * localT * (3 - 2 * localT);
    return interpolateValue(k0.value, k1.value, smoothT);
  }
  return interpolateValue(k0.value, k1.value, localT);
}

/**
 * @template T
 * @param {ParamKeyframes<T>} param
 * @param {number} t
 * @returns {T}
 */
function valueAtRepeatedTime(keyframes, t) {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  const duration = last.t - first.t;
  if (duration === 0) return first.value;
  let wrapped = ((t - first.t) % duration + duration) % duration + first.t;
  return evaluateKeyframes({ type: 'keyframes', keyframes, extrapolation: 'clamp' }, wrapped);
}

/**
 * @template T
 * @param {T} a
 * @param {T} b
 * @param {number} t
 * @returns {T}
 */
function interpolateValue(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') {
    return /** @type {T} */ (lerp(a, b, t));
  }
  if (isVec2(a) && isVec2(b)) {
    return /** @type {T} */ ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  }
  return t < 0.5 ? a : b;
}

/**
 * @template T
 * @param {ParamExpr<T>} param
 * @param {number} t
 * @returns {T}
 */
function evaluateExpr(param, t) {
  const scoped = buildSafeScope();
  const evaluator = new Function('t', ...Object.keys(scoped), `return (${param.expr});`);
  // eslint-disable-next-line unicorn/new-for-builtins
  return /** @type {T} */ (evaluator(t, ...Object.values(scoped)));
}

function buildSafeScope() {
  return {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    sqrt: Math.sqrt,
    PI: Math.PI,
  };
}

/**
 * @param {unknown} value
 * @returns {value is {x:number, y:number}}
 */
function isVec2(value) {
  return Boolean(value && typeof value === 'object' && 'x' in value && 'y' in value);
}
