/**
 * Broken-screenplay corpus (M12.7): 40+ minimal films, each pinned to the
 * exact MF codes it must produce. The regression net for the validator —
 * message wording may evolve, codes must not.
 */
import { describe, expect, it } from 'vitest';

import type { VerbClaims } from './conflicts.js';
import { loadLibraries } from './library.js';
import type { NarrationCacheProbe } from './narration-validate.js';
import { check } from './references.js';

const CLAIMS: VerbClaims = {
  fling: { exclusive: 'travel', defaultSeconds: 0.9 },
  bonk: { exclusive: 'travel', defaultSeconds: 0.7 },
};

/** Cache probe that reports every segment as frozen and fresh. */
const FRESH: NarrationCacheProbe = { probe: () => 'ok' };
const MISSING: NarrationCacheProbe = { probe: () => 'missing' };
const STALE: NarrationCacheProbe = { probe: () => 'stale' };

const META = 'meta: { title: T, resolution: 640x360, fps: 30 }';
const BOX = 'shapes:\n  box: { kind: rect, width: 1, height: 1 }';
const CAST = 'cast:\n  imp: { template: potato-biped }\n  pony: { template: horse }';
const VOICES = 'voices:\n  narrator: { engine: mock, voice: warm }';

interface Case {
  readonly name: string;
  readonly yaml: string;
  readonly codes: readonly string[];
  readonly probe?: NarrationCacheProbe;
}

const scene = (body: string): string =>
  `motionforge: 2\n${META}\n${BOX}\n${CAST}\n${VOICES}\nscenes:\n${body}`;

