/**
 * The potato-biped (M6.4) — the flagship caricature template (plan §5.4):
 * a big rounded body on stubby legs, thin arms, an oversized head. Sized
 * and recolored by parameters; posed via the rig; skinned with layered
 * shading so it reads as drawn art, not primitives.
 *
 * The paint stack is "inked cel": every silhouette shape is a dark base
 * carrying the outline stroke, with the main fill offset toward the
 * front-top light so a rim of dark shows as a back-edge crescent. Light
 * always comes over the character's leading shoulder, so shading mirrors
 * with facing and stays consistent.
 *
 * Anatomy (size = 1 → ~2.1 world units to the top of the head, feet at y = 0):
 *
 *        head (r 0.42)          bones: pelvis(spine) → head
 *      ┌──────────┐                    pelvis → arm-{l,r}-{upper,lower}
 *      │   body   │  0.85              pelvis → leg-{l,r}
 *      └──────────┘
 *        ‖      ‖    0.35 legs
 */

import {
  compose,
  parseColor,
  scaling,
  translation,
  vec2,
  type Color,
  type SceneNode,
  type Transform,
} from '@motionforge/core';

import { fk, type RigPose, type Skeleton } from './rig.js';
import { skin, type SkinPart } from './skin.js';

export interface PotatoPalette {
  readonly skin: Color;
  readonly outfit: Color;
  readonly outfitDark: Color;
  readonly outline: Color;
  readonly boots: Color;
}

export const DEFAULT_POTATO_PALETTE: PotatoPalette = {
  skin: parseColor('#eec39a'),
  outfit: parseColor('#3c6fb5'),
  outfitDark: parseColor('#2d5488'),
  outline: parseColor('#3a3226'),
  boots: parseColor('#4a3a24'),
};

/** Template-agnostic build options (what the Film IR descriptor carries). */
export interface CharacterOptions {
  readonly size?: number;
  /** Palette slot overrides by the template's slot names. */
  readonly palette?: Readonly<Record<string, Color>>;
}

export interface PotatoOptions {
  readonly size?: number;
  readonly palette?: Partial<PotatoPalette>;
}

export interface CharacterTemplate {
  readonly skeleton: Skeleton;
  readonly parts: readonly SkinPart[];
  /** Bone whose end is the head center (face/costume anchor). */
  readonly headBone: string;
  readonly headRadius: number;
  readonly size: number;
  readonly palette: PotatoPalette;
}

