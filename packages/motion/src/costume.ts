/**
 * Costume/prop system (M6.6): headwear, facial hair, outfit overlays, and
 * held items, so a caricature is a 3-line description (plan §5.4). Pieces
 * are pure vector-art generators keyed by name:
 *
 * - outfits add SkinParts to the template (sashes, belts, collars ride the
 *   body bone through every pose),
 * - hats and facial hair are face-frame nodes joining the head anchor
 *   (they mirror with facing and nod with the head for free),
 * - held items are hand-frame nodes gripped by the near hand.
 *
 * Face frame: origin at head center, +x facing, +y up (see face.ts).
 * Hand frame: origin at the grip, +x along the item's shaft, pointing up
 * at the rest pose.
 */

import {
  compose,
  parseColor,
  rotation,
  translation,
  vec2,
  type Color,
  type SceneNode,
} from '@motionforge/core';

import { HAND_ANCHOR_Z, HEAD_ANCHOR_Z, type CharacterTemplate } from './potato.js';
import type { SkinPart } from './skin.js';

/** Metal/cloth accent palette shared by all pieces (kept off the character
 * palette so costume colors stay consistent across a recolored cast). */
const GOLD = parseColor('#d4a933');
const GOLD_DARK = parseColor('#a87f1f');
const STEEL = parseColor('#8b9097');
const STEEL_DARK = parseColor('#5f646c');
const PAPER = parseColor('#efe3c2');
const LEATHER = parseColor('#5b4226');
const CLOTH_RED = parseColor('#b5453c');
const CLOTH_WHITE = parseColor('#f4efe2');

interface PieceContext {
  /** Character size multiplier (1 = default potato). */
  readonly s: number;
  readonly headR: number;
  readonly bodyLen: number;
  readonly ink: Color;
  readonly outfit: Color;
  readonly outfitDark: Color;
}

/** A piece node with a z relative to its group; made absolute on assembly. */
type CostumeNode = SceneNode & { readonly relLayer: number };

interface PieceResult {
  readonly bodyParts?: readonly SkinPart[];
  /** Face-frame nodes (hats, facial hair). Relative z ≥ 5 (above the face). */
  readonly headNodes?: readonly CostumeNode[];
  /** Hand-frame nodes for held items. */
  readonly handNodes?: readonly CostumeNode[];
}

type PieceFn = (ctx: PieceContext) => PieceResult;

const node = (
  id: string,
  z: number,
  shape: SceneNode['shape'],
  fill: Color,
  extra: Partial<SceneNode> = {},
  ink?: { color: Color; width: number },
): CostumeNode => ({
  id,
  relLayer: z,
  shape,
  fill: { color: fill },
  stroke: ink,
  ...extra,
});

// ---- headwear ----------------------------------------------------------------

const crown: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node(
      'crown-points',
      6,
      {
        kind: 'polygon',
        points: [
          vec2(-0.46 * r, 0.78 * r),
          vec2(-0.46 * r, 1.22 * r),
          vec2(-0.23 * r, 0.95 * r),
          vec2(0, 1.28 * r),
          vec2(0.23 * r, 0.95 * r),
          vec2(0.46 * r, 1.22 * r),
          vec2(0.46 * r, 0.78 * r),
        ],
      },
      GOLD,
      {},
      { color: ink, width: 0.03 * r },
    ),
    node('crown-band', 7, { kind: 'rect', width: 0.95 * r, height: 0.2 * r, rx: 0.05 * r }, GOLD, {
      transform: translation(0, 0.78 * r),
    }),
    node('crown-jewel', 8, { kind: 'circle', r: 0.06 * r }, CLOTH_RED, {
      transform: translation(0, 0.78 * r),
    }),
    node('crown-jewel-l', 8, { kind: 'circle', r: 0.045 * r }, STEEL_DARK, {
      transform: translation(-0.3 * r, 0.78 * r),
    }),
    node('crown-jewel-r', 8, { kind: 'circle', r: 0.045 * r }, STEEL_DARK, {
      transform: translation(0.3 * r, 0.78 * r),
    }),
  ],
});

