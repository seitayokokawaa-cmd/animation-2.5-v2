import { apply, parseColor, vec2, type SceneNode, type Shape } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { blinkOpenness, FACE_EXPRESSIONS, faceNodes, type FaceState } from './face.js';

const ink = parseColor('#3a3226');
const lid = parseColor('#eec39a');

const options = { idPrefix: 'f', layerBase: 100, headRadius: 0.42, ink, lid };

const state = (over: Partial<FaceState> = {}): FaceState => ({
  expression: FACE_EXPRESSIONS.neutral!,
  eyesOpen: 1,
  look: vec2(0, 0),
  ...over,
});

const ids = (group: SceneNode) => group.children!.map((n) => n.id);
const find = (group: SceneNode, id: string) => group.children!.find((n) => n.id === id)!;

describe('face module (M6.5)', () => {
  it('builds whites, pupils, brows, and a mouth in explicit layers', () => {
    const face = faceNodes(state(), options);
    expect(ids(face)).toEqual([
      'f/eye-b-white',
      'f/eye-b-pupil',
      'f/eye-f-white',
      'f/eye-f-pupil',
      'f/brow-b',
      'f/brow-f',
      'f/mouth',
    ]);
    expect(find(face, 'f/eye-b-white').layer).toBe(101);
    expect(find(face, 'f/eye-b-pupil').layer).toBe(102);
    expect(find(face, 'f/brow-b').layer).toBe(104);
  });

  it('maps face-local +x (facing) to the head-anchor front', () => {
    const face = faceNodes(state(), options);
    const mapped = apply(face.transform!, vec2(1, 0));
    expect(mapped.x).toBeCloseTo(0, 9);
    expect(mapped.y).toBeCloseTo(-1, 9); // anchor −y = world front
  });

  it('blinks collapse the eyes to ink lines', () => {
    const face = faceNodes(state({ eyesOpen: 0 }), options);
    expect(ids(face)).toContain('f/eye-b-shut');
    expect(ids(face)).not.toContain('f/eye-b-white');
    expect(ids(face)).not.toContain('f/eye-b-pupil');
  });

  it('deadpan adds lids and a flat mouth; shocked bulges eyes with an o-mouth', () => {
    const deadpan = faceNodes(state({ expression: FACE_EXPRESSIONS.deadpan! }), options);
    expect(ids(deadpan)).toContain('f/eye-b-lid');
    const flat = find(deadpan, 'f/mouth').shape as Extract<Shape, { kind: 'rect' }>;
    expect(flat.width).toBeGreaterThan(0.42 * 0.4);

    const shocked = faceNodes(state({ expression: FACE_EXPRESSIONS.shocked! }), options);
    const o = find(shocked, 'f/mouth').shape as Extract<Shape, { kind: 'ellipse' }>;
    expect(o.kind).toBe('ellipse');
    const neutralWhite = find(faceNodes(state(), options), 'f/eye-b-white').shape as Extract<
      Shape,
      { kind: 'ellipse' }
    >;
    const shockedWhite = find(shocked, 'f/eye-b-white').shape as Extract<
      Shape,
      { kind: 'ellipse' }
    >;
    expect(shockedWhite.rx).toBeGreaterThan(neutralWhite.rx);
  });

  it('clamps the gaze inside the eye', () => {
    const wild = faceNodes(state({ look: vec2(9, -9) }), options);
    const white = find(wild, 'f/eye-f-white');
    const pupil = find(wild, 'f/eye-f-pupil');
    const dx = Math.abs(pupil.transform!.e - white.transform!.e);
    expect(dx).toBeLessThan(0.21 * 0.42); // stays within the white's rx
  });

  it('smile and frown mouths are filled path crescents', () => {
    const smile = faceNodes(state({ expression: FACE_EXPRESSIONS.happy! }), options);
    const mouth = find(smile, 'f/mouth').shape as Extract<Shape, { kind: 'path' }>;
    expect(mouth.kind).toBe('path');
    expect(mouth.d).toMatch(/^M .+ Z$/);
  });

  it('blinkOpenness is deterministic, mostly open, and de-synced per stream', () => {
    expect(blinkOpenness(500, 7, 'a')).toBe(blinkOpenness(500, 7, 'a'));
    const ticks = Array.from({ length: 408 }, (_, i) => i);
    const openA = ticks.map((t) => blinkOpenness(t, 7, 'a'));
    const openShare = openA.filter((v) => v === 1).length / openA.length;
    expect(openShare).toBeGreaterThan(0.85);
    expect(openA.some((v) => v === 0)).toBe(true);
    const openB = ticks.map((t) => blinkOpenness(t, 7, 'b'));
    expect(openB).not.toEqual(openA);
  });
});
