/**
 * Planted gait (M14.1) — including the no-slide CI metric: forward-
 * kinematics the stance foot every tick of a walk and assert it never
 * drifts from its plant.
 */
import { apply, compose, IDENTITY, translation, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { GAIT_KINDS, GAIT_LEG_LENGTH, GAITS, gaitSample } from './gait.js';
import { potatoBiped } from './potato.js';
import { fk } from './rig.js';

describe('planted gait (M14.1)', () => {
  it('ships walk, run, and sneak with sane speeds', () => {
    expect([...GAIT_KINDS]).toEqual(['walk', 'run', 'sneak']);
    expect(GAITS.run.speed).toBeGreaterThan(GAITS.walk.speed);
    expect(GAITS.sneak.speed).toBeLessThan(GAITS.walk.speed);
    expect(GAITS.sneak.crouch).toBeGreaterThan(0);
  });

  it('alternates stance feet every step', () => {
    const size = 1;
    const S = GAITS.walk.step * size;
    const early = gaitSample('walk', 0.1 * S, size);
    const later = gaitSample('walk', 1.1 * S, size);
    expect(early.stance.foot).not.toBe(later.stance.foot);
  });

  it('the body bobs with stance geometry and sneak crouches', () => {
    const drops = (kind: 'walk' | 'sneak'): number[] =>
      Array.from(
        { length: 100 },
        (_, i) => gaitSample(kind, (2 * GAITS[kind].step * i) / 100, 1).drop,
      );
    const walk = drops('walk');
    expect(Math.min(...walk)).toBeLessThan(0.01); // leg passes vertical
    expect(Math.max(...walk)).toBeGreaterThan(Math.min(...walk) + 0.02); // real bob
    // Sneak carries its crouch on top of the same bob.
    expect(Math.min(...drops('sneak'))).toBeGreaterThanOrEqual(GAITS.sneak.crouch - 1e-6);
  });

  // The no-slide CI metric (plan M14.1).
  for (const kind of GAIT_KINDS) {
    it(`no-slide metric: ${kind} stance foot stays on its plant`, () => {
      const size = 0.9;
      const template = potatoBiped({ size });
      const distance = 4;
      const legLength = GAIT_LEG_LENGTH * size;
      let maxSlide = 0;
      let maxLift = 0;
      let checked = 0;
      for (let step = 0; step <= 400; step++) {
        const traveled = (distance * step) / 400;
        const sample = gaitSample(kind, traveled, size);
        // Skip the instant around stance handoff (the foot changes).
        const S = GAITS[kind].step * size;
        const phase = ((traveled / S) % 1) + 1e-9;
        if (Math.abs(phase - 0.5) < 0.05 || phase < 0.05 || phase > 0.95) continue;
        const root = compose(translation(traveled, -sample.drop), IDENTITY);
        const bones = fk(template.skeleton, sample.pose, root);
        const stanceBone = bones.get(sample.stance.foot)!;
        const tip = apply(stanceBone.transform, vec2(legLength, 0));
        maxSlide = Math.max(maxSlide, Math.abs(tip.x - sample.stance.plant));
        // Feet rest 0.04·size above y = 0 (the boots cover it) — measure
        // lift against that baseline.
        maxLift = Math.max(maxLift, Math.abs(tip.y - 0.04 * size));
        checked++;
      }
      expect(checked).toBeGreaterThan(200);
      // The plant holds to within 3% of the character size.
      expect(maxSlide).toBeLessThan(0.03 * size);
      expect(maxLift).toBeLessThan(0.03 * size);
    });
  }
});
