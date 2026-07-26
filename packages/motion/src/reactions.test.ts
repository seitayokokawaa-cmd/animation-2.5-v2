import { secondsToTicks, type FilmEffect } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { FACE_EXPRESSIONS } from './face.js';
import { REACTION_KINDS, reactionFace } from './reactions.js';
import { emitEffectNodes } from './verbs.js';

describe('reaction pack (M6.7)', () => {
  it('ships the plan reaction set in stable index order', () => {
    expect(REACTION_KINDS).toEqual([
      'jaw-drop',
      'eye-bulge',
      'sweat',
      'anger-steam',
      'hearts',
      'deadpan',
    ]);
  });

  it('jaw-drop falls fast then hangs open', () => {
    expect(reactionFace('jaw-drop', 0.05).mouthOpen!).toBeLessThan(0.5);
    expect(reactionFace('jaw-drop', 0.3).mouthOpen!).toBeCloseTo(1, 5);
    expect(reactionFace('jaw-drop', 0.9).mouthOpen!).toBe(1);
    expect(reactionFace('jaw-drop', 0.9).expression.mouth).toBe('open');
  });

  it('eye-bulge snaps out and settles, never below rest', () => {
    const peak = reactionFace('eye-bulge', 0.2).expression.eyeScale;
    const settled = reactionFace('eye-bulge', 1).expression.eyeScale;
    expect(peak).toBeGreaterThan(1.5);
    expect(settled).toBeLessThan(peak);
    expect(settled).toBeGreaterThan(1.2);
  });

  it('anger-steam knits the brows; hearts go dreamy; deadpan is the preset', () => {
    expect(reactionFace('anger-steam', 0.5).expression.browAngle).toBeGreaterThan(0);
    expect(reactionFace('hearts', 0.5).expression.lidCover).toBeGreaterThan(0.2);
    expect(reactionFace('hearts', 0.5).expression.mouth).toBe('smile');
    expect(reactionFace('deadpan', 0.5).expression).toBe(FACE_EXPRESSIONS.deadpan);
  });

  it('is a pure function of (kind, t)', () => {
    expect(reactionFace('sweat', 0.4)).toEqual(reactionFace('sweat', 0.4));
  });

  it('hearts FX emits deterministic floating hearts', () => {
    const effect: FilmEffect = {
      target: 'c',
      verb: 'hearts',
      startTick: 0,
      durationTicks: secondsToTicks(1.2),
      params: {},
      seed: 'hearts/test/0',
    };
    const nodes = emitEffectNodes(effect, 30, 7);
    expect(nodes.length).toBe(4);
    expect(nodes[0]!.children).toHaveLength(3); // two lobes + point
    expect(emitEffectNodes(effect, 30, 7)).toEqual(nodes);
    expect(emitEffectNodes(effect, 200, 7)).toEqual([]); // outside the window
  });
});
