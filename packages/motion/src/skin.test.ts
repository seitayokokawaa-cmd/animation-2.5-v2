import { apply, parseColor, scaling, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { fk, type Skeleton } from './rig.js';
import { skin, type SkinPart } from './skin.js';

const arm: Skeleton = {
  bones: [
    { id: 'upper', rest: 0, length: 1 },
    { id: 'lower', parent: 'upper', offset: vec2(1, 0), rest: 0, length: 1 },
  ],
};

const parts: SkinPart[] = [
  {
    id: 'sleeve',
    bone: 'upper',
    at: vec2(0.5, 0),
    z: 2,
    shape: { kind: 'rect', width: 1, height: 0.3, rx: 0.15 },
    fill: { color: parseColor('#b5453c') },
  },
  {
    id: 'hand',
    bone: 'lower',
    at: vec2(1, 0),
    z: 1,
    shape: { kind: 'circle', r: 0.16 },
    fill: { color: parseColor('#e0b26a') },
  },
];

describe('vector skinning (M6.3)', () => {
  it('parts ride their bones through pose changes', () => {
    const bent = skin(fk(arm, { upper: Math.PI / 2 }), parts, { idPrefix: 'c' });
    const hand = bent.find((n) => n.id === 'c/hand')!;
    const pos = apply(hand.transform!, vec2(0, 0));
    expect(pos.x).toBeCloseTo(0, 9);
    expect(pos.y).toBeCloseTo(2, 9); // straight up, at the wrist
  });

  it('sorts by z into explicit layers', () => {
    const nodes = skin(fk(arm, {}), parts, { idPrefix: 'c', layerBase: 100 });
    expect(nodes.map((n) => n.id)).toEqual(['c/hand', 'c/sleeve']);
    expect(nodes.map((n) => n.layer)).toEqual([101, 102]);
  });

  it('facing flips via the root transform mirror x', () => {
    const flipped = skin(fk(arm, {}, scaling(-1, 1)), parts, { idPrefix: 'c' });
    const hand = flipped.find((n) => n.id === 'c/hand')!;
    expect(apply(hand.transform!, vec2(0, 0)).x).toBeCloseTo(-2, 9);
  });

  it('throws on unknown bones', () => {
    expect(() => skin(fk(arm, {}), [{ ...parts[0]!, bone: 'tail' }], { idPrefix: 'c' })).toThrow(
      /unknown bone/,
    );
  });
});