const spikedHelmet: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node(
      'helm-dome',
      6,
      { kind: 'path', d: domePath(r) },
      STEEL,
      {},
      { color: ink, width: 0.03 * r },
    ),
    node(
      'helm-band',
      7,
      { kind: 'rect', width: 1.6 * r, height: 0.16 * r, rx: 0.08 * r },
      STEEL_DARK,
      {
        transform: translation(0, 0.52 * r),
      },
    ),
    node(
      'helm-spike',
      6,
      {
        kind: 'polygon',
        points: [vec2(-0.08 * r, 1.1 * r), vec2(0, 1.62 * r), vec2(0.08 * r, 1.1 * r)],
      },
      GOLD_DARK,
      {},
      { color: ink, width: 0.025 * r },
    ),
    node('helm-boss', 8, { kind: 'circle', r: 0.07 * r }, GOLD, {
      transform: translation(0, 0.6 * r),
    }),
  ],
});

const plumedHat: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    // Plume tucked behind the crown of the hat.
    node('plume-1', 5, { kind: 'ellipse', rx: 0.14 * r, ry: 0.42 * r }, CLOTH_WHITE, {
      transform: compose(translation(-0.42 * r, 1.28 * r), rotation(0.35)),
    }),
    node('plume-2', 5, { kind: 'ellipse', rx: 0.12 * r, ry: 0.34 * r }, CLOTH_WHITE, {
      transform: compose(translation(-0.2 * r, 1.38 * r), rotation(0.15)),
    }),
    node('hat-crown', 6, { kind: 'path', d: domePath(r, 0.55, 1.32) }, ink, {}, undefined),
    node('hat-brim', 7, { kind: 'rect', width: 1.9 * r, height: 0.14 * r, rx: 0.07 * r }, ink, {
      transform: translation(0.05 * r, 0.56 * r),
    }),
    node('hat-braid', 8, { kind: 'rect', width: 0.85 * r, height: 0.07 * r, rx: 0.035 * r }, GOLD, {
      transform: translation(0.02 * r, 0.8 * r),
    }),
  ],
});

const turban: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node(
      'turban-base',
      6,
      { kind: 'ellipse', rx: 0.98 * r, ry: 0.5 * r },
      CLOTH_WHITE,
      { transform: translation(0, 0.72 * r) },
      { color: ink, width: 0.03 * r },
    ),
    node('turban-top', 7, { kind: 'ellipse', rx: 0.62 * r, ry: 0.38 * r }, CLOTH_WHITE, {
      transform: translation(0.03 * r, 1.05 * r),
      stroke: { color: ink, width: 0.025 * r },
    }),
    node(
      'turban-wrap',
      8,
      { kind: 'rect', width: 1.1 * r, height: 0.09 * r, rx: 0.045 * r },
      CLOTH_RED,
      {
        transform: compose(translation(0, 0.78 * r), rotation(-0.12)),
      },
    ),
    node('turban-jewel', 9, { kind: 'circle', r: 0.07 * r }, GOLD, {
      transform: translation(0.28 * r, 0.86 * r),
    }),
  ],
});

const beret: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node(
      'beret-cap',
      6,
      { kind: 'ellipse', rx: 0.82 * r, ry: 0.3 * r },
      CLOTH_RED,
      { transform: compose(translation(-0.1 * r, 0.82 * r), rotation(-0.16)) },
      { color: ink, width: 0.028 * r },
    ),
    node('beret-nub', 7, { kind: 'circle', r: 0.06 * r }, shadeOf(CLOTH_RED), {
      transform: translation(-0.14 * r, 1.06 * r),
    }),
  ],
});

// ---- facial hair -------------------------------------------------------------

