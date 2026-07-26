/**
 * Reaction pack (M6.7): timed face takeovers — the genre's comedy engine.
 * A reaction is compiled as a `react` effect on a character instance; the
 * frame builder maps it through `reactionFace(kind, t)` to an expression
 * (plus flap/gaze drive) for the effect window, overriding the resting
 * face. Emitter kinds (sweat, anger-steam, hearts) get their particle FX
 * as companion effects at compile time.
 */

import { clamp, vec2, type Vec2 } from '@motionforge/core';

import { FACE_EXPRESSIONS, type FaceExpression } from './face.js';

/** Order matters: the compiled effect stores `kind` as this array's index. */
export const REACTION_KINDS = [
  'jaw-drop',
  'eye-bulge',
  'sweat',
  'anger-steam',
  'hearts',
  'deadpan',
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export interface ReactionFace {
  readonly expression: FaceExpression;
  /** Flap-mouth drive for the open mouth (jaw-drop). */
  readonly mouthOpen?: number;
  readonly look?: Vec2;
}

/**
 * Face override for a reaction at normalized time t ∈ [0,1]. Pure — the
 * same (kind, t) always yields the same face.
 */
export function reactionFace(kind: ReactionKind, t: number): ReactionFace {
  const u = clamp(t, 0, 1);
  switch (kind) {
    case 'jaw-drop': {
      // Jaw falls fast, then hangs.
      const drop = u < 0.3 ? Math.sin((u / 0.3) * (Math.PI / 2)) : 1;
      return {
        expression: {
          browRaise: 1,
          browAngle: 0,
          mouth: 'open',
          eyeScale: 1.15,
          lidCover: 0,
        },
        mouthOpen: drop,
        look: vec2(0.35, -0.3),
      };
    }
    case 'eye-bulge': {
      // Snap out, settle back a little.
      const bulge = u < 0.2 ? u / 0.2 : 1 - 0.3 * ((u - 0.2) / 0.8);
      return {
        expression: {
          browRaise: 0.8,
          browAngle: 0,
          mouth: 'o',
          eyeScale: 1 + 0.65 * bulge,
          lidCover: 0,
        },
        look: vec2(0.2, 0),
      };
    }
    case 'sweat':
      return {
        expression: {
          browRaise: 0.5,
          browAngle: -0.25,
          mouth: 'flat',
          eyeScale: 1,
          lidCover: 0.1,
        },
        look: vec2(0.7, 0),
      };
    case 'anger-steam':
      return {
        expression: {
          browRaise: -0.3,
          browAngle: 0.6,
          mouth: 'frown',
          eyeScale: 0.88,
          lidCover: 0.15,
        },
        look: vec2(0.35, -0.05),
      };
    case 'hearts':
      return {
        expression: {
          browRaise: 0.4,
          browAngle: -0.15,
          mouth: 'smile',
          eyeScale: 1,
          lidCover: 0.35,
        },
        look: vec2(0.2, 0.3),
      };
    case 'deadpan':
      return { expression: FACE_EXPRESSIONS.deadpan!, look: vec2(0.35, -0.05) };
  }
}
