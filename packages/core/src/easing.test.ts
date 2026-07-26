import { describe, expect, it } from 'vitest';

import { cubicBezier, ease, easing, EASING_NAMES, sampleCurve } from './easing.js';

describe('easing', () => {
  it('every named easing hits 0 at t=0 and 1 at t=1', () => {
    for (const name of EASING_NAMES) {
      expect(ease(name, 0), name).toBeCloseTo(0, 9);
      expect(ease(name, 1), name).toBeCloseTo(1, 9);
    }
  });

  it('clamps out-of-range t', () => {
    expect(ease('cubicInOut', -3)).toBeCloseTo(0, 12);
    expect(ease('cubicInOut', 42)).toBeCloseTo(1, 12);
  });

  it('linear is identity; inOut is symmetric', () => {
    expect(ease('linear', 0.37)).toBe(0.37);
    for (const t of [0.1, 0.25, 0.4]) {
      expect(ease('cubicInOut', t) + ease('cubicInOut', 1 - t)).toBeCloseTo(1, 9);
    }
  });

  it('backOut overshoots above 1 mid-curve', () => {
    const peak = Math.max(...sampleCurve(easing('backOut'), 100));
    expect(peak).toBeGreaterThan(1.05);
  });

  it('bounceOut stays within [0,1]', () => {
    for (const v of sampleCurve(easing('bounceOut'), 200)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('rejects unknown names', () => {
    expect(() => easing('zoomy')).toThrow(/Unknown easing/);
  });

  it('cubicBezier matches known anchors and is monotone for ease-like params', () => {
    const css = cubicBezier(0.25, 0.1, 0.25, 1); // CSS "ease"
    expect(css(0)).toBe(0);
    expect(css(1)).toBe(1);
    const samples = sampleCurve(css, 50);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]! - 1e-9);
    }
    // linear control points reproduce identity
    const lin = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const t of [0.2, 0.5, 0.8]) expect(lin(t)).toBeCloseTo(t, 6);
  });

  it('sampleCurve returns n+1 points and validates n', () => {
    expect(sampleCurve((t) => t, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(() => sampleCurve((t) => t, 0)).toThrow(/Invalid sample count/);
  });
});
