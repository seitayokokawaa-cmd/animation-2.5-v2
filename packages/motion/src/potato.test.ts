import { apply, parseColor, vec2, type SceneNode } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import {
  CHARACTER_TEMPLATES,
  characterNodes,
  DEFAULT_POTATO_PALETTE,
  idlePose,
  potatoBiped,
} from './potato.js';
import { validateSkeleton } from './rig.js';

const origin = vec2(0, 0);

const childAt = (root: SceneNode, id: string): SceneNode => {
  const hit = root.children?.find((n) => n.id === id);
  if (!hit) throw new Error(`missing node ${id}`);
  return hit;
};

describe('potato-biped template (M6.4)', () => {
  it('builds a valid skeleton with feet on the ground and the head up top', () => {
    const potato = potatoBiped();
    expect(() => validateSkeleton(potato.skeleton)).not.toThrow();

    const rig = characterNodes(potato, { idPrefix: 'c', at: origin });
    for (const boot of ['c/boot-l', 'c/boot-r']) {
      const y = apply(childAt(rig, boot).transform!, origin).y;
      expect(Math.abs(y)).toBeLessThan(0.15);
    }
    // Head center: legs 0.35 + body 0.85 + neck 0.26 + 0.55·r(0.42).
    const head = apply(childAt(rig, 'c/head-base').transform!, origin);
    expect(head.x).toBeCloseTo(0, 9);
    expect(head.y).toBeCloseTo(1.691, 3);
  });

  it('scales every proportion with size', () => {
    const big = potatoBiped({ size: 2 });
    expect(big.headRadius).toBeCloseTo(0.84, 9);
    const rig = characterNodes(big, { idPrefix: 'c', at: origin });
    expect(apply(childAt(rig, 'c/head-base').transform!, origin).y).toBeCloseTo(2 * 1.691, 3);
  });

  it('reads as drawn art: layered shading, outline, ≥14 parts', () => {
    const potato = potatoBiped();
    expect(potato.parts.length).toBeGreaterThanOrEqual(14);
    const body = potato.parts.find((p) => p.id === 'body')!;
    expect(body.stroke?.color).toEqual(DEFAULT_POTATO_PALETTE.outline);
    const zOf = (id: string) => potato.parts.find((p) => p.id === id)!.z;
    // Dark silhouette base → main fill → highlight, on body and head both.
    expect(zOf('body')).toBeLessThan(zOf('body-fill'));
    expect(zOf('body-fill')).toBeLessThan(zOf('body-light'));
    expect(zOf('body-light')).toBeLessThan(zOf('head-base'));
    expect(zOf('head-base')).toBeLessThan(zOf('head-skin'));
    expect(zOf('head-skin')).toBeLessThan(zOf('head-light'));
    // Far arm behind the body, near arm in front.
    expect(zOf('arm-l-upper-skin')).toBeLessThan(zOf('body'));
    expect(zOf('arm-r-upper-skin')).toBeGreaterThan(zOf('head-light'));
    // Limbs and hands are inked so they read against the body.
    expect(potato.parts.find((p) => p.id === 'hand-r')!.stroke).toBeDefined();
    expect(potato.parts.find((p) => p.id === 'arm-r-upper-skin')!.stroke).toBeDefined();
  });

  it('recolors via palette params, deriving the dark tone from the outfit', () => {
    const red = parseColor('#aa2222');
    const potato = potatoBiped({ palette: { outfit: red } });
    expect(potato.parts.find((p) => p.id === 'body-fill')!.fill?.color).toEqual(red);
    // The silhouette base follows the recolor instead of staying default blue.
    expect(potato.palette.outfitDark).not.toEqual(DEFAULT_POTATO_PALETTE.outfitDark);
    expect(potato.palette.outfitDark.r).toBeGreaterThan(potato.palette.outfitDark.b);
    expect(potato.palette.skin).toEqual(DEFAULT_POTATO_PALETTE.skin);
  });

  it('facing left mirrors the character', () => {
    const potato = potatoBiped();
    const right = characterNodes(potato, { idPrefix: 'c', at: origin, facing: 'right' });
    const left = characterNodes(potato, { idPrefix: 'c', at: origin, facing: 'left' });
    const rx = apply(childAt(right, 'c/hand-r').transform!, origin).x;
    const lx = apply(childAt(left, 'c/hand-r').transform!, origin).x;
    expect(rx).toBeGreaterThan(0.1);
    expect(lx).toBeCloseTo(-rx, 9);
  });

  it('lays skin into explicit layers above layerBase with unique ids', () => {
    const rig = characterNodes(potatoBiped(), { idPrefix: 'c', at: origin, layerBase: 3000 });
    const ids = rig.children!.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of rig.children!) {
      expect(node.layer).toBeGreaterThan(3000);
      expect(node.layer).toBeLessThanOrEqual(3021);
    }
  });

  it('anchors head nodes at the head center for face/costume layers', () => {
    const potato = potatoBiped();
    const face: SceneNode = { id: 'face', shape: { kind: 'circle', r: 0.1 } };
    const rig = characterNodes(potato, {
      idPrefix: 'c',
      at: vec2(2, 0),
      layerBase: 100,
      headNodes: [face],
    });
    const anchor = childAt(rig, 'c/head-anchor');
    expect(anchor.layer).toBe(115);
    const pos = apply(anchor.transform!, origin);
    expect(pos.x).toBeCloseTo(2, 9);
    expect(pos.y).toBeCloseTo(1.691, 3);
    expect(anchor.children).toEqual([face]);
  });

  it('idle pose is deterministic and actually moves', () => {
    expect(idlePose(37)).toEqual(idlePose(37));
    expect(idlePose(90)).not.toEqual(idlePose(0));
    // Seed offsets de-sync a crowd.
    expect(idlePose(0, 17)).not.toEqual(idlePose(0));
  });

  it('is registered for the render tier', () => {
    expect(CHARACTER_TEMPLATES['potato-biped']).toBe(potatoBiped);
  });
});
