import { sample, type Vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { compile, sceneAtTick } from './compile.js';
import { mfsSchema } from './schema.js';

const doc = mfsSchema.parse({
  motionforge: 1,
  meta: { title: 'T', resolution: '1920x1080', fps: 30, seed: 3 },
  shapes: {
    box: { kind: 'rect', width: 2, height: 1, fill: '#d94f30' },
  },
  scenes: [
    {
      id: 'a',
      duration: 2,
      place: [{ ref: 'box', as: 'b', at: [0, 0], rotate: 90, scale: 2, depth: 0.4, layer: 1 }],
      actions: [
        { at: 0, move: { target: 'b', to: [4, 0], duration: 1 } },
        { at: 1, move: { target: 'b', to: [4, 2], duration: 1 } },
        { at: 0.5, rotate: { target: 'b', to: 180, duration: 1 } },
        { at: 0, camera: { to: [2, 0], zoom: 1.5, duration: 2 } },
        { at: 0.5, caption: { text: 'hi', duration: 1 } },
      ],
    },
    { id: 'b', duration: 1 },
  ],
});

describe('compile', () => {
  const film = compile(doc);

  it('converts meta and computes film duration in ticks', () => {
    expect(film.width).toBe(1920);
    expect(film.height).toBe(1080);
    expect(film.durationTicks).toBe(360); // 3 s
    expect(film.scenes[1]!.startTick).toBe(240);
  });

  it('chains consecutive moves from the previous end value', () => {
    const tl = film.scenes[0]!.timeline;
    expect(sample<Vec2>(tl, 'b/pos', 0)).toEqual({ x: 0, y: 0 });
    expect(sample<Vec2>(tl, 'b/pos', 60)).toEqual({ x: 2, y: 0 });
    expect(sample<Vec2>(tl, 'b/pos', 120)).toEqual({ x: 4, y: 0 });
    expect(sample<Vec2>(tl, 'b/pos', 180)).toEqual({ x: 4, y: 1 });
  });

  it('converts degrees to radians for base and tween', () => {
    const tl = film.scenes[0]!.timeline;
    expect(sample<number>(tl, 'b/rot', 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(sample<number>(tl, 'b/rot', 240)).toBeCloseTo(Math.PI, 12);
  });

  it('camera pos and zoom tween from defaults', () => {
    const tl = film.scenes[0]!.timeline;
    expect(sample<Vec2>(tl, 'camera/pos', 120).x).toBeCloseTo(1, 12);
    expect(sample<number>(tl, 'camera/zoom', 240)).toBe(1.5);
  });

  it('compiles captions with defaults', () => {
    const [caption] = film.scenes[0]!.captions;
    expect(caption).toMatchObject({
      text: 'hi',
      startTick: 60,
      durationTicks: 120,
      size: 0.6,
      color: { r: 255, g: 255, b: 255, a: 1 },
      font: 'noto-sans',
    });
    expect(caption!.at).toEqual({ x: 0, y: -3.5 });
  });

  it('instances carry shape, depth, layer', () => {
    const [inst] = film.scenes[0]!.instances;
    expect(inst).toMatchObject({ id: 'b', depth: 0.4, layer: 1 });
    expect(inst!.shape.kind).toBe('rect');
  });

  it('sceneAtTick maps film ticks to scenes, inclusive tail', () => {
    expect(sceneAtTick(film, 0).id).toBe('a');
    expect(sceneAtTick(film, 239).id).toBe('a');
    expect(sceneAtTick(film, 240).id).toBe('b');
    expect(sceneAtTick(film, 999).id).toBe('b');
  });

  it('rejects overlapping tweens on the same property via track validation', () => {
    const bad = mfsSchema.parse({
      motionforge: 1,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      shapes: { box: { kind: 'rect', width: 1, height: 1 } },
      scenes: [
        {
          id: 'a',
          duration: 2,
          place: [{ ref: 'box', as: 'b', at: [0, 0] }],
          actions: [
            { at: 0, move: { target: 'b', to: [1, 0], duration: 1 } },
            { at: 0.5, move: { target: 'b', to: [2, 0], duration: 1 } },
          ],
        },
      ],
    });
    expect(() => compile(bad)).toThrow(/overlap/);
  });
});
