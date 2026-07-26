/**
 * Face module (M6.5): eyes with deterministic blinks and look-at, brows,
 * and a flap-capable mouth, composed into the head-anchor group that
 * `characterNodes` provides. Everything is a pure function of its inputs —
 * blinks come from `hashNoise`, never a clock.
 *
 * Face-local frame: origin at the head center, +x toward the character's
 * facing side, +y up, in world units. `faceNodes` wraps its children in a
 * rotation so this holds inside the head-anchor frame (whose +x is the
 * head-bone axis, i.e. up). The rig's facing mirror flows through the
 * anchor transform, so the face mirrors with the character for free.
 */

import {
  clamp,
  compose,
  hashNoise,
  rotation,
  TICKS_PER_SECOND,
  translation,
  vec2,
  type Color,
  type SceneNode,
} from '@motionforge/core';

export type MouthShape = 'neutral' | 'flat' | 'smile' | 'frown' | 'open' | 'o';

export interface FaceExpression {
  /** 0 = rest height, 1 = fully raised (surprise). */
  readonly browRaise: number;
  /** Radians; positive slants the inner brow ends down (anger). */
  readonly browAngle: number;
  readonly mouth: MouthShape;
  /** Eye-white scale; >1 bulges, <1 squints. */
  readonly eyeScale: number;
  /** Fraction of the eye covered by the upper lid (deadpan ≈ 0.45). */
  readonly lidCover: number;
}

/** The starter expression set (reaction verbs build on these in M6.7). */
export const FACE_EXPRESSIONS: Readonly<Record<string, FaceExpression>> = {
  neutral: { browRaise: 0, browAngle: 0, mouth: 'neutral', eyeScale: 1, lidCover: 0 },
  happy: { browRaise: 0.35, browAngle: -0.1, mouth: 'smile', eyeScale: 1, lidCover: 0 },
  angry: { browRaise: -0.2, browAngle: 0.45, mouth: 'frown', eyeScale: 0.92, lidCover: 0.12 },
  sad: { browRaise: 0.25, browAngle: -0.4, mouth: 'frown', eyeScale: 0.95, lidCover: 0.18 },
  shocked: { browRaise: 1, browAngle: 0, mouth: 'o', eyeScale: 1.25, lidCover: 0 },
  deadpan: { browRaise: -0.1, browAngle: 0, mouth: 'flat', eyeScale: 1, lidCover: 0.45 },
};

export interface FaceState {
  readonly expression: FaceExpression;
  /** 1 open … 0 closed (blink). Below 0.5 the eyes draw as closed lines. */
  readonly eyesOpen: number;
  /** Gaze direction in [-1,1]² of the pupil's travel range. */
  readonly look: { readonly x: number; readonly y: number };
  /** Flap-mouth drive for character lines (M8.4); scales the open mouth. */
  readonly mouthOpen?: number;
}

/** Mean seconds between blinks (jittered per cycle). */
const BLINK_PERIOD = 3.4;
/** Seconds the eye stays shut. */
const BLINK_SHUT = 0.13;

/**
 * Deterministic eyelid openness at a tick. Each ~3.4 s cycle hides one
 * blink at a seeded moment, so a cast never blinks in unison.
 */
export function blinkOpenness(tick: number, filmSeed: number, stream: string): number {
  const t = tick / TICKS_PER_SECOND;
  const cycle = Math.floor(t / BLINK_PERIOD);
  const jitter = hashNoise(filmSeed, `${stream}/blink`, cycle);
  const start = cycle * BLINK_PERIOD + 0.5 + jitter * (BLINK_PERIOD - BLINK_SHUT - 1);
  if (t < start - 0.05) return 1;
  if (t < start) return (start - t) / 0.05;
  if (t < start + BLINK_SHUT) return 0;
  if (t < start + BLINK_SHUT + 0.07) return (t - start - BLINK_SHUT) / 0.07;
  return 1;
}

export interface FaceRenderOptions {
  readonly idPrefix: string;
  /** Absolute layer of the head anchor; parts stack explicitly above it. */
  readonly layerBase?: number;
  /** World units. */
  readonly headRadius: number;
  /** Ink/outline color (pupils, brows, closed eyes, mouth line). */
  readonly ink: Color;
  /** Eyelid color — the character's skin tone. */
  readonly lid: Color;
}

const WHITE: Color = { r: 253, g: 250, b: 241, a: 1 };

const fmt = (n: number): string => {
  const r = n.toFixed(3);
  return r.replace(/\.?0+$/, '') || '0';
};

/** Filled crescent along a quadratic arc — a tapered "drawn" mouth line. */
const arcMouth = (w: number, bow: number): string =>
  `M ${fmt(-w)} 0 Q 0 ${fmt(bow)} ${fmt(w)} 0 Q 0 ${fmt(bow * 0.45)} ${fmt(-w)} 0 Z`;

