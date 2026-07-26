/**
 * Mock TTS (ADR-0006): fully offline, fully deterministic placeholder used
 * by CI and local dev without an API key. Each word becomes a short tone
 * burst whose pitch derives from a hash of (voice, word), separated by
 * brief gaps — so durations scale with text like real speech and the
 * aligner has word-shaped energy to work with.
 */

import { fnv1a } from '@motionforge/core';

import type { TtsAdapter, VoiceSpec } from './adapter.js';
import { encodeWavPcm16 } from './wav.js';

export const MOCK_SAMPLE_RATE = 48000;

/** Seconds per word at rate 1, and the silent gap between words. */
export const MOCK_WORD_SECONDS = 0.32;
export const MOCK_GAP_SECONDS = 0.08;

const splitWords = (text: string): string[] => text.split(/\s+/).filter((w) => w.length > 0);

/** The mock's deterministic duration model — the cache/aligner tests use it. */
export function mockDurationSeconds(text: string, spec: VoiceSpec): number {
  const words = splitWords(text).length;
  const rate = spec.rate ?? 1;
  return (words * MOCK_WORD_SECONDS + Math.max(0, words - 1) * MOCK_GAP_SECONDS) / rate;
}

export const mockAdapter: TtsAdapter = {
  name: 'mock',
  synthesize(text, spec) {
    const words = splitWords(text);
    const rate = spec.rate ?? 1;
    const pitchShift = 2 ** ((spec.pitch ?? 0) / 12);
    const wordLen = Math.round((MOCK_WORD_SECONDS / rate) * MOCK_SAMPLE_RATE);
    const gapLen = Math.round((MOCK_GAP_SECONDS / rate) * MOCK_SAMPLE_RATE);
    const total = words.length * wordLen + Math.max(0, words.length - 1) * gapLen;
    const samples = new Float32Array(total);
    let cursor = 0;
    for (let w = 0; w < words.length; w++) {
      const base = 160 + (fnv1a(`${spec.voice}/${words[w]!.toLowerCase()}`) % 200);
      const freq = base * pitchShift;
      for (let i = 0; i < wordLen; i++) {
        // Attack/decay envelope keeps word boundaries visible in the energy.
        const t = i / wordLen;
        const envelope = Math.sin(Math.PI * t) ** 0.7;
        samples[cursor + i] =
          0.35 * envelope * Math.sin((2 * Math.PI * freq * i) / MOCK_SAMPLE_RATE);
      }
      cursor += wordLen + (w < words.length - 1 ? gapLen : 0);
    }
    return Promise.resolve(encodeWavPcm16(samples, MOCK_SAMPLE_RATE));
  },
};
