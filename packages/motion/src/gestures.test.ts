import { describe, expect, it } from 'vitest';

import { GESTURE_DEFAULT_SECONDS, GESTURE_KINDS, gesturePose } from './gestures.js';

describe('gesture pack (M8.2)', () => {
  it('ships the plan gesture set with defaults', () => {
    expect(GESTURE_KINDS).toEqual([
      'point',
      'wave',
      'salute',
      'facepalm',
      'shrug',
      'clap',
      'nod',
      'shake-head',
      'bow',
    ]);
    for (const kind of GESTURE_KINDS) {
      expect(GESTURE_DEFAULT_SECONDS[kind]).toBeGreaterThan(0);
    }
  });

  it('ramps softly in and out so poses never snap', () => {
    for (const kind of GESTURE_KINDS) {
      const start = gesturePose(kind, 0);
      const end = gesturePose(kind, 1);
      for (const angle of [...Object.values(start), ...Object.values(end)]) {
        expect(Math.abs(angle)).toBeLessThan(0.02);
      }
      const peak = Math.max(
        ...[0.3, 0.45, 0.6].flatMap((u) => Object.values(gesturePose(kind, u)).map(Math.abs)),
      );
      expect(peak, kind).toBeGreaterThan(0.05);
    }
  });

  it('points level, waves flap the forearm, bows bend the spine', () => {
    expect(gesturePose('point', 0.5)['arm-r-upper']).toBeCloseTo(1.4, 5);
    const flapA = gesturePose('wave', 0.4)['arm-r-lower']!;
    const flapB = gesturePose('wave', 0.5)['arm-r-lower']!;
    expect(flapA).not.toBeCloseTo(flapB, 2);
    expect(gesturePose('bow', 0.5).pelvis).toBeLessThan(-0.4);
    // Shrug is symmetric: both arms out in mirror.
    const shrug = gesturePose('shrug', 0.5);
    expect(shrug['arm-r-upper']).toBeCloseTo(-shrug['arm-l-upper']!, 5);
  });

  it('is pure', () => {
    expect(gesturePose('clap', 0.37)).toEqual(gesturePose('clap', 0.37));
  });
});
