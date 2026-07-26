/**
 * Deterministic MP4 encoder (ADR-0003): PNG frames piped into a pinned
 * ffmpeg-static binary with bitexact flags. Same frames in → same bytes out
 * (verified by spike M0.6 and the e2e double-render test).
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';

import ffmpegPath from 'ffmpeg-static';

export interface EncodeOptions {
  readonly fps: number;
  readonly outPath: string;
  /** x264 CRF quality; default 18. */
  readonly crf?: number;
}

export interface Encoder {
  /** Push one PNG frame (in presentation order). Applies backpressure. */
  readonly writeFrame: (png: Uint8Array) => Promise<void>;
  /** Finish the stream and wait for ffmpeg to exit. */
  readonly close: () => Promise<void>;
}

export function createEncoder(options: EncodeOptions): Encoder {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(options.fps),
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    String(options.crf ?? 18),
    '-pix_fmt',
    'yuv420p',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    options.outPath,
  ];
  const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const exit = new Promise<void>((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)),
    );
  });
  // Surface encoder failures on the next write instead of crashing the process.
  exit.catch(() => {});

  return {
    async writeFrame(png) {
      if (proc.exitCode !== null) await exit; // throws the failure
      if (!proc.stdin.write(png)) {
        await Promise.race([once(proc.stdin, 'drain'), exit]);
      }
    },
    async close() {
      proc.stdin.end();
      await exit;
    },
  };
}

/** Convenience: encode a whole sequence of PNG frames to MP4. */
export async function encodeFrames(
  frames: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  options: EncodeOptions,
): Promise<void> {
  const encoder = createEncoder(options);
  for await (const png of frames) await encoder.writeFrame(png);
  await encoder.close();
}
