import { decodeWav, encodeWavPcm16, type Film } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { MIX_SAMPLE_RATE, mixNarration } from './mix.js';

/** A film skeleton with two scenes and known narration placements. */
const film = {
  title: 'T',
  width: 320,
  height: 180,
  fps: 30,
  seed: 0,
  durationTicks: 480, // 4 s
  scenes: [
    {
      id: 'a',
      startTick: 0,
      durationTicks: 240,
      narration: [{ key: 'a/0', hash: 'h1', startTick: 120, durationTicks: 120 }],
      instances: [],
      timeline: { tracks: new Map(), events: [], durationTicks: 240 },
      captions: [],
    },
    {
      id: 'b',
      startTick: 240,
      durationTicks: 240,
      narration: [{ key: 'b/0', hash: 'h2', startTick: 0, durationTicks: 120 }],
      instances: [],
      timeline: { tracks: new Map(), events: [], durationTicks: 240 },
      captions: [],
    },
  ],
} as unknown as Film;

/** 1 s of constant 0.5 (h1) / -0.25 (h2). */
const wavs: Record<string, Uint8Array> = {
  h1: encodeWavPcm16(new Float32Array(MIX_SAMPLE_RATE).fill(0.5), MIX_SAMPLE_RATE),
  h2: encodeWavPcm16(new Float32Array(MIX_SAMPLE_RATE).fill(-0.25), MIX_SAMPLE_RATE),
};

describe('mixNarration', () => {
  const { wav, segments } = mixNarration(film, (hash) => wavs[hash]!);
  const mixed = decodeWav(wav);

  it('mixes every segment at its film-global offset', () => {
    expect(segments).toBe(2);
    expect(mixed.sampleRate).toBe(MIX_SAMPLE_RATE);
    expect(mixed.samples.length).toBe(4 * MIX_SAMPLE_RATE);
    const at = (seconds: number) => mixed.samples[Math.floor(seconds * MIX_SAMPLE_RATE) + 10]!;
    expect(at(0)).toBeCloseTo(0, 3); // silence before scene-a narration
    expect(at(1)).toBeCloseTo(0.5, 2); // scene a: startTick 120 → 1 s
    expect(at(2.5)).toBeCloseTo(-0.25, 2); // scene b start (film 2 s) + 0.5
    expect(at(3.5)).toBeCloseTo(0, 3); // tail silence
  });

  it('is byte-deterministic', () => {
    const again = mixNarration(film, (hash) => wavs[hash]!);
    expect(Buffer.from(again.wav).equals(Buffer.from(wav))).toBe(true);
  });

  it('limits overlapping audio to [-1, 1]', () => {
    const loud = encodeWavPcm16(new Float32Array(MIX_SAMPLE_RATE).fill(0.9), MIX_SAMPLE_RATE);
    const overlapping = {
      ...film,
      scenes: [
        {
          ...film.scenes[0]!,
          narration: [
            { key: 'a/0', hash: 'h1', startTick: 0, durationTicks: 120 },
            { key: 'a/1', hash: 'h1', startTick: 0, durationTicks: 120 },
          ],
        },
      ],
    } as unknown as Film;
    const { wav: clipped } = mixNarration(overlapping, () => loud);
    const decoded = decodeWav(clipped);
    for (let i = 0; i < MIX_SAMPLE_RATE; i += 997) {
      expect(Math.abs(decoded.samples[i]!)).toBeLessThanOrEqual(1);
    }
  });
});
