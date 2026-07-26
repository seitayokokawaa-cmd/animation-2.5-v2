import { sample } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { compile } from './compile.js';
import { mfsSchema } from './schema.js';

const doc = (actions: unknown[]) =>
  mfsSchema.parse({
    motionforge: 2,
    meta: { title: 'T', resolution: '640x360', fps: 30, seed: 5 },
    shapes: { box: { kind: 'rect', width: 1, height: 1 } },
    scenes: [
      {
        id: 's',
        duration: 4,
        place: [{ ref: 'box', as: 'b', at: [0, 0] }],
        actions,
      },
    ],
  });

describe('effect compilation (M4.1/M4.2)', () => {
  it('emphasis verbs become registry effects with unique seeds', () => {
    const film = compile(
      doc([
        { at: 0.5, 'pop-in': { target: 'b' } },
        { at: 1, pulse: { target: 'b', to: 1.4, duration: 0.6 } },
        { at: 2, wiggle: { target: 'b' } },
      ]),
    );
    const effects = film.scenes[0]!.effects;
    expect(effects.map((e) => e.verb)).toEqual(['pop-in', 'pulse', 'wiggle']);
    expect(effects[0]).toMatchObject({ target: 'b', startTick: 60, durationTicks: 48 });
    expect(effects[1]!.params).toEqual({ to: 1.4 });
    expect(new Set(effects.map((e) => e.seed)).size).toBe(3);
  });

  it('slam adds a camera shake starting at impact; shake: 0 disables it', () => {
    const film = compile(doc([{ at: 1, slam: { target: 'b', height: 5, duration: 0.5 } }]));
    const effects = film.scenes[0]!.effects;
    expect(effects.map((e) => e.verb)).toEqual(['slam', 'shake']);
    const shake = effects[1]!;
    expect(shake.target).toBe('camera');
    expect(shake.startTick).toBe(120 + Math.round(0.5 * 0.6 * 120));
    const noShake = compile(doc([{ at: 1, slam: { target: 'b', shake: 0 } }]));
    expect(noShake.scenes[0]!.effects.map((e) => e.verb)).toEqual(['slam']);
  });

  it('bounce-to slides linearly and layers a bounce-bob with derived hops', () => {
    const film = compile(doc([{ at: 0, 'bounce-to': { target: 'b', to: [4.5, 0] } }]));
    const scene = film.scenes[0]!;
    const clip = scene.timeline.tracks.get('b/pos')!.clips[0]!;
    expect(clip.easing).toBe('linear');
    expect(clip.to).toEqual({ x: 4.5, y: 0 });
    const bob = scene.effects.find((e) => e.verb === 'bounce-bob')!;
    expect(bob.params.hops).toBe(3); // 4.5 units / 1.5 per hop
    expect(bob.durationTicks).toBe(clip.duration); // slide and bob share the window
    expect(clip.duration).toBe(Math.round(3 * 0.35 * 120));
  });

  it('bounce-to chains from the previous position like move', () => {
    const film = compile(
      doc([
        { at: 0, move: { target: 'b', to: [2, 0], duration: 0.5 } },
        { at: 1, 'bounce-to': { target: 'b', to: [2, 3], hops: 2 } },
      ]),
    );
    const clips = film.scenes[0]!.timeline.tracks.get('b/pos')!.clips;
    expect(clips[1]!.from).toEqual({ x: 2, y: 0 });
    expect(clips[1]!.to).toEqual({ x: 2, y: 3 });
  });
});

describe('articulation compilation (M5.3)', () => {
  const artDoc = mfsSchema.parse({
    motionforge: 2,
    meta: { title: 'T', resolution: '640x360', fps: 30 },
    objects: {
      cart: {
        parts: [
          { id: 'body', shape: { kind: 'rect', width: 2, height: 0.5 }, fill: '#804020' },
          {
            id: 'wheel',
            at: [0.7, -0.3],
            pivot: [0, 0],
            shape: { kind: 'circle', r: 0.35 },
            fill: '#404040',
          },
        ],
      },
    },
    scenes: [
      {
        id: 's',
        duration: 4,
        place: [{ ref: 'cart', as: 'c', at: [-4, 0] }],
        actions: [
          { at: 0, move: { target: 'c', to: [4, 0], duration: 3 } },
          { at: 0, roll: { target: 'c.wheel', radius: 0.35, duration: 3 } },
          { at: 1, hinge: { target: 'c.body', to: 15, duration: 0.5 } },
          { at: 2, oscillate: { target: 'c.body', amplitude: 10, cycles: 3, duration: 1 } },
        ],
      },
    ],
  });
  const film = compile(artDoc);
  const scene = film.scenes[0]!;

  it('emits part-targeted effects with radians', () => {
    const hinge = scene.effects.find((e) => e.verb === 'hinge')!;
    expect(hinge.target).toBe('c.body');
    expect(hinge.params.to).toBeCloseTo((15 * Math.PI) / 180, 9);
  });

  it('builds a cumulative eased travel track for roll', () => {
    expect(sample<number>(scene.timeline, 'c/travel', 0)).toBe(0);
    expect(sample<number>(scene.timeline, 'c/travel', 180)).toBeCloseTo(4, 6); // halfway of 8 units
    expect(sample<number>(scene.timeline, 'c/travel', 360)).toBeCloseTo(8, 6);
  });
});
