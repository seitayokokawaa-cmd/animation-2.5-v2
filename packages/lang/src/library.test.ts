import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { loadLibraries } from './library.js';
import { check } from './references.js';

const dir = mkdtempSync(join(tmpdir(), 'mf-lib-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const builtinDir = join(dir, 'assets-library');
const filmDir = join(dir, 'films');
mkdirSync(builtinDir, { recursive: true });
mkdirSync(filmDir, { recursive: true });

writeFileSync(
  join(builtinDir, 'props.yaml'),
  `objects:
  desk:
    parts:
      - { id: top, shape: { kind: rect, width: 2, height: 0.2 }, fill: "#8a6a3f" }
`,
);
writeFileSync(
  join(filmDir, 'local.yaml'),
  `objects:
  gizmo:
    parts:
      - { id: body, shape: { kind: circle, r: 0.5 }, fill: "#3c6fb5" }
`,
);

const options = { filmDir, builtinDir };

describe('library loader (M5.4)', () => {
  it('resolves built-in library/ paths and project-relative paths', () => {
    const { objects, findings } = loadLibraries(['library/props.yaml', 'local.yaml'], options);
    expect(findings).toEqual([]);
    expect(Object.keys(objects).sort()).toEqual(['desk', 'gizmo']);
  });

  it('reports missing and conflicting libraries with MF4001', () => {
    const missing = loadLibraries(['library/nope.yaml'], options);
    expect(missing.findings[0]!.code).toBe('MF4001');
    writeFileSync(
      join(filmDir, 'dupe.yaml'),
      `objects:\n  desk:\n    parts:\n      - { id: x, shape: { kind: circle, r: 1 }, fill: "#000000" }\n`,
    );
    const dupe = loadLibraries(['library/props.yaml', 'dupe.yaml'], options);
    expect(dupe.findings[0]!.message).toContain('defined by both');
  });

  it('merged objects satisfy place references in check()', () => {
    const film = `motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
use: [library/props.yaml]
scenes:
  - id: s
    duration: 2
    place:
      - { ref: desk, as: d, at: [0, 0] }
`;
    const { objects } = loadLibraries(['library/props.yaml'], options);
    expect(check(film, 'f.yaml', { libraries: objects }).findings).toEqual([]);
    // Without the libraries the ref is unknown.
    expect(check(film, 'f.yaml').findings.some((f) => f.code === 'MF2001')).toBe(true);
  });
});
