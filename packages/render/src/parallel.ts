/**
 * Worker-pool rasterization (M15.1): the main thread builds SVG
 * documents (cheap — text is pre-shaped to paths, ADR-0002) and a pool
 * of worker threads turns them into PNGs, which stream to the encoder
 * strictly in presentation order. The MP4 is byte-identical to a
 * sequential render for any job count.
 *
 * The worker is an inline JavaScript module (a data: URL), so it runs
 * identically under tsx, vitest, and a built package — no TypeScript
 * resolution inside worker threads. It needs only @resvg/resvg-js,
 * resolved from this file's own dependency tree.
 *
 * Memory stays bounded: SVGs are built lazily as workers free up, and
 * at most `jobs × BUFFER_PER_WORKER` finished PNGs wait in the reorder
 * buffer while the encoder catches up.
 */

import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';

import { frameCount, tickForFrame, type Film } from '@motionforge/core';

import { buildFrameSvg } from './frame.js';

/** Default pool size: leave a core for the encoder, cap at 8. */
export const defaultRenderJobs = (): number => Math.max(1, Math.min(8, cpus().length - 1));

/** Reorder-buffer depth per worker before the pool stops feeding it. */
const BUFFER_PER_WORKER = 3;

const RESVG_PATH = createRequire(import.meta.url).resolve('@resvg/resvg-js');

const WORKER_SOURCE = `
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
const { Resvg } = createRequire(workerData.resvgPath)(workerData.resvgPath);
parentPort.on('message', (msg) => {
  const png = new Resvg(msg.svg, { font: { loadSystemFonts: false } }).render().asPng();
  const buffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
  parentPort.postMessage({ frame: msg.frame, png: buffer }, [buffer]);
});
`;

/**
 * Async stream of PNG frames rasterized by `jobs` workers, yielded in
 * frame order.
 */
export async function* pooledFrames(
  film: Film,
  jobs: number,
  onFrame?: (frame: number, total: number) => void,
): AsyncGenerator<Uint8Array> {
  const total = frameCount(film.durationTicks, film.fps);
  if (total === 0) return;
  const workerUrl = new URL(`data:text/javascript,${encodeURIComponent(WORKER_SOURCE)}`);
  const workers = Array.from(
    { length: Math.max(1, Math.min(jobs, total)) },
    () => new Worker(workerUrl, { workerData: { resvgPath: RESVG_PATH } }),
  );

  const results = new Map<number, Uint8Array>();
  const idle: Worker[] = [];
  let nextAssign = 0;
  let failure: Error | undefined;
  let waiters: (() => void)[] = [];
  const wake = (): void => {
    const w = waiters;
    waiters = [];
    for (const fn of w) fn();
  };
  const bufferFull = (): boolean => results.size >= workers.length * BUFFER_PER_WORKER;
  const feed = (worker: Worker): void => {
    if (failure || nextAssign >= total || bufferFull()) {
      idle.push(worker);
      return;
    }
    const frame = nextAssign++;
    worker.postMessage({ frame, svg: buildFrameSvg(film, tickForFrame(frame, film.fps)) });
  };

  try {
    for (const worker of workers) {
      worker.on('message', (msg: { frame: number; png: ArrayBuffer }) => {
        results.set(msg.frame, new Uint8Array(msg.png));
        feed(worker);
        wake();
      });
      worker.on('error', (err) => {
        failure = err instanceof Error ? err : new Error(String(err));
        wake();
      });
      feed(worker);
    }
    for (let frame = 0; frame < total; frame++) {
      while (!results.has(frame)) {
        if (failure) throw failure;
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      const png = results.get(frame)!;
      results.delete(frame);
      // A buffer slot drained — put idle workers back to work.
      while (idle.length > 0 && nextAssign < total && !bufferFull()) {
        feed(idle.pop()!);
      }
      yield png;
      onFrame?.(frame + 1, total);
    }
    if (failure) throw failure;
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}
