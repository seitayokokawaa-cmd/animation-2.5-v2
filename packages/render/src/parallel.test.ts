/**
 * Worker-pool rasterization (M15.1): a pooled render must be
 * byte-identical to the sequential render — same frames, same order,
 * same MP4 — for any job count.
 */
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tickForFrame } from '@motionforge/core';
import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { buildFrameSvg } from './frame.js';
import { defaultRenderJobs, pooledFrames } from './parallel.js';
import { resvgRasterizer } from './rasterizer.js';
import { renderFilm } from './service.js';

const film = compile(
  mfsSchema.parse({
    motionforge: 2,
    meta: { title: 'pool', resolution: '320x180', fps: 30, seed: 4 },
    shapes: { box: { kind: 'rect', width: 1.4, height: 1, fill: '#b5533c' } },
    cast: { imp: { template: 'potato-biped', size: 0.8 } },
    scenes: [
      {
        id: 'a',
        duration: 1.5,
        place: [
          { ref: 'box', as: 'box', at: [-2, 0] },
          { ref: 'imp', as: 'imp', at: [2, -2.6] },
        ],
        actions: [
          { at: 0.1, move: { target: 'box', to: [2, 1], duration: 1.2 } },
          { at: 0.2, gesture: { target: 'imp', kind: 'wave' } },
        ],
      },
    ],
  }),
);

describe('worker-pool rendering (M15.1)', () => {
  it('sizes the default pool for the machine', () => {
    const jobs = defaultRenderJobs();
    expect(jobs).toBeGreaterThanOrEqual(1);
    expect(jobs).toBeLessThanOrEqual(8);
  });

  it('pooled frames match the sequential render byte for byte', { timeout: 120_000 }, async () => {
    const pooled: Uint8Array[] = [];
    for await (const png of pooledFrames(film, 3)) pooled.push(png);
    expect(pooled.length).toBe(45);
    for (let frame = 0; frame < pooled.length; frame += 11) {
      const svg = buildFrameSvg(film, tickForFrame(frame, film.fps));
      expect(Buffer.compare(Buffer.from(pooled[frame]!), resvgRasterizer.toPng(svg))).toBe(0);
    }
  });

  it('renderFilm with jobs produces the identical MP4', { timeout: 240_000 }, async () => {
    const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
    const seq = join(tmpdir(), `mf-pool-seq-${process.pid}.mp4`);
    const par = join(tmpdir(), `mf-pool-par-${process.pid}.mp4`);
    try {
      await renderFilm(film, seq, { jobs: 1 });
      await renderFilm(film, par, { jobs: 4 });
      expect(sha(par)).toBe(sha(seq));
    } finally {
      rmSync(seq, { force: true });
      rmSync(par, { force: true });
    }
  });
});
