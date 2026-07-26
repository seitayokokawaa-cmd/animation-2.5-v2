/**
 * 2D math primitives. Everything is a plain immutable value object; all
 * functions return new values. No hidden state, no wall-clock, no randomness.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const ZERO: Vec2 = vec2(0, 0);
export const ONE: Vec2 = vec2(1, 1);

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const mul = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => length(sub(b, a));

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? ZERO : mul(a, 1 / len);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpVec2 = (a: Vec2, b: Vec2, t: number): Vec2 =>
  vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export const rotate = (a: Vec2, radians: number): Vec2 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return vec2(a.x * c - a.y * s, a.x * s + a.y * c);
};

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * 2D affine transform in SVG matrix convention:
 *
 *   | a c e |   | x |
 *   | b d f | · | y |
 *   | 0 0 1 |   | 1 |
 */
export interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const translation = (tx: number, ty: number): Transform => ({
  ...IDENTITY,
  e: tx,
  f: ty,
});

export const scaling = (sx: number, sy: number = sx): Transform => ({
  ...IDENTITY,
  a: sx,
  d: sy,
});

export function rotation(radians: number): Transform {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
}

/** `compose(m, n)` applies `n` first, then `m` (matrix product m·n). */
export const compose = (m: Transform, n: Transform): Transform => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});

export const apply = (m: Transform, p: Vec2): Vec2 =>
  vec2(m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f);

/** Translate · Rotate · Scale, the usual node-local transform order. */
export const trs = (t: Vec2, radians: number, s: Vec2): Transform =>
  compose(translation(t.x, t.y), compose(rotation(radians), scaling(s.x, s.y)));

export function invert(m: Transform): Transform {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) throw new Error('Transform is not invertible (determinant 0)');
  const inv = 1 / det;
  const a = m.d * inv;
  const b = -m.b * inv;
  const c = -m.c * inv;
  const d = m.a * inv;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}
