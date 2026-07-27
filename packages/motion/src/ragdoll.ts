/**
 * Ragdoll + blend-back (M14.4, plan §5.7, ADR 0010): map any character
 * skeleton onto PBD particles, go limp, tumble deterministically, then
 * blend the settled pose back to acting. The whole thing is a bounded
 * replay fold — `ragdollPose(elapsed)` re-simulates from the effect
 * start every frame, so frame N stays pure in (film, tick).
 *
 * Mapping: every bone contributes two particles (its start and tip).
 * The bone itself is a rigid distance constraint; the start is pinned
 * into the parent segment's frame with two more distances (to the
 * parent's start and tip) — rigid attachment, free rotation. The pose
 * is read back by walking bones in FK order and converting each
 * particle pair's world angle into a rotation offset from rest.
 */

import { clamp, ease, vec2, type Vec2 } from '@motionforge/core';

import { particle, simulate, type PbdConstraint, type PbdParticle, type PbdWorld } from './pbd.js';
import type { CharacterTemplate } from './potato.js';
import { fk, type RigPose } from './rig.js';

/** Fraction of a ragdoll effect spent simulating before recovery. */
export const RAGDOLL_SETTLE = 0.7;
/** Default toss velocity, world units/s (rig-forward x, up y). */
export const RAGDOLL_IMPULSE: Vec2 = { x: 1.2, y: 2.4 };

export interface RagdollSample {
  /** Full-body pose (offsets from rest) — replaces the acting pose. */
  readonly pose: RigPose;
  /** Root displacement of the skeleton origin, rig units. */
  readonly shift: Vec2;
}

const TWO_PI = 2 * Math.PI;
const wrapAngle = (a: number): number => {
  let x = a % TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  return x;
};

/** Build the PBD world for a template's skeleton in a given pose. */
export function ragdollWorld(
  template: CharacterTemplate,
  initialPose: RigPose,
  impulse: Vec2,
): PbdWorld {
  const s = template.size;
  const bones = template.skeleton.bones;
  const world = fk(template.skeleton, initialPose);
  const particles: PbdParticle[] = [];
  const constraints: PbdConstraint[] = [];
  const index = new Map<string, { start: number; tip: number }>();

  for (const bone of bones) {
    const bw = world.get(bone.id)!;
    // The head tip carries the big cranium; the torso is stocky; limbs
    // are twigs. Radii keep the silhouette off the floor.
    const isHead = bone.id === template.headBone;
    const isRoot = bone.parent === undefined;
    // Radii sized to the drawn silhouette (big cranium, stocky torso) so
    // the settled body rests on the ground instead of sinking into it —
    // but the hip stays under the leg length or standing would pop.
    const tipRadius = isHead ? template.headRadius * 0.95 : isRoot ? 0.28 * s : 0.05 * s;
    const startRadius = isRoot ? 0.2 * s : 0.05 * s;
    const invMass = isRoot ? 0.6 : 1;
    const start = particles.push(particle(bw.start, impulse, invMass, startRadius)) - 1;
    const tip = particles.push(particle(bw.end, impulse, invMass, tipRadius)) - 1;
    index.set(bone.id, { start, tip });
    if (bone.length > 0) {
      constraints.push({ kind: 'distance', a: start, b: tip, rest: bone.length });
    }
    if (bone.parent) {
      const p = index.get(bone.parent)!;
      const pw = world.get(bone.parent)!;
      // Rigid attachment into the parent segment (free rotation).
      constraints.push(
        {
          kind: 'distance',
          a: start,
          b: p.start,
          rest: Math.hypot(bw.start.x - pw.start.x, bw.start.y - pw.start.y),
        },
        {
          kind: 'distance',
          a: start,
          b: p.tip,
          rest: Math.hypot(bw.start.x - pw.end.x, bw.start.y - pw.end.y),
        },
      );
    }
  }

  return {
    particles,
    constraints,
    colliders: [{ kind: 'ground', y: 0 }],
    friction: 0.75,
    restitution: 0.2,
  };
}

/** Read the rig pose + root shift back out of a simulated world. */
export function ragdollReadback(template: CharacterTemplate, world: PbdWorld): RagdollSample {
  const bones = template.skeleton.bones;
  const pose: Record<string, number> = {};
  const angles = new Map<string, number>();
  let shift = vec2(0, 0);
  let cursor = 0;
  for (const bone of bones) {
    const start = world.particles[cursor]!;
    const tip = world.particles[cursor + 1]!;
    cursor += 2;
    const angle =
      bone.length > 0
        ? Math.atan2(tip.pos.y - start.pos.y, tip.pos.x - start.pos.x)
        : (angles.get(bone.parent ?? '') ?? 0) + bone.rest;
    angles.set(bone.id, angle);
    const parentAngle = bone.parent ? (angles.get(bone.parent) ?? 0) : 0;
    pose[bone.id] = wrapAngle(angle - parentAngle - bone.rest);
    if (bone.parent === undefined) {
      const rest = fk(template.skeleton, {}).get(bone.id)!;
      shift = vec2(start.pos.x - rest.start.x, start.pos.y - rest.start.y);
    }
  }
  return { pose, shift };
}

/**
 * The full verb: limp tumble for `RAGDOLL_SETTLE` of the window, then
 * blend pose and shift back to neutral so acting resumes in place.
 * Pure in its arguments — call it fresh every frame (ADR 0010).
 */
export function ragdollPose(
  template: CharacterTemplate,
  initialPose: RigPose,
  impulse: Vec2,
  elapsedTicks: number,
  durationTicks: number,
): RagdollSample {
  const settleTicks = Math.max(1, Math.round(durationTicks * RAGDOLL_SETTLE));
  const simTicks = Math.min(Math.max(0, elapsedTicks), settleTicks);
  const world = simulate(ragdollWorld(template, initialPose, impulse), simTicks);
  const settled = ragdollReadback(template, world);
  if (elapsedTicks <= settleTicks) return settled;
  // Recovery: ease every offset (and the root shift) back to zero.
  const r = clamp((elapsedTicks - settleTicks) / (durationTicks - settleTicks), 0, 1);
  const keep = 1 - ease('cubicInOut', r);
  const pose: Record<string, number> = {};
  for (const [id, angle] of Object.entries(settled.pose)) pose[id] = angle * keep;
  return { pose, shift: vec2(settled.shift.x * keep, settled.shift.y * keep) };
}
