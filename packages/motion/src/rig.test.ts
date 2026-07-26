import { translation, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { addPoses, blendPoses, fk, validateSkeleton, type Skeleton } from './rig.js';

/** Upper arm pointing right, forearm continuing. */
const arm: Skeleton = {
  bones: [
    { id: 'upper', rest: 0, length: 1 },
    { id: 'lower', parent: 'upper', offset: vec2(1, 0), rest: 0, length: 1 },
  ],
};

describe('skeleton + fk (M6.1)', () => {
  it('validates ordering, duplicates, lengths', () => {
    expect(() => validateSkeleton(arm)).not.toThrow();
    expect(() =>
      validateSkeleton({
        bones: [
          { id: 'a', rest: 0, length: 1 },
          { id: 'a', rest: 0, length: 1 },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      validateSkeleton({
        bones: [{ id: 'child', parent: 'missing', rest: 0, length: 1 }],
      }),
    ).toThrow(/before its parent/);
  });

  it('chains rest angles and pose offsets through parents', () => {
    const straight = fk(arm, {});
    expect(straight.get('lower')!.end.x).toBeCloseTo(2, 9);
    expect(straight.get('lower')!.end.y).toBeCloseTo(0, 9);

    // Bend the elbow 90° up: forearm now points +y from (1,0).
    const bent = fk(arm, { lower: Math.PI / 2 });
    expect(bent.get('lower')!.end.x).toBeCloseTo(1, 9);
    expect(bent.get('lower')!.end.y).toBeCloseTo(1, 9);

    // Rotate the shoulder too: whole chain follows.
    const up = fk(arm, { upper: Math.PI / 2 });
    expect(up.get('upper')!.end.y).toBeCloseTo(1, 9);
    expect(up.get('lower')!.end.y).toBeCloseTo(2, 9);
  });

  it('applies the root transform (placement + facing)', () => {
    const placed = fk(arm, {}, translation(10, 5));
    expect(placed.get('upper')!.start).toEqual({ x: 10, y: 5 });
    expect(placed.get('lower')!.end.x).toBeCloseTo(12, 9);
  });

  it('reports world angles', () => {
    const bent = fk(arm, { upper: Math.PI / 4 });
    expect(bent.get('upper')!.angle).toBeCloseTo(Math.PI / 4, 9);
  });
});

describe('pose blending', () => {
  it('lerps and layers', () => {
    const a = { upper: 0, lower: 1 };
    const b = { upper: 2 };
    expect(blendPoses(a, b, 0.5)).toEqual({ upper: 1, lower: 0.5 });
    expect(addPoses(a, b)).toEqual({ upper: 2, lower: 1 });
  });
});