export function potatoBiped(options: PotatoOptions = {}): CharacterTemplate {
  const size = options.size ?? 1;
  const requested = options.palette ?? {};
  const outfit = requested.outfit ?? DEFAULT_POTATO_PALETTE.outfit;
  const palette: PotatoPalette = {
    skin: requested.skin ?? DEFAULT_POTATO_PALETTE.skin,
    outfit,
    // Recoloring just the outfit derives a matching dark tone.
    outfitDark:
      requested.outfitDark ??
      (requested.outfit ? shade(outfit, 0.74) : DEFAULT_POTATO_PALETTE.outfitDark),
    outline: requested.outline ?? DEFAULT_POTATO_PALETTE.outline,
    boots: requested.boots ?? DEFAULT_POTATO_PALETTE.boots,
  };
  const s = size;

  const legLen = 0.35 * s;
  const bodyLen = 0.85 * s;
  const headR = 0.42 * s;
  const armUpper = 0.34 * s;
  const armLower = 0.3 * s;

  const skeleton: Skeleton = {
    bones: [
      // Spine points straight up from the pelvis (feet-origin + legs).
      { id: 'pelvis', offset: vec2(0, legLen), rest: Math.PI / 2, length: bodyLen },
      { id: 'head', parent: 'pelvis', offset: vec2(bodyLen, 0), rest: 0, length: 0.26 * s },
      // Arms hang at the silhouette edge, mostly down and a little out, so
      // the inked sleeves trace the body edge instead of crossing the chest.
      {
        id: 'arm-r-upper',
        parent: 'pelvis',
        offset: vec2(bodyLen * 0.8, -0.42 * s),
        rest: -2.75,
        length: armUpper,
      },
      {
        id: 'arm-r-lower',
        parent: 'arm-r-upper',
        offset: vec2(armUpper, 0),
        rest: 0.3,
        length: armLower,
      },
      {
        id: 'arm-l-upper',
        parent: 'pelvis',
        offset: vec2(bodyLen * 0.8, 0.42 * s),
        rest: 2.75,
        length: armUpper,
      },
      {
        id: 'arm-l-lower',
        parent: 'arm-l-upper',
        offset: vec2(armUpper, 0),
        rest: -0.3,
        length: armLower,
      },
      // Stubby single-bone legs pointing down.
      {
        id: 'leg-r',
        parent: 'pelvis',
        offset: vec2(0.04 * s, -0.16 * s),
        rest: Math.PI,
        length: legLen,
      },
      {
        id: 'leg-l',
        parent: 'pelvis',
        offset: vec2(0.04 * s, 0.16 * s),
        rest: Math.PI,
        length: legLen,
      },
    ],
  };

  // Bone-local axes on the vertical bones: +x = up, −y = front (facing side).
  const ink = { color: palette.outline, width: 0.022 * s };
  const limb = (
    id: string,
    bone: string,
    length: number,
    width: number,
    color: Color,
    z: number,
  ): SkinPart => ({
    id,
    bone,
    at: vec2(length / 2, 0),
    z,
    shape: { kind: 'rect', width: length + width, height: width, rx: width / 2 },
    fill: { color },
    stroke: ink,
  });
  const hand = (
    id: string,
    bone: string,
    boneLength: number,
    r: number,
    color: Color,
    z: number,
  ): SkinPart => ({
    id,
    bone,
    at: vec2(boneLength, 0),
    z,
    shape: { kind: 'circle', r },
    fill: { color },
    stroke: { color: palette.outline, width: 0.02 * s },
  });
  const boot = (
    id: string,
    bone: string,
    boneLength: number,
    w: number,
    h: number,
    color: Color,
    z: number,
  ): SkinPart => ({
    id,
    bone,
    // Toe pushed toward the front so feet read directional.
    at: vec2(boneLength - h / 2, 0.07 * s),
    rotate: -Math.PI / 2,
    z,
    shape: { kind: 'rect', width: w, height: h, rx: h / 2 },
    fill: { color },
    stroke: { color: palette.outline, width: 0.025 * s },
  });

  const limbW = 0.13 * s;
  const headCX = 0.26 * s + headR * 0.55;
  const parts: SkinPart[] = [
    // Far (left) limbs behind everything.
    limb('arm-l-upper-skin', 'arm-l-upper', armUpper, limbW, palette.outfitDark, 1),
    limb('arm-l-lower-skin', 'arm-l-lower', armLower, limbW, palette.outfitDark, 1),
    hand('hand-l', 'arm-l-lower', armLower, 0.14 * s, shade(palette.skin), 2),
    limb('leg-l-skin', 'leg-l', legLen + 0.06 * s, 0.16 * s, palette.outfitDark, 1),
    boot('boot-l', 'leg-l', legLen, 0.3 * s, 0.13 * s, shade(palette.boots), 2),
    // Near (right) leg + boot under the body.
    limb('leg-r-skin', 'leg-r', legLen + 0.06 * s, 0.16 * s, palette.outfit, 3),
    boot('boot-r', 'leg-r', legLen, 0.3 * s, 0.13 * s, palette.boots, 4),
    // The potato body: dark silhouette (carries the outline + back-edge
    // crescent) → main fill offset toward the front-top light → belly glow.
    {
      id: 'body',
      bone: 'pelvis',
      at: vec2(bodyLen / 2, 0),
      z: 5,
      shape: { kind: 'ellipse', rx: 0.55 * s, ry: bodyLen * 0.62 },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.035 * s },
    },
    {
      id: 'body-fill',
      bone: 'pelvis',
      at: vec2(bodyLen / 2 + 0.02 * s, -0.04 * s),
      z: 6,
      shape: { kind: 'ellipse', rx: 0.55 * s * 0.95, ry: bodyLen * 0.62 * 0.95 },
      fill: { color: palette.outfit },
    },
    {
      id: 'body-light',
      bone: 'pelvis',
      at: vec2(bodyLen / 2 - 0.16 * s, -0.1 * s),
      z: 7,
      shape: { kind: 'ellipse', rx: 0.28 * s, ry: bodyLen * 0.24 },
      fill: { color: lighten(palette.outfit) },
    },
    // Head: dark base circle (outline + crescent) → skin fill toward the
    // light → a soft crown highlight.
    {
      id: 'head-base',
      bone: 'head',
      at: vec2(headCX, 0),
      z: 10,
      shape: { kind: 'circle', r: headR },
      fill: { color: shade(palette.skin) },
      stroke: { color: palette.outline, width: 0.035 * s },
    },
    {
      // Offset magnitude is exactly (1 − 0.93)·r so the fill stays flush
      // inside the base circle (60° toward the front-top light).
      id: 'head-skin',
      bone: 'head',
      at: vec2(headCX + headR * 0.035, -headR * 0.0606),
      z: 11,
      shape: { kind: 'circle', r: headR * 0.93 },
      fill: { color: palette.skin },
    },
    {
      id: 'head-light',
      bone: 'head',
      at: vec2(headCX + headR * 0.42, -headR * 0.3),
      z: 12,
      shape: { kind: 'ellipse', rx: headR * 0.3, ry: headR * 0.2 },
      fill: { color: lighten(palette.skin) },
    },
    // Near (right) arm in front of the body.
    limb('arm-r-upper-skin', 'arm-r-upper', armUpper, limbW, palette.outfit, 20),
    limb('arm-r-lower-skin', 'arm-r-lower', armLower, limbW, palette.outfit, 20),
    hand('hand-r', 'arm-r-lower', armLower, 0.14 * s, palette.skin, 21),
  ];

  return { skeleton, parts, headBone: 'head', headRadius: headR, size, palette };
}

