/**
 * Gesture pack (M8.2, plan §5.5): timed rig-pose overlays for the potato
 * cast — point, wave, salute, facepalm, shrug, clap, nod, shake-head, bow.
 * A gesture is a pure pose curve over t ∈ [0,1] with a soft in/out
 * envelope; the frame builder adds it on top of the idle (or seat) pose,
 * so gestures compose with breathing and riding.
 *
 * Angle conventions (facing right): positive offsets on the near arm swing
 * it forward/up; the far arm mirrors with the opposite sign. Positive head
 * offsets tilt back, negative droop forward. Positive pelvis leans back.
 */

import { clamp } from '@motionforge/core';

import type { RigPose } from './rig.js';

export const GESTURE_KINDS = [
  'point',
  'wave',
  'salute',
  'facepalm',
  'shrug',
  'clap',
  'nod',
  'shake-head',
  'bow',
] as const;

export type GestureKind = (typeof GESTURE_KINDS)[number];

/** Default gesture length, seconds (schema-checked against M12.5). */
export const GESTURE_DEFAULT_SECONDS: Readonly<Record<GestureKind, number>> = {
  point: 1.4,
  wave: 1.6,
  salute: 1.3,
  facepalm: 1.7,
  shrug: 1.4,
  clap: 1.6,
  nod: 1.2,
  'shake-head': 1.2,
  bow: 1.6,
};

/** Soft ramp in and out; full strength through the middle. */
const envelope = (t: number): number => {
  const u = clamp(t, 0, 1);
  const RAMP = 0.18;
  if (u < RAMP) return Math.sin(((u / RAMP) * Math.PI) / 2);
  if (u > 1 - RAMP) return Math.sin((((1 - u) / RAMP) * Math.PI) / 2);
  return 1;
};

const scalePose = (pose: RigPose, k: number): RigPose =>
  Object.fromEntries(Object.entries(pose).map(([bone, angle]) => [bone, angle * k]));

/** The gesture's pose at normalized time t. Pure. */
export function gesturePose(kind: GestureKind, t: number): RigPose {
  const e = envelope(t);
  switch (kind) {
    case 'point':
      // Arm shoots out level with the shoulder, dead ahead.
      return scalePose({ 'arm-r-upper': 1.4, 'arm-r-lower': -0.35, head: 0.04 }, e);
    case 'wave': {
      const flap = Math.sin(t * Math.PI * 2 * 2.5) * 0.55;
      return scalePose({ 'arm-r-upper': 2.15, 'arm-r-lower': -0.5 + flap, head: 0.05 }, e);
    }
    case 'salute':
      // Forearm folds up-and-back so the hand lands at the brow.
      return scalePose({ 'arm-r-upper': 1.5, 'arm-r-lower': 1.1, head: 0.05, pelvis: 0.03 }, e);
    case 'facepalm':
      // Hand comes up onto the face while the head droops into it.
      return scalePose({ 'arm-r-upper': 1.95, 'arm-r-lower': 1.05, head: -0.3, pelvis: -0.05 }, e);
    case 'shrug':
      return scalePose(
        {
          'arm-r-upper': 0.75,
          'arm-r-lower': 1.0,
          'arm-l-upper': -0.75,
          'arm-l-lower': -1.0,
          head: 0.08,
        },
        e,
      );
    case 'clap': {
      const beat = Math.abs(Math.sin(t * Math.PI * 2 * 2.5)) * 0.22;
      // Both hands meet at chest height; the counter-beat sells the claps.
      return scalePose(
        {
          'arm-r-upper': 1.2 + beat,
          'arm-r-lower': 0.15,
          'arm-l-upper': 1.75 - beat,
          'arm-l-lower': -0.15,
        },
        e,
      );
    }
    case 'nod': {
      const dip = (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 2.5)) * -0.24;
      return { head: dip * e };
    }
    case 'shake-head':
      return { head: Math.sin(t * Math.PI * 2 * 3) * 0.15 * e };
    case 'bow':
      return scalePose(
        { pelvis: -0.55, head: -0.18, 'arm-r-upper': -0.25, 'arm-l-upper': 0.25 },
        e,
      );
  }
}
