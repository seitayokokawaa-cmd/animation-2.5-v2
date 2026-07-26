/**
 * M2.8 e2e: the example screenplay checks clean, compiles, renders to MP4 —
 * and a double render is byte-identical (the determinism contract, ADR-0004
 * / ADR-0003, on the whole pipeline).
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { frameCount } from '@motionforge/core';
import { check, compile } from '@motionforge/lang';
import { buildFrameSvg, renderFilm } from '@motionforge/render';
import { afterAll, describe, expect, it } from 'vitest';

const exampleFile = join(import.meta.dirname, '../../../examples/01-shapes.mfs.yaml');
const workDir = mkdtempSync(join(tmpdir(), 'mf-e2e-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('examples/01-shapes end to end', () => {
  const text = readFileSync(exampleFile, 'utf8');

  it('checks clean', () => {
    const result = check(text, 'examples/01-shapes.mfs.yaml');
    expect(result.findings).toEqual([]);
    expect(result.doc).toBeDefined();
  });

  it('compiles to the expected film shape', () => {
    const film = compile(check(text, 'x').doc!);
    expect(film.scenes.map((s) => s.id)).toEqual(['intro', 'dance', 'outro']);
    expect(film.durationTicks).toBe(8 * 120);
    expect(frameCount(film.durationTicks, film.fps)).toBe(240);
  });

  it('frame SVGs are pure functions of the tick', () => {
    const film = compile(check(text, 'x').doc!);
    for (const tick of [0, 200, 500, 959]) {
      expect(buildFrameSvg(film, tick)).toBe(buildFrameSvg(film, tick));
    }
  });

  it('renders twice to byte-identical MP4s', { timeout: 120_000 }, async () => {
    const film = compile(check(text, 'x').doc!);
    const a = join(workDir, 'a.mp4');
    const b = join(workDir, 'b.mp4');
    const resultA = await renderFilm(film, a);
    await renderFilm(film, b);
    expect(resultA.frames).toBe(240);
    expect(sha256(a)).toBe(sha256(b));
  });
});