/**
 * Build the face as a single group for `characterNodes`' `headNodes`.
 * Layers are explicit (whites < pupils < lids < brows) so paint order can
 * never depend on screen position.
 */
export function faceNodes(state: FaceState, options: FaceRenderOptions): SceneNode {
  const r = options.headRadius;
  const base = options.layerBase ?? 0;
  const { expression: x } = state;
  const ink = { color: options.ink };
  const nodes: SceneNode[] = [];

  const eyeRx = 0.21 * r * x.eyeScale;
  const eyeRy = 0.26 * r * x.eyeScale;
  const eyeY = 0.06 * r;
  const eyes = [
    { key: 'b', cx: 0.1 * r },
    { key: 'f', cx: 0.55 * r },
  ];

  for (const eye of eyes) {
    if (state.eyesOpen < 0.5) {
      // Blink: the whole eye collapses to an ink line.
      nodes.push({
        id: `${options.idPrefix}/eye-${eye.key}-shut`,
        layer: base + 1,
        transform: translation(eye.cx, eyeY - eyeRy * 0.4),
        shape: { kind: 'rect', width: eyeRx * 1.7, height: 0.05 * r, rx: 0.025 * r },
        fill: ink,
      });
      continue;
    }
    nodes.push({
      id: `${options.idPrefix}/eye-${eye.key}-white`,
      layer: base + 1,
      transform: translation(eye.cx, eyeY),
      shape: { kind: 'ellipse', rx: eyeRx, ry: eyeRy },
      fill: { color: WHITE },
      stroke: { color: options.ink, width: 0.025 * r },
    });
    const range = vec2(eyeRx * 0.45, eyeRy * 0.45);
    nodes.push({
      id: `${options.idPrefix}/eye-${eye.key}-pupil`,
      layer: base + 2,
      transform: translation(
        eye.cx + clamp(state.look.x, -1, 1) * range.x,
        eyeY + clamp(state.look.y, -1, 1) * range.y,
      ),
      shape: { kind: 'circle', r: 0.075 * r * x.eyeScale },
      fill: ink,
    });
    const cover = clamp(x.lidCover + (1 - state.eyesOpen) * 0.4, 0, 0.75);
    if (cover > 0.01) {
      nodes.push({
        id: `${options.idPrefix}/eye-${eye.key}-lid`,
        layer: base + 3,
        transform: translation(eye.cx, eyeY + eyeRy * (1 - cover)),
        shape: { kind: 'ellipse', rx: eyeRx * 1.04, ry: eyeRy },
        fill: { color: options.lid },
      });
    }
  }

  // Brows: rounded ink bars; the pair tilts in mirror (anger slants in).
  const browY = eyeY + eyeRy + (0.14 + 0.14 * x.browRaise) * r;
  for (const [i, eye] of eyes.entries()) {
    nodes.push({
      id: `${options.idPrefix}/brow-${eye.key}`,
      layer: base + 4,
      // Positive browAngle drops the inner ends (between the eyes): the
      // back brow's inner end is its +x side, the front brow's its −x side.
      transform: compose(
        translation(eye.cx, browY),
        rotation(i === 0 ? -x.browAngle : x.browAngle),
      ),
      shape: { kind: 'rect', width: 0.34 * r, height: 0.055 * r, rx: 0.0275 * r },
      fill: ink,
    });
  }

  // Mouth, toward the facing side under the eyes.
  const mouthAt = translation(0.3 * r, -0.42 * r);
  const mouthW = 0.28 * r;
  switch (x.mouth) {
    case 'neutral':
    case 'flat':
      nodes.push({
        id: `${options.idPrefix}/mouth`,
        layer: base + 1,
        transform: mouthAt,
        shape: {
          kind: 'rect',
          width: x.mouth === 'flat' ? 0.5 * r : mouthW,
          height: 0.05 * r,
          rx: 0.025 * r,
        },
        fill: ink,
      });
      break;
    case 'smile':
    case 'frown': {
      const bow = (x.mouth === 'smile' ? -0.24 : 0.2) * r;
      nodes.push({
        id: `${options.idPrefix}/mouth`,
        layer: base + 1,
        transform: mouthAt,
        shape: { kind: 'path', d: arcMouth(mouthW, bow) },
        fill: ink,
      });
      break;
    }
    case 'open':
    case 'o': {
      const drive = x.mouth === 'o' ? 0.7 : 0.3 + 0.7 * (state.mouthOpen ?? 1);
      nodes.push({
        id: `${options.idPrefix}/mouth`,
        layer: base + 1,
        transform: mouthAt,
        shape: { kind: 'ellipse', rx: 0.14 * r, ry: 0.19 * r * drive },
        fill: { color: { r: 90, g: 41, b: 35, a: 1 } },
        stroke: { color: options.ink, width: 0.025 * r },
      });
      break;
    }
  }

  return {
    id: `${options.idPrefix}/face`,
    // Head-anchor frame → face frame (+x facing, +y up).
    transform: rotation(-Math.PI / 2),
    children: nodes,
  };
}
