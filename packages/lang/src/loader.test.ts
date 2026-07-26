import { describe, expect, it } from 'vitest';

import { loadYaml } from './loader.js';

const DOC = `motionforge: 1
meta:
  title: Shapes
  fps: 30
scenes:
  - id: intro
    duration: 4
    place:
      - { ref: box, as: box-1, at: [0, 0] }
  - id: outro
    duration: 2
`;

describe('loadYaml', () => {
  it('parses to plain data with no issues', () => {
    const loaded = loadYaml(DOC);
    expect(loaded.issues).toEqual([]);
    expect(loaded.value).toMatchObject({ motionforge: 1, meta: { title: 'Shapes', fps: 30 } });
  });

  it('locates nested map keys, sequence items, and flow values', () => {
    const loaded = loadYaml(DOC);
    expect(loaded.locate(['meta', 'title'])).toEqual({ line: 3, col: 10 });
    expect(loaded.locate(['scenes', 0, 'id'])).toEqual({ line: 6, col: 9 });
    expect(loaded.locate(['scenes', 1, 'duration'])).toEqual({ line: 11, col: 15 });
    expect(loaded.locate(['scenes', 0, 'place', 0, 'ref'])).toEqual({ line: 9, col: 16 });
  });

  it('falls back to the deepest existing ancestor for missing paths', () => {
    const loaded = loadYaml(DOC);
    // 'nope' does not exist under scenes[0] → falls back to the scene node.
    expect(loaded.locate(['scenes', 0, 'nope'])).toEqual(loaded.locate(['scenes', 0]));
    // Entirely unknown top-level key → root.
    expect(loaded.locate(['zzz', 3, 'x'])).toEqual(loaded.locate([]));
  });

  it('reports syntax errors with positions', () => {
    const bad = 'meta:\n  title: "unterminated\n';
    const loaded = loadYaml(bad);
    expect(loaded.value).toBeUndefined();
    expect(loaded.issues.length).toBeGreaterThan(0);
    expect(loaded.issues[0]!.pos.line).toBeGreaterThanOrEqual(2);
  });

  it('resolves anchors/aliases in data while locating the alias node', () => {
    const withAlias = `defaults: &d\n  depth: 0.5\nuse:\n  <<: *d\n  extra: 1\n`;
    const loaded = loadYaml(withAlias);
    expect(loaded.issues).toEqual([]);
    expect(loaded.value).toMatchObject({ use: { extra: 1 } });
  });
});
