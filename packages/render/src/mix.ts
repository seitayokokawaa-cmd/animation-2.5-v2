/**
 * Offline narration mixer (M3.6): places every scene's frozen narration
 * segments on the film timeline and sums them into one 48 kHz mono WAV —
 * sample-accurate, deterministic, no network. The WAV reader is injected
 * (the CLI passes the voice cache) so render stays decoupled from voice.
 */

import { decodeWav, encodeWavPcm16, ticksToSeconds, type Film } from '@motionforge/core';

export const MIX_SAMPLE_RATE = 48000;

export interface MixResult {
  readonly wav: Uint8Array;
  readonly segments: number;
}

/** Resample by linear interpolation (only hit when a source isn't 48 kHz). */
function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const outLength = Math.round((samples.length * to) / from);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = (i * from) / to;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, samples.length - 1);
    out[i] = samples[lo]! + (samples[hi]! - samples[lo]!) * (src - lo);
  }
  return out;
}

export function mixNarration(film: Film, readWav: (hash: string) => Uint8Array): MixResult {
  const totalSamples = Math.ceil(ticksToSeconds(film.durationTicks) * MIX_SAMPLE_RATE);
  const mix = new Float32Array(totalSamples);
  let segments = 0;

  for (const scene of film.scenes) {
    for (const segment of scene.narration) {
      const wav = decodeWav(readWav(segment.hash));
      const samples = resample(wav.samples, wav.sampleRate, MIX_SAMPLE_RATE);
      const offset = Math.round(
        ticksToSeconds(scene.startTick + segment.startTick) * MIX_SAMPLE_RATE,
      );
      for (let i = 0; i < samples.length && offset + i < totalSamples; i++) {
        mix[offset + i]! += samples[i]!;
      }
      segments++;
    }
  }

  // Hard safety limiter — narration segments rarely overlap, but clipping
  // must be impossible by construction.
  for (let i = 0; i < mix.length; i++) {
    const s = mix[i]!;
    if (s > 1) mix[i] = 1;
    else if (s < -1) mix[i] = -1;
  }

  return { wav: encodeWavPcm16(mix, MIX_SAMPLE_RATE), segments };
}
