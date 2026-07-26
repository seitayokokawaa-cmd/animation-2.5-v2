import { describe, expect, it } from 'vitest';

import type { NarrationCacheProbe } from './narration-validate.js';
import { check } from './references.js';

const FILM = `motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
voices:
  narrator: { engine: mock, voice: warm }
shapes:
  box: { kind: rect, width: 1, height: 1 }
scenes:
  - id: setup
    place:
      - { ref: box, as: b, at: [0, 0] }
    narration:
      - voice: narrator
        text: Europe had a problem again a problem
        sync:
          - { on: "a problem", do: { move: { target: b, to: [2, 0], duration: 1 } } }
`;

const okProbe: NarrationCacheProbe = { probe: () => 'ok' };

describe('narration validation (M3.7)', () => {
  it('warns MF3003 on ambiguous string anchors, binding to the first', () => {
    const res = check(FILM, 'f.yaml', { cacheProbe: okProbe });
    const [f] = res.findings;
    expect(f!.code).toBe('MF3003');
    expect(f!.severity).toBe('warning');
    expect(f!.hint).toContain('nth: 2');
  });

  it('MF3001: unknown voice with candidates', () => {
    const bad = FILM.replace('voice: narrator', 'voice: narator');
    const codes = check(bad, 'f.yaml').findings;
    const f = codes.find((x) => x.code === 'MF3001');
    expect(f).toBeDefined();
    expect(f!.hint).toContain('narrator');
  });

  it('MF3002: anchor not found, with nearest-window did-you-mean', () => {
    const bad = FILM.replace('on: "a problem"', 'on: "a probelm"');
    const f = check(bad, 'f.yaml').findings.find((x) => x.code === 'MF3002');
    expect(f).toBeDefined();
    expect(f!.hint).toContain('"a problem"');
  });

  it('MF3004: nth out of range', () => {
    const bad = FILM.replace('on: "a problem"', 'on: { phrase: "a problem", nth: 5 }');
    const f = check(bad, 'f.yaml').findings.find((x) => x.code === 'MF3004');
    expect(f).toBeDefined();
    expect(f!.hint).toContain('between 1 and 2');
  });

  it('MF3005: stale and missing cache states, only when probed', () => {
    const stale = check(FILM, 'f.yaml', {
      cacheProbe: { probe: () => 'stale' },
    }).findings.find((x) => x.code === 'MF3005');
    expect(stale!.message).toContain('stale');
    expect(stale!.hint).toContain('mf voice sync');
    const missing = check(FILM, 'f.yaml', {
      cacheProbe: { probe: () => 'missing' },
    }).findings.find((x) => x.code === 'MF3005');
    expect(missing!.message).toContain('never been synthesized');
    // No probe → no cache findings (offline check still works).
    expect(check(FILM, 'f.yaml').findings.every((x) => x.code !== 'MF3005')).toBe(true);
  });

  it('positions point into the narration block', () => {
    const bad = FILM.replace('on: "a problem"', 'on: "missing words"');
    const f = check(bad, 'f.yaml').findings.find((x) => x.code === 'MF3002');
    expect(f!.pos.line).toBeGreaterThanOrEqual(14);
  });
});
