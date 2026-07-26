/**
 * Vector skinning (M6.3): shapes bound to bones. Each skin part rides its
 * bone's world transform with a local offset, and carries an explicit z so
 * a character's internal draw order is stable regardless of pose (the same
 * layering trick objects use). Facing flips happen at the root transform
 * (scale −1,1) and flow through FK untouched.
 */

import {
  compose,
  rotation,
  translation,
  type Fill,
  type SceneNode,
  type Shape,
  type Stroke,
} from '@motionforge/core';

import type { BoneWorld } from './rig.js';

export interface SkinPart {
  readonly id: string;
  readonly bone: string;
  /** Offset in the bone's local frame (bone extends along +x). */
  readonly at?: { readonly x: number; readonly y: number };
  /** Radians, in the bone frame. */
  readonly rotate?: number;
  /** Draw order within the character; higher = on top. */
  readonly z: number;
  readonly shape: Shape;
  readonly fill?: Fill;
  readonly stroke?: Stroke;
}

export interface SkinOptions {
  readonly idPrefix: string;
  readonly layerBase?: number;
}

/** Bind skin parts to solved bones, sorted by z into explicit layers. */
export function skin(
  bones: ReadonlyMap<string, BoneWorld>,
  parts: readonly SkinPart[],
  options: SkinOptions,
): SceneNode[] {
  return [...parts]
    .sort((a, b) => a.z - b.z)
    .map((part) => {
      const bone = bones.get(part.bone);
      if (!bone) throw new Error(`Skin part "${part.id}" binds unknown bone "${part.bone}"`);
      return {
        id: `${options.idPrefix}/${part.id}`,
        layer: (options.layerBase ?? 0) + part.z,
        transform: compose(
          bone.transform,
          compose(translation(part.at?.x ?? 0, part.at?.y ?? 0), rotation(part.rotate ?? 0)),
        ),
        shape: part.shape,
        fill: part.fill,
        stroke: part.stroke,
      };
    });
}
