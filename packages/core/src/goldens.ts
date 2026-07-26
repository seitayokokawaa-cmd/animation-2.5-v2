/**
 * Golden-test infrastructure (used by every package's tests).
 *
 * - `matchGolden(file, content)`: compare text (SVG frames) against a
 *   committed golden. Goldens update ONLY via `pnpm goldens:update`
 *   (sets MF_UPDATE_GOLDENS=1) after eyeballing the diff — never by hand.
 * - `phash`: 64-bit perceptual hash (32×32 DCT, top-left 8×8) over RGBA
 *   pixels, for "did the rendered frame change visibly" checks that are
 *   robust to encoder-level byte differences.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface GoldenResult {
  readonly ok: boolean;
  readonly message?: string;
}

export const updatingGoldens = (): boolean => process.env.MF_UPDATE_GOLDENS === '1';

/**
 * Compare `content` to the golden at `file`. In update mode the golden is
 * (re)written and the comparison always passes. A missing golden fails with
 * the command that creates it.
 */
export function matchGolden(file: string, content: string): GoldenResult {
  if (updatingGoldens()) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return { ok: true };
  }
  if (!existsSync(file)) {
    return {
      ok: false,
      message: `Golden missing: ${file}. Run \`pnpm goldens:update\` and eyeball the result.`,
    };
  }
  const expected = readFileSync(file, 'utf8');
  if (expected !== content) {
    return {
      ok: false,
      message: `Golden mismatch: ${file} (${expected.length} bytes) vs actual (${content.length} bytes). If the change is intended, run \`pnpm goldens:update\` and eyeball the diff.`,
    };
  }
  return { ok: true };
}

/** RGBA (4 bytes/px, row-major) → 64-bit perceptual hash as 16 hex chars. */
export function phash(rgba: Uint8Array, width: number, height: number): string {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Pixel buffer length ${rgba.length} != ${width}x${height}x4`);
  }
  const N = 32;
  // Downsample to N×N grayscale by box averaging.
  const gray = new Float64Array(N * N);
  for (let gy = 0; gy < N; gy++) {
    const y0 = Math.floor((gy * height) / N);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / N));
    for (let gx = 0; gx < N; gx++) {
      const x0 = Math.floor((gx * width) / N);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / N));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
        }
      }
      gray[gy * N + gx] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  // 2D DCT-II, keep the top-left 8×8 block.
  const K = 8;
  const dct = new Float64Array(K * K);
  for (let v = 0; v < K; v++) {
    for (let u = 0; u < K; u++) {
      let sum = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          sum =
            sum +
            gray[y * N + x]! *
              Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) *
              Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
        }
      }
      dct[v * K + u] = sum;
    }
  }
  // Median of AC coefficients (exclude DC) → bit per coefficient.
  const ac = [...dct.slice(1)].sort((a, b) => a - b);
  const median = ac[Math.floor(ac.length / 2)]!;
  let bits = 0n;
  for (let i = 0; i < K * K; i++) {
    bits = (bits << 1n) | (dct[i]! > median ? 1n : 0n);
  }
  return bits.toString(16).padStart(16, '0');
}

/** Hamming distance between two phash hex strings (0 = identical). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('Hash length mismatch');
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
