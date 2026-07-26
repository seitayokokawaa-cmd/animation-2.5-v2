/**
 * Locomotion cycles (M14.2): climb, swim, and fly as pure bone-pose
 * cycles over normalized time — the companions to the planted gait. The
 * verbs compile to a pos clip + one of these effects; the frame builder
 * adds the cycle's bone offsets exactly like gestures. Cycles reference
 * the shared bone vocabulary and are harmless on rigs that lack a bone.
 */

import type { RigPose } from './rig.js';

export const LOCOMOTION_KINDS = ['climb', 'swim', 'fly'] as const;
export type LocomotionKind = (typeof LOCOMOTION_KINDS)[number];

/** Cycle rates, cycles per second (compile packs cycles = rate × secs). */
export const LOCOMOTION_RATES: Readonly<Record<LocomotionKind, number>> = {
  climb: 1.1,
  swim: 1.4,
  fly: 3.2,
};

/**
 * Bone offsets at cycle phase `c` (in cycles, fractional). Biped bones
 * (arms/legs) and creature bones (wings/tail) both get curves, so one
 * verb serves potatoes, birds, and fish.
 */
export function locomotionPose(kind: LocomotionKind, c: number): RigPose {
  const w = 2 * Math.PI * c;
  switch (kind) {
    case 'climb':
      // The far arm (drawn behind the head) does the big overhead
      // reaches; the near arm pumps at chest height so it never covers
      // the face. Legs pump opposite; the torso leans into the wall.
      return {
        'arm-r-upper': 1.35 + Math.sin(w) * 0.4,
        'arm-l-upper': 2.05 + Math.sin(w + Math.PI) * 0.5,
        'arm-r-lower': 0.25,
        'arm-l-lower': 0.25,
        'leg-r': Math.sin(w + Math.PI) * 0.45,
        'leg-l': Math.sin(w) * 0.45,
        body: 0.1,
      };
    case 'swim':
      // Breaststroke arms for bipeds, a strong tail wave for fish.
      return {
        'arm-r-upper': 1.4 + Math.sin(w) * 0.7,
        'arm-l-upper': 1.4 + Math.sin(w + 0.5) * 0.7,
        'leg-r': Math.sin(w) * 0.3,
        'leg-l': Math.sin(w + Math.PI) * 0.3,
        tail: Math.sin(w) * 0.5,
        body: Math.sin(w) * 0.05,
      };
    case 'fly':
      // Wing flaps (far wing trails a touch); legs trail; tail steers.
      return {
        'wing-n': Math.sin(w) * 0.85,
        'wing-f': Math.sin(w - 0.5) * 0.85,
        'leg-r': -0.5,
        'leg-l': -0.5,
        tail: Math.sin(w * 0.5) * 0.15,
        'arm-r-upper': Math.sin(w) * 0.4,
        'arm-l-upper': Math.sin(w - 0.4) * 0.4,
      };
  }
}
