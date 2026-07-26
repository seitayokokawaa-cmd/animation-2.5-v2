/**
 * Planted gait (M14.1, plan §5.4): walk/run/sneak as footstep-planned
 * locomotion. The body glides linearly (the pos track); each foot plants
 * at fixed world points spaced one step apart and stays put through its
 * stance — the stance leg's rotation is solved from the plant, and the
 * body height follows the stance geometry (the inverted-pendulum bob
 * falls out for free). No foot sliding, by construction: the no-slide CI
 * metric in gait.test.ts measures exactly that.
 *
 * Everything is a pure function of distance traveled, so frame N stays a
 * pure function of the film and the tick.
 */

import { clamp } from '@motionforge/core';

import type { RigPose } from './rig.js';

export const GAIT_KINDS = ['walk', 'run', 'sneak'] as const;
export type GaitKind = (typeof GAIT_KINDS)[number];

export interface GaitSpec {
  /** One step (plant to opposite plant), size units. */
  readonly step: number;
  /** Cruise speed, size units per second (compile derives durations). */
  readonly speed: number;
  /** Swing-leg high-step kick, radians. */
  readonly tuck: number;
  /** Constant crouch, size units. */
  readonly crouch: number;
  /** Forward lean into the motion, radians. */
  readonly lean: number;
  /** Arm counter-swing amplitude, radians. */
  readonly armSwing: number;
}

export const GAITS: Readonly<Record<GaitKind, GaitSpec>> = {
  // Steps stay within the stubby legs' reach (S/2 + hip offset ≤ 0.9·L):
  // potato characters mince — runs read fast via cadence, lean, and
  // kick, not stride length.
  // Crouch stays subtle: with knee-less legs it sinks the planted foot
  // (the boots hide ≤ 0.025), so sneak reads mostly through lean + pace.
  walk: { step: 0.28, speed: 1.4, tuck: 0.45, crouch: 0, lean: 0.05, armSwing: 0.3 },
  run: { step: 0.3, speed: 2.8, tuck: 0.85, crouch: 0, lean: 0.2, armSwing: 0.55 },
  sneak: { step: 0.18, speed: 0.6, tuck: 0.6, crouch: 0.025, lean: 0.2, armSwing: 0.12 },
};

/** Potato-biped leg length in size units (kept in step with the template). */
export const GAIT_LEG_LENGTH = 0.35;

/** Fore/aft hip offset per leg in size units (leg-r ahead, leg-l behind —
 * the template's pelvis-local ±0.16 sideways offset reads as horizontal
 * spread in profile). */
export const GAIT_HIP_OFFSET = 0.16;

export interface GaitSample {
  /** Leg + arm rotation offsets to add onto the idle pose. */
  readonly pose: RigPose;
  /** Body drop, world units (stance geometry + crouch). */
  readonly drop: number;
  /** Forward lean magnitude, radians (frame signs it by facing). */
  readonly lean: number;
  /** Stance foot + its plant (path units) — the no-slide metric reads it. */
  readonly stance: { readonly foot: 'leg-r' | 'leg-l'; readonly plant: number };
}

/** Where a foot with plants at `offset + 2kS` stands/swings at body x. */
function footPhase(
  x: number,
  step: number,
  offset: number,
): { stance: boolean; plant: number; swing: number } {
  // The foot is in stance while the body travels the step centered on its
  // plant, then swings for one step to the next plant.
  const local = (x - offset) / (2 * step) + 0.25;
  const cycle = local - Math.floor(local); // [0,1): stance [0,0.5), swing [0.5,1)
  const index = Math.floor(local);
  if (cycle < 0.5) {
    return { stance: true, plant: offset + index * 2 * step, swing: 0 };
  }
  return { stance: false, plant: offset + (index + 1) * 2 * step, swing: (cycle - 0.5) * 2 };
}

/**
 * Sample the gait at `traveled` world units along the path. `dir` is the
 * motion sign in rig-forward terms (+1 when walking the way the
 * character faces).
 */
export function gaitSample(kind: GaitKind, traveled: number, size: number, dir = 1): GaitSample {
  const spec = GAITS[kind];
  const S = spec.step * size;
  const L = GAIT_LEG_LENGTH * size;
  const x = traveled;

  /** Rig-forward hip offset of a leg's pivot from the body center. */
  const hipOffset = (bone: 'leg-r' | 'leg-l'): number =>
    (bone === 'leg-r' ? 1 : -1) * GAIT_HIP_OFFSET * size;

  // Both feet share one plant grid (alternating every step); the solver
  // compensates each hip's fore/aft art offset so the foot really lands
  // on the shared grid.
  const feet = [
    { bone: 'leg-r' as const, phase: footPhase(x, S, 0) },
    { bone: 'leg-l' as const, phase: footPhase(x, S, S) },
  ];
  const stanceFoot = feet.find((f) => f.phase.stance) ?? feet[0]!;
  const swingFoot = feet.find((f) => !f.phase.stance);

  const angleFor = (dx: number): number => Math.asin(clamp(dx / L, -0.9, 0.9));

  const pose: Record<string, number> = {};
  // Stance: solve the leg so the foot stays on its plant, compensating
  // the hip's own fore/aft offset.
  const stanceO = hipOffset(stanceFoot.bone);
  const stanceDx = (stanceFoot.phase.plant - x) * dir - stanceO;
  const stanceAngle = angleFor(stanceDx);
  pose[stanceFoot.bone] = stanceAngle;
  // Swing: release from a trailing half-step, land a half-step ahead,
  // with a high-step kick so the foot clears the ground.
  if (swingFoot) {
    const w = swingFoot.phase.swing;
    const eased = w * w * (3 - 2 * w);
    const o = hipOffset(swingFoot.bone);
    const releaseAngle = angleFor(-S / 2 - o);
    const landAngle = angleFor(S / 2 - o);
    pose[swingFoot.bone] =
      releaseAngle + (landAngle - releaseAngle) * eased + Math.sin(Math.PI * w) * spec.tuck;
  }
  // Arms counter-swing; the stride phase drives both.
  const stride = Math.sin((Math.PI * x) / S);
  pose['arm-r-upper'] = spec.armSwing * stride;
  pose['arm-l-upper'] = -spec.armSwing * stride;

  const drop = L - L * Math.cos(stanceAngle) + spec.crouch * size;
  return {
    pose,
    drop,
    lean: spec.lean,
    stance: { foot: stanceFoot.bone, plant: stanceFoot.phase.plant },
  };
}
