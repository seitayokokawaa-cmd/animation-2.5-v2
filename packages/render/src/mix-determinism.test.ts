import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeWavPcm16 } from '@motionforge/core';
import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { MIX_SAMPLE_RATE, mixNarration } from './mix.js';
import { renderFilm } from './service.js';

/** A film exercising every audio source: VO, line, music bed, SFX cues. */
const doc = mfsSchema.parse({
  motionforge: 2,
  meta: { title: 'T', resolution: '320x180', fps: 30, seed: 4 },
  voices: {
    narrator: { engine: 'mock', voice: 'warm' },
    imp: { engine: 'mock', voice: 'b', pitch: 6 },
  },
  cast: { imp: { template: 'potato-biped', size: 0.6 } },
  scenes: [
    {
      id: 'a',
      music: { mood: 'tense' },
      place: [{ ref: 'imp', as: 'imp', at: [0, -2.6] }],
      narration: [{ voice: 'narrator', text: 'Something is about to go wrong.' }],
      lines: [{ after: 'go wrong', speaker: 'imp', say: 'Yep.' }],
      actions: [
        { at: 0.4, sfx: 'ding' },
        { at: 1.2, 'pop-in': { target: 'imp' } },
        { at: 2, sfx: { name: 'riser', gain: 80 } },
      ],
    },
  ],
});

const voice = {
  segment: (key: string) =>
    key === 'a/0'
      ? {
          hash: 'h-n',
          durationSeconds: 2.4,
          words: 'something is about to go wrong'.split(' ').map((word, i) => ({
            word,
            start: i * 0.4,
            end: i * 0.4 + 0.3,
          })),
        }
      : key === 'a/line/0'
        ? { hash: 'h-l', durationSeconds: 0.5, words: [] }
        : undefined,
};

/** Deterministic pseudo-speech fixtures. */
const wavs: Record<string, Uint8Array> = {
  'h-n': encodeWavPcm16(
    Float32Array.from(
      { length: Math.round(2.4 * MIX_SAMPLE_RATE) },
      (_, i) => Math.sin(i / 40) * 0.3,
    ),
    MIX_SAMPLE_RATE,
  ),
  'h-l': encodeWavPcm16(
    Float32Array.from(
      { length: Math.round(0.5 * MIX_SAMPLE_RATE) },
      (_, i) => Math.sin(i / 12) * 0.3,
    ),
    MIX_SAMPLE_RATE,
  ),
};

const film = compile(doc, voice);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('deterministic mix (M9.5)', () => {
  it('the full mix — VO, line, music, cues — is byte-identical across runs', () => {
    const a = mixNarration(film, (hash) => wavs[hash]!);
    const b = mixNarration(film, (hash) => wavs[hash]!);
    expect(a.segments).toBe(2);
    expect(sha256(a.wav)).toBe(sha256(b.wav));
    // The mix actually contains audio.
    expect(a.wav.length).toBeGreaterThan(MIX_SAMPLE_RATE);
  });

  it('a sounded film muxes to a byte-identical MP4 across renders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-mux-'));
    try {
      const short = { ...film, durationTicks: 120, scenes: film.scenes };
      const a = join(dir, 'a.mp4');
      const b = join(dir, 'b.mp4');
      await renderFilm(short, a, { readVoiceWav: (hash) => wavs[hash]! });
      await renderFilm(short, b, { readVoiceWav: (hash) => wavs[hash]! });
      const hashA = createHash('sha256').update(readFileSync(a)).digest('hex');
      const hashB = createHash('sha256').update(readFileSync(b)).digest('hex');
      expect(hashA).toBe(hashB);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
