import { vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { ikEndPoint, twoBoneIk } from './ik.js';

const root = vec2(0, 0);

describe('two-bone IK (M6.2)', () => {
  it('reaches reachable targets exactly', () => {
    for (const target of [vec2(1.2, 0.5), vec2(-0.8, 1.1), vec2(0.3, -1.4), vec2(1.5, -0.2)]) {
      const s = twoBoneIk(root, target, 1, 1);
      expect(s.clamped).toBe(false);
      const end = ikEndPoint(root, s, 1, 1);
      expect(end.x).toBeCloseTo(target.x, 9);
      expect(end.y).toBeCloseTo(target.y, 9);
    }
  });

  it('clamps out-of-reach targets to a straight arm at the target bearing', () => {
    const s = twoBoneIk(root, vec2(5, 0), 1, 1);
    expect(s.clamped).toBe(true);
    expect(s.upper).toBeCloseTo(0, 9);
    const end = ikEndPoint(root, s, 1, 1);
    expect(end.x).toBeCloseTo(2, 9); // full extension
  });

  it('bend direction flips the elbow side', () => {
    const target = vec2(1.2, 0);
    const up = twoBoneIk(root, target, 1, 1, 1);
    const down = twoBoneIk(root, target, 1, 1, -1);
    const elbowUpY = Math.sin(up.upper) * 1;
    const elbowDownY = Math.sin(down.upper) * 1;
    expect(Math.sign(elbowUpY)).not.toBe(Math.sign(elbowDownY));
    // Both still reach the target.
    expect(ikEndPoint(root, down, 1, 1).x).toBeCloseTo(1.2, 9);
  });

  it('handles asymmetric bone lengths', () => {
    const s = twoBoneIk(root, vec2(0.9, 0.9), 1, 0.6);
    const end = ikEndPoint(root, s, 1, 0.6);
    expect(end.x).toBeCloseTo(0.9, 9);
    expect(end.y).toBeCloseTo(0.9, 9);
  });

  it('is continuous near full extension (no angle jumps)', () => {
    const nearly = twoBoneIk(root, vec2(1.999, 0), 1, 1);
    const full = twoBoneIk(root, vec2(2.001, 0), 1, 1);
    expect(Math.abs(nearly.upper - full.upper)).toBeLessThan(0.1);
  });
});
