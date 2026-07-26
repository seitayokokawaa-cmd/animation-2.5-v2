/**
 * Render service (M2.6 + M3.6): Film IR → frames → encoder, with narration
 * mixed offline and muxed as AAC when the film has any. The whole pipeline
 * is streaming — no whole-film frame buffering.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { frameCount, tickForFrame, type Film } from '@motionforge/core';

import { encodeFrames } from './encode.js';
import { buildFrameSvg } from './frame.js';
import { mixNarration } from './mix.js';
import { resvgRasterizer, type Rasterizer } from './rasterizer.js';

export interface RenderOptions {
  readonly rasterizer?: Rasterizer;
  readonly crf?: number;
  /** Voice-cache WAV reader; required when the film has narration. */
  readonly readVoiceWav?: (hash: string) => Uint8Array;
  /** Called after each frame is rasterized. */
  readonly onFrame?: (frame: number, total: number) => void;
}

export interface RenderResult {
  readonly frames: number;
  /** Narration segments mixed into the audio track (0 = silent film). */
  readonly narrationSegments: number;
}

const hasNarration = (film: Film): boolean => film.scenes.some((s) => s.narration.length > 0);

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
  if (hasNarration(film)) {
    if (!options.readVoiceWav) {
      throw new Error(
        'Film has narration but no voice-cache reader was provided — run `mf voice sync` and render via the CLI',
      );
    }
    const mixed = mixNarration(film, options.readVoiceWav);
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

  try {
    await encodeFrames(frames(), { fps: film.fps, outPath, crf: options.crf, audioWavPath });
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
  return { frames: total, narrationSegments };
}
