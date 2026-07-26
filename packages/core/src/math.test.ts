import { describe, expect, it } from 'vitest';

import {
  add,
  apply,
  clamp,
  compose,
  cross,
  degToRad,
  distance,
  dot,
  IDENTITY,
  invert,
  length,
  lerp,
  lerpVec2,
  mul,
  normalize,
  rotate,
  rotation,
  scaling,
  sub,
  translation,
  trs,
  vec2,
  ZERO,
} from './math.js';

describe('Vec2', () => {
  it('does arithmetic', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(3, 4), vec2(1, 2))).toEqual(vec2(2, 2));
    expect(mul(vec2(1, -2), 3)).toEqual(vec2(3, -6));
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1);
  });

  it('measures', () => {
    expect(length(vec2(3, 4))).toBe(5);
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
    const n = normalize(vec2(3, 4));
    expect(n.x).toBeCloseTo(0.6, 12);
    expect(n.y).toBeCloseTo(0.8, 12);
    expect(length(n)).toBeCloseTo(1, 12);
    expect(normalize(ZERO)).toEqual(ZERO);
  });

  it('interpolates and clamps', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerpVec2(vec2(0, 0), vec2(10, 20), 0.5)).toEqual(vec2(5, 10));
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });

  it('rotates counter-clockwise in math convention', () => {
    const r = rotate(vec2(1, 0), degToRad(90));
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });
});

describe('Transform', () => {
  it('applies identity as a no-op', () => {
    expect(apply(IDENTITY, vec2(7, -3))).toEqual(vec2(7, -3));
  });

  it('translates, scales, rotates', () => {
    expect(apply(translation(10, 20), vec2(1, 2))).toEqual(vec2(11, 22));
    expect(apply(scaling(2, 3), vec2(4, 5))).toEqual(vec2(8, 15));
    const p = apply(rotation(degToRad(90)), vec2(1, 0));
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });

  it('composes right-to-left like matrix product', () => {
    // Scale then translate: point (1,0) → (2,0) → (12,20).
    const m = compose(translation(10, 20), scaling(2));
    expect(apply(m, vec2(1, 0))).toEqual(vec2(12, 20));
  });

  it('builds TRS in translate·rotate·scale order', () => {
    const m = trs(vec2(10, 0), degToRad(90), vec2(2, 2));
    const p = apply(m, vec2(1, 0));
    expect(p.x).toBeCloseTo(10, 12);
    expect(p.y).toBeCloseTo(2, 12);
  });

  it('inverts round-trip', () => {
    const m = trs(vec2(3, -7), 0.83, vec2(2, 0.5));
    const p = apply(invert(m), apply(m, vec2(5, 11)));
    expect(p.x).toBeCloseTo(5, 9);
    expect(p.y).toBeCloseTo(11, 9);
  });

  it('rejects singular inversion', () => {
    expect(() => invert(scaling(0))).toThrow(/not invertible/);
  });
});
