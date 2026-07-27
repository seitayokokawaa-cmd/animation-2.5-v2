/**
 * PBD kernel (M14.3, ADR 0010): stability, contact response, constraint
 * holding, and the pure-replay determinism the frame builder relies on.
 */
import { distance, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { particle, PBD_SUBSTEPS, PBD_ITERATIONS, pbdStep, simulate, type PbdWorld } from './pbd.js';

const drop = (overrides: Partial<PbdWorld> = {}): PbdWorld => ({
  particles: [particle(vec2(0, 2), vec2(0, 0), 1, 0.05)],
  constraints: [],
  colliders: [{ kind: 'ground', y: 0 }],
  ...overrides,
});

describe('pbd kernel (M14.3)', () => {
  it('freezes the solver parameters the goldens depend on', () => {
    expect(PBD_SUBSTEPS).toBe(4);
    expect(PBD_ITERATIONS).toBe(8);
  });

  it('replay is deterministic: same fold, same bits', () => {
    const a = simulate(drop(), 90);
    const b = simulate(drop(), 90);
    expect(a.particles).toEqual(b.particles);
    // And a fold to T equals a fold to T-30 continued 30 more ticks.
    const partial = simulate(drop(), 60);
    for (let i = 0; i < 30 * PBD_SUBSTEPS; i++) pbdStep(partial);
    expect(partial.particles).toEqual(a.particles);
  });

  it('a dropped ball lands on the ground and stays there', () => {
    const world = simulate(drop(), 240); // 2 s — plenty to settle
    const p = world.particles[0]!;
    expect(p.pos.y).toBeCloseTo(0.05, 2); // resting at its radius
    expect(Math.abs(p.pos.x)).toBeLessThan(1e-9); // no sideways drift
    expect(Math.abs(p.pos.y - p.prev.y)).toBeLessThan(1e-4); // at rest
  });

  it('restitution bounces, and each bounce is lower', () => {
    const world = drop({ restitution: 0.8, friction: 1 });
    let apex1 = 0;
    let apex2 = 0;
    let bounces = 0;
    let rising = false;
    for (let t = 0; t < 480; t++) {
      const before = world.particles[0]!.pos.y;
      for (let i = 0; i < PBD_SUBSTEPS; i++) pbdStep(world);
      const after = world.particles[0]!.pos.y;
      if (after > before && !rising) {
        rising = true;
        bounces++;
      }
      if (after < before) rising = false;
      if (bounces === 1) apex1 = Math.max(apex1, after);
      if (bounces === 2) apex2 = Math.max(apex2, after);
    }
    expect(bounces).toBeGreaterThanOrEqual(2);
    expect(apex1).toBeGreaterThan(0.5); // a real bounce off a 2-unit drop
    expect(apex2).toBeLessThan(apex1); // decaying, not superball
  });

  it('a falling rod keeps its length through flight and landing', () => {
    const world: PbdWorld = {
      particles: [particle(vec2(-0.3, 2), vec2(0, 0)), particle(vec2(0.3, 2.2), vec2(0, 0))],
      constraints: [{ kind: 'distance', a: 0, b: 1, rest: Math.hypot(0.6, 0.2) }],
      colliders: [{ kind: 'ground', y: 0 }],
    };
    const rest = Math.hypot(0.6, 0.2);
    for (let t = 0; t < 300; t++) {
      for (let i = 0; i < PBD_SUBSTEPS; i++) pbdStep(world);
      const len = distance(world.particles[0]!.pos, world.particles[1]!.pos);
      expect(Math.abs(len - rest)).toBeLessThan(0.02);
    }
    // It ends up lying on the ground.
    expect(world.particles[0]!.pos.y).toBeLessThan(0.2);
    expect(world.particles[1]!.pos.y).toBeLessThan(0.2);
  });

  it('a pinned pendulum swings without stretching its string', () => {
    const world: PbdWorld = {
      particles: [particle(vec2(0, 2), vec2(0, 0), 0), particle(vec2(0.5, 2), vec2(0, 0))],
      constraints: [{ kind: 'distance', a: 0, b: 1, rest: 0.5 }],
      colliders: [],
    };
    let minX = Infinity;
    for (let t = 0; t < 240; t++) {
      for (let i = 0; i < PBD_SUBSTEPS; i++) pbdStep(world);
      expect(world.particles[0]!.pos).toEqual(vec2(0, 2)); // the pin holds
      expect(distance(world.particles[0]!.pos, world.particles[1]!.pos)).toBeCloseTo(0.5, 2);
      minX = Math.min(minX, world.particles[1]!.pos.x);
    }
    expect(minX).toBeLessThan(0); // it swung through the bottom and past
  });

  it('AABB and circle colliders hold particles out', () => {
    const world: PbdWorld = {
      particles: [
        particle(vec2(0, 2), vec2(0, 0), 1, 0.05), // onto the crate
        particle(vec2(2.3, 2), vec2(0, 0), 1, 0.05), // grazing the ball
      ],
      constraints: [],
      colliders: [
        { kind: 'ground', y: 0 },
        { kind: 'aabb', min: vec2(-0.5, 0), max: vec2(0.5, 1) },
        { kind: 'circle', center: vec2(2, 0.5), r: 0.5 },
      ],
    };
    simulate(world, 300);
    // First particle rests on the crate lid.
    expect(world.particles[0]!.pos.y).toBeCloseTo(1.05, 2);
    // Second slid off the circle and rests on the ground beside it.
    const off = world.particles[1]!;
    expect(off.pos.y).toBeCloseTo(0.05, 2);
    expect(distance(off.pos, vec2(2, 0.5))).toBeGreaterThan(0.549);
  });

  it('angle limits stop a chain folding past its joint range', () => {
    // An elbow: upper arm pinned horizontal, forearm launched to slam
    // shut — the limit keeps the joint from folding past ~30°.
    const world: PbdWorld = {
      particles: [
        particle(vec2(0, 1), vec2(0, 0), 0),
        particle(vec2(0.4, 1), vec2(0, 0), 0),
        particle(vec2(0.8, 1), vec2(0, 6)),
      ],
      constraints: [
        { kind: 'distance', a: 1, b: 2, rest: 0.4 },
        { kind: 'angle', pivot: 1, a: 0, b: 2, min: -Math.PI + 0.5, max: -0.5 },
      ],
      colliders: [],
      gravity: 0,
    };
    for (let t = 0; t < 120; t++) {
      for (let i = 0; i < PBD_SUBSTEPS; i++) pbdStep(world);
      const [shoulder, elbow, wrist] = world.particles;
      const angA = Math.atan2(shoulder!.pos.y - elbow!.pos.y, shoulder!.pos.x - elbow!.pos.x);
      const angB = Math.atan2(wrist!.pos.y - elbow!.pos.y, wrist!.pos.x - elbow!.pos.x);
      let joint = angB - angA;
      while (joint <= -Math.PI) joint += 2 * Math.PI;
      while (joint > Math.PI) joint -= 2 * Math.PI;
      // Soft solve: allow a whisker of overshoot, never a fold-through.
      expect(joint).toBeLessThan(-0.4);
      expect(joint).toBeGreaterThan(-Math.PI + 0.4);
    }
  });

  it('stays finite and calm over a long tumble (unconditional stability)', () => {
    const world: PbdWorld = {
      particles: [
        particle(vec2(-0.2, 3), vec2(4, 2)),
        particle(vec2(0.2, 3.1), vec2(4, 2)),
        particle(vec2(0, 3.4), vec2(4, 2)),
      ],
      constraints: [
        { kind: 'distance', a: 0, b: 1, rest: 0.4 },
        { kind: 'distance', a: 1, b: 2, rest: 0.36 },
        { kind: 'distance', a: 2, b: 0, rest: 0.36 },
      ],
      colliders: [
        { kind: 'ground', y: 0 },
        { kind: 'aabb', min: vec2(1, 0), max: vec2(1.6, 0.8) },
      ],
    };
    simulate(world, 1200); // 10 s
    for (const p of world.particles) {
      expect(Number.isFinite(p.pos.x)).toBe(true);
      expect(Number.isFinite(p.pos.y)).toBe(true);
      expect(p.pos.y).toBeGreaterThan(-0.01); // never through the floor
      // Settled: residual speed under a whisker per substep.
      expect(distance(p.pos, p.prev)).toBeLessThan(1e-3);
    }
  });
});
