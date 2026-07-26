/**
 * Frame builder: (Film, tick) → SVG document. Pure — frame N is a function
 * of the film and the tick, nothing else.
 *
 * World convention (schema doc): y-up, origin at screen center, 10 world
 * units span the viewport height. The camera is a position + zoom sampled
 * from the scene timeline; zoom scales about the screen center.
 */

import {
  combinePoses,
  compose,
  IDENTITY,
  instantiateObject,
  emitSvg,
  flattenScene,
  formatColor,
  painterSort,
  sample,
  sceneAtTick,
  scaling,
  translation,
  trs,
  vec2,
  type Film,
  type FilmScene,
  type Pose,
  type SceneNode,
  type Tick,
  type Vec2,
} from '@motionforge/core';
import { emitEffectNodes, sampleEffect } from '@motionforge/motion';

import { buildCardNodes } from './cards.js';
import { paperTextureNodes, stylePreset, type StylePreset } from './style.js';
import { shapeText } from './text.js';

/** World units visible vertically at zoom 1. */
export const WORLD_UNITS_PER_VIEW_HEIGHT = 10;

/** How strongly depth separates under camera pans (M5.7). */
export const PARALLAX_STRENGTH = 0.6;

function captionNodes(scene: FilmScene, localTick: Tick, preset: StylePreset): SceneNode[] {
  return scene.captions
    .filter((c) => localTick >= c.startTick && localTick < c.startTick + c.durationTicks)
    .map((c, index): SceneNode => {
      const run = shapeText(c.font, c.text);
      const s = c.size / run.upem; // font units → world units
      const xStart = (-run.width * s) / 2; // center on the anchor
      return {
        id: `caption-${index}`,
        depth: 0,
        layer: 1000,
        transform: translation(c.at.x + xStart, c.at.y),
        children: run.paths.map((glyph, gi): SceneNode => ({
          id: `caption-${index}-g${gi}`,
          transform: compose(translation(glyph.x * s, glyph.y * s), scaling(s, s)),
          shape: { kind: 'path', d: glyph.d },
          fill: { color: c.color ?? preset.captionColor },
        })),
      };
    });
}

