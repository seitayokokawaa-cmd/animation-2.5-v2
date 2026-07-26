import { describe, expect, it } from 'vitest';

import { check } from './references.js';

const HEADER = `
motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
voices:
  imp: { engine: mock, voice: b }
cast:
  imp: { template: potato-biped }
  pony: { template: horse }
`;

describe('continuity validation (M12.2)', () => {
  it('errors on a line speaker who is not on stage', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 4
    place: [{ ref: imp, as: imp, at: [0, 0] }]
    narration: []
    lines: [{ after: nothing, speaker: ghost, say: Boo. }]
`,
      'f.yaml',
    );
    const finding = result.findings.find((f) => f.code === 'MF2009')!;
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('error');
    expect(finding.message).toContain('"ghost"');
  });

  it('warns when actions target actors before enter or after exit', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 8
    place: [{ ref: imp, as: imp, at: [0, 0] }]
    actions:
      - { at: 0.5, gesture: { target: imp, kind: wave } }
      - { at: 2, enter: { target: imp, from: left } }
      - { at: 4, exit: { target: imp, to: right } }
      - { at: 6, gesture: { target: imp, kind: shrug } }
`,
      'f.yaml',
    );
    const offstage = result.findings.filter((f) => f.code === 'MF2007');
    expect(offstage).toHaveLength(2);
    expect(offstage[0]!.message).toContain('before it enters');
    expect(offstage[1]!.message).toContain('after it exits');
  });

  it('warns when a rider mounts something without a seat', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 2
    place:
      - { ref: imp, as: walker, at: [0, 0] }
      - { ref: imp, as: rider, at: [0, 0], on: walker }
`,
      'f.yaml',
    );
    const finding = result.findings.find((f) => f.code === 'MF2010')!;
    expect(finding).toBeDefined();
    expect(finding.message).toContain('no seat');
  });

  it('accepts riders on mountable templates', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 2
    place:
      - { ref: pony, as: pony, at: [0, 0] }
      - { ref: imp, as: rider, at: [0, 0], on: pony }
`,
      'f.yaml',
    );
    expect(result.findings.filter((f) => f.code === 'MF2010')).toHaveLength(0);
  });

  it('flags a same-stage teleport, tracking the previous scene moves', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 4
    stage: { preset: street }
    place: [{ ref: imp, as: imp, at: [-3, -2.6] }]
    actions:
      - { at: 1, move: { target: imp, to: [2, -2.6], duration: 1 } }
  - id: b
    duration: 4
    stage: { preset: street }
    place: [{ ref: imp, as: imp, at: [-3, -2.6] }]
`,
      'f.yaml',
    );
    const finding = result.findings.find((f) => f.code === 'MF2008')!;
    expect(finding).toBeDefined();
    expect(finding.message).toContain('teleports');
    expect(finding.message).toContain('[2, -2.6]');
  });

  it('transitions, exits, and different stages all motivate re-blocking', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 4
    stage: { preset: street }
    place: [{ ref: imp, as: imp, at: [-3, -2.6] }]
  - id: b
    duration: 4
    stage: { preset: street }
    transition: { kind: fade }
    place: [{ ref: imp, as: imp, at: [3, -2.6] }]
  - id: c
    duration: 4
    stage: { preset: meadow }
    place: [{ ref: imp, as: imp, at: [-1, -2.6] }]
`,
      'f.yaml',
    );
    expect(result.findings.filter((f) => f.code === 'MF2008')).toHaveLength(0);
  });
});
