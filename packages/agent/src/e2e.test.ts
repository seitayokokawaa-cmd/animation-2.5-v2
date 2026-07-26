/**
 * Author-loop e2e (M13.6): drive the real `mf author` CLI on a mock
 * transcript whose direction pass is deliberately broken — the loop must
 * surface the validator findings, apply the scripted fix, and render an
 * actual MP4. A second run with an EMPTY transcript proves the response
 * cache resumes the whole conversation (M13.5).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');
const MAIN = join(REPO, 'packages', 'cli', 'src', 'main.ts');

const SCRIPT = `motionforge: 2
meta: { title: The Great Snack Heist, resolution: 320x180, fps: 30, seed: 3 }
voices:
  narrator: { engine: mock, voice: warm }
scenes:
  - id: heist
    narration:
      - voice: narrator
        text: The imp stole the royal snack and everyone noticed immediately.
`;

const DIRECTED_BROKEN = `motionforge: 2
meta: { title: The Great Snack Heist, resolution: 320x180, fps: 30, seed: 3 }
voices:
  narrator: { engine: mock, voice: warm }
cast:
  imp: { template: potato-biped, size: 0.8, expression: happy }
scenes:
  - id: heist
    stage: { preset: street }
    place:
      - { ref: imp, as: imp, at: [-1.5, -2.6] }
    narration:
      - voice: narrator
        text: The imp stole the royal snack and everyone noticed immediately.
        sync:
          - { on: 'royal snacc', do: { gesture: { target: imp, kind: point } } }
          - {
              on: 'noticed immediately',
              do: { card: { style: label, text: 'BUSTED', duration: 1.5 } },
            }
`;

const DIRECTED_FIXED = DIRECTED_BROKEN.replace('royal snacc', 'royal snack');

const fence = (yaml: string): string => '```yaml\n' + yaml + '```';

describe('author loop e2e (M13.6)', () => {
  it('bad draft → findings → scripted fix → MP4, then a cached resume', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-e2e-'));
    try {
      const transcript = join(dir, 'transcript.json');
      writeFileSync(
        transcript,
        JSON.stringify([fence(SCRIPT), fence(DIRECTED_BROKEN), fence(DIRECTED_FIXED)]),
      );
      const out = join(dir, 'film.mp4');
      const run = (mock: string): string =>
        execFileSync(
          TSX,
          [
            MAIN,
            'author',
            'the great snack heist',
            '--mock',
            mock,
            '-o',
            out,
            '--cache-dir',
            join(dir, 'voice'),
          ],
          { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );

      try {
        run(transcript);
      } catch (error) {
        throw new Error(String((error as { stderr?: string }).stderr ?? error), {
          cause: error,
        });
      }
      // The loop needed exactly one fix pass and produced a real film.
      const artifacts = join(dir, 'film.author');
      expect(readFileSync(join(artifacts, 'fix-1.mfs.yaml'), 'utf8')).toContain('royal snack');
      expect(readFileSync(join(artifacts, 'final.mfs.yaml'), 'utf8')).not.toContain('snacc');
      expect(existsSync(out)).toBe(true);
      expect(statSync(out).size).toBeGreaterThan(10_000);

      // Resume (M13.5): an EMPTY transcript still completes — every LLM
      // response replays from the cache.
      rmSync(out);
      const empty = join(dir, 'empty.json');
      writeFileSync(empty, '[]');
      run(empty);
      expect(existsSync(out)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
