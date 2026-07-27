/**
 * PBD physics kernel (M14.3, ADR 0010): Verlet particles + distance and
 * angle constraints + ground/AABB/circle colliders, stepped at fixed
 * 120 Hz substeps with fixed iteration counts. State at tick T is a
 * bounded replay fold from the effect start — `simulate` re-runs the
 * same substeps every frame, so frame N stays a pure function of
 * (film, tick) and the solver holds no cross-frame state.
 *
 * Everything here is frozen engine physics, not authoring knobs:
 * changing PBD_SUBSTEPS or PBD_ITERATIONS re-times every golden.
 */

import { TICKS_PER_SECOND, vec2, type Vec2 } from '@motionforge/core';

/** Fixed substeps per 120 Hz tick (ADR 0010). */
export const PBD_SUBSTEPS = 4;
/** Fixed constraint-solve iterations per substep (ADR 0010). */
export const PBD_ITERATIONS = 8;
/** Default gravity, world units/s² (negative y is down in world space). */
export const PBD_GRAVITY = -14;
/** Velocity damping per substep (air drag; keeps tumbles from ringing). */
export const PBD_DAMPING = 0.999;

export interface PbdParticle {
  pos: Vec2;
  /** Previous position — Verlet's implicit velocity store. */
  prev: Vec2;
  /** 1/mass; 0 pins the particle (kinematic anchor). */
  invMass: number;
  /** Collision radius, world units. */
  radius: number;
}

/** Keep particles `a` and `b` exactly `rest` apart (a bone). */
export interface DistanceConstraint {
  readonly kind: 'distance';
  readonly a: number;
  readonly b: number;
  readonly rest: number;
  /** 0..1 positional stiffness per iteration (1 = rigid). */
  readonly stiffness?: number;
}

/**
 * Clamp the angle at the joint `pivot` between segments pivot→a and
 * pivot→b to [min, max] radians (a joint limit — elbows don't bend
 * backward, even in cartoons).
 */
export interface AngleConstraint {
  readonly kind: 'angle';
  readonly pivot: number;
  readonly a: number;
  readonly b: number;
  readonly min: number;
  readonly max: number;
}

export type PbdConstraint = DistanceConstraint | AngleConstraint;

/** The floor: an infinite horizontal line at `y`, solid below. */
export interface GroundCollider {
  readonly kind: 'ground';
  readonly y: number;
}

/** A solid axis-aligned box (crates, walls, stage furniture). */
export interface AabbCollider {
  readonly kind: 'aabb';
  readonly min: Vec2;
  readonly max: Vec2;
}

/** A solid circle (boulders, heads, cannonballs). */
export interface CircleCollider {
  readonly kind: 'circle';
  readonly center: Vec2;
  readonly r: number;
}

export type PbdCollider = GroundCollider | AabbCollider | CircleCollider;

export interface PbdWorld {
  readonly particles: PbdParticle[];
  readonly constraints: readonly PbdConstraint[];
  readonly colliders: readonly PbdCollider[];
  /** World units/s²; defaults to PBD_GRAVITY. */
  readonly gravity?: number;
  /** Tangential velocity kept on contact (0 grips, 1 slides freely). */
  readonly friction?: number;
  /** Normal velocity bounced back on contact (0 thuds, 1 superball). */
  readonly restitution?: number;
}

/** A particle with velocity `vel` (units/s), for building worlds. */
export function particle(pos: Vec2, vel: Vec2, invMass = 1, radius = 0.05): PbdParticle {
  const dt = 1 / (TICKS_PER_SECOND * PBD_SUBSTEPS);
  return { pos, prev: vec2(pos.x - vel.x * dt, pos.y - vel.y * dt), invMass, radius };
}

const solveDistance = (p: PbdParticle[], c: DistanceConstraint): void => {
  const a = p[c.a]!;
  const b = p[c.b]!;
  const w = a.invMass + b.invMass;
  if (w === 0) return;
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const k = ((len - c.rest) / (len * w)) * (c.stiffness ?? 1);
  a.pos = vec2(a.pos.x + dx * k * a.invMass, a.pos.y + dy * k * a.invMass);
  b.pos = vec2(b.pos.x - dx * k * b.invMass, b.pos.y - dy * k * b.invMass);
};

