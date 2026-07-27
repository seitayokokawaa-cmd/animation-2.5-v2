/** `mf check --json` contract (M12.6): envelope + exit codes, end to end. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');
const MAIN = join(REPO, 'packages', 'cli', 'src', 'main.ts');

interface RunResult {
  readonly status: number;
  readonly stdout: string;
}

function runCheck(...args: string[]): RunResult {
  try {
    const stdout = execFileSync(TSX, [MAIN, 'check', ...args], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    const e = error as { status?: number; stdout?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '' };
  }
}

const CLEAN = `motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
shapes:
  box: { kind: rect, width: 1, height: 1 }
scenes:
  - id: a
    duration: 2
    place: [{ ref: box, as: b, at: [0, 0] }]
    actions:
      - { at: 0.5, pulse: { target: b } }
`;

describe('mf check --json exit codes (M12.6)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-check-'));
  const write = (name: string, text: string): string => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  };

  it('clean film → exit 0 + ok envelope', () => {
    const result = runCheck(write('clean.mfs.yaml', CLEAN), '--json');
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; summary: object };
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toEqual({ errors: 0, warnings: 0 });
  });

  it('error findings → exit 1 + findings in the envelope', () => {
    const broken = CLEAN.replace('target: b', 'target: ghost');
    const result = runCheck(write('broken.mfs.yaml', broken), '--json');
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      findings: { code: string }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.findings.some((f) => f.code === 'MF2002')).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('unreadable file → exit 2', () => {
    expect(runCheck(join(dir, 'missing.mfs.yaml'), '--json').status).toBe(2);
  });
}, 120_000);

describe('cli ux (M15.2)', () => {
  const run = (...args: string[]): RunResult => {
    try {
      const stdout = execFileSync(TSX, [MAIN, ...args], {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout };
    } catch (error) {
      const e = error as { status?: number; stdout?: string };
      return { status: e.status ?? -1, stdout: e.stdout ?? '' };
    }
  };

  it('`mf help` prints usage and exits 0; bare `mf` exits 2', () => {
    const help = run('help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage:');
    expect(run().status).toBe(2);
  });

  it('`mf --version` prints the version', () => {
    const version = run('--version');
    expect(version.status).toBe(0);
    expect(version.stdout).toMatch(/^mf \d+\.\d+\.\d+/);
  });

  it('unknown commands land on usage with exit 2', () => {
    expect(run('rendr', 'x.mfs.yaml').status).toBe(2);
  });
}, 120_000);
