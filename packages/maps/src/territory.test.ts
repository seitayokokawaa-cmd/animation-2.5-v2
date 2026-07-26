import { vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import {
  clipToFront,
  highlightPulse,
  morphRings,
  packColor,
  resampleRing,
  unpackColor,
} from './territory.js';

const square = [vec2(0, 0), vec2(2, 0), vec2(2, 2), vec2(0, 2)];

describe('territory animation geometry (M7.3)', () => {
  it('clips a polygon to the sweep front', () => {
    const half = clipToFront(square, 1);
    expect(half).toEqual([vec2(0, 0), vec2(1, 0), vec2(1, 2), vec2(0, 2)]);
    expect(clipToFront(square, -0.5)).toEqual([]);
    expect(clipToFront(square, 3)).toEqual(square);
  });

  it('resamples rings to a canonical form (count, start at top, ccw)', () => {
    const out = resampleRing(square, 8);
    expect(out).toHaveLength(8);
    // Starts at the topmost point.
    expect(out[0]!.y).toBeCloseTo(2, 9);
    // All points stay on the square's perimeter.
    for (const p of out) {
      const onEdge =
        Math.abs(p.x) < 1e-9 ||
        Math.abs(p.x - 2) < 1e-9 ||
        Math.abs(p.y) < 1e-9 ||
        Math.abs(p.y - 2) < 1e-9;
      expect(onEdge).toBe(true);
    }
    // Orientation-normalized: a clockwise input resamples identically.
    expect(resampleRing([...square].reverse(), 8)).toEqual(out);
  });

  it('morphs one ring into another and lands exactly', () => {
    const target = [vec2(1, 1), vec2(3, 1), vec2(3, 3), vec2(1, 3)];
    const at0 = morphRings(square, target, 0, 16);
    const at1 = morphRings(square, target, 1, 16);
    const mid = morphRings(square, target, 0.5, 16);
    expect(at0[0]!.y).toBeCloseTo(2, 6);
    expect(at1[0]!.y).toBeCloseTo(3, 6);
    expect(mid[0]!.y).toBeCloseTo(2.5, 6);
    expect(morphRings(square, target, 0.5, 16)).toEqual(mid); // pure
  });

  it('highlight pulses inside the window and rests outside', () => {
    expect(highlightPulse(0)).toBe(0);
    expect(highlightPulse(1)).toBe(0);
    expect(highlightPulse(0.17)).toBeGreaterThan(0.5);
    expect(highlightPulse(0.5, 3)).toBeGreaterThan(0.8);
  });

  it('packs colors into effect params and back', () => {
    expect(unpackColor(packColor(0xb5, 0x45, 0x3c))).toEqual({ r: 0xb5, g: 0x45, b: 0x3c, a: 1 });
  });
});
