import { describe, expect, it } from 'vitest';

import { hasErrors, printJson, printPretty } from './errors.js';
import { checkStructure } from './validate.js';

const GOOD = `motionforge: 1
meta: { title: Shapes, resolution: 1920x1080, fps: 30, seed: 7 }
shapes:
  box: { kind: rect, width: 2, height: 1, fill: "#d94f30" }
scenes:
  - id: intro
    duration: 4
    place:
      - { ref: box, as: box-1, at: [0, 0] }
    actions:
      - { at: 0.5, move: { target: box-1, to: [4, 0], duration: 2 } }
`;

describe('checkStructure', () => {
  it('passes a valid document and returns the typed doc', () => {
    const res = checkStructure(GOOD, 'film.mfs.yaml');
    expect(res.findings).toEqual([]);
    expect(res.doc?.meta.title).toBe('Shapes');
  });

  it('reports YAML syntax errors as MF1001', () => {
    const res = checkStructure('meta: [unclosed', 'film.mfs.yaml');
    expect(res.findings[0]!.code).toBe('MF1001');
    expect(res.doc).toBeUndefined();
    expect(hasErrors(res.findings)).toBe(true);
  });

  it('reports schema violations as MF1002 with position and hint', () => {
    const bad = GOOD.replace('fps: 30', 'fps: 25');
    const res = checkStructure(bad, 'film.mfs.yaml');
    expect(res.findings).toHaveLength(1);
    const f = res.findings[0]!;
    expect(f.code).toBe('MF1002');
    expect(f.message).toContain('fps must divide');
    expect(f.pos.line).toBe(2);
    expect(f.pos.col).toBeGreaterThan(40);
  });

  it('flags typo keys with an unrecognized-keys hint', () => {
    const bad = GOOD.replace('place:', 'plaec:');
    const res = checkStructure(bad, 'film.mfs.yaml');
    expect(res.findings.some((f) => f.hint?.includes('"plaec"'))).toBe(true);
  });

  it('points at the exact offending nested node', () => {
    const bad = GOOD.replace('fill: "#d94f30"', 'fill: "red"');
    const res = checkStructure(bad, 'film.mfs.yaml');
    const f = res.findings[0]!;
    expect(f.message).toContain('shapes.box.fill');
    expect(f.pos.line).toBe(4);
  });
});

describe('printers', () => {
  const findings = checkStructure(GOOD.replace('fps: 30', 'fps: 25'), 'x.mfs.yaml').findings;

  it('pretty output includes code, position, message, hint, and counts', () => {
    const out = printPretty(findings);
    expect(out).toContain('error MF1002 x.mfs.yaml:2:');
    expect(out).toContain('hint:');
    expect(out).toContain('1 error(s), 0 warning(s)');
    expect(printPretty([])).toBe('No problems found.');
  });

  it('json output is the stable machine envelope (M12.6)', () => {
    const parsed = JSON.parse(printJson(findings, 'x.mfs.yaml')) as {
      ok: boolean;
      file: string;
      summary: { errors: number; warnings: number };
      findings: { code: string; title: string; line: number; col: number }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.file).toBe('x.mfs.yaml');
    expect(parsed.summary).toEqual({ errors: 1, warnings: 0 });
    expect(parsed.findings[0]!.code).toBe('MF1002');
    expect(parsed.findings[0]!.title).toBe('Schema violation');
    expect(parsed.findings[0]!.line).toBe(2);
    // A clean check still yields a parseable envelope.
    const clean = JSON.parse(printJson([])) as { ok: boolean; summary: object };
    expect(clean.ok).toBe(true);
    expect(clean.summary).toEqual({ errors: 0, warnings: 0 });
  });
});
