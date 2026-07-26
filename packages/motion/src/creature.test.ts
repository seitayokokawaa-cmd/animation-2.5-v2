/**
 * The menagerie (M14.2): creature-builder templates (bird, fish) and the
 * climb/swim/fly locomotion cycles.
 */
import { apply, parseColor, vec2 } from '@motionforge/core';
import { describe, expect, it } from 'vitest';

import { CHARACTER_TEMPLATES } from './characters.js';
import { birdTemplate, creatureIdle, creatureTemplate, fishTemplate } from './creature.js';
import { LOCOMOTION_KINDS, LOCOMOTION_RATES, locomotionPose } from './locomotion.js';
import { characterNodes } from './potato.js';
import { validateSkeleton } from './rig.js';

const origin = vec2(0, 0);

describe('menagerie (M14.2)', () => {
  it('registers bird and fish next to the other templates', () => {
    expect(CHARACTER_TEMPLATES.bird).toBe(birdTemplate);
    expect(CHARACTER_TEMPLATES.fish).toBe(fishTemplate);
  });

  it('bird has wings, beak, and legs that reach the ground', () => {
    const bird = birdTemplate();
    expect(() => validateSkeleton(bird.skeleton)).not.toThrow();
    const boneIds = bird.skeleton.bones.map((b) => b.id);
    expect(boneIds).toContain('wing-n');
    expect(boneIds).toContain('wing-f');
    expect(boneIds).toContain('leg-r');
    expect(bird.parts.some((p) => p.id === 'beak')).toBe(true);
    const rig = characterNodes(bird, { idPrefix: 'b', at: origin });
    for (const side of ['r', 'l']) {
      const leg = rig.children!.find((n) => n.id === `b/leg-${side}-skin`)!;
      // Stick legs hang from the body toward y = 0.
      expect(apply(leg.transform!, origin).y).toBeLessThan(0.45);
    }
  });

  it('fish is headless with a tail fin, dorsal fin, and body eye', () => {
    const fish = fishTemplate();
    expect(() => validateSkeleton(fish.skeleton)).not.toThrow();
    expect(fish.headBone).toBe('body');
    expect(fish.skeleton.bones.some((b) => b.id === 'tail')).toBe(true);
    expect(fish.parts.some((p) => p.id === 'dorsal')).toBe(true);
    expect(fish.parts.find((p) => p.id === 'eye')!.bone).toBe('body');
    expect(fish.hasFace).toBe(false);
  });

  it('keeps the inked cel order: far wing under body under near wing', () => {
    const bird = birdTemplate();
    const zOf = (id: string) => bird.parts.find((p) => p.id === id)!.z;
    expect(zOf('wing-f-skin')).toBeLessThan(zOf('body-base'));
    expect(zOf('body-base')).toBeLessThan(zOf('body-fill'));
    expect(zOf('body-fill')).toBeLessThan(zOf('wing-n-skin'));
  });

  it('recolors plumage via the outfit slot', () => {
    const red = parseColor('#b53c3c');
    const bird = birdTemplate({ palette: { outfit: red } });
    expect(bird.parts.find((p) => p.id === 'body-fill')!.fill?.color).toEqual(red);
    expect(bird.palette.outfitDark).not.toEqual(birdTemplate().palette.outfitDark);
  });

  it('the builder makes new species from a bare spec', () => {
    const snake = creatureTemplate(
      { body: { rx: 0.5, ry: 0.1, y: 0.15 }, tailFin: { length: 0.2, height: 0.1 } },
      fishTemplate().palette,
    );
    expect(() => validateSkeleton(snake.skeleton)).not.toThrow();
    expect(snake.skeleton.bones.map((b) => b.id)).toEqual(['body', 'tail']);
    expect(snake.parts.some((p) => p.id === 'wing-n-skin')).toBe(false);
  });

  it('idles deterministically with wing settle and tail sway', () => {
    expect(creatureIdle(60)).toEqual(creatureIdle(60));
    expect(creatureIdle(60).tail).not.toBe(creatureIdle(0).tail);
  });

  it('locomotion cycles are periodic and hit the right bones', () => {
    expect([...LOCOMOTION_KINDS]).toEqual(['climb', 'swim', 'fly']);
    for (const kind of LOCOMOTION_KINDS) {
      expect(LOCOMOTION_RATES[kind]).toBeGreaterThan(0);
      // Two cycles later the pose repeats (the fly tail steers at half
      // frequency, so the shared period is two cycles).
      const a = locomotionPose(kind, 0.2);
      const b = locomotionPose(kind, 2.2);
      for (const [bone, angle] of Object.entries(a)) {
        expect(b[bone], `${kind}.${bone}`).toBeCloseTo(angle!, 8);
      }
    }
    // Fly flaps wings out of phase with nothing else; swim waves the tail.
    const fly = locomotionPose('fly', 0.25);
    expect(Math.abs(fly['wing-n']!)).toBeGreaterThan(0.5);
    const swim = locomotionPose('swim', 0.25);
    expect(Math.abs(swim.tail!)).toBeGreaterThan(0.3);
    // Climb alternates the arms — opposite swing signs at quarter cycle.
    const climb = locomotionPose('climb', 0.25);
    expect(Math.sign(climb['arm-r-upper']! - 1.35)).not.toBe(
      Math.sign(climb['arm-l-upper']! - 2.05),
    );
  });
});
