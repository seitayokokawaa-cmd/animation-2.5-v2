/**
 * Postures (M8.3, plan §5.5): held body states — sit, kneel, lie-down —
 * plus stand to return to neutral. Unlike gestures they persist: the frame
 * builder blends from the previous posture into the newest one over the
 * effect window and then holds it for the rest of the scene.
 *
 * A posture is a rig pose plus a root adjustment (drop toward the ground
 * and a whole-body rotation about the feet), both scaled by character size.
 */

import type { RigPose } from './rig.js';

export const POSTURE_KINDS = ['sit', 'kneel', 'lie-down', 'stand'] as const;
export type PostureKind = (typeof POSTURE_KINDS)[number];

export interface Posture {
  readonly pose: RigPose;
  /** Root drop toward the ground, in character-size units. */
  readonly drop: number;
  /** Whole-body rotation about the feet, radians (lying down). */
  readonly rotate: number;
}

export const NEUTRAL_POSTURE: Posture = { pose: {}, drop: 0, rotate: 0 };

/** The held pose for a posture kind. Pure and static. */
export function posturePose(kind: PostureKind): Posture {
  switch (kind) {
    case 'sit':
      // Butt on the ground, legs out front, tiny recline.
      return {
        pose: {
          'leg-r': 1.35,
          'leg-l': 1.1,
          pelvis: 0.08,
          'arm-r-upper': 0.3,
          'arm-l-upper': -0.3,
        },
        drop: 0.24,
        rotate: 0,
      };
    case 'kneel':
      // Near shin folds back under; far leg braces forward.
      return {
        pose: { 'leg-r': -1.2, 'leg-l': 0.9, pelvis: -0.06 },
        drop: 0.18,
        rotate: 0,
      };
    case 'lie-down':
      // The whole body tips back about the feet; arms splay.
      return {
        pose: { 'arm-r-upper': 0.5, 'arm-l-upper': -0.5, head: 0.12 },
        drop: -0.06,
        rotate: -1.45,
      };
    case 'stand':
      return NEUTRAL_POSTURE;
  }
}

/** Linear blend between two postures (the transition). */
export function blendPostures(from: Posture, to: Posture, t: number): Posture {
  const keys = new Set([...Object.keys(from.pose), ...Object.keys(to.pose)]);
  const pose: Record<string, number> = {};
  for (const key of keys) {
    const a = from.pose[key] ?? 0;
    const b = to.pose[key] ?? 0;
    pose[key] = a + (b - a) * t;
  }
  return {
    pose,
    drop: from.drop + (to.drop - from.drop) * t,
    rotate: from.rotate + (to.rotate - from.rotate) * t,
  };
}