const mustacheImperial: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node('stache-l', 5, { kind: 'ellipse', rx: 0.17 * r, ry: 0.09 * r }, ink, {
      transform: compose(translation(0.12 * r, -0.3 * r), rotation(0.5)),
    }),
    node('stache-r', 5, { kind: 'ellipse', rx: 0.17 * r, ry: 0.09 * r }, ink, {
      transform: compose(translation(0.5 * r, -0.3 * r), rotation(-0.5)),
    }),
    node('stache-curl-l', 5, { kind: 'circle', r: 0.07 * r }, ink, {
      transform: translation(-0.01 * r, -0.2 * r),
    }),
    node('stache-curl-r', 5, { kind: 'circle', r: 0.07 * r }, ink, {
      transform: translation(0.63 * r, -0.2 * r),
    }),
  ],
});

const mustacheHandlebar: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node('stache-bar', 5, { kind: 'rect', width: 0.56 * r, height: 0.11 * r, rx: 0.055 * r }, ink, {
      transform: translation(0.31 * r, -0.31 * r),
    }),
    node('stache-end-l', 5, { kind: 'circle', r: 0.075 * r }, ink, {
      transform: translation(0.0 * r, -0.26 * r),
    }),
    node('stache-end-r', 5, { kind: 'circle', r: 0.075 * r }, ink, {
      transform: translation(0.62 * r, -0.26 * r),
    }),
  ],
});

const mustacheChevron: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node('stache', 5, { kind: 'rect', width: 0.5 * r, height: 0.13 * r, rx: 0.065 * r }, ink, {
      transform: translation(0.31 * r, -0.3 * r),
    }),
  ],
});

const goatee: PieceFn = ({ headR: r, ink }) => ({
  headNodes: [
    node('goatee-chin', 5, { kind: 'ellipse', rx: 0.14 * r, ry: 0.18 * r }, ink, {
      transform: translation(0.3 * r, -0.72 * r),
    }),
    node(
      'goatee-stache',
      5,
      { kind: 'rect', width: 0.4 * r, height: 0.08 * r, rx: 0.04 * r },
      ink,
      {
        transform: translation(0.31 * r, -0.31 * r),
      },
    ),
  ],
});

// ---- outfits (SkinPart overlays on the body bone) ---------------------------

const royalUniform: PieceFn = ({ s, bodyLen, ink }) => ({
  bodyParts: [
    // Sash: shoulder → opposite hip across the chest front.
    {
      id: 'costume-sash',
      bone: 'pelvis',
      at: vec2(bodyLen / 2 + 0.04 * s, -0.06 * s),
      rotate: 1.05,
      z: 8,
      shape: { kind: 'rect', width: 0.16 * s, height: 0.95 * s, rx: 0.05 * s },
      fill: { color: GOLD },
      stroke: { color: GOLD_DARK, width: 0.02 * s },
    },
    epaulette('costume-epaulette-r', s, bodyLen, -0.42 * s),
    epaulette('costume-epaulette-l', s, bodyLen, 0.42 * s),
    ...buttonColumn(s, bodyLen, ink, 3),
  ],
});

const militaryUniform: PieceFn = ({ s, bodyLen, ink, outfitDark }) => ({
  bodyParts: [
    {
      id: 'costume-belt',
      bone: 'pelvis',
      at: vec2(bodyLen * 0.22, 0),
      z: 8,
      shape: { kind: 'rect', width: 1.06 * s, height: 0.14 * s, rx: 0.04 * s },
      rotate: Math.PI / 2,
      fill: { color: LEATHER },
      stroke: { color: ink, width: 0.02 * s },
    },
    {
      id: 'costume-buckle',
      bone: 'pelvis',
      at: vec2(bodyLen * 0.22, -0.3 * s),
      z: 9,
      shape: { kind: 'rect', width: 0.14 * s, height: 0.1 * s, rx: 0.02 * s },
      fill: { color: GOLD },
    },
    epaulette('costume-board-r', s, bodyLen, -0.42 * s, outfitDark),
    epaulette('costume-board-l', s, bodyLen, 0.42 * s, outfitDark),
    ...buttonColumn(s, bodyLen, ink, 4),
  ],
});

