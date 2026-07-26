import { describe, expect, it } from 'vitest';

import { check } from './references.js';
import type { VerbClaims } from './conflicts.js';

const CLAIMS: VerbClaims = {
  fling: { exclusive: 'travel', defaultSeconds: 0.9 },
  bonk: { exclusive: 'travel', defaultSeconds: 0.7 },
  gesture: { exclusive: 'gesture', defaultSeconds: 1.4 },
};

const wrap = (actions: string): string => `
motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
cast:
  imp: { template: potato-biped }
scenes:
  - id: a
    duration: 8
    place:
      - { ref: imp, as: imp, at: [0, 0] }
      - { ref: imp, as: imp2, at: [2, 0] }
    actions:
${actions}
`;

describe('conflict matrix (M12.1)', () => {
  it('flags overlapping moves on one target as an error', () => {
    const result = check(
      wrap(`      - { at: 0, move: { target: imp, to: [3, 0], duration: 2 } }
      - { at: 1, move: { target: imp, to: [0, 2], duration: 1 } }`),
      'f.yaml',
    );
    const finding = result.findings.find((f) => f.code === 'MF2005')!;
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('error');
    expect(finding.message).toContain('fights');
    expect(finding.hint).toContain('Start the move at 2s or later');
  });

  it('flags camera fights across different camera verbs', () => {
    const result = check(
      wrap(`      - { at: 0, camera: { to: [2, 0], zoom: 1.5, duration: 1 } }
      - { at: 0.5, shot: { kind: wide } }`),
      'f.yaml',
    );
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('MF2005');
    expect(result.findings.find((f) => f.code === 'MF2005')!.message).toContain('the camera');
  });

  it('cuts are instant and never conflict', () => {
    const result = check(
      wrap(`      - { at: 0, camera: { to: [2, 0], duration: 1 } }
      - { at: 2, shot: { kind: wide, cut: true } }
      - { at: 2, camera: { cut: true, to: [1, 1] } }`),
      'f.yaml',
    );
    expect(result.findings.filter((f) => f.code === 'MF2005')).toHaveLength(0);
  });

  it('sequential actions on one target pass clean', () => {
    const result = check(
      wrap(`      - { at: 0, move: { target: imp, to: [3, 0], duration: 1 } }
      - { at: 1, move: { target: imp, to: [0, 2], duration: 1 } }
      - { at: 0, move: { target: imp2, to: [4, 0], duration: 3 } }`),
      'f.yaml',
    );
    expect(result.findings).toHaveLength(0);
  });

  it('catches a long tween straddling a short one', () => {
    const result = check(
      wrap(`      - { at: 0, move: { target: imp, to: [3, 0], duration: 6 } }
      - { at: 1, move: { target: imp2, to: [1, 1], duration: 1 } }
      - { at: 4, move: { target: imp, to: [0, 0], duration: 1 } }`),
      'f.yaml',
    );
    expect(result.findings.filter((f) => f.code === 'MF2005')).toHaveLength(1);
  });

  it('warns on overlapping exclusive effects via registry claims', () => {
    const result = check(
      wrap(`      - { at: 0, fling: { target: imp, to: [4, 0] } }
      - { at: 0.3, bonk: { target: imp } }`),
      'f.yaml',
      { verbClaims: CLAIMS },
    );
    const finding = result.findings.find((f) => f.code === 'MF2006')!;
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('warning');
    expect(finding.message).toContain('travel');
    // Without claims the effect check is silent.
    const bare = check(
      wrap(`      - { at: 0, fling: { target: imp, to: [4, 0] } }
      - { at: 0.3, bonk: { target: imp } }`),
      'f.yaml',
    );
    expect(bare.findings.filter((f) => f.code === 'MF2006')).toHaveLength(0);
  });

  it('exclusive groups are per target — different targets pass', () => {
    const result = check(
      wrap(`      - { at: 0, fling: { target: imp, to: [4, 0] } }
      - { at: 0.3, bonk: { target: imp2 } }`),
      'f.yaml',
      { verbClaims: CLAIMS },
    );
    expect(result.findings.filter((f) => f.code === 'MF2006')).toHaveLength(0);
  });
});
