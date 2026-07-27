/**
 * Held-item validation (M14.6): the validator replays take/put/give/
 * throw in time order and knows who holds what.
 */
import { describe, expect, it } from 'vitest';

import { check } from './references.js';

const film = (actions: string): string => `
motionforge: 2
meta: { title: T, resolution: 640x360, fps: 30 }
shapes:
  bread: { kind: ellipse, rx: 0.3, ry: 0.18, fill: '#c8963c' }
cast:
  fox: { template: potato-biped }
  crow: { template: potato-biped }
scenes:
  - id: a
    duration: 8
    place:
      - { ref: fox, as: fox, at: [-2, -2.6] }
      - { ref: crow, as: crow, at: [2, -2.6] }
      - { ref: bread, as: bread, at: [0, -2.8] }
    actions:
${actions}
`;

const codes = (yaml: string): string[] => check(yaml, 'x.mfs.yaml').findings.map((f) => f.code);

describe('held-item validator (M14.6)', () => {
  it('a clean take → give → put chain passes', () => {
    const found = codes(
      film(
        `      - { at: 0.5, take: { target: fox, item: bread } }
      - { at: 2, give: { target: fox, to: crow, item: bread } }
      - { at: 4, put: { target: crow, item: bread, at: [1, -2.8] } }`,
      ),
    );
    expect(found).not.toContain('MF2011');
    expect(found).not.toContain('MF2012');
  });

  it('give without a take is MF2011', () => {
    const found = codes(film(`      - { at: 1, give: { target: fox, to: crow, item: bread } }`));
    expect(found).toContain('MF2011');
  });

  it("throwing somebody else's item is MF2011", () => {
    const found = codes(
      film(
        `      - { at: 0.5, take: { target: fox, item: bread } }
      - { at: 2, throw: { target: crow, item: bread, to: [3, -2.8] } }`,
      ),
    );
    expect(found).toContain('MF2011');
  });

  it('taking a held item is MF2012; a caught throw transfers holding', () => {
    const double = codes(
      film(
        `      - { at: 0.5, take: { target: fox, item: bread } }
      - { at: 2, take: { target: crow, item: bread } }`,
      ),
    );
    expect(double).toContain('MF2012');
    // Throw to a catcher hands possession over — the catcher may put.
    const caught = codes(
      film(
        `      - { at: 0.5, take: { target: fox, item: bread } }
      - { at: 2, throw: { target: fox, item: bread, to: crow } }
      - { at: 5, put: { target: crow, item: bread, at: [2.5, -2.8] } }`,
      ),
    );
    expect(caught).not.toContain('MF2011');
    expect(caught).not.toContain('MF2012');
  });
});
