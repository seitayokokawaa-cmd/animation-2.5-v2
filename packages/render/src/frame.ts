/**
 * Frame builder: (Film, tick) → SVG document. Pure — frame N is a function
 * of the film and the tick, nothing else.
 *
 * World convention (schema doc): y-up, origin at screen center, 10 world
 * units span the viewport height. The camera is a position + zoom sampled
 * from the scene timeline; zoom scales about the screen center.
 */

import {
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
  type SceneNode,
  type Tick,
  type Vec2,
} from '@motionforge/core';

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

  const cameraPos = sample<Vec2>(scene.timeline, 'camera/pos', localTick);
  const zoom = sample<number>(scene.timeline, 'camera/zoom', localTick);

  const unit = (film.height / WORLD_UNITS_PER_VIEW_HEIGHT) * zoom;
  // screen = center + (world - camera) * unit, y flipped.
  const screenTransform = compose(
    translation(film.width / 2, film.height / 2),
    compose(scaling(unit, -unit), translation(-cameraPos.x, -cameraPos.y)),
  );

  const root: SceneNode = {
    id: 'root',
    transform: screenTransform,
    children: [
      ...scene.instances.map((inst): SceneNode => {
        const pos = sample<Vec2>(scene.timeline, `${inst.id}/pos`, localTick);
        const rot = sample<number>(scene.timeline, `${inst.id}/rot`, localTick);
        const scale = sample<number>(scene.timeline, `${inst.id}/scale`, localTick);
        return {
          id: inst.id,
          depth: inst.depth,
          layer: inst.layer,
          transform: trs(pos, rot, vec2(scale, scale)),
          shape: inst.shape,
          fill: inst.fill,
          stroke: inst.stroke,
        };
      }),
      ...captionNodes(scene, localTick),
    ],
  };

  return emitSvg(painterSort(flattenScene(root)), {
    width: film.width,
    height: film.height,
    background: film.background ? formatColor(film.background) : undefined,
  });
}
