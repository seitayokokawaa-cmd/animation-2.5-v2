import { describe, expect, it } from 'vitest';

import { check, didYouMean, editDistance } from './references.js';

const BASE = `motionforge: 1
meta: { title: T, resolution: 1920x1080, fps: 30 }
shapes:
  box: { kind: rect, width: 2, height: 1 }
  ball: { kind: circle, r: 0.5 }
scenes:
  - id: intro
    duration: 4
    place:
      - { ref: box, as: box-1, at: [0, 0] }
      - { ref: ball, as: ball-1, at: [2, 0] }
    actions:
      - { at: 0, move: { target: box-1, to: [4, 0], duration: 2 } }
`;

describe('editDistance / didYouMean', () => {
  it('computes classic distances', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('box', 'box')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('suggests near names only', () => {
    expect(didYouMean('bal', ['box', 'ball'])).toBe('ball');
    expect(didYouMean('zzzzz', ['box', 'ball'])).toBeUndefined();
  });
});

describe('check (T1+T2)', () => {
  it('passes the clean document', () => {
    expect(check(BASE, 'f.yaml').findings).toEqual([]);
  });

  it('MF2001: unknown shape ref with did-you-mean, positioned at the ref', () => {
    const bad = BASE.replace('{ ref: ball, as: ball-1', '{ ref: bal, as: ball-1');
    const [f] = check(bad, 'f.yaml').findings;
    expect(f!.code).toBe('MF2001');
    expect(f!.hint).toContain('Did you mean "ball"?');
    expect(f!.pos.line).toBe(11);
  });

  it('MF2002: unknown action target with did-you-mean', () => {
    const bad = BASE.replace('target: box-1', 'target: box1');
    const [f] = check(bad, 'f.yaml').findings;
    expect(f!.code).toBe('MF2002');
    expect(f!.hint).toContain('Did you mean "box-1"?');
  });

  it('MF2003: duplicate instance names in one scene', () => {
    const bad = BASE.replace('as: ball-1', 'as: box-1');
    const codes = check(bad, 'f.yaml').findings.map((f) => f.code);
    expect(codes).toContain('MF2003');
  });

  it('MF2004: duplicate scene ids', () => {
    const bad = `${BASE}  - id: intro\n    duration: 2\n`;
    const codes = check(bad, 'f.yaml').findings.map((f) => f.code);
    expect(codes).toContain('MF2004');
  });

  it('skips T2 when T1 already failed', () => {
    const res = check('motionforge: 2\n', 'f.yaml');
    expect(res.findings.every((f) => f.code.startsWith('MF1'))).toBe(true);
  });
});
