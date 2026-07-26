/**
 * Render service (M2.6): Film IR → frames → encoder. The whole pipeline is
 * streaming — no whole-film frame buffering.
 */

import { frameCount, tickForFrame, type Film } from '@motionforge/core';

import { encodeFrames } from './encode.js';
import { buildFrameSvg } from './frame.js';
import { resvgRasterizer, type Rasterizer } from './rasterizer.js';

export interface RenderOptions {
  readonly rasterizer?: Rasterizer;
  readonly crf?: number;
  /** Called after each frame is rasterized. */
  readonly onFrame?: (frame: number, total: number) => void;
}

export interface RenderResult {
  readonly frames: number;
}

/** Render the film to an MP4 at `outPath`. Deterministic end to end. */
export async function renderFilm(
  film: Film,
  outPath: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const rasterizer = options.rasterizer ?? resvgRasterizer;
  const total = frameCount(film.durationTicks, film.fps);

  async function* frames(): AsyncGenerator<Uint8Array> {
    for (let frame = 0; frame < total; frame++) {
      const svg = buildFrameSvg(film, tickForFrame(frame, film.fps));
      yield rasterizer.toPng(svg);
      options.onFrame?.(frame + 1, total);
    }
  }

  await encodeFrames(frames(), { fps: film.fps, outPath, crf: options.crf });
  return { frames: total };
}
