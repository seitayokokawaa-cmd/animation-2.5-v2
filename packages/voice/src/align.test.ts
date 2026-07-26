import { tokenizeWords } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { energyAligner } from './align.js';
import { mockAdapter, MOCK_GAP_SECONDS, MOCK_WORD_SECONDS } from './mock.js';
import { decodeWav, wavDurationSeconds } from './wav.js';

const spec = { engine: 'mock', voice: 'warm' };

async function alignText(text: string) {
  const wav = decodeWav(await mockAdapter.synthesize(text, spec));
  return { wav, alignment: energyAligner.align(wav, tokenizeWords(text)) };
}

describe('energyAligner on mock audio (one burst per word)', () => {
  it('gives every transcript word a timestamp, in order, covering the audio', async () => {
    const text = 'By 1914 Europe had organized itself into two armed groups';
    const { wav, alignment } = await alignText(text);
    const words = tokenizeWords(text);
    expect(alignment.words.map((w) => w.word)).toEqual(words);
    // Monotonic, non-overlapping, bounded by the audio duration.
    let prevEnd = 0;
    for (const timing of alignment.words) {
      expect(timing.start).toBeGreaterThanOrEqual(prevEnd - 1e-9);
      expect(timing.end).toBeGreaterThan(timing.start);
      prevEnd = timing.end;
    }
    expect(prevEnd).toBeLessThanOrEqual(wavDurationSeconds(wav) + 1e-9);
  });

  it('locates word starts on the mock cadence grid', async () => {
    const text = 'one two three';
    const { alignment } = await alignText(text);
    const cadence = MOCK_WORD_SECONDS + MOCK_GAP_SECONDS;
    alignment.words.forEach((timing, i) => {
      expect(timing.start).toBeCloseTo(i * cadence, 1);
    });
  });

  it('is deterministic', async () => {
    const a = await alignText('same input twice');
    const b = await alignText('same input twice');
    expect(a.alignment).toEqual(b.alignment);
  });
});

describe('energyAligner fallback (burst count mismatch)', () => {
  it('distributes by word length over the full duration', () => {
    // Constant tone: a single burst, but five transcript words.
    const sampleRate = 48000;
    const samples = Float32Array.from(
      { length: sampleRate },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.4,
    );
    const words = ['a', 'bb', 'ccc', 'dddd', 'eeeee'];
    const alignment = energyAligner.align({ sampleRate, samples }, words);
    expect(alignment.words).toHaveLength(5);
    expect(alignment.words[0]!.start).toBe(0);
    expect(alignment.words[4]!.end).toBeCloseTo(1, 6);
    // Longer words get proportionally more time.
    const spans = alignment.words.map((w) => w.end - w.start);
    expect(spans[4]!).toBeGreaterThan(spans[0]!);
  });

  it('handles empty transcript and silent audio', () => {
    const silent = { sampleRate: 48000, samples: new Float32Array(4800) };
    expect(energyAligner.align(silent, []).words).toEqual([]);
    const timings = energyAligner.align(silent, ['quiet']).words;
    expect(timings).toHaveLength(1);
  });
});
