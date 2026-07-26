/**
 * Simple quadrupeds (M6.8): horse (cavalry first) and dog, drawn in the
 * same inked-cel stack as the potato-biped — dark silhouette bases with
 * offset fills, everything bone-bound so gaits are pose work later.
 *
 * Palette slot mapping (so `cast:` palettes work unchanged): `outfit` is
 * the coat, `outfit-dark` the shading/points, `boots` the hooves, `skin`
 * the mane/muzzle accent, `outline` the ink.
 *
 * Both templates draw their own face (`hasFace: false`) and expose a
 * `seat` anchor on the back for a rider (plan §5.4).
 */

import { parseColor, vec2, type Color } from '@motionforge/core';

import {
  DEFAULT_POTATO_PALETTE,
  type CharacterTemplate,
  type PotatoOptions,
  type PotatoPalette,
} from './potato.js';
import type { RigPose, Skeleton } from './rig.js';
import type { SkinPart } from './skin.js';

const HORSE_DEFAULTS: PotatoPalette = {
  skin: parseColor('#d8c39a'), // mane + muzzle
  outfit: parseColor('#8c5a33'), // coat
  outfitDark: parseColor('#6b421f'),
  outline: DEFAULT_POTATO_PALETTE.outline,
  boots: parseColor('#3f3222'), // hooves
};

const DOG_DEFAULTS: PotatoPalette = {
  skin: parseColor('#e8d8b8'), // muzzle + chest
  outfit: parseColor('#b08a4f'), // coat
  outfitDark: parseColor('#8a683a'),
  outline: DEFAULT_POTATO_PALETTE.outline,
  boots: parseColor('#6b4f2a'), // paws
};

const resolvePalette = (
  defaults: PotatoPalette,
  over: Partial<PotatoPalette> = {},
): PotatoPalette => ({
  skin: over.skin ?? defaults.skin,
  outfit: over.outfit ?? defaults.outfit,
  outfitDark: over.outfitDark ?? (over.outfit ? shade(over.outfit, 0.76) : defaults.outfitDark),
  outline: over.outline ?? defaults.outline,
  boots: over.boots ?? defaults.boots,
});

/** Grazing-calm idle: body breathe, tail sway, slow head bob. */
export function quadrupedIdle(tick: number, seedOffset = 0): RigPose {
  const t = (tick + seedOffset) / 120;
  return {
    body: Math.sin(t * 2 * Math.PI * 0.4) * 0.012,
    tail: Math.sin(t * 2 * Math.PI * 0.55 + 1.2) * 0.16,
    neck: Math.sin(t * 2 * Math.PI * 0.28) * 0.05,
    ear: Math.sin(t * 2 * Math.PI * 0.9 + 2) * 0.1,
  };
}

/**
 * The horse: long legs, arched neck, mane, docked cartoon proportions.
 * size = 1 → ~1.9 world units at the ears, feet at y = 0.
 */
