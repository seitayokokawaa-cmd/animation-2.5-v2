import { apply, parseColor, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { CHARACTER_TEMPLATES } from './characters.js';
import { characterNodes } from './potato.js';
import { dogTemplate, horseTemplate, quadrupedIdle } from './quadruped.js';
import { validateSkeleton } from './rig.js';

const origin = vec2(0, 0);

describe('quadrupeds (M6.8)', () => {
  it('registers horse and dog next to the potato-biped', () => {
    expect(CHARACTER_TEMPLATES.horse).toBe(horseTemplate);
    expect(CHARACTER_TEMPLATES.dog).toBe(dogTemplate);
    expect(CHARACTER_TEMPLATES['potato-biped']).toBeDefined();
  });

  it('builds valid skeletons with hooves on the ground', () => {
    for (const build of [horseTemplate, dogTemplate]) {
      const t = build();
      expect(() => validateSkeleton(t.skeleton)).not.toThrow();
      const rig = characterNodes(t, { idPrefix: 'q', at: origin });
      const feet = rig.children!.filter((n) => /-(hoof|paw)$/.test(n.id));
      expect(feet.length).toBe(4);
      for (const foot of feet) {
        expect(Math.abs(apply(foot.transform!, origin).y)).toBeLessThan(0.12);
      }
    }
  });

  it('draws its own face and offers a saddle', () => {
    const horse = horseTemplate();
    expect(horse.hasFace).toBe(false);
    expect(horse.seat!.bone).toBe('body');
    expect(horse.parts.some((p) => p.id === 'eye')).toBe(true);
    expect(horse.parts.some((p) => p.id === 'mane')).toBe(true);
    // Saddle sits above the spine, inside the body span.
    expect(horse.seat!.at.y).toBeGreaterThan(0);
  });

  it('keeps the inked cel stack: dark base under fill under highlight', () => {
    const horse = horseTemplate();
    const zOf = (id: string) => horse.parts.find((p) => p.id === id)!.z;
    expect(zOf('body')).toBeLessThan(zOf('body-fill'));
    expect(zOf('body-fill')).toBeLessThan(zOf('body-light'));
    expect(zOf('leg-back-f-skin')).toBeLessThan(zOf('body'));
    expect(zOf('leg-back-n-skin')).toBeLessThan(zOf('body'));
  });

  it('recolors the coat via the outfit slot, deriving the dark tone', () => {
    const grey = parseColor('#8d8d99');
    const horse = horseTemplate({ palette: { outfit: grey } });
    expect(horse.parts.find((p) => p.id === 'body-fill')!.fill?.color).toEqual(grey);
    expect(horse.palette.outfitDark).not.toEqual(horseTemplate().palette.outfitDark);
  });

  it('dog is pup-sized relative to the horse', () => {
    const rigOf = (t: ReturnType<typeof horseTemplate>) =>
      characterNodes(t, { idPrefix: 'q', at: origin });
    const horseHead = apply(
      rigOf(horseTemplate()).children!.find((n) => n.id === 'q/head-base')!.transform!,
      origin,
    );
    const dogHead = apply(
      rigOf(dogTemplate()).children!.find((n) => n.id === 'q/head-base')!.transform!,
      origin,
    );
    expect(dogHead.y).toBeLessThan(horseHead.y * 0.6);
  });

  it('idles deterministically with tail sway', () => {
    expect(quadrupedIdle(60)).toEqual(quadrupedIdle(60));
    expect(quadrupedIdle(60).tail).not.toBe(quadrupedIdle(0).tail);
  });
});