const CASES: readonly Case[] = [
  // ---- MF1001 structural -------------------------------------------------
  {
    name: 'unparseable yaml',
    yaml: 'meta: [unclosed',
    codes: ['MF1001'],
  },
  {
    name: 'tab indentation',
    yaml: 'meta:\n\ttitle: T',
    codes: ['MF1001'],
  },
  // ---- MF1002 schema -----------------------------------------------------
  {
    name: 'fps as a word',
    yaml: `motionforge: 2\nmeta: { title: T, resolution: 640x360, fps: thirty }\nscenes:\n  - { id: a, duration: 2 }`,
    codes: ['MF1002'],
  },
  {
    name: 'unknown top-level key',
    yaml: `motionforge: 2\n${META}\nsceness: []\nscenes:\n  - { id: a, duration: 2 }`,
    codes: ['MF1002'],
  },
  {
    name: 'bad easing enum',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0, move: { target: b, to: [1, 0], duration: 1, easing: swoopy } }`,
    ),
    codes: ['MF1002'],
  },
  {
    name: 'uppercase instance name',
    yaml: scene(`  - id: a\n    duration: 2\n    place: [{ ref: box, as: Box, at: [0, 0] }]`),
    codes: ['MF1002'],
  },
  {
    name: 'bad hex color',
    yaml: `motionforge: 2\n${META}\nshapes:\n  box: { kind: rect, width: 1, height: 1, fill: red }\nscenes:\n  - { id: a, duration: 2 }`,
    codes: ['MF1002'],
  },
  {
    name: 'scene without duration or narration',
    yaml: scene(`  - id: a\n    place: [{ ref: box, as: b, at: [0, 0] }]`),
    codes: ['MF1002'],
  },
  {
    name: 'negative duration',
    yaml: scene(`  - { id: a, duration: -2 }`),
    codes: ['MF1002'],
  },
  {
    name: 'unknown card style',
    yaml: scene(
      `  - id: a\n    duration: 2\n    actions:\n      - { at: 0, card: { style: banner, text: HI, duration: 1.5 } }`,
    ),
    codes: ['MF1002'],
  },
  {
    name: 'unknown cast template',
    yaml: `motionforge: 2\n${META}\ncast:\n  imp: { template: robot }\nscenes:\n  - { id: a, duration: 2 }`,
    codes: ['MF1002'],
  },
  {
    name: 'zoom-punch strength out of range',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0, camera: { zoom-punch: imp, punch: 9 } }`,
    ),
    codes: ['MF1002'],
  },
  // ---- MF2001 unknown ref -----------------------------------------------
  {
    name: 'placement of an undefined ref',
    yaml: scene(`  - id: a\n    duration: 2\n    place: [{ ref: box2, as: b, at: [0, 0] }]`),
    codes: ['MF2001'],
  },
  {
    name: 'misspelled cast ref (did-you-mean)',
    yaml: scene(`  - id: a\n    duration: 2\n    place: [{ ref: impp, as: i, at: [0, 0] }]`),
    codes: ['MF2001'],
  },
  // ---- MF2002 unknown target ---------------------------------------------
  {
    name: 'move targets a ghost',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0, move: { target: ghost, to: [1, 0], duration: 1 } }`,
    ),
    codes: ['MF2002'],
  },
  {
    name: 'gesture targets a ghost',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0, gesture: { target: gost, kind: wave } }`,
    ),
    codes: ['MF2002'],
  },
  {
    name: 'fling targets a ghost',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0, fling: { target: ghost, to: [4, 0] } }`,
    ),
    codes: ['MF2002'],
  },
  {
    name: 'chase with one unplaced runner',
    yaml: scene(
      `  - id: a\n    duration: 6\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0, chase: { targets: [imp, ghost] } }`,
    ),
    codes: ['MF2002'],
  },
  {
    name: 'mount on an unplaced instance',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place: [{ ref: imp, as: rider, at: [0, 0], on: ghost }]`,
    ),
    codes: ['MF2002'],
  },
  // ---- MF2003 / MF2004 duplicates ---------------------------------------
  {
    name: 'duplicate instance name',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place:\n      - { ref: box, as: b, at: [0, 0] }\n      - { ref: box, as: b, at: [1, 0] }`,
    ),
    codes: ['MF2003'],
  },
  {
    name: 'duplicate scene id',
    yaml: scene(`  - { id: a, duration: 2 }\n  - { id: a, duration: 2 }`),
    codes: ['MF2004'],
  },
  // ---- MF2005 track conflicts --------------------------------------------
  {
    name: 'overlapping moves',
    yaml: scene(
      `  - id: a\n    duration: 4\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0, move: { target: b, to: [2, 0], duration: 2 } }\n      - { at: 1, move: { target: b, to: [0, 1], duration: 1 } }`,
    ),
    codes: ['MF2005'],
  },
  {
    name: 'camera pan fights a shot preset',
    yaml: scene(
      `  - id: a\n    duration: 4\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0, camera: { to: [2, 0], zoom: 1.4, duration: 1 } }\n      - { at: 0.4, shot: { kind: close-up, of: imp } }`,
    ),
    codes: ['MF2005'],
  },
  {
    name: 'zoom-to fights a camera glide',
    yaml: `motionforge: 2\n${META}\nmaps:\n  world: { source: naturalearth/world-110m }\nscenes:\n  - id: a\n    duration: 4\n    place: [{ ref: world, as: map, at: [0, 0] }]\n    actions:\n      - { at: 0, camera: { to: [1, 0], duration: 2 } }\n      - { at: 1, zoom-to: { region: france } }`,
    codes: ['MF2005'],
  },
  {
    name: 'rotate overlap on one instance',
    yaml: scene(
      `  - id: a\n    duration: 4\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0, rotate: { target: b, to: 90, duration: 2 } }\n      - { at: 1, rotate: { target: b, to: 0, duration: 2 } }`,
    ),
    codes: ['MF2005'],
  },
  // ---- MF2006 exclusive effects ------------------------------------------
  {
    name: 'fling into a bonk',
    yaml: scene(
      `  - id: a\n    duration: 4\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0, fling: { target: imp, to: [4, 0] } }\n      - { at: 0.3, bonk: { target: imp } }`,
    ),
    codes: ['MF2006'],
  },
  // ---- MF2007 offstage ----------------------------------------------------
  {
    name: 'gesture before enter',
    yaml: scene(
      `  - id: a\n    duration: 6\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0.5, gesture: { target: imp, kind: wave } }\n      - { at: 2, enter: { target: imp, from: left } }`,
    ),
    codes: ['MF2007'],
  },
  {
    name: 'pulse after exit',
    yaml: scene(
      `  - id: a\n    duration: 6\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 1, exit: { target: imp, to: right } }\n      - { at: 4, pulse: { target: imp } }`,
    ),
    codes: ['MF2007'],
  },
  // ---- MF2008 teleport ----------------------------------------------------
  {
    name: 'same-stage teleport',
    yaml: scene(
      `  - id: a\n    duration: 2\n    stage: { preset: street }\n    place: [{ ref: imp, as: imp, at: [3, -2.6] }]\n  - id: b\n    duration: 2\n    stage: { preset: street }\n    place: [{ ref: imp, as: imp, at: [-3, -2.6] }]`,
    ),
    codes: ['MF2008'],
  },
  // ---- MF2009 line speaker ------------------------------------------------
  {
    name: 'line spoken by a ghost',
    yaml: scene(
      `  - id: a\n    duration: 4\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    lines:\n      - { after: nothing, speaker: ghost, say: Hi. }`,
    ),
    codes: ['MF2009'],
  },
  // ---- MF2010 seatless mount ----------------------------------------------
  {
    name: 'riding a potato',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place:\n      - { ref: imp, as: walker, at: [0, 0] }\n      - { ref: imp, as: rider, at: [0, 0], on: walker }`,
    ),
    codes: ['MF2010'],
  },
  {
    name: 'riding a prop',
    yaml: scene(
      `  - id: a\n    duration: 2\n    place:\n      - { ref: box, as: crate, at: [0, 0] }\n      - { ref: imp, as: rider, at: [0, 0], on: crate }`,
    ),
    codes: ['MF2010'],
  },
  // ---- MF3001 unknown voice -----------------------------------------------
  {
    name: 'narration with undeclared voice',
    yaml: scene(`  - id: a\n    narration:\n      - { voice: baritone, text: Hello there. }`),
    codes: ['MF3001'],
  },
  // ---- MF3002/3/4 anchors -------------------------------------------------
  {
    name: 'anchor phrase not in the text',
    yaml: scene(
      `  - id: a\n    narration:\n      - voice: narrator\n        text: The empire collapsed.\n        sync:\n          - { on: the kingdom, do: { sfx: ding } }`,
    ),
    codes: ['MF3002'],
  },
  {
    name: 'ambiguous anchor',
    yaml: scene(
      `  - id: a\n    narration:\n      - voice: narrator\n        text: The plan was the plan.\n        sync:\n          - { on: the plan, do: { sfx: ding } }`,
    ),
    codes: ['MF3003'],
  },
  {
    name: 'anchor nth out of range',
    yaml: scene(
      `  - id: a\n    narration:\n      - voice: narrator\n        text: The plan was the plan.\n        sync:\n          - { on: { phrase: the plan, nth: 5 }, do: { sfx: ding } }`,
    ),
    codes: ['MF3004'],
  },
  {
    name: 'anchor missing in a later segment',
    yaml: scene(
      `  - id: a\n    narration:\n      - { voice: narrator, text: A short story. }\n      - voice: narrator\n        text: It got worse.\n        sync:\n          - { on: got better, do: { sfx: ding } }`,
    ),
    codes: ['MF3002'],
  },
  // ---- MF3005 cache -------------------------------------------------------
  {
    name: 'voice cache missing',
    yaml: scene(`  - id: a\n    narration:\n      - { voice: narrator, text: Hello there. }`),
    codes: ['MF3005'],
    probe: MISSING,
  },
  {
    name: 'voice cache stale',
    yaml: scene(`  - id: a\n    narration:\n      - { voice: narrator, text: Hello there. }`),
    codes: ['MF3005'],
    probe: STALE,
  },
  // ---- MF3006 dead air ----------------------------------------------------
  {
    name: 'empty seven-second scene',
    yaml: scene(`  - id: a\n    duration: 7\n    place: [{ ref: box, as: b, at: [0, 0] }]`),
    codes: ['MF3006'],
  },
  {
    name: 'six-second gap between beats',
    yaml: scene(
      `  - id: a\n    duration: 10\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0.5, pulse: { target: b } }\n      - { at: 8, pulse: { target: b } }`,
    ),
    codes: ['MF3006'],
  },
  // ---- MF3007 sync collisions ---------------------------------------------
  {
    name: 'two cards on one anchor',
    yaml: scene(
      `  - id: a\n    narration:\n      - voice: narrator\n        text: The plan was bad.\n        sync:\n          - { on: plan, do: { card: { style: label, text: 'AA', duration: 2 } } }\n          - { on: plan, offset: 0.1, do: { card: { style: label, text: 'BB', duration: 2, at: [3, 2] } } }`,
    ),
    codes: ['MF3007'],
  },
  // ---- MF3008 / MF3009 cards ---------------------------------------------
  {
    name: 'stacked cards',
    yaml: scene(
      `  - id: a\n    duration: 6\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0.5, card: { style: label, text: 'FIRST CARD', duration: 4 } }\n      - { at: 2, card: { style: label, text: 'SECOND CARD', duration: 3 } }`,
    ),
    codes: ['MF3008'],
  },
  {
    name: 'unreadable flash card',
    yaml: scene(
      `  - id: a\n    duration: 6\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0.5, card: { style: label, text: 'A CARD WITH FAR TOO MANY WORDS TO READ', duration: 0.8 } }`,
    ),
    codes: ['MF3009'],
  },
  {
    name: 'parked card',
    yaml: scene(
      `  - id: a\n    duration: 12\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    actions:\n      - { at: 0.5, card: { style: label, text: 'HI', duration: 10 } }\n      - { at: 6, pulse: { target: b } }`,
    ),
    codes: ['MF3009'],
  },
  // ---- combinations -------------------------------------------------------
  {
    name: 'several families at once',
    yaml: scene(
      `  - id: a\n    duration: 7\n    place: [{ ref: box, as: b, at: [0, 0] }]\n    lines:\n      - { after: x, speaker: ghost, say: Hi. }\n  - id: a\n    duration: 2`,
    ),
    codes: ['MF2004', 'MF2009'],
  },
];

