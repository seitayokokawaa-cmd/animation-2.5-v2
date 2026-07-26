/**
 * Easing functions. An easing maps normalized time t ∈ [0,1] to progress
 * (usually [0,1]; `back`/`elastic` overshoot by design). All are pure and
 * total on [0,1]; inputs are clamped so solvers can't sample outside.
 */

import { clamp } from './math.js';

export type Easing = (t: number) => number;

const c1 = 1.70158; // classic back overshoot amount
const c3 = c1 + 1;

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

const raw: Record<string, Easing> = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  cubicIn: (t) => t ** 3,
  cubicOut: (t) => 1 - (1 - t) ** 3,
  cubicInOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  quartIn: (t) => t ** 4,
  quartOut: (t) => 1 - (1 - t) ** 4,
  quartInOut: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  sineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoIn: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  expoOut: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  backIn: (t) => c3 * t ** 3 - c1 * t * t,
  backOut: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  elasticOut: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  bounceOut,
  bounceIn: (t) => 1 - bounceOut(1 - t),
};

/** All easing names, sorted — the registry the validator and spec read. */
export const EASING_NAMES: readonly string[] = Object.keys(raw).sort();

/** Look up an easing by name; unknown names throw (validator catches first). */
export function easing(name: string): Easing {
  const fn = raw[name];
  if (!fn) throw new Error(`Unknown easing: ${JSON.stringify(name)}`);
  return (t) => fn(clamp(t, 0, 1));
}

/** Evaluate `name` at t — convenience for solvers. */
export const ease = (name: string, t: number): number => easing(name)(t);

/**
 * CSS-style cubic-bezier easing through control points (x1,y1),(x2,y2).
 * Solved by bisection on the x polynomial — deterministic, no tolerance
 * drift across platforms.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const px = (t: number) => 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;
  const py = (t: number) => 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
  return (x) => {
    x = clamp(x, 0, 1);
    if (x === 0 || x === 1) return x;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (px(mid) < x) lo = mid;
      else hi = mid;
    }
    return py((lo + hi) / 2);
  };
}

/**
 * Sample an easing into n+1 uniform points (t=0…1 inclusive) — used by
 * golden tests and by solvers that need a cheap LUT.
 */
export function sampleCurve(fn: Easing, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid sample count: ${n}`);
  return Array.from({ length: n + 1 }, (_, i) => fn(i / n));
}
