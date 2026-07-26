import { vec2, type FilmCard } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { buildCardNodes } from './cards.js';

const card = (over: Partial<FilmCard>): FilmCard => ({
  style: 'date',
  text: '1914',
  at: vec2(0, 0),
  startTick: 120,
  durationTicks: 360,
  size: 0.9,
  entrance: 'slam',
  font: 'noto-sans',
  ...over,
});

const flatten = (nodes: readonly { id: string; children?: readonly unknown[] }[]): string[] =>
  nodes.flatMap((n) => [n.id, ...flatten((n.children ?? []) as never)]);

describe('cards (M4.5)', () => {
  it('renders nothing outside the card window', () => {
    const c = card({});
    expect(buildCardNodes(c, 0, 0)).toEqual([]);
    expect(buildCardNodes(c, 480, 0)).toEqual([]);
    expect(buildCardNodes(c, 200, 0)).toHaveLength(1);
  });

  it('slam entrance drops from above then squashes', () => {
    const c = card({});
    const early = buildCardNodes(c, 126, 0)[0]!;
    expect(early.transform!.f).toBeGreaterThan(0.5); // still up high (world y-up)
    const impact = buildCardNodes(c, 120 + Math.round(0.35 * 0.85 * 120), 0)[0]!;
    expect(impact.transform!.a).toBeGreaterThan(1); // squash wide
  });

  it('pop entrance scales up from 0 with overshoot', () => {
    const c = card({ entrance: 'pop' });
    const early = buildCardNodes(c, 122, 0)[0]!;
    expect(Math.abs(early.transform!.a)).toBeLessThan(0.5);
    const settled = buildCardNodes(c, 240, 0)[0]!;
    expect(settled.transform!.a).toBeCloseTo(1, 1);
  });

  it('fades out near the end', () => {
    const c = card({});
    expect(buildCardNodes(c, 478, 0)[0]!.opacity!).toBeLessThan(0.5);
  });

  it('title cards carry an accent rule and optional subtext (M11.2)', () => {
    const c = card({ style: 'title', text: 'THE GREAT WAR', subtext: 'Part One' });
    const ids = flatten(buildCardNodes(c, 240, 0) as never);
    expect(ids).toContain('card-0-rule');
    expect(ids).toContain('card-0-s');
    expect(ids.some((id) => id.startsWith('card-0-t-g'))).toBe(true);
  });

  it('lower-thirds build a spine, name plate, and role bar (M11.2)', () => {
    const c = card({ style: 'lower-third', text: 'Archduke Franz', subtext: 'Has One Job' });
    const ids = flatten(buildCardNodes(c, 240, 0) as never);
    expect(ids).toContain('card-0-spine');
    expect(ids).toContain('card-0-p');
    expect(ids).toContain('card-0-role-p');
    // Without subtext, only the name strap remains.
    const bare = flatten(
      buildCardNodes(card({ style: 'lower-third', text: 'Franz' }), 240, 0) as never,
    );
    expect(bare).toContain('card-0-spine');
    expect(bare).not.toContain('card-0-role-p');
  });

  it('list items pop in sequentially and all render once landed', () => {
    const c = card({ style: 'list', text: undefined, items: ['a', 'bb', 'ccc'], entrance: 'pop' });
    const early = flatten(buildCardNodes(c, 130, 0) as never);
    expect(early.filter((id) => id.includes('-item'))).toHaveLength(1);
    const late = flatten(buildCardNodes(c, 120 + 2 * 120, 0) as never);
    expect(late.filter((id) => id.includes('-item'))).toHaveLength(3);
  });

  it('plates layer under content so text is never covered', () => {
    const c = card({ style: 'list', text: undefined, items: ['x', 'y'], entrance: 'pop' });
    const root = buildCardNodes(c, 400, 5)[0]!;
    const plateNode = root.children!.find((n) => n.id.endsWith('-p'))!;
    const item = root.children!.find((n) => n.id.includes('-item'))!;
    expect(plateNode.layer).toBeLessThan(item.layer!);
  });

  it('cutaway content sits inside a frame', () => {
    const c = card({
      style: 'note',
      text: undefined,
      content: { shape: { kind: 'circle', r: 1 }, scale: 1.2 },
    });
    const ids = flatten(buildCardNodes(c, 240, 0) as never);
    expect(ids.some((id) => id.endsWith('-frame'))).toBe(true);
    expect(ids.some((id) => id.endsWith('-content'))).toBe(true);
  });

  it('is deterministic', () => {
    const c = card({ style: 'quote', text: 'we ride at dawn' });
    expect(buildCardNodes(c, 300, 1)).toEqual(buildCardNodes(c, 300, 1));
  });
});
