import { describe, expect, it } from 'vitest';

import { check } from './references.js';

const HEADER = `
motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
voices:
  narrator: { engine: mock, voice: warm }
shapes:
  box: { kind: rect, width: 1, height: 1 }
`;

describe('pacing lints (M12.3)', () => {
  it('warns on dead air in explicitly-timed scenes', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 12
    place: [{ ref: box, as: b, at: [0, 0] }]
    actions:
      - { at: 0.5, pulse: { target: b } }
      - { at: 9, pulse: { target: b } }
`,
      'f.yaml',
    );
    const finding = result.findings.find((f) => f.code === 'MF3006')!;
    expect(finding).toBeDefined();
    expect(finding.message).toContain('between 0.5s and 9s');
    // A scene with no beats at all is one long gap.
    const empty = check(
      `${HEADER}
scenes:
  - id: a
    duration: 7
    place: [{ ref: box, as: b, at: [0, 0] }]
`,
      'f.yaml',
    );
    expect(empty.findings.filter((f) => f.code === 'MF3006')).toHaveLength(1);
  });

  it('flags two attention beats on the same anchor', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    place: [{ ref: box, as: b, at: [0, 0] }]
    narration:
      - voice: narrator
        text: The plan was bad.
        sync:
          - { on: plan, do: { card: { style: label, text: 'ONE', duration: 2 } } }
          - { on: plan, offset: 0.1, do: { card: { style: label, text: 'TWO', duration: 2, at: [3, 2] } } }
`,
      'f.yaml',
    );
    const finding = result.findings.find((f) => f.code === 'MF3007')!;
    expect(finding).toBeDefined();
    expect(finding.message).toContain('fight for attention');
    // Staggered by 0.4s: fine.
    const staggered = check(
      `${HEADER}
scenes:
  - id: a
    place: [{ ref: box, as: b, at: [0, 0] }]
    narration:
      - voice: narrator
        text: The plan was bad.
        sync:
          - { on: plan, do: { card: { style: label, text: 'ONE', duration: 2 } } }
          - { on: plan, offset: 0.4, do: { card: { style: label, text: 'TWO', duration: 2, at: [3, 2] } } }
`,
      'f.yaml',
    );
    expect(staggered.findings.filter((f) => f.code === 'MF3007')).toHaveLength(0);
  });

  it('flags two cards parked on the same spot', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 6
    place: [{ ref: box, as: b, at: [0, 0] }]
    actions:
      - { at: 0.5, card: { style: label, text: 'FIRST CARD HERE', duration: 4 } }
      - { at: 2, card: { style: label, text: 'SECOND CARD HERE', duration: 3 } }
`,
      'f.yaml',
    );
    expect(result.findings.filter((f) => f.code === 'MF3008')).toHaveLength(1);
    // Separated positions coexist.
    const apart = check(
      `${HEADER}
scenes:
  - id: a
    duration: 6
    place: [{ ref: box, as: b, at: [0, 0] }]
    actions:
      - { at: 0.5, card: { style: label, text: 'FIRST CARD HERE', duration: 4, at: [-3, 2] } }
      - { at: 2, card: { style: label, text: 'SECOND CARD HERE', duration: 3, at: [3, -2] } }
`,
      'f.yaml',
    );
    expect(apart.findings.filter((f) => f.code === 'MF3008')).toHaveLength(0);
  });

  it('flags unreadable and overstaying cards', () => {
    const result = check(
      `${HEADER}
scenes:
  - id: a
    duration: 12
    place: [{ ref: box, as: b, at: [0, 0] }]
    actions:
      - { at: 0.5, card: { style: label, text: 'AN EXTREMELY LONG CARD TEXT THAT NEEDS TIME', duration: 1 } }
      - { at: 3, card: { style: label, text: 'HI', duration: 9, at: [3, 2] } }
`,
      'f.yaml',
    );
    const timing = result.findings.filter((f) => f.code === 'MF3009');
    expect(timing).toHaveLength(2);
    expect(timing[0]!.message).toContain('too short to read');
    expect(timing[1]!.message).toContain('parks on screen');
  });
});