/** Character template registry — the render tier looks templates up by name. */
export const CHARACTER_TEMPLATES: Readonly<
  Record<string, (options: CharacterOptions) => CharacterTemplate>
> = {
  'potato-biped': potatoBiped,
};

const shade = (c: Color, factor = 0.82): Color =>
  parseColor(
    `#${[c.r, c.g, c.b]
      .map((v) =>
        Math.max(0, Math.round(v * factor))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`,
  );

const lighten = (c: Color): Color =>
  parseColor(
    `#${[c.r, c.g, c.b]
      .map((v) =>
        Math.min(255, Math.round(v + (255 - v) * 0.25))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`,
  );

/** Subtle deterministic idle: breathing bob + tiny arm sway. */
export function idlePose(tick: number, seedOffset = 0): RigPose {
  const t = (tick + seedOffset) / 120;
  const breathe = Math.sin(t * 2 * Math.PI * 0.45) * 0.02;
  return {
    pelvis: breathe * 0.4,
    'arm-r-upper': Math.sin(t * 2 * Math.PI * 0.45 + 1.1) * 0.05,
    'arm-l-upper': Math.sin(t * 2 * Math.PI * 0.45 + 2.3) * -0.05,
    head: breathe,
  };
}

export interface CharacterRenderOptions {
  readonly idPrefix: string;
  readonly layerBase?: number;
  /** World position of the feet. */
  readonly at: { readonly x: number; readonly y: number };
  readonly facing?: 'left' | 'right';
  readonly pose?: RigPose;
  /** Extra nodes anchored to the head center (face, headwear) — M6.5/6.6. */
  readonly headNodes?: readonly SceneNode[];
}

/** Layer offset of the head anchor group (face sits above the head skin,
 * below the near arm at z 20). */
export const HEAD_ANCHOR_Z = 15;

/** Pose + skin a character template into scene nodes. */
export function characterNodes(
  template: CharacterTemplate,
  options: CharacterRenderOptions,
): SceneNode {
  const facingScale = options.facing === 'left' ? -1 : 1;
  const root: Transform = compose(translation(options.at.x, options.at.y), scaling(facingScale, 1));
  const bones = fk(template.skeleton, options.pose ?? {}, root);
  const nodes = skin(bones, template.parts, {
    idPrefix: options.idPrefix,
    layerBase: options.layerBase ?? 0,
  });

  const children = [...nodes];
  if (options.headNodes && options.headNodes.length > 0) {
    const head = bones.get(template.headBone)!;
    children.push({
      id: `${options.idPrefix}/head-anchor`,
      layer: (options.layerBase ?? 0) + HEAD_ANCHOR_Z,
      transform: compose(
        head.transform,
        translation(0.26 * template.size + template.headRadius * 0.55, 0),
      ),
      children: [...options.headNodes],
    });
  }
  return { id: `${options.idPrefix}/rig`, children };
}