const suit: PieceFn = ({ s, bodyLen, ink }) => ({
  bodyParts: [
    {
      id: 'costume-shirt',
      bone: 'pelvis',
      at: vec2(bodyLen * 0.72, -0.16 * s),
      z: 8,
      shape: {
        kind: 'polygon',
        points: [vec2(0.22 * s, 0.14 * s), vec2(0.22 * s, -0.14 * s), vec2(-0.18 * s, 0)],
      },
      fill: { color: CLOTH_WHITE },
      stroke: { color: ink, width: 0.018 * s },
    },
    {
      id: 'costume-tie',
      bone: 'pelvis',
      at: vec2(bodyLen * 0.52, -0.18 * s),
      z: 9,
      shape: {
        kind: 'polygon',
        points: [
          vec2(0.14 * s, 0.05 * s),
          vec2(0.14 * s, -0.05 * s),
          vec2(-0.18 * s, -0.07 * s),
          vec2(-0.24 * s, 0),
          vec2(-0.18 * s, 0.07 * s),
        ],
      },
      fill: { color: CLOTH_RED },
    },
  ],
});

const robe: PieceFn = ({ s, bodyLen, outfitDark, ink }) => ({
  bodyParts: [
    {
      id: 'costume-robe-panel',
      bone: 'pelvis',
      at: vec2(bodyLen / 2 - 0.04 * s, -0.3 * s),
      z: 8,
      shape: { kind: 'rect', width: 0.22 * s, height: bodyLen * 1.04, rx: 0.08 * s },
      rotate: Math.PI / 2,
      fill: { color: outfitDark },
      stroke: { color: ink, width: 0.02 * s },
    },
    {
      id: 'costume-robe-trim',
      bone: 'pelvis',
      at: vec2(bodyLen / 2 - 0.04 * s, -0.19 * s),
      z: 9,
      shape: { kind: 'rect', width: 0.05 * s, height: bodyLen * 1.0, rx: 0.025 * s },
      rotate: Math.PI / 2,
      fill: { color: GOLD },
    },
  ],
});

const peasantTunic: PieceFn = ({ s, bodyLen, ink }) => ({
  bodyParts: [
    {
      id: 'costume-rope-belt',
      bone: 'pelvis',
      at: vec2(bodyLen * 0.24, 0),
      z: 8,
      shape: { kind: 'rect', width: 1.04 * s, height: 0.07 * s, rx: 0.035 * s },
      rotate: Math.PI / 2,
      fill: { color: LEATHER },
    },
    {
      id: 'costume-patch',
      bone: 'pelvis',
      at: vec2(bodyLen * 0.62, 0.24 * s),
      z: 8,
      shape: { kind: 'rect', width: 0.2 * s, height: 0.18 * s, rx: 0.02 * s },
      rotate: 0.2,
      fill: { color: shadeOf(LEATHER) },
      stroke: { color: ink, width: 0.015 * s },
    },
  ],
});

// ---- held items (hand frame: +x = shaft up) ---------------------------------

const heldScroll: PieceFn = ({ s, ink }) => ({
  handNodes: [
    // Sheet unrolled along the shaft (+x = up), roll ends at top and bottom.
    node(
      'scroll-sheet',
      1,
      { kind: 'rect', width: 0.5 * s, height: 0.26 * s, rx: 0.02 * s },
      PAPER,
      {
        stroke: { color: ink, width: 0.02 * s },
      },
    ),
    node('scroll-roll-top', 2, { kind: 'circle', r: 0.055 * s }, shadeOf(PAPER), {
      transform: translation(0.25 * s, 0),
    }),
    node('scroll-roll-bottom', 2, { kind: 'circle', r: 0.055 * s }, shadeOf(PAPER), {
      transform: translation(-0.25 * s, 0),
    }),
  ],
});

