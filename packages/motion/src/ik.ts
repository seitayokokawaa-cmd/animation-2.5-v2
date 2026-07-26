/**
 * Analytic two-bone IK (M6.2): given a shoulder position, a reach target,
 * and two bone lengths, return the world angles of both bones via the law
 * of cosines. Out-of-reach targets clamp to a straight arm pointing at the
 * target — no iteration, no drift, fully deterministic.
 */

import { clamp, type Vec2 } from '@motionforge/core';

export interface TwoBoneSolution {
  /** World angle of the upper bone, radians. */
  readonly upper: number;
  /** World angle of the lower bone, radians. */
  readonly lower: number;
  /** True when the target was beyond reach and the arm is straight. */
  readonly clamped: boolean;
}

/**
 * `bend` picks the elbow side: +1 bends one way, −1 the other
 * (characters usually bend elbows "down/back", knees "forward").
 */
export function twoBoneIk(
  root: Vec2,
  target: Vec2,
  upperLength: number,
  lowerLength: number,
  bend: 1 | -1 = 1,
): TwoBoneSolution {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const distance = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);

  const maxReach = upperLength + lowerLength;
  if (distance >= maxReach || distance === 0) {
    return { upper: base, lower: base, clamped: true };
  }

  // Law of cosines for the shoulder and elbow interior angles.
  const cosShoulder =
    (upperLength * upperLength + distance * distance - lowerLength * lowerLength) /
    (2 * upperLength * distance);
  const shoulderOffset = Math.acos(clamp(cosShoulder, -1, 1));
  const cosElbow =
    (upperLength * upperLength + lowerLength * lowerLength - distance * distance) /
    (2 * upperLength * lowerLength);
  const elbowInterior = Math.acos(clamp(cosElbow, -1, 1));

  const upper = base + bend * shoulderOffset;
  const lower = upper + bend * (elbowInterior - Math.PI);
  return { upper, lower, clamped: false };
}

/** End position implied by a solution — for tests and debug overlays. */
export function ikEndPoint(
  root: Vec2,
  solution: TwoBoneSolution,
  upperLength: number,
  lowerLength: number,
): Vec2 {
  const elbowX = root.x + Math.cos(solution.upper) * upperLength;
  const elbowY = root.y + Math.sin(solution.upper) * upperLength;
  return {
    x: elbowX + Math.cos(solution.lower) * lowerLength,
    y: elbowY + Math.sin(solution.lower) * lowerLength,
  };
}
