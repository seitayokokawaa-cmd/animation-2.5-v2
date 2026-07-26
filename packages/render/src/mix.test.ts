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
    // VO leveling (M9.4) halves these loud constant fixtures (gain clamp 0.5).
    expect(at(0)).toBeCloseTo(0, 3); // silence before scene-a narration
    expect(at(1)).toBeCloseTo(0.25, 2); // scene a: startTick 120 → 1 s
    expect(at(2.5)).toBeCloseTo(-0.125, 2); // scene b start (film 2 s) + 0.5
    expect(at(3.5)).toBeCloseTo(0, 3); // tail silence
  });

  it('is byte-deterministic', () => {
    const again = mixNarration(film, (hash) => wavs[hash]!);
    expect(Buffer.from(again.wav).equals(Buffer.from(wav))).toBe(true);
  });

  it('ducks narration under character lines with ramps (M8.4)', () => {
    const withLine = {
      ...film,
      scenes: [
        {
          ...film.scenes[0]!,
          narration: [{ key: 'a/0', hash: 'h1', startTick: 0, durationTicks: 240 }],
          lines: [
            {
              key: 'a/line/0',
              hash: 'h3',
              speaker: 'x',
              text: 'hi',
              startTick: 120,
              durationTicks: 60,
            },
          ],
        },
      ],
    } as unknown as Film;
    const wavs2 = {
      h1: encodeWavPcm16(new Float32Array(2 * MIX_SAMPLE_RATE).fill(0.5), MIX_SAMPLE_RATE),
      h3: encodeWavPcm16(
        new Float32Array(Math.round(0.5 * MIX_SAMPLE_RATE)).fill(0.2),
        MIX_SAMPLE_RATE,
      ),
    };
    const { wav: ducked, segments: count } = mixNarration(
      withLine,
      (hash) => wavs2[hash as keyof typeof wavs2]!,
    );
    expect(count).toBe(2);
    const out = decodeWav(ducked);
    const at = (seconds: number) => out.samples[Math.floor(seconds * MIX_SAMPLE_RATE)]!;
    // Leveling halves both constant fixtures (0.5 → 0.25, 0.2 → 0.1).
    expect(at(0.5)).toBeCloseTo(0.25, 2); // before the line: full narration
    expect(at(1.25)).toBeCloseTo(0.25 * 0.35 + 0.1, 2); // during: ducked + line
    expect(at(1.8)).toBeCloseTo(0.25, 2); // after the ramp: recovered
  });

  it('levels VO toward the target loudness and ducks music under it (M9.4)', () => {
    // A quiet narration segment (RMS 0.02) in a scene with jaunty music.
    const quiet = encodeWavPcm16(
      Float32Array.from({ length: MIX_SAMPLE_RATE }, (_, i) =>
        i % 2 === 0 ? 0.02 * Math.SQRT2 : -0.02 * Math.SQRT2,
      ),
      MIX_SAMPLE_RATE,
    );
    const withMusic = {
      ...film,
      durationTicks: 480,
      scenes: [
        {
          ...film.scenes[0]!,
          durationTicks: 480,
          music: { mood: 'jaunty', gain: 1 },
          narration: [{ key: 'a/0', hash: 'hq', startTick: 120, durationTicks: 120 }],
        },
      ],
    } as unknown as Film;
    const { wav: mixed2 } = mixNarration(withMusic, () => quiet);
    const out = decodeWav(mixed2);
    const rmsOver = (from: number, to: number) => {
      let sum = 0;
      const a = Math.floor(from * MIX_SAMPLE_RATE);
      const b = Math.floor(to * MIX_SAMPLE_RATE);
      for (let i = a; i < b; i++) sum += out.samples[i]! * out.samples[i]!;
      return Math.sqrt(sum / (b - a));
    };
    // Music alone (before narration) vs music ducked under leveled VO.
    const musicOnly = rmsOver(0.3, 0.8);
    const underVo = rmsOver(1.2, 1.8);
    expect(musicOnly).toBeGreaterThan(0.01);
    // VO got boosted ×2 (clamp) and dominates the ducked music.
    expect(underVo).toBeGreaterThan(musicOnly);
    // After narration ends the music recovers.
    expect(rmsOver(3.2, 3.8)).toBeCloseTo(musicOnly, 1);
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