/** Build the complete SVG frame for a film-global tick. */
export function buildFrameSvg(film: Film, tick: Tick): string {
  const scene = sceneAtTick(film, tick);
  const localTick = Math.min(tick - scene.startTick, scene.durationTicks);
  const preset = stylePreset(film.style);

  /** Combined verb pose for a target at this instant (ADR-0008). */
  const poseFor = (target: string): Pose =>
    combinePoses(
      scene.effects
        .filter((e) => e.target === target)
        .map((e) => sampleEffect(e, localTick, film.seed)),
    );

  const cameraPose = poseFor('camera');
  const cameraShift = cameraPose.translate ?? vec2(0, 0);
  const cameraPos = sample<Vec2>(scene.timeline, 'camera/pos', localTick);
  const zoom = sample<number>(scene.timeline, 'camera/zoom', localTick);
  const camX = cameraPos.x + cameraShift.x;
  const camY = cameraPos.y + cameraShift.y;

  const baseUnit = film.height / WORLD_UNITS_PER_VIEW_HEIGHT;
  const unit = baseUnit * zoom;
  const worldWidthUnits = (film.width / film.height) * WORLD_UNITS_PER_VIEW_HEIGHT;

  /**
   * Parallax (M5.7): the camera offset applied to a node scales with its
   * nearness. Depth 0.5 tracks the camera exactly; nearer layers move
   * more, farther layers less — true 2.5D parallax under pans.
   */
  const parallaxFactor = (depth: number): number => 1 + (0.5 - depth) * PARALLAX_STRENGTH;
  const withParallax = (
    depth: number,
    worldTransform: SceneNode['transform'],
  ): SceneNode['transform'] => {
    const f = parallaxFactor(depth);
    return compose(translation(-camX * f, -camY * f), worldTransform ?? IDENTITY);
  };

  // World content: center + zoom scale; camera offset applied per node.
  const worldTransform = compose(
    translation(film.width / 2, film.height / 2),
    scaling(unit, -unit),
  );
  // Overlay content (cards, captions, texture, backdrop): screen-fixed —
  // no camera, no zoom.
  const overlayTransform = compose(
    translation(film.width / 2, film.height / 2),
    scaling(baseUnit, -baseUnit),
  );

  const backdropNodes: SceneNode[] = scene.backdrop
    ? [
        {
          id: 'backdrop',
          depth: 1,
          layer: -500_000,
          shape: { kind: 'rect', width: worldWidthUnits + 0.2, height: 10.2 },
          fill: {
            gradient: {
              from: vec2(0, 5.1),
              to: vec2(0, -5.1),
              stops: [
                { offset: 0, color: scene.backdrop.top },
                { offset: 1, color: scene.backdrop.bottom },
              ],
            },
          },
        },
      ]
    : [];

  const world: SceneNode = {
    id: 'world',
    transform: worldTransform,
    children: [
      ...scene.instances.map((inst): SceneNode => {
        const pos = sample<Vec2>(scene.timeline, `${inst.id}/pos`, localTick);
        const rot = sample<number>(scene.timeline, `${inst.id}/rot`, localTick);
        const scale = sample<number>(scene.timeline, `${inst.id}/scale`, localTick);
        const pose = poseFor(inst.id);
        const shift = pose.translate ?? vec2(0, 0);
        const poseScale = pose.scale ?? vec2(1, 1);
        const base = {
          id: inst.id,
          depth: inst.depth,
          layer: inst.layer,
          opacity: pose.opacity ?? 1,
          transform: withParallax(
            inst.depth,
            trs(
              vec2(pos.x + shift.x, pos.y + shift.y),
              rot + (pose.rotate ?? 0),
              vec2(scale * poseScale.x, scale * poseScale.y),
            ),
          ),
        };
        if (!inst.object) {
          return { ...base, shape: inst.shape, fill: inst.fill, stroke: inst.stroke };
        }
        // Part poses: articulation effects targeting `instance.part`. The
        // roll verb reads the instance's cumulative travel track (ω = v/r).
        const partPoses = new Map<string, Pose>();
        for (const effect of scene.effects) {
          const dot = effect.target.indexOf('.');
          if (dot < 0 || effect.target.slice(0, dot) !== inst.id) continue;
          const partId = effect.target.slice(dot + 1);
          const fed =
            effect.verb === 'roll'
              ? {
                  ...effect,
                  params: {
                    ...effect.params,
                    travel: sample<number>(scene.timeline, `${inst.id}/travel`, localTick),
                  },
                }
              : effect;
          const partPose = sampleEffect(fed, localTick, film.seed);
          const existing = partPoses.get(partId);
          partPoses.set(partId, existing ? combinePoses([existing, partPose]) : partPose);
        }
        return {
          ...base,
          children: [instantiateObject(inst.object.spec, inst.object.options, partPoses)],
        };
      }),
      // Cartoon FX geometry, anchored at the target's current position.
      ...scene.effects.flatMap((effect, ei): SceneNode[] => {
        const emitted = emitEffectNodes(effect, localTick, film.seed);
        if (emitted.length === 0) return [];
        const inst = scene.instances.find((i) => i.id === effect.target);
        const anchor = inst
          ? sample<Vec2>(scene.timeline, `${inst.id}/pos`, localTick)
          : vec2(0, 0);
        return [
          {
            id: `fx-${ei}`,
            depth: inst?.depth ?? 0.2,
            layer: (inst?.layer ?? 0) + 1,
            transform: withParallax(inst?.depth ?? 0.2, translation(anchor.x, anchor.y)),
            children: emitted,
          },
        ];
      }),
    ],
  };

  const overlay: SceneNode = {
    id: 'overlay',
    transform: overlayTransform,
    children: [
      ...backdropNodes,
      ...(preset.paperTexture ? paperTextureNodes(film.seed, worldWidthUnits + 4) : []),
      ...scene.cards.flatMap((card, i) => buildCardNodes(card, localTick, i, preset.cardTheme)),
      ...captionNodes(scene, localTick, preset),
    ],
  };

  const root: SceneNode = { id: 'root', children: [overlay, world] };

  return emitSvg(painterSort(flattenScene(root)), {
    width: film.width,
    height: film.height,
    background: formatColor(film.background ?? preset.background),
  });
}