const heldSword: PieceFn = ({ s, ink }) => ({
  handNodes: [
    node(
      'sword-blade',
      1,
      {
        kind: 'polygon',
        points: [
          vec2(0.12 * s, 0.045 * s),
          vec2(0.78 * s, 0.045 * s),
          vec2(0.9 * s, 0),
          vec2(0.78 * s, -0.045 * s),
          vec2(0.12 * s, -0.045 * s),
        ],
      },
      STEEL,
      {},
      { color: ink, width: 0.02 * s },
    ),
    node(
      'sword-guard',
      2,
      { kind: 'rect', width: 0.05 * s, height: 0.26 * s, rx: 0.025 * s },
      GOLD,
      {
        transform: translation(0.12 * s, 0),
      },
    ),
    node(
      'sword-grip',
      1,
      { kind: 'rect', width: 0.18 * s, height: 0.07 * s, rx: 0.035 * s },
      LEATHER,
      {
        transform: translation(0.0 * s, 0),
      },
    ),
    node('sword-pommel', 2, { kind: 'circle', r: 0.045 * s }, GOLD, {
      transform: translation(-0.1 * s, 0),
    }),
  ],
});

const heldStaff: PieceFn = ({ s, ink }) => ({
  handNodes: [
    node(
      'staff-shaft',
      1,
      { kind: 'rect', width: 1.5 * s, height: 0.07 * s, rx: 0.035 * s },
      LEATHER,
      {
        transform: translation(0.35 * s, 0),
        stroke: { color: ink, width: 0.018 * s },
      },
    ),
    node('staff-knob', 2, { kind: 'circle', r: 0.09 * s }, GOLD_DARK, {
      transform: translation(1.1 * s, 0),
    }),
  ],
});

const heldFlag: PieceFn = ({ s, ink }) => ({
  handNodes: [
    node(
      'flag-pole',
      1,
      { kind: 'rect', width: 1.6 * s, height: 0.06 * s, rx: 0.03 * s },
      LEATHER,
      {
        transform: translation(0.4 * s, 0),
        stroke: { color: ink, width: 0.016 * s },
      },
    ),
    node(
      'flag-cloth',
      2,
      {
        kind: 'polygon',
        points: [
          vec2(1.18 * s, 0.03 * s),
          vec2(1.18 * s, 0.42 * s),
          vec2(0.62 * s, 0.32 * s),
          vec2(0.62 * s, 0.03 * s),
        ],
      },
      CLOTH_RED,
      {},
      { color: ink, width: 0.02 * s },
    ),
  ],
});

// ---- registries --------------------------------------------------------------

export const COSTUME_PIECES: Readonly<Record<string, PieceFn>> = {
  crown,
  'spiked-helmet': spikedHelmet,
  'plumed-hat': plumedHat,
  turban,
  beret,
  'royal-uniform': royalUniform,
  'military-uniform': militaryUniform,
  suit,
  robe,
  'peasant-tunic': peasantTunic,
};

export const MUSTACHES: Readonly<Record<string, PieceFn>> = {
  imperial: mustacheImperial,
  handlebar: mustacheHandlebar,
  chevron: mustacheChevron,
  goatee,
};

export const HELD_ITEMS: Readonly<Record<string, PieceFn>> = {
  scroll: heldScroll,
  sword: heldSword,
  staff: heldStaff,
  flag: heldFlag,
};

export interface CostumeSpec {
  readonly pieces?: readonly string[];
  readonly mustache?: string;
  readonly held?: string;
}

export interface CostumeAssembly {
  readonly template: CharacterTemplate;
  /** Groups for `characterNodes`' headNodes (after the face). */
  readonly headNodes: readonly SceneNode[];
  /** Groups for `characterNodes`' handNodes. */
  readonly handNodes: readonly SceneNode[];
}

export interface CostumeRenderOptions {
  readonly idPrefix: string;
  /** Absolute base layer of the character instance. */
  readonly layerBase?: number;
}

/** Face-frame piece z is relative to the head anchor; ≥5 clears the face
 * (which uses +1…+4). Held-item z is relative to the hand anchor. */

