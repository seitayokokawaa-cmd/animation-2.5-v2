/**
 * Forced alignment (ADR-0006): per-word `[start, end]` timestamps for a
 * known transcript against a WAV. The `Aligner` interface is the contract;
 * two implementations:
 *
 * - `energyAligner` (default today): offline and deterministic. Detects
 *   speech bursts by RMS energy and maps them to transcript words; when the
 *   burst count disagrees it falls back to duration-weighted distribution
 *   by word length. Exact on mock-TTS audio (which emits one burst per
 *   word); approximate on real speech.
 * - whisper-class adapter: pending spike M0.7 (blocked on DASHSCOPE_API_KEY
 *   for real narration to test against). It will implement this same
 *   interface; alignment JSON in the cache is unaffected.
 *
 * We never trust recognition content — only timing (the transcript is
 * known), which is what makes the interface this small.
 */

import type { WavData } from './wav.js';

export interface WordTiming {
  readonly word: string;
  /** Seconds from segment start. */
  readonly start: number;
  readonly end: number;
}

export interface Alignment {
  readonly version: 1;
  readonly aligner: string;
  readonly words: readonly WordTiming[];
}

export interface Aligner {
  readonly name: string;
  readonly align: (wav: WavData, transcriptWords: readonly string[]) => Alignment;
}

const WINDOW_SECONDS = 0.01;

/** RMS energy per 10 ms window. */
function energyWindows(wav: WavData): Float64Array {
  const windowLen = Math.max(1, Math.round(wav.sampleRate * WINDOW_SECONDS));
  const count = Math.ceil(wav.samples.length / windowLen);
  const out = new Float64Array(count);
  for (let w = 0; w < count; w++) {
    let sum = 0;
    const start = w * windowLen;
    const end = Math.min(start + windowLen, wav.samples.length);
    for (let i = start; i < end; i++) sum += wav.samples[i]! * wav.samples[i]!;
    out[w] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return out;
}

/** Contiguous above-threshold runs as [startSec, endSec] bursts. */
function detectBursts(wav: WavData): [number, number][] {
  const windows = energyWindows(wav);
  const peak = windows.reduce((m, v) => Math.max(m, v), 0);
  if (peak === 0) return [];
  const threshold = peak * 0.08;
  const bursts: [number, number][] = [];
  let start = -1;
  for (let w = 0; w < windows.length; w++) {
    const loud = windows[w]! > threshold;
    if (loud && start < 0) start = w;
    if (!loud && start >= 0) {
      bursts.push([start * WINDOW_SECONDS, w * WINDOW_SECONDS]);
      start = -1;
    }
  }
  if (start >= 0) bursts.push([start * WINDOW_SECONDS, windows.length * WINDOW_SECONDS]);
  return bursts;
}

/** Duration-weighted fallback: words get time proportional to their length. */
function distributeByLength(words: readonly string[], durationSeconds: number): WordTiming[] {
  const weights = words.map((w) => Math.max(1, w.length));
  const total = weights.reduce((s, w) => s + w, 0);
  const timings: WordTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const span = (weights[i]! / total) * durationSeconds;
    timings.push({ word: words[i]!, start: cursor, end: cursor + span });
    cursor += span;
  }
  return timings;
}

export const energyAligner: Aligner = {
  name: 'energy',
  align(wav, transcriptWords) {
    const durationSeconds = wav.samples.length / wav.sampleRate;
    const words = [...transcriptWords];
    if (words.length === 0) return { version: 1, aligner: 'energy', words: [] };

    const bursts = detectBursts(wav);
    if (bursts.length === words.length) {
      return {
        version: 1,
        aligner: 'energy',
        words: words.map((word, i) => ({
          word,
          start: bursts[i]![0],
          end: bursts[i]![1],
        })),
      };
    }
    return { version: 1, aligner: 'energy', words: distributeByLength(words, durationSeconds) };
  },
};
