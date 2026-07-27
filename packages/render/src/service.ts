/**
 * Render service (M2.6 + M3.6): Film IR → frames → encoder, with narration
 * mixed offline and muxed as AAC when the film has any. The whole pipeline
 * is streaming — no whole-film frame buffering.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { frameCount, tickForFrame, type Film } from '@motionforge/core';

import { collectCues } from './audio.js';
import { encodeFrames } from './encode.js';
import { buildFrameSvg } from './frame.js';
import { mixNarration } from './mix.js';
import { pooledFrames } from './parallel.js';
import { resvgRasterizer, type Rasterizer } from './rasterizer.js';

export interface RenderOptions {
  readonly rasterizer?: Rasterizer;
  readonly crf?: number;
  /** Voice-cache WAV reader; required when the film has narration. */
  readonly readVoiceWav?: (hash: string) => Uint8Array;
  /** Called after each frame is rasterized. */
  readonly onFrame?: (frame: number, total: number) => void;
  /**
   * Rasterizer worker threads (M15.1). >1 fans frames out over a worker
   * pool — byte-identical output, encoder fed in order. 1 (or a custom
   * `rasterizer`) keeps everything on this thread.
   */
  readonly jobs?: number;
}

export interface RenderResult {
  readonly frames: number;
  /** Narration segments mixed into the audio track (0 = silent film). */
  readonly narrationSegments: number;
}

const hasVoice = (film: Film): boolean =>
  film.scenes.some((s) => s.narration.length > 0 || (s.lines ?? []).length > 0);

/** Any audio at all: VO, music beds, or SFX cues (M9.5). */
const hasAudio = (film: Film): boolean =>
  hasVoice(film) || film.scenes.some((s) => s.music) || collectCues(film).length > 0;

/** Render the film to an MP4 at `outPath`. Deterministic end to end. */
export async function renderFilm(
  film: Film,
  outPath: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const rasterizer = options.rasterizer ?? resvgRasterizer;
  const total = frameCount(film.durationTicks, film.fps);

  let audioWavPath: string | undefined;
  let tempDir: string | undefined;
  let narrationSegments = 0;
  if (hasAudio(film)) {
    if (hasVoice(film) && !options.readVoiceWav) {
      throw new Error(
        'Film has narration but no voice-cache reader was provided — run `mf voice sync` and render via the CLI',
      );
    }
    const mixed = mixNarration(
      film,
      options.readVoiceWav ??
        ((hash) => {
          throw new Error(`No voice reader for hash ${hash}`);
        }),
    );
    narrationSegments = mixed.segments;
    tempDir = mkdtempSync(join(tmpdir(), 'mf-mix-'));
    audioWavPath = join(tempDir, 'narration.wav');
    writeFileSync(audioWavPath, mixed.wav);
  }

  async function* frames(): AsyncGenerator<Uint8Array> {
    for (let frame = 0; frame < total; frame++) {
      const svg = buildFrameSvg(film, tickForFrame(frame, film.fps));
      yield rasterizer.toPng(svg);
      options.onFrame?.(frame + 1, total);
    }
  }

  // A custom rasterizer can't cross the worker boundary — stay inline.
  const jobs = options.rasterizer ? 1 : (options.jobs ?? 1);
  const stream = jobs > 1 ? pooledFrames(film, jobs, options.onFrame) : frames();

  try {
    await encodeFrames(stream, { fps: film.fps, outPath, crf: options.crf, audioWavPath });
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
  return { frames: total, narrationSegments };
}
