import { describe, expect, it } from 'vitest';

import { blendPostures, NEUTRAL_POSTURE, POSTURE_KINDS, posturePose } from './postures.js';

describe('postures (M8.3)', () => {
  it('ships sit/kneel/lie-down/stand', () => {
    expect(POSTURE_KINDS).toEqual(['sit', 'kneel', 'lie-down', 'stand']);
    expect(posturePose('stand')).toBe(NEUTRAL_POSTURE);
  });

  it('sitting drops the root with legs out; lying tips the body', () => {
    const sit = posturePose('sit');
    expect(sit.drop).toBeGreaterThan(0.15);
    expect(sit.pose['leg-r']).toBeGreaterThan(1);
    const lie = posturePose('lie-down');
    expect(Math.abs(lie.rotate)).toBeGreaterThan(1.2);
    const kneel = posturePose('kneel');
    expect(kneel.pose['leg-r']).toBeLessThan(0); // shin folds back
  });

  it('blends smoothly between postures', () => {
    const mid = blendPostures(posturePose('sit'), posturePose('stand'), 0.5);
    expect(mid.drop).toBeCloseTo(posturePose('sit').drop / 2, 6);
    expect(mid.pose['leg-r']).toBeCloseTo(posturePose('sit').pose['leg-r']! / 2, 6);
    expect(blendPostures(NEUTRAL_POSTURE, posturePose('lie-down'), 1)).toEqual(
      posturePose('lie-down'),
    );
    // Pure.
    expect(blendPostures(posturePose('sit'), posturePose('kneel'), 0.3)).toEqual(
      blendPostures(posturePose('sit'), posturePose('kneel'), 0.3),
    );
  });
});
