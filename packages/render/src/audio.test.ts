import { describe, expect, it } from 'vitest';

import { compile, mfsSchema } from '@motionforge/lang';

import { collectCues } from './audio.js';

describe('audio event bus (M9.1)', () => {
  const doc = mfsSchema.parse({
    motionforge: 2,
    meta: { title: 'T', resolution: '640x360', fps: 30 },
    shapes: { box: { kind: 'rect', width: 1, height: 1 } },
    scenes: [
      {
        id: 'a',
        duration: 3,
        place: [{ ref: 'box', as: 'b', at: [0, 0] }],
        actions: [
          { at: 0.5, 'pop-in': { target: 'b' } },
          { at: 1, slam: { target: 'b' } },
          { at: 1.5, sfx: 'quill' },
          { at: 2, sfx: { name: 'drumroll', gain: 60 } },
        ],
      },
      {
        id: 'z',
        duration: 2,
        place: [{ ref: 'box', as: 'b', at: [0, 0] }],
        actions: [{ at: 0.25, explode: { target: 'b' } }],
      },
    ],
  });
  const film = compile(doc);

  it('collects verb defaults and explicit cues, film-global and sorted', () => {
    const cues = collectCues(film);
    expect(cues.map((c) => c.name)).toEqual(['pop', 'slam', 'quill', 'drumroll', 'boom']);
    expect(cues[0]).toMatchObject({ tick: 60, source: 'verb-default', gain: 1 });
    expect(cues[2]).toMatchObject({ tick: 180, source: 'explicit' });
    expect(cues[3]!.gain).toBeCloseTo(0.6, 9);
    // Scene z's explode lands at film tick 360 + 30.
    expect(cues[4]!.tick).toBe(390);
  });

  it('is pure', () => {
    expect(collectCues(film)).toEqual(collectCues(film));
  });
});
