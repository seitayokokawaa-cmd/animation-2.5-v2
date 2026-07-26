/**
 * Rig core (M6.1): 2D skeletons with FK and pose blending. A bone attaches
 * to its parent at an offset in the parent's frame and extends along its
 * own +x axis after rotation. Poses are per-bone rotation offsets from the
 * rest angle (radians) — blending is plain lerp per bone.
 */

import {
  apply,
  compose,
  IDENTITY,
  rotation,
  translation,
  vec2,
  type Transform,
  type Vec2,
} from '@motionforge/core';

export interface Bone {
  readonly id: string;
  /** Parent bone id; absent = root. Parents must precede children. */
  readonly parent?: string;
  /** Attachment point in the parent's local frame (from its start). */
  readonly offset?: Vec2;
  /** Rest rotation relative to the parent, radians. */
  readonly rest: number;
  readonly length: number;
}

export interface Skeleton {
  readonly bones: readonly Bone[];
}

/** Per-bone rotation offsets from rest, radians. Missing bones = 0. */
export type RigPose = Readonly<Record<string, number>>;

export interface BoneWorld {
  readonly bone: Bone;
  /** Local→world transform at the bone's start (rotation applied). */
  readonly transform: Transform;
  readonly start: Vec2;
  readonly end: Vec2;
  /** World angle, radians. */
  readonly angle: number;
}

export function validateSkeleton(skeleton: Skeleton): void {
  const seen = new Set<string>();
  for (const bone of skeleton.bones) {
    if (seen.has(bone.id)) throw new Error(`Skeleton: duplicate bone "${bone.id}"`);
    if (bone.parent !== undefined && !seen.has(bone.parent)) {
      throw new Error(`Skeleton: bone "${bone.id}" appears before its parent "${bone.parent}"`);
    }
    if (bone.length < 0) throw new Error(`Skeleton: bone "${bone.id}" has negative length`);
    seen.add(bone.id);
  }
}

/**
 * Forward kinematics: resolve every bone's world transform.
 * `rootTransform` places the skeleton in the world (position/facing).
 */
export function fk(
  skeleton: Skeleton,
  pose: RigPose,
  rootTransform: Transform = IDENTITY,
): Map<string, BoneWorld> {
  const out = new Map<string, BoneWorld>();
  for (const bone of skeleton.bones) {
    const parent = bone.parent ? out.get(bone.parent) : undefined;
    if (bone.parent && !parent) throw new Error(`Skeleton: unknown parent "${bone.parent}"`);
    const parentTransform = parent?.transform ?? rootTransform;
    const local = compose(
      translation(bone.offset?.x ?? 0, bone.offset?.y ?? 0),
      rotation(bone.rest + (pose[bone.id] ?? 0)),
    );
    const transform = compose(parentTransform, local);
    const start = apply(transform, vec2(0, 0));
    const end = apply(transform, vec2(bone.length, 0));
    out.set(bone.id, {
      bone,
      transform,
      start,
      end,
      angle: Math.atan2(end.y - start.y, end.x - start.x),
    });
  }
  return out;
}

/** Lerp between poses per bone (union of keys). */
export function blendPoses(a: RigPose, b: RigPose, t: number): RigPose {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    out[key] = av + (bv - av) * t;
  }
  return out;
}

/** Add pose offsets (layering, e.g. gesture on top of posture). */
export function addPoses(a: RigPose, b: RigPose): RigPose {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = (a[key] ?? 0) + (b[key] ?? 0);
  return out;
}