const solveAngle = (p: PbdParticle[], c: AngleConstraint): void => {
  const pivot = p[c.pivot]!;
  const a = p[c.a]!;
  const b = p[c.b]!;
  const angA = Math.atan2(a.pos.y - pivot.pos.y, a.pos.x - pivot.pos.x);
  const angB = Math.atan2(b.pos.y - pivot.pos.y, b.pos.x - pivot.pos.x);
  // Signed joint angle in (-π, π].
  let joint = angB - angA;
  while (joint <= -Math.PI) joint += 2 * Math.PI;
  while (joint > Math.PI) joint -= 2 * Math.PI;
  const clamped = joint < c.min ? c.min : joint > c.max ? c.max : joint;
  if (clamped === joint) return;
  // Rotate b about the pivot to the clamped angle (soft half-correction
  // per iteration keeps chains from snapping).
  const target = angA + clamped;
  const r = Math.hypot(b.pos.x - pivot.pos.x, b.pos.y - pivot.pos.y);
  const correct = 0.5;
  const angle = angB + (target - angB) * correct;
  if (b.invMass === 0) return;
  b.pos = vec2(pivot.pos.x + Math.cos(angle) * r, pivot.pos.y + Math.sin(angle) * r);
};

/**
 * Push a particle out of a collider along the contact normal; apply
 * friction (tangent) and restitution (normal) by rewriting `prev` so the
 * Verlet velocity reflects the contact response.
 */
const collide = (pt: PbdParticle, normal: Vec2, depth: number, world: PbdWorld): void => {
  if (depth <= 0 || pt.invMass === 0) return;
  pt.pos = vec2(pt.pos.x + normal.x * depth, pt.pos.y + normal.y * depth);
  const vx = pt.pos.x - pt.prev.x;
  const vy = pt.pos.y - pt.prev.y;
  const vn = vx * normal.x + vy * normal.y;
  const tx = vx - vn * normal.x;
  const ty = vy - vn * normal.y;
  const friction = world.friction ?? 0.85;
  const restitution = world.restitution ?? 0.25;
  // New velocity: damped tangent, reflected damped normal.
  const nvx = tx * friction - vn * restitution * normal.x;
  const nvy = ty * friction - vn * restitution * normal.y;
  pt.prev = vec2(pt.pos.x - nvx, pt.pos.y - nvy);
};

const solveColliders = (world: PbdWorld): void => {
  for (const col of world.colliders) {
    for (const pt of world.particles) {
      if (col.kind === 'ground') {
        collide(pt, vec2(0, 1), col.y + pt.radius - pt.pos.y, world);
      } else if (col.kind === 'aabb') {
        // Nearest-face pushout when the (inflated) box contains the point.
        const minX = col.min.x - pt.radius;
        const maxX = col.max.x + pt.radius;
        const minY = col.min.y - pt.radius;
        const maxY = col.max.y + pt.radius;
        if (pt.pos.x <= minX || pt.pos.x >= maxX || pt.pos.y <= minY || pt.pos.y >= maxY) {
          continue;
        }
        const dl = pt.pos.x - minX;
        const dr = maxX - pt.pos.x;
        const db = pt.pos.y - minY;
        const dtp = maxY - pt.pos.y;
        const m = Math.min(dl, dr, db, dtp);
        if (m === dl) collide(pt, vec2(-1, 0), dl, world);
        else if (m === dr) collide(pt, vec2(1, 0), dr, world);
        else if (m === db) collide(pt, vec2(0, -1), db, world);
        else collide(pt, vec2(0, 1), dtp, world);
      } else {
        const dx = pt.pos.x - col.center.x;
        const dy = pt.pos.y - col.center.y;
        const d = Math.hypot(dx, dy);
        const rr = col.r + pt.radius;
        if (d >= rr) continue;
        const n = d === 0 ? vec2(0, 1) : vec2(dx / d, dy / d);
        collide(pt, n, rr - d, world);
      }
    }
  }
};

/** One fixed substep: integrate, solve constraints, resolve contacts. */
export function pbdStep(world: PbdWorld): void {
  const dt = 1 / (TICKS_PER_SECOND * PBD_SUBSTEPS);
  const g = world.gravity ?? PBD_GRAVITY;
  for (const pt of world.particles) {
    if (pt.invMass === 0) continue;
    const vx = (pt.pos.x - pt.prev.x) * PBD_DAMPING;
    const vy = (pt.pos.y - pt.prev.y) * PBD_DAMPING + g * dt * dt;
    pt.prev = pt.pos;
    pt.pos = vec2(pt.pos.x + vx, pt.pos.y + vy);
  }
  for (let i = 0; i < PBD_ITERATIONS; i++) {
    for (const c of world.constraints) {
      if (c.kind === 'distance') solveDistance(world.particles, c);
      else solveAngle(world.particles, c);
    }
    solveColliders(world);
  }
}

/**
 * The replay fold (ADR 0010): step `ticks` whole ticks (PBD_SUBSTEPS
 * substeps each) and return the world. Mutates and returns `world` —
 * callers build a fresh initial world per frame.
 */
export function simulate(world: PbdWorld, ticks: number): PbdWorld {
  const steps = Math.max(0, Math.round(ticks)) * PBD_SUBSTEPS;
  for (let i = 0; i < steps; i++) pbdStep(world);
  return world;
}
