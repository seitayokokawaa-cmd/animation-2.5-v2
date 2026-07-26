/**
 * Poses — additive/multiplicative modifiers that motion-graphics verbs
 * apply on top of a node's base transform (ADR-0008). Sampling is a pure
 * function of (verb, params, tick, seed); combining is order-independent
 * for translate/rotate and multiplicative for scale/opacity.
 */

import { vec2, type Vec2 } from './math.js';
import { fnv1a, Pcg32 } from './rng.js';

export interface Pose {
  /** World units, added to the node position. */
  readonly translate?: Vec2;
  /** Radians, added. */
  readonly rotate?: number;
  /** Multiplied per axis; default [1,1]. */
  readonly scale?: Vec2;
  /** Multiplied; default 1. */
  readonly opacity?: number;
}

export const IDENTITY_POSE: Pose = {};

export function combinePoses(poses: readonly Pose[]): Pose {
  let tx = 0;
  let ty = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  let opacity = 1;
  for (const pose of poses) {
    tx += pose.translate?.x ?? 0;
    ty += pose.translate?.y ?? 0;
    rot += pose.rotate ?? 0;
    sx *= pose.scale?.x ?? 1;
    sy *= pose.scale?.y ?? 1;
    opacity *= pose.opacity ?? 1;
  }
  return { translate: vec2(tx, ty), rotate: rot, scale: vec2(sx, sy), opacity };
}

/**
 * Pure seeded noise: uniform [0,1) as a function of (seed, stream, step) —
 * no sequence state, so any tick can be sampled in any order (ADR-0004).
 */
export function hashNoise(filmSeed: number, stream: string, step: number): number {
  return new Pcg32(filmSeed, (BigInt(fnv1a(stream)) << 32n) | BigInt(step >>> 0)).nextFloat();
}

/** Signed variant in [-1, 1). */
export const hashNoiseSigned = (filmSeed: number, stream: string, step: number): number =>
  hashNoise(filmSeed, stream, step) * 2 - 1;