/**
 * Resolve a costume onto a character template. Unknown piece names throw —
 * the validator catches them earlier with a hint (schema enum).
 */
export function applyCostume(
  template: CharacterTemplate,
  spec: CostumeSpec,
  options: CostumeRenderOptions,
): CostumeAssembly {
  const ctx: PieceContext = {
    s: template.size,
    headR: template.headRadius,
    bodyLen: 0.85 * template.size,
    ink: template.palette.outline,
    outfit: template.palette.outfit,
    outfitDark: template.palette.outfitDark,
  };
  const base = options.layerBase ?? 0;

  const bodyParts: SkinPart[] = [];
  const headNodes: SceneNode[] = [];
  const handNodes: SceneNode[] = [];

  const resolve = (name: string, registry: Readonly<Record<string, PieceFn>>): PieceResult => {
    const fn = registry[name];
    if (!fn) throw new Error(`Unknown costume piece "${name}"`);
    return fn(ctx);
  };

  const collect = (name: string, result: PieceResult): void => {
    bodyParts.push(...(result.bodyParts ?? []));
    if (result.headNodes) {
      headNodes.push({
        id: `${options.idPrefix}/${name}`,
        // Head-anchor frame → face frame, same wrapper as faceNodes.
        transform: rotation(-Math.PI / 2),
        children: result.headNodes.map(({ relLayer, ...n }) => ({
          ...n,
          id: `${options.idPrefix}/${name}/${n.id}`,
          layer: base + HEAD_ANCHOR_Z + relLayer,
        })),
      });
    }
    if (result.handNodes) {
      handNodes.push({
        id: `${options.idPrefix}/${name}`,
        children: result.handNodes.map(({ relLayer, ...n }) => ({
          ...n,
          id: `${options.idPrefix}/${name}/${n.id}`,
          layer: base + HAND_ANCHOR_Z + relLayer,
        })),
      });
    }
  };

  for (const name of spec.pieces ?? []) collect(name, resolve(name, COSTUME_PIECES));
  if (spec.mustache) collect(`stache-${spec.mustache}`, resolve(spec.mustache, MUSTACHES));
  if (spec.held) collect(`held-${spec.held}`, resolve(spec.held, HELD_ITEMS));

  return {
    template: bodyParts.length
      ? { ...template, parts: [...template.parts, ...bodyParts] }
      : template,
    headNodes,
    handNodes,
  };
}

// ---- shared bits -------------------------------------------------------------

/** Dome over the head top: a filled half-disc arc (hats, helmets). */
function domePath(r: number, from = 0.4, top = 1.18): string {
  const f = (n: number): string => {
    const t = n.toFixed(3);
    return t.replace(/\.?0+$/, '') || '0';
  };
  const w = r * Math.sqrt(Math.max(0, 1 - from * from)) * 1.04;
  const y = r * from;
  return `M ${f(-w)} ${f(y)} Q 0 ${f(r * top * 2 - y)} ${f(w)} ${f(y)} Z`;
}

function epaulette(id: string, s: number, bodyLen: number, sideY: number, color = GOLD): SkinPart {
  return {
    id,
    bone: 'pelvis',
    at: vec2(bodyLen * 0.8, sideY),
    z: 9,
    shape: { kind: 'ellipse', rx: 0.13 * s, ry: 0.09 * s },
    fill: { color },
    stroke: { color: GOLD_DARK, width: 0.018 * s },
  };
}

function buttonColumn(s: number, bodyLen: number, ink: Color, count: number): SkinPart[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `costume-button-${i}`,
    bone: 'pelvis',
    at: vec2(bodyLen * (0.62 - i * 0.14), -0.24 * s),
    z: 9,
    shape: { kind: 'circle', r: 0.035 * s },
    fill: { color: GOLD },
    stroke: { color: ink, width: 0.012 * s },
  }));
}

const shadeOf = (c: Color): Color => ({
  r: Math.round(c.r * 0.8),
  g: Math.round(c.g * 0.8),
  b: Math.round(c.b * 0.8),
  a: c.a,
});
