import { describe, expect, it } from 'vitest';

import { applyCostume, COSTUME_PIECES, HELD_ITEMS, MUSTACHES } from './costume.js';
import { characterNodes, potatoBiped } from './potato.js';

const opts = { idPrefix: 'c/costume', layerBase: 1000 };

describe('costume system (M6.6)', () => {
  it('ships the full plan §5.4 wardrobe', () => {
    for (const hat of ['crown', 'spiked-helmet', 'plumed-hat', 'turban', 'beret']) {
      expect(COSTUME_PIECES[hat], hat).toBeDefined();
    }
    for (const outfit of ['royal-uniform', 'military-uniform', 'suit', 'robe', 'peasant-tunic']) {
      expect(COSTUME_PIECES[outfit], outfit).toBeDefined();
    }
    expect(Object.keys(MUSTACHES).sort()).toEqual(['chevron', 'goatee', 'handlebar', 'imperial']);
    expect(Object.keys(HELD_ITEMS).sort()).toEqual(['flag', 'scroll', 'staff', 'sword']);
  });

  it('outfits add body-bone skin parts that ride poses', () => {
    const bare = potatoBiped();
    const dressed = applyCostume(bare, { pieces: ['royal-uniform'] }, opts);
    expect(dressed.template.parts.length).toBeGreaterThan(bare.parts.length);
    const sash = dressed.template.parts.find((p) => p.id === 'costume-sash')!;
    expect(sash.bone).toBe('pelvis');
    // Overlays sit above the body stack (z 5–7), below the head (z 10).
    expect(sash.z).toBeGreaterThan(7);
    expect(sash.z).toBeLessThan(10);
  });

  it('hats and mustaches join the head anchor with explicit layers above the face', () => {
    const dressed = applyCostume(potatoBiped(), { pieces: ['crown'], mustache: 'imperial' }, opts);
    expect(dressed.headNodes).toHaveLength(2);
    const crownGroup = dressed.headNodes[0]!;
    expect(crownGroup.id).toBe('c/costume/crown');
    for (const child of crownGroup.children!) {
      // Above the face parts (anchor 1015 + face 1…4).
      expect(child.layer!).toBeGreaterThanOrEqual(1015 + 5);
    }
  });

  it('held items land in the hand anchor and render without id collisions', () => {
    const dressed = applyCostume(potatoBiped(), { held: 'sword' }, opts);
    expect(dressed.handNodes).toHaveLength(1);
    const rig = characterNodes(dressed.template, {
      idPrefix: 'c',
      at: { x: 0, y: 0 },
      headNodes: dressed.headNodes,
      handNodes: dressed.handNodes,
    });
    const anchor = rig.children!.find((n) => n.id === 'c/hand-anchor');
    expect(anchor).toBeDefined();
    expect(anchor!.children![0]!.id).toBe('c/costume/held-sword');
  });

  it('a full caricature stacks without duplicate part ids', () => {
    const dressed = applyCostume(
      potatoBiped(),
      { pieces: ['military-uniform', 'spiked-helmet'], mustache: 'handlebar', held: 'sword' },
      opts,
    );
    const ids = dressed.template.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('throws on unknown pieces (the validator catches this earlier)', () => {
    expect(() => applyCostume(potatoBiped(), { pieces: ['fedora'] }, opts)).toThrow(/fedora/);
  });
});
