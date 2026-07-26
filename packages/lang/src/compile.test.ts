import { sample, secondsToTicks, vec2, type Vec2 } from '@motionforge/core';
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
      font: 'noto-sans',
    });
    expect(caption!.at).toEqual({ x: 0, y: -3.5 });
  });

  it('instances carry shape, depth, layer', () => {
    const [inst] = film.scenes[0]!.instances;
    expect(inst).toMatchObject({ id: 'b', depth: 0.4, layer: 1000 });
    expect(inst!.shape!.kind).toBe('rect');
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

describe('cast compilation (M6.4)', () => {
  const doc = mfsSchema.parse({
    motionforge: 2,
    meta: { title: 'T', resolution: '640x360', fps: 30 },
    cast: {
      franz: {
        template: 'potato-biped',
        size: 0.9,
        palette: { outfit: '#8a1c1c', 'outfit-dark': '#5f1212' },
        expression: 'deadpan',
      },
    },
    scenes: [
      {
        id: 'a',
        duration: 1,
        place: [
          { ref: 'franz', as: 'f1', at: [-2, 0], facing: 'left', layer: 2 },
          { ref: 'franz', as: 'f2', at: [2, 0] },
        ],
      },
    ],
  });

  it('compiles cast placements into character instances', () => {
    const [f1, f2] = compile(doc).scenes[0]!.instances;
    expect(f1).toMatchObject({ id: 'f1', depth: 0.5, layer: 2000 });
    expect(f1!.character).toMatchObject({
      template: 'potato-biped',
      size: 0.9,
      facing: 'left',
      expression: 'deadpan',
    });
    // Kebab-case YAML slots map to the template's camelCase slot names.
    expect(f1!.character!.palette).toEqual({
      outfit: { r: 0x8a, g: 0x1c, b: 0x1c, a: 1 },
      outfitDark: { r: 0x5f, g: 0x12, b: 0x12, a: 1 },
    });
    expect(f2!.character).toMatchObject({ size: 0.9, facing: 'right' });
    expect(f1!.shape).toBeUndefined();
    expect(f1!.object).toBeUndefined();
  });

  it('places maps as object instances via MapsData (M7.2)', () => {
    const withMap = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      maps: {
        europe: {
          source: 'naturalearth/europe-110m',
          groups: { entente: ['france'] },
        },
      },
      scenes: [{ id: 'a', duration: 1, place: [{ ref: 'europe', as: 'map', at: [0, 0] }] }],
    });
    const spec = {
      params: {},
      parts: [{ id: 'france', z: 1, shape: { kind: 'polygon' as const, points: [] } }],
    };
    const film = compile(withMap, undefined, {
      map: (name) =>
        name === 'europe'
          ? { objectSpec: spec, regions: [], groups: { entente: ['france'] } }
          : undefined,
    });
    const [inst] = film.scenes[0]!.instances;
    expect(inst!.object!.spec).toBe(spec);
    expect(inst!.object!.options.idPrefix).toBe('map');
    // Without MapsData the compile fails loudly.
    expect(() => compile(withMap)).toThrow(/map data/);
  });

  it('map verbs expand groups into staggered region effects (M7.3)', () => {
    const doc2 = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      maps: {
        europe: {
          source: 'naturalearth/europe-110m',
          groups: { entente: ['france', 'serbia'] },
        },
      },
      scenes: [
        {
          id: 'a',
          duration: 3,
          place: [{ ref: 'europe', as: 'war-map', at: [0, 0] }],
          actions: [
            { at: 0.5, map: { recolor: { entente: '#3c6fb5' }, duration: 0.6 } },
            { at: 1, map: { highlight: 'germany' } },
            { at: 2, map: { morph: { region: 'germany', to: 'germany-1941' } } },
          ],
        },
      ],
    });
    const ring = [vec2(0, 0), vec2(1, 0), vec2(1, 1)];
    const part = (id: string) => ({
      id,
      z: 1,
      children: [{ id: `${id}-main`, z: 1, shape: { kind: 'polygon' as const, points: ring } }],
    });
    const mapsData = {
      map: () => ({
        objectSpec: {
          params: {},
          parts: [part('france'), part('serbia'), part('germany'), part('germany-1941')],
        },
        regions: ['france', 'serbia', 'germany', 'germany-1941'].map((id) => ({
          id,
          centroid: vec2(0, 0),
          bbox: { min: vec2(0, 0), max: vec2(1, 1) },
        })),
        groups: { entente: ['france', 'serbia'] },
      }),
    };
    const effects = compile(doc2, undefined, mapsData).scenes[0]!.effects;
    const recolors = effects.filter((e) => e.verb === 'map-recolor');
    expect(recolors.map((e) => e.target)).toEqual(['war-map.france', 'war-map.serbia']);
    // Alliance members stagger by 0.12 s.
    expect(recolors[1]!.startTick - recolors[0]!.startTick).toBe(14);
    expect(recolors[0]!.params.color).toBe(0x3c6fb5);
    expect(effects.some((e) => e.verb === 'map-highlight' && e.target === 'war-map.germany')).toBe(
      true,
    );
    const morph = effects.find((e) => e.verb === 'map-morph')!;
    expect(morph.target).toBe('war-map.germany');
    expect(morph.params.to).toBe(3); // germany-1941's part index
    // Unknown regions fail loudly.
    const bad = {
      ...doc2,
      scenes: [
        {
          ...doc2.scenes[0]!,
          actions: [{ at: 0, map: { highlight: 'narnia' } }],
        },
      ],
    };
    expect(() => compile(bad, undefined, mapsData)).toThrow(/narnia/);

    // Multi-arrow offensives (M7.4): region centroids, staggered launches.
    const withArrows = {
      ...doc2,
      scenes: [
        {
          ...doc2.scenes[0]!,
          actions: [
            {
              at: 0,
              arrow: {
                from: 'germany',
                to: ['france', [3, 2] as [number, number]],
                color: '#8a1c1c',
              },
            },
          ],
        },
      ],
    };
    const arrows = compile(withArrows, undefined, mapsData).scenes[0]!.effects.filter(
      (e) => e.verb === 'map-arrow',
    );
    expect(arrows).toHaveLength(2);
    expect(arrows[0]!.target).toBe('war-map');
    expect(arrows[1]!.startTick - arrows[0]!.startTick).toBe(18); // 0.15 s
    expect(arrows[1]!.params.x1).toBe(3);
    expect(arrows[0]!.params.color).toBe(0x8a1c1c);

    // Labels carry text; groups land at the mean member centroid (M7.6).
    const withLabels = {
      ...doc2,
      scenes: [
        {
          ...doc2.scenes[0]!,
          actions: [
            { at: 0, label: { of: { entente: 'The Entente', germany: 'Germany' } } },
            { at: 1, 'zoom-to': { region: 'germany' } },
          ],
        },
      ],
    };
    const zoomed = compile(withLabels, undefined, mapsData).scenes[0]!;
    const labels = zoomed.effects.filter((e) => e.verb === 'map-label');
    expect(labels.map((e) => e.text)).toEqual(['The Entente', 'Germany']);
    // zoom-to frames the region bbox: camera lands zoomed in past 1×.
    expect(sample<number>(zoomed.timeline, 'camera/zoom', 300)).toBeGreaterThan(1.5);
    expect(sample<Vec2>(zoomed.timeline, 'camera/pos', 300).x).toBeCloseTo(0.5, 6);
  });

  it('stage presets dress the scene; enter/exit run through the wings (M8.1)', () => {
    const skit = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '1280x720', fps: 30 },
      cast: { hero: { template: 'potato-biped' } },
      scenes: [
        {
          id: 'a',
          stage: { preset: 'throne-room' },
          duration: 4,
          place: [{ ref: 'hero', as: 'hero', at: [1, -2.6] }],
          actions: [
            { at: 0.4, enter: { target: 'hero', from: 'left' } },
            { at: 3, exit: { target: 'hero', to: 'right' } },
          ],
        },
      ],
    });
    const sceneOut = compile(skit).scenes[0]!;
    // Stage decor compiled in behind authored content.
    expect(sceneOut.instances.some((i) => i.id === 'stage-ground')).toBe(true);
    expect(sceneOut.instances.some((i) => i.id === 'stage-dais')).toBe(true);
    expect(sceneOut.instances.find((i) => i.id === 'stage-dais')!.layer).toBeLessThan(0);
    expect(sceneOut.backdrop).toBeDefined();
    // Before the entrance the hero waits offstage left.
    expect(sample<Vec2>(sceneOut.timeline, 'hero/pos', 0).x).toBeLessThan(-9);
    // Onstage after entering, offstage right after exiting.
    expect(sample<Vec2>(sceneOut.timeline, 'hero/pos', 240).x).toBeCloseTo(1, 6);
    expect(sample<Vec2>(sceneOut.timeline, 'hero/pos', 470).x).toBeGreaterThan(9);
    // The hops ride a bounce-bob.
    expect(sceneOut.effects.filter((e) => e.verb === 'bounce-bob')).toHaveLength(2);
  });

  it('keyframes pack frames into a held effect (M8.6)', () => {
    const doc3 = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      shapes: { box: { kind: 'rect', width: 1, height: 1 } },
      scenes: [
        {
          id: 'a',
          duration: 4,
          place: [{ ref: 'box', as: 'b', at: [0, 0] }],
          actions: [
            {
              at: 0.5,
              keyframes: {
                target: 'b',
                property: 'rotate',
                frames: [
                  { t: 0, value: 0 },
                  { t: 1, value: -90, easing: 'cubicOut' },
                  { t: 2, value: 45 },
                ],
              },
            },
          ],
        },
      ],
    });
    const effect = compile(doc3).scenes[0]!.effects.find((e) => e.verb === 'keyframes')!;
    expect(effect.startTick).toBe(secondsToTicks(0.5));
    expect(effect.durationTicks).toBe(secondsToTicks(2));
    expect(effect.params.count).toBe(3);
    expect(effect.params.t1).toBeCloseTo(0.5, 9);
    expect(effect.params.v1).toBeCloseTo(-Math.PI / 2, 9);
    expect(effect.params.property).toBe(2);
  });

  it('slapstick: bonk pairs stars, fling arcs, chase ping-pongs (M8.5)', () => {
    const skit = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '1280x720', fps: 30 },
      cast: { a: { template: 'potato-biped' }, b: { template: 'potato-biped' } },
      scenes: [
        {
          id: 's',
          duration: 8,
          place: [
            { ref: 'a', as: 'a', at: [-2, -2.6] },
            { ref: 'b', as: 'b', at: [2, -2.6] },
          ],
          actions: [
            { at: 0.2, bonk: { target: 'a' } },
            { at: 1, fling: { target: 'a', to: [4, -2.6], spins: 3 } },
            { at: 2.5, chase: { targets: ['a', 'b'], duration: 4.4 } },
          ],
        },
      ],
    });
    const sceneOut = compile(skit).scenes[0]!;
    const verbs = sceneOut.effects.map((e) => e.verb);
    expect(verbs).toContain('bonk');
    expect(verbs).toContain('impact-stars');
    const fling = sceneOut.effects.find((e) => e.verb === 'fling')!;
    expect(fling.params.spins).toBe(3);
    // Fling moved the actor; the chase starts from where it landed.
    expect(sample<Vec2>(sceneOut.timeline, 'a/pos', secondsToTicks(2.4)).x).toBeCloseTo(4, 6);
    // Chase: both actors get bounce legs; the chaser trails.
    const bobs = sceneOut.effects.filter((e) => e.verb === 'bounce-bob');
    expect(bobs.filter((e) => e.target === 'a').length).toBeGreaterThanOrEqual(2);
    expect(bobs.filter((e) => e.target === 'b').length).toBeGreaterThanOrEqual(2);
    const aFirst = bobs.find((e) => e.target === 'a')!.startTick;
    const bFirst = bobs.find((e) => e.target === 'b')!.startTick;
    expect(bFirst - aFirst).toBe(secondsToTicks(0.35));
  });

  it('schedules character lines after their anchor phrase (M8.4)', () => {
    const skit = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      voices: {
        narrator: { engine: 'mock', voice: 'warm' },
        franz: { engine: 'mock', voice: 'bright', pitch: 5 },
      },
      cast: { franz: { template: 'potato-biped' } },
      scenes: [
        {
          id: 'a',
          place: [{ ref: 'franz', as: 'franz', at: [0, -2.6] }],
          narration: [{ voice: 'narrator', text: 'That is quite a lot of demands.' }],
          lines: [{ after: 'a lot', speaker: 'franz', say: 'It really is.', react: 'deadpan' }],
        },
      ],
    });
    const voice = {
      segment: (key: string) =>
        key === 'a/0'
          ? {
              hash: 'h-narr',
              durationSeconds: 2.8,
              // 7 words, 0.4 s apart.
              words: 'that is quite a lot of demands'.split(' ').map((word, i) => ({
                word,
                start: i * 0.4,
                end: i * 0.4 + 0.3,
              })),
            }
          : key === 'a/line/0'
            ? { hash: 'h-line', durationSeconds: 0.9, words: [] }
            : undefined,
    };
    const sceneOut = compile(skit, voice).scenes[0]!;
    const [line] = sceneOut.lines;
    // "a lot" ends at word #5 (index 4): end 1.9 s + 0.15 gap.
    expect(line!.startTick).toBe(secondsToTicks(2.05));
    expect(line!.hash).toBe('h-line');
    expect(line!.speaker).toBe('franz');
    // The scene stretches to cover the line plus a beat.
    expect(sceneOut.durationTicks).toBe(secondsToTicks(2.05 + 0.9 + 0.35));
    // The deadpan reaction rides the delivery.
    const react = sceneOut.effects.find((e) => e.verb === 'react')!;
    expect(react.startTick).toBe(line!.startTick);
  });

  it('react compiles a face effect plus companion particles (M6.7)', () => {
    const withReact = mfsSchema.parse({
      motionforge: 2,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      cast: { franz: { template: 'potato-biped' } },
      scenes: [
        {
          id: 'a',
          duration: 2,
          place: [{ ref: 'franz', as: 'f1', at: [0, 0] }],
          actions: [{ at: 0.5, react: { target: 'f1', kind: 'anger-steam' } }],
        },
      ],
    });
    const effects = compile(withReact).scenes[0]!.effects;
    expect(effects.map((e) => e.verb)).toEqual(['react', 'steam']);
    expect(effects[0]!.params.kind).toBe(3); // anger-steam's index
    expect(effects[0]!.durationTicks).toBe(168); // 1.4 s default
  });
});
