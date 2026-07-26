import { describe, expect, it } from 'vitest';

import {
  compileWithMarkers,
  DEFAULT_SEGMENT_PAUSE,
  resolveAnchorSeconds,
  timingTable,
  type NarrationWordTiming,
  type VoiceData,
} from './compile.js';
import { mfsSchema } from './schema.js';

/** Fake voice data: 0.4 s cadence per word, like the mock adapter's shape. */
function fakeVoice(texts: Record<string, string>): VoiceData {
  return {
    segment(key) {
      const text = texts[key];
      if (text === undefined) return undefined;
      const words = text.split(/\s+/).filter(Boolean);
      return {
        hash: `hash-${key}`,
        durationSeconds: words.length * 0.4,
        words: words.map((word, i) => ({ word, start: i * 0.4, end: i * 0.4 + 0.32 })),
      };
    },
  };
}

const doc = mfsSchema.parse({
  motionforge: 2,
  meta: { title: 'T', resolution: '640x360', fps: 30 },
  voices: { narrator: { engine: 'mock', voice: 'warm' } },
  shapes: { box: { kind: 'rect', width: 1, height: 1 } },
  scenes: [
    {
      id: 'setup',
      place: [{ ref: 'box', as: 'b', at: [0, 0] }],
      narration: [
        {
          voice: 'narrator',
          text: 'Europe had a problem again a problem',
          sync: [
            { on: 'a problem', do: { move: { target: 'b', to: [2, 0], duration: 1 } } },
            {
              on: { phrase: 'a problem', nth: 2 },
              offset: 0.1,
              do: { caption: { text: 'AGAIN', duration: 1 } },
            },
          ],
        },
        { voice: 'narrator', text: 'It was fine', pause: 0.5, sync: [] },
      ],
    },
  ],
});

const voice = fakeVoice({
  'setup/0': 'Europe had a problem again a problem',
  'setup/1': 'It was fine',
});

describe('phrase-anchored timing (M3.5)', () => {
  const { film, markers } = compileWithMarkers(doc, voice);
  const scene = film.scenes[0]!;

  it('derives scene duration from narration audio + pauses', () => {
    // seg0: 7 words * 0.4 = 2.8 + default pause 0.3; seg1: 3 * 0.4 = 1.2 + 0.5
    const expected = 2.8 + DEFAULT_SEGMENT_PAUSE + 1.2 + 0.5;
    expect(scene.durationTicks).toBe(Math.round(expected * 120));
  });

  it('schedules narration segments sequentially with hashes', () => {
    expect(scene.narration).toHaveLength(2);
    expect(scene.narration[0]).toMatchObject({
      key: 'setup/0',
      hash: 'hash-setup/0',
      startTick: 0,
    });
    expect(scene.narration[1]!.startTick).toBe(Math.round((2.8 + 0.3) * 120));
  });

  it('anchors resolve to the right word: first occurrence by default', () => {
    // "a problem" first occurs at word index 2 → 0.8 s → tick 96.
    const moveClip = [...scene.timeline.tracks.get('b/pos')!.clips][0]!;
    expect(moveClip.start).toBe(96);
  });

  it('nth + offset resolve later occurrences', () => {
    // 2nd "a problem" at word index 5 → 2.0 s + 0.1 offset → tick 252.
    expect(scene.captions[0]!.startTick).toBe(252);
  });

  it('produces a sorted marker table with words and sync markers', () => {
    expect(markers.length).toBe(7 + 3 + 2);
    const ticks = markers.map((m) => m.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    const table = timingTable(markers);
    expect(table).toContain('▶ on "a problem"');
    expect(table).toContain('Europe');
  });

  it('fails loudly on cache misses and bad anchors', () => {
    expect(() => compileWithMarkers(doc, { segment: () => undefined })).toThrow(/mf voice sync/);
    const words: NarrationWordTiming[] = [{ word: 'hello', start: 0, end: 0.3 }];
    expect(() => resolveAnchorSeconds('missing', 'hello', words)).toThrow(/not found/);
    expect(() => resolveAnchorSeconds({ phrase: 'hello', nth: 3 }, 'hello', words)).toThrow(
      /occurs 1x/,
    );
  });
});