export function horseTemplate(options: PotatoOptions = {}): CharacterTemplate {
  const s = options.size ?? 1;
  const palette = resolvePalette(HORSE_DEFAULTS, options.palette);
  const legLen = 0.6 * s;
  const bodyY = 0.72 * s; // spine height
  const bodyLen = 1.15 * s;

  const skeleton: Skeleton = {
    bones: [
      // Spine runs rear → chest along +x.
      { id: 'body', offset: vec2(-bodyLen / 2, bodyY), rest: 0, length: bodyLen },
      { id: 'tail', parent: 'body', offset: vec2(0.02 * s, 0.08 * s), rest: 2.5, length: 0.5 * s },
      {
        id: 'neck',
        parent: 'body',
        offset: vec2(bodyLen * 0.92, 0.1 * s),
        rest: 1.0,
        length: 0.52 * s,
      },
      { id: 'head', parent: 'neck', offset: vec2(0.52 * s, 0), rest: -1.15, length: 0.42 * s },
      { id: 'ear', parent: 'head', offset: vec2(0.06 * s, 0.1 * s), rest: 1.2, length: 0.16 * s },
      // Legs: far pair then near pair, hip/shoulder to fetlock.
      {
        id: 'leg-back-f',
        parent: 'body',
        offset: vec2(0.16 * s, -0.06 * s),
        rest: -Math.PI / 2 - 0.06,
        length: legLen,
      },
      {
        id: 'leg-front-f',
        parent: 'body',
        offset: vec2(bodyLen - 0.18 * s, -0.06 * s),
        rest: -Math.PI / 2 + 0.06,
        length: legLen,
      },
      {
        id: 'leg-back-n',
        parent: 'body',
        offset: vec2(0.22 * s, -0.08 * s),
        rest: -Math.PI / 2 - 0.03,
        length: legLen,
      },
      {
        id: 'leg-front-n',
        parent: 'body',
        offset: vec2(bodyLen - 0.12 * s, -0.08 * s),
        rest: -Math.PI / 2 + 0.03,
        length: legLen,
      },
    ],
  };

  const legW = 0.13 * s;
  const leg = (id: string, bone: string, color: Color, z: number): SkinPart[] => [
    {
      id,
      bone,
      at: vec2(legLen / 2 - 0.04 * s, 0),
      z,
      shape: { kind: 'rect', width: legLen + 0.1 * s, height: legW, rx: legW / 2 },
      fill: { color },
      stroke: { color: palette.outline, width: 0.022 * s },
    },
    {
      id: `${id}-hoof`,
      bone,
      at: vec2(legLen - 0.045 * s, 0),
      z: z + 1,
      shape: { kind: 'rect', width: 0.11 * s, height: 0.17 * s, rx: 0.035 * s },
      fill: { color: palette.boots },
      stroke: { color: palette.outline, width: 0.02 * s },
    },
  ];

  const parts: SkinPart[] = [
    // Far side + tail behind the body.
    ...leg('leg-back-f-skin', 'leg-back-f', palette.outfitDark, 1),
    ...leg('leg-front-f-skin', 'leg-front-f', palette.outfitDark, 1),
    {
      id: 'tail-skin',
      bone: 'tail',
      at: vec2(0.22 * s, 0),
      z: 1,
      shape: { kind: 'ellipse', rx: 0.26 * s, ry: 0.09 * s },
      fill: { color: palette.skin },
      stroke: { color: palette.outline, width: 0.022 * s },
    },
    {
      id: 'tail-tip',
      bone: 'tail',
      at: vec2(0.44 * s, 0),
      z: 2,
      shape: { kind: 'circle', r: 0.09 * s },
      fill: { color: shade(palette.skin) },
    },
    // Body: dark silhouette + offset fill + belly light (cel stack).
    {
      id: 'body',
      bone: 'body',
      at: vec2(bodyLen / 2, 0.02 * s),
      z: 5,
      shape: { kind: 'ellipse', rx: bodyLen * 0.56, ry: 0.4 * s },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.035 * s },
    },
    {
      id: 'body-fill',
      bone: 'body',
      at: vec2(bodyLen / 2 + 0.03 * s, 0.05 * s),
      z: 6,
      shape: { kind: 'ellipse', rx: bodyLen * 0.53, ry: 0.375 * s },
      fill: { color: palette.outfit },
    },
    {
      id: 'body-light',
      bone: 'body',
      at: vec2(bodyLen / 2 + 0.1 * s, -0.12 * s),
      z: 7,
      shape: { kind: 'ellipse', rx: bodyLen * 0.3, ry: 0.16 * s },
      fill: { color: lighten(palette.outfit) },
    },
    // Near legs above the body's lower edge.
    ...leg('leg-back-n-skin', 'leg-back-n', palette.outfit, 3),
    ...leg('leg-front-n-skin', 'leg-front-n', palette.outfit, 3),
    // Neck + mane.
    {
      id: 'neck-skin',
      bone: 'neck',
      at: vec2(0.24 * s, 0),
      z: 8,
      shape: { kind: 'rect', width: 0.62 * s, height: 0.3 * s, rx: 0.13 * s },
      fill: { color: palette.outfit },
      stroke: { color: palette.outline, width: 0.03 * s },
    },
    {
      id: 'mane',
      bone: 'neck',
      at: vec2(0.22 * s, 0.16 * s),
      z: 9,
      shape: { kind: 'rect', width: 0.56 * s, height: 0.12 * s, rx: 0.06 * s },
      fill: { color: palette.skin },
    },
    // Head: base + fill + muzzle + nostril + eye + forelock.
    {
      id: 'head-base',
      bone: 'head',
      at: vec2(0.2 * s, 0),
      z: 10,
      shape: { kind: 'ellipse', rx: 0.3 * s, ry: 0.17 * s },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.03 * s },
    },
    {
      id: 'head-fill',
      bone: 'head',
      at: vec2(0.19 * s, 0.02 * s),
      z: 11,
      shape: { kind: 'ellipse', rx: 0.28 * s, ry: 0.155 * s },
      fill: { color: palette.outfit },
    },
    {
      id: 'muzzle',
      bone: 'head',
      at: vec2(0.4 * s, -0.01 * s),
      z: 12,
      shape: { kind: 'ellipse', rx: 0.12 * s, ry: 0.11 * s },
      fill: { color: palette.skin },
      stroke: { color: palette.outline, width: 0.022 * s },
    },
    {
      id: 'nostril',
      bone: 'head',
      at: vec2(0.44 * s, -0.04 * s),
      z: 13,
      shape: { kind: 'circle', r: 0.02 * s },
      fill: { color: palette.outline },
    },
    {
      id: 'eye',
      bone: 'head',
      at: vec2(0.12 * s, 0.05 * s),
      z: 13,
      shape: { kind: 'circle', r: 0.035 * s },
      fill: { color: palette.outline },
    },
    {
      id: 'ear-skin',
      bone: 'ear',
      at: vec2(0.08 * s, 0),
      z: 12,
      shape: { kind: 'ellipse', rx: 0.1 * s, ry: 0.05 * s },
      fill: { color: palette.outfit },
      stroke: { color: palette.outline, width: 0.02 * s },
    },
    {
      id: 'forelock',
      bone: 'head',
      at: vec2(0.02 * s, 0.1 * s),
      z: 12,
      shape: { kind: 'ellipse', rx: 0.09 * s, ry: 0.05 * s },
      fill: { color: palette.skin },
    },
  ];

  return {
    skeleton,
    parts,
    headBone: 'head',
    handBone: 'head',
    headRadius: 0.3 * s,
    size: s,
    palette,
    hasFace: false,
    seat: { bone: 'body', at: vec2(bodyLen * 0.42, 0.26 * s) },
    idle: quadrupedIdle,
  };
}

