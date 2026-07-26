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
import { shapeText } from './text.js';

/** World units visible vertically at zoom 1. */
export const WORLD_UNITS_PER_VIEW_HEIGHT = 10;

function captionNodes(scene: FilmScene, localTick: Tick): SceneNode[] {
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
          fill: { color: c.color },
        })),
      };
    });
}

/** Build the complete SVG frame for a film-global tick. */
export function buildFrameSvg(film: Film, tick: Tick): string {
  const scene = sceneAtTick(film, tick);
  const localTick = Math.min(tick - scene.startTick, scene.durationTicks);

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

  const unit = (film.height / WORLD_UNITS_PER_VIEW_HEIGHT) * zoom;
  // screen = center + (world - camera) * unit, y flipped.
  const screenTransform = compose(
    translation(film.width / 2, film.height / 2),
    compose(
      scaling(unit, -unit),
      translation(-cameraPos.x - cameraShift.x, -cameraPos.y - cameraShift.y),
    ),
  );

  const root: SceneNode = {
    id: 'root',
    transform: screenTransform,
    children: [
      ...scene.instances.map((inst): SceneNode => {
        const pos = sample<Vec2>(scene.timeline, `${inst.id}/pos`, localTick);
        const rot = sample<number>(scene.timeline, `${inst.id}/rot`, localTick);
        const scale = sample<number>(scene.timeline, `${inst.id}/scale`, localTick);
        const pose = poseFor(inst.id);
        const shift = pose.translate ?? vec2(0, 0);
        const poseScale = pose.scale ?? vec2(1, 1);
        return {
          id: inst.id,
          depth: inst.depth,
          layer: inst.layer,
          opacity: pose.opacity ?? 1,
          transform: trs(
            vec2(pos.x + shift.x, pos.y + shift.y),
            rot + (pose.rotate ?? 0),
            vec2(scale * poseScale.x, scale * poseScale.y),
          ),
          shape: inst.shape,
          fill: inst.fill,
          stroke: inst.stroke,
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
            transform: translation(anchor.x, anchor.y),
            children: emitted,
          },
        ];
      }),
      ...scene.cards.flatMap((card, i) => buildCardNodes(card, localTick, i)),
      ...captionNodes(scene, localTick),
    ],
  };

  return emitSvg(painterSort(flattenScene(root)), {
    width: film.width,
    height: film.height,
    background: film.background ? formatColor(film.background) : undefined,
  });
}
