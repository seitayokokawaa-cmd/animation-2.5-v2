/**
 * Ragdoll + blend-back (M14.4): skeleton↔particle mapping, continuity
 * at the go-limp instant, a real tumble, and the recovery blend that
 * hands the body back to acting.
 */
import { compose, IDENTITY, translation, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { potatoBiped } from './potato.js';
import { RAGDOLL_IMPULSE, RAGDOLL_SETTLE, ragdollPose, ragdollWorld } from './ragdoll.js';
import { fk } from './rig.js';

const template = potatoBiped({ size: 0.9 });
const idle = { pelvis: 0.02, 'arm-r-upper': 0.05 };

describe('ragdoll (M14.4)', () => {
  it('maps every bone to two particles plus rigid attachments', () => {
    const world = ragdollWorld(template, {}, vec2(0, 0));
    expect(world.particles.length).toBe(template.skeleton.bones.length * 2);
    // One length constraint per bone + two attachment constraints per
    // child bone.
    const children = template.skeleton.bones.filter((b) => b.parent).length;
    expect(world.constraints.length).toBe(template.skeleton.bones.length + 2 * children);
    expect(world.colliders).toEqual([{ kind: 'ground', y: 0 }]);
  });

  it('is continuous at the go-limp instant', () => {
    const sampled = ragdollPose(template, idle, RAGDOLL_IMPULSE, 0, 300);
    for (const bone of template.skeleton.bones) {
      expect(sampled.pose[bone.id] ?? 0, bone.id).toBeCloseTo(idle[bone.id as 'pelvis'] ?? 0, 6);
    }
    expect(Math.hypot(sampled.shift.x, sampled.shift.y)).toBeLessThan(0.05);
  });

  it('replays deterministically', () => {
    const a = ragdollPose(template, idle, vec2(2, 3), 150, 300);
    const b = ragdollPose(template, idle, vec2(2, 3), 150, 300);
    expect(a).toEqual(b);
  });

  it('tumbles: the head ends up low and the pose is nothing like idle', () => {
    const settle = Math.round(300 * RAGDOLL_SETTLE);
    const sampled = ragdollPose(template, idle, vec2(2.5, 2.5), settle, 300);
    const root = compose(translation(sampled.shift.x, sampled.shift.y), IDENTITY);
    const bones = fk(template.skeleton, sampled.pose, root);
    const headY = bones.get('head')!.end.y;
    const standingHeadY = fk(template.skeleton, {}).get('head')!.end.y;
    expect(headY).toBeLessThan(standingHeadY * 0.6); // crumpled, not standing
    expect(Math.abs(sampled.pose.pelvis ?? 0)).toBeGreaterThan(0.3); // keeled over
    // Nothing fell through the floor (radii keep it above -0.05).
    for (const bw of bones.values()) {
      expect(bw.start.y).toBeGreaterThan(-0.2);
      expect(bw.end.y).toBeGreaterThan(-0.2);
    }
  });

  it('blends back to neutral by the end of the window', () => {
    const done = ragdollPose(template, idle, vec2(2.5, 2.5), 300, 300);
    for (const angle of Object.values(done.pose)) {
      expect(Math.abs(angle)).toBeLessThan(1e-9);
    }
    expect(Math.hypot(done.shift.x, done.shift.y)).toBeLessThan(1e-9);
    // And the recovery is a shrink of the settled pose, already well
    // under way at 90%.
    const settle = Math.round(300 * RAGDOLL_SETTLE);
    const settled = ragdollPose(template, idle, vec2(2.5, 2.5), settle, 300);
    const late = ragdollPose(template, idle, vec2(2.5, 2.5), 270, 300);
    expect(Math.abs(late.pose.pelvis ?? 0)).toBeLessThan(Math.abs(settled.pose.pelvis ?? 0));
  });

  it('holds the settled state through the settle window (no re-tumble)', () => {
    // Elapsed past the settle point simulates the same fixed fold.
    const settle = Math.round(200 * RAGDOLL_SETTLE);
    const a = ragdollPose(template, idle, RAGDOLL_IMPULSE, settle, 200);
    const b = ragdollPose(template, idle, RAGDOLL_IMPULSE, settle + 1, 200);
    // One recovery tick in: same shape, a hair smaller.
    for (const bone of template.skeleton.bones) {
      const av = a.pose[bone.id] ?? 0;
      const bv = b.pose[bone.id] ?? 0;
      expect(Math.abs(bv)).toBeLessThanOrEqual(Math.abs(av) + 1e-9);
    }
  });
});
