/**
 * Style presets (M4.6, plan §5.7): the film-wide look as config, not hope.
 * A preset bundles background, paper-grain texture, card theme, caption
 * color, and motion defaults. Ships `explainer-paper` (the genre look) and
 * `clean-flat`; `meta.background` still wins when set.
 */

import { hashNoise, parseColor, translation, type Color, type SceneNode } from '@motionforge/core';

import { DEFAULT_CARD_THEME, type CardTheme } from './cards.js';

export interface StylePreset {
  readonly name: string;
  readonly background: Color;
  /** Subtle deterministic speckle over the background. */
  readonly paperTexture: boolean;
  readonly cardTheme: CardTheme;
  readonly captionColor: Color;
  /** Documented motion defaults (overshoot/shake), read by authoring docs. */
  readonly motion: { readonly overshoot: number; readonly shakeIntensity: number };
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  'explainer-paper': {
    name: 'explainer-paper',
    background: parseColor('#e9dfc9'),
    paperTexture: true,
    cardTheme: {
      plate: parseColor('#b5453c'),
      plateAlt: parseColor('#f7f2e4'),
      text: parseColor('#ffffff'),
      textOnAlt: parseColor('#3a3226'),
      accent: parseColor('#c8a24a'),
    },
    captionColor: parseColor('#3a3226'),
    motion: { overshoot: 1.7, shakeIntensity: 0.3 },
  },
  'clean-flat': {
    name: 'clean-flat',
    background: parseColor('#22262e'),
    paperTexture: false,
    cardTheme: DEFAULT_CARD_THEME,
    captionColor: parseColor('#ffffff'),
    motion: { overshoot: 1.5, shakeIntensity: 0.25 },
  },
};

export const DEFAULT_STYLE = 'clean-flat';

export function stylePreset(name: string | undefined): StylePreset {
  const preset = STYLE_PRESETS[name ?? DEFAULT_STYLE];
  if (!preset) throw new Error(`Unknown style preset ${JSON.stringify(name)}`);
  return preset;
}

/**
 * Deterministic paper-grain speckle: faint dots scattered by hash noise in
 * world units over the visible area. Static per film seed — no shimmer.
 */
export function paperTextureNodes(filmSeed: number, worldWidth: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  const speckle = parseColor('#a99a7c');
  for (let i = 0; i < 90; i++) {
    const x = (hashNoise(filmSeed, 'paper/x', i) - 0.5) * worldWidth;
    const y = (hashNoise(filmSeed, 'paper/y', i) - 0.5) * 10;
    const r = 0.015 + hashNoise(filmSeed, 'paper/r', i) * 0.03;
    nodes.push({
      id: `paper-${i}`,
      depth: 1,
      layer: -1_000_000,
      transform: translation(x, y),
      shape: { kind: 'circle', r },
      fill: { color: speckle },
      opacity: 0.25 + hashNoise(filmSeed, 'paper/o', i) * 0.3,
    });
  }
  return nodes;
}
