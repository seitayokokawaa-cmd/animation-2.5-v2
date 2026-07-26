import { describe, expect, it } from 'vitest';

import { findPhrase, narrationWords } from './narration.js';
import { mfsSchema } from './schema.js';

const base = {
  motionforge: 2,
  meta: { title: 'T', resolution: '640x360', fps: 30 },
  voices: {
    narrator: { engine: 'mock', voice: 'warm' },
    franz: { engine: 'qwen-audio-3.0-tts-flash', voice: 'preset-bright-m', pitch: 5 },
  },
  shapes: { box: { kind: 'rect', width: 1, height: 1 } },
  scenes: [
    {
      id: 'setup',
      place: [{ ref: 'box', as: 'b', at: [0, 0] }],
      narration: [
        {
          voice: 'narrator',
          text: 'By 1914, Europe was very heavily armed. Very armed.',
          sync: [
            { on: 'heavily armed', do: { move: { target: 'b', to: [2, 0], duration: 1 } } },
            {
              on: { phrase: 'Very', nth: 2 },
              offset: -0.1,
              do: { caption: { text: 'VERY', duration: 1 } },
            },
          ],
        },
      ],
    },
  ],
};

describe('narration schema', () => {
  it('accepts voices + narration and derives no explicit duration', () => {
    const doc = mfsSchema.parse(base);
    expect(doc.scenes[0]!.duration).toBeUndefined();
    expect(doc.scenes[0]!.narration).toHaveLength(1);
    expect(doc.voices.narrator!.engine).toBe('mock');
  });

  it('rejects scenes with neither duration nor narration', () => {
    const bad = { ...base, scenes: [{ id: 'x', place: [], actions: [] }] };
    const res = mfsSchema.safeParse(bad);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toMatch(/either an explicit duration or narration/);
  });

  it('sync verbs are timing-free and exactly one', () => {
    const two = {
      on: 'armed',
      do: {
        move: { target: 'b', to: [1, 1], duration: 1 },
        caption: { text: 'x', duration: 1 },
      },
    };
    const res = mfsSchema.safeParse({
      ...base,
      scenes: [
        { ...base.scenes[0], narration: [{ ...base.scenes[0]!.narration[0], sync: [two] }] },
      ],
    });
    expect(res.success).toBe(false);
    const withAt = {
      on: 'armed',
      do: { at: 1, move: { target: 'b', to: [1, 1], duration: 1 } },
    };
    expect(
      mfsSchema.safeParse({
        ...base,
        scenes: [
          { ...base.scenes[0], narration: [{ ...base.scenes[0]!.narration[0], sync: [withAt] }] },
        ],
      }).success,
    ).toBe(false);
  });

  it('still accepts motionforge: 1 documents without narration', () => {
    const v1 = {
      motionforge: 1,
      meta: { title: 'T', resolution: '640x360', fps: 30 },
      scenes: [{ id: 'a', duration: 1 }],
    };
    expect(mfsSchema.parse(v1).scenes[0]!.narration).toEqual([]);
  });
});

describe('narrationWords / findPhrase', () => {
  it('tokenizes and strips punctuation but keeps numbers and unicode', () => {
    expect(narrationWords('By 1914, Europe — was "fine".')).toEqual([
      'By',
      '1914',
      'Europe',
      'was',
      'fine',
    ]);
    expect(narrationWords('চলচ্চিত্র কম্পাইলার!')).toEqual(['চলচ্চিত্র', 'কম্পাইলার']);
  });

  it('finds all case-insensitive occurrences by word index', () => {
    const words = narrationWords('Very armed. Very armed indeed, very armed.');
    expect(findPhrase(words, 'very armed')).toEqual([0, 2, 5]);
    expect(findPhrase(words, 'ARMED INDEED')).toEqual([3]);
    expect(findPhrase(words, 'missing phrase')).toEqual([]);
  });

  it('does not match partial words', () => {
    const words = narrationWords('armadillo armed');
    expect(findPhrase(words, 'armed')).toEqual([1]);
  });
});