/** The dog: same rig at pup proportions — floppy ear, snout, curl tail. */
export function dogTemplate(options: PotatoOptions = {}): CharacterTemplate {
  const s = (options.size ?? 1) * 0.55;
  const palette = resolvePalette(DOG_DEFAULTS, options.palette);
  const legLen = 0.34 * s;
  const bodyY = 0.44 * s;
  const bodyLen = 0.95 * s;

  const skeleton: Skeleton = {
    bones: [
      { id: 'body', offset: vec2(-bodyLen / 2, bodyY), rest: 0, length: bodyLen },
      { id: 'tail', parent: 'body', offset: vec2(0.02 * s, 0.06 * s), rest: 2.1, length: 0.3 * s },
      {
        id: 'neck',
        parent: 'body',
        offset: vec2(bodyLen * 0.9, 0.08 * s),
        rest: 0.85,
        length: 0.3 * s,
      },
      { id: 'head', parent: 'neck', offset: vec2(0.3 * s, 0), rest: -0.85, length: 0.3 * s },
      { id: 'ear', parent: 'head', offset: vec2(0.04 * s, 0.12 * s), rest: -2.6, length: 0.16 * s },
      {
        id: 'leg-back-f',
        parent: 'body',
        offset: vec2(0.14 * s, -0.05 * s),
        rest: -Math.PI / 2 - 0.08,
        length: legLen,
      },
      {
        id: 'leg-front-f',
        parent: 'body',
        offset: vec2(bodyLen - 0.16 * s, -0.05 * s),
        rest: -Math.PI / 2 + 0.08,
        length: legLen,
      },
      {
        id: 'leg-back-n',
        parent: 'body',
        offset: vec2(0.2 * s, -0.07 * s),
        rest: -Math.PI / 2 - 0.04,
        length: legLen,
      },
      {
        id: 'leg-front-n',
        parent: 'body',
        offset: vec2(bodyLen - 0.1 * s, -0.07 * s),
        rest: -Math.PI / 2 + 0.04,
        length: legLen,
      },
    ],
  };

  const legW = 0.11 * s;
  const leg = (id: string, bone: string, color: Color, z: number): SkinPart[] => [
    {
      id,
      bone,
      at: vec2(legLen / 2 - 0.02 * s, 0),
      z,
      shape: { kind: 'rect', width: legLen + 0.08 * s, height: legW, rx: legW / 2 },
      fill: { color },
      stroke: { color: palette.outline, width: 0.02 * s },
    },
    {
      id: `${id}-paw`,
      bone,
      at: vec2(legLen - 0.03 * s, 0.03 * s),
      z: z + 1,
      shape: { kind: 'ellipse', rx: 0.07 * s, ry: 0.05 * s },
      fill: { color: palette.boots },
    },
  ];

  const parts: SkinPart[] = [
    ...leg('leg-back-f-skin', 'leg-back-f', palette.outfitDark, 1),
    ...leg('leg-front-f-skin', 'leg-front-f', palette.outfitDark, 1),
    {
      id: 'tail-skin',
      bone: 'tail',
      at: vec2(0.14 * s, 0),
      z: 1,
      shape: { kind: 'rect', width: 0.32 * s, height: 0.09 * s, rx: 0.045 * s },
      fill: { color: palette.outfit },
      stroke: { color: palette.outline, width: 0.02 * s },
    },
    {
      id: 'tail-tip',
      bone: 'tail',
      at: vec2(0.3 * s, 0),
      z: 2,
      shape: { kind: 'circle', r: 0.06 * s },
      fill: { color: palette.skin },
    },
    {
      id: 'body',
      bone: 'body',
      at: vec2(bodyLen / 2, 0.01 * s),
      z: 5,
      shape: { kind: 'ellipse', rx: bodyLen * 0.55, ry: 0.3 * s },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.03 * s },
    },
    {
      id: 'body-fill',
      bone: 'body',
      at: vec2(bodyLen / 2 + 0.025 * s, 0.035 * s),
      z: 6,
      shape: { kind: 'ellipse', rx: bodyLen * 0.52, ry: 0.28 * s },
      fill: { color: palette.outfit },
    },
    {
      id: 'chest-patch',
      bone: 'body',
      at: vec2(bodyLen * 0.78, -0.08 * s),
      z: 7,
      shape: { kind: 'ellipse', rx: 0.18 * s, ry: 0.14 * s },
      fill: { color: palette.skin },
    },
    ...leg('leg-back-n-skin', 'leg-back-n', palette.outfit, 3),
    ...leg('leg-front-n-skin', 'leg-front-n', palette.outfit, 3),
    {
      id: 'head-base',
      bone: 'head',
      at: vec2(0.12 * s, 0.02 * s),
      z: 10,
      shape: { kind: 'circle', r: 0.21 * s },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.028 * s },
    },
    {
      id: 'head-fill',
      bone: 'head',
      at: vec2(0.13 * s, 0.035 * s),
      z: 11,
      shape: { kind: 'circle', r: 0.195 * s },
      fill: { color: palette.outfit },
    },
    {
      id: 'snout',
      bone: 'head',
      at: vec2(0.32 * s, -0.03 * s),
      z: 12,
      shape: { kind: 'ellipse', rx: 0.11 * s, ry: 0.08 * s },
      fill: { color: palette.skin },
      stroke: { color: palette.outline, width: 0.02 * s },
    },
    {
      id: 'nose',
      bone: 'head',
      at: vec2(0.4 * s, 0.0 * s),
      z: 13,
      shape: { kind: 'circle', r: 0.035 * s },
      fill: { color: palette.outline },
    },
    {
      id: 'eye',
      bone: 'head',
      at: vec2(0.1 * s, 0.09 * s),
      z: 13,
      shape: { kind: 'circle', r: 0.03 * s },
      fill: { color: palette.outline },
    },
    {
      id: 'ear-skin',
      bone: 'ear',
      at: vec2(0.08 * s, 0),
      z: 12,
      shape: { kind: 'ellipse', rx: 0.11 * s, ry: 0.06 * s },
      fill: { color: palette.outfitDark },
      stroke: { color: palette.outline, width: 0.018 * s },
    },
    {
      id: 'collar',
      bone: 'neck',
      at: vec2(0.1 * s, 0),
      z: 9,
      shape: { kind: 'rect', width: 0.09 * s, height: 0.3 * s, rx: 0.03 * s },
      fill: { color: parseColor('#b5453c') },
    },
  ];

  return {
    skeleton,
    parts,
    headBone: 'head',
    handBone: 'head',
    headRadius: 0.21 * s,
    size: s,
    palette,
    hasFace: false,
    seat: { bone: 'body', at: vec2(bodyLen * 0.42, 0.26 * s) },
    idle: quadrupedIdle,
  };
}

const shade = (c: Color, factor = 0.82): Color => ({
  r: Math.round(c.r * factor),
  g: Math.round(c.g * factor),
  b: Math.round(c.b * factor),
  a: c.a,
});

const lighten = (c: Color): Color => ({
  r: Math.min(255, Math.round(c.r + (255 - c.r) * 0.25)),
  g: Math.min(255, Math.round(c.g + (255 - c.g) * 0.25)),
  b: Math.min(255, Math.round(c.b + (255 - c.b) * 0.25)),
  a: c.a,
});