describe('broken-screenplay corpus (M12.7)', () => {
  it(`covers ${CASES.length} broken screenplays (40+ required)`, () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
  });

  for (const testCase of CASES) {
    it(testCase.name, () => {
      const result = check(testCase.yaml, 'corpus.mfs.yaml', {
        verbClaims: CLAIMS,
        cacheProbe: testCase.probe ?? FRESH,
      });
      const got = new Set(result.findings.map((f) => f.code));
      for (const code of testCase.codes) {
        expect([...got], `expected ${code} for "${testCase.name}"`).toContain(code);
      }
    });
  }

  it('a fully-clean screenplay produces zero findings', () => {
    const clean = scene(
      `  - id: a\n    duration: 4\n    place: [{ ref: imp, as: imp, at: [0, 0] }]\n    actions:\n      - { at: 0.5, gesture: { target: imp, kind: wave } }\n      - { at: 3, pulse: { target: imp } }`,
    );
    expect(
      check(clean, 'clean.mfs.yaml', { verbClaims: CLAIMS, cacheProbe: FRESH }).findings,
    ).toHaveLength(0);
  });

  it('a broken library reference produces MF4001', () => {
    const libs = loadLibraries(['library/does-not-exist.yaml'], {
      filmDir: '/tmp',
      builtinDir: 'assets/library',
    });
    expect(libs.findings.some((f) => f.code === 'MF4001')).toBe(true);
  });
});
