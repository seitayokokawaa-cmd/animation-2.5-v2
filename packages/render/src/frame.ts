/**
 * Frame builder: (Film, tick) → SVG document. Pure — frame N is a function
 * of the film and the tick, nothing else.
 *
 * World convention (schema doc): y-up, origin at screen center, 10 world
 * units span the viewport height. The camera is a position + zoom sampled
 * from the scene timeline; zoom scales about the screen center.
 */

import {
  cameraTransform,
  combinePoses,
  compose,
  dampedTrack,
  ease,
  fnv1a,
  IDENTITY,
  instantiateObject,
  emitSvg,
  flattenScene,
  formatColor,
  painterSort,
  rotation,
  sample,
  sceneAtTick,
  scaling,
  translation,
  trs,
  vec2,
  whipZoomDip,
  WORLD_UNITS_PER_VIEW_HEIGHT,
  zoomPunchCamera,
  type Film,
  type FilmScene,
  type Pose,
  type SceneNode,
  type Tick,
  type Transform,
  type Vec2,
} from '@motionforge/core';
import {
  addPoses,
  applyCostume,
  blinkOpenness,
  CHARACTER_TEMPLATES,
  characterNodes,
  emitEffectNodes,
  FACE_EXPRESSIONS,
  faceNodes,
  fk,
  blendPostures,
  GESTURE_KINDS,
  gesturePose,
  HEAD_ANCHOR_Z,
  idlePose,
  NEUTRAL_POSTURE,
  POSTURE_KINDS,
  posturePose,
  REACTION_KINDS,
  reactionFace,
  sampleEffect,
  SEAT_POSE,
} from '@motionforge/motion';

import {
  arrowPolygon,
  battleNodes,
  clipToFront,
  flagNodes,
  highlightPulse,
  marchNodes,
  morphRings,
  UNIT_KINDS,
  unpackColor,
} from '@motionforge/maps';

import { buildCardNodes } from './cards.js';
import { paperTextureNodes, stylePreset, type StylePreset } from './style.js';
import { shapeText } from './text.js';

export { WORLD_UNITS_PER_VIEW_HEIGHT } from '@motionforge/core';

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

/** Comic speech bubble (M8.4): rounded plate + tail + ink text, popping
 * in above the speaker's head. Local frame = the speaker instance. */
function speechBubble(
  text: string,
  characterSize: number,
  idPrefix: string,
  layer: number,
  popT: number,
): SceneNode {
  const run = shapeText('noto-sans', text);
  const size = 0.3;
  const s = size / run.upem;
  const textWidth = run.width * s;
  const bw = textWidth + 0.6;
  const bh = 0.72;
  const topY = 2.25 * characterSize + 0.55;
  const pop = ease('backOut', Math.min(1, popT));
  const ink = { r: 0x3a, g: 0x32, b: 0x26, a: 1 };
  return {
    id: idPrefix,
    layer,
    transform: compose(translation(0.3, topY), scaling(pop, pop)),
    children: [
      {
        id: `${idPrefix}/plate`,
        layer,
        shape: { kind: 'rect', width: bw, height: bh, rx: 0.3 },
        transform: translation(0, bh / 2),
        fill: { color: { r: 0xfd, g: 0xfa, b: 0xf1, a: 1 } },
        stroke: { color: ink, width: 0.035 },
      },
      {
        id: `${idPrefix}/tail`,
        layer,
        shape: {
          kind: 'polygon',
          points: [vec2(-0.25, 0.06), vec2(0.05, 0.06), vec2(-0.28, -0.42)],
        },
        fill: { color: { r: 0xfd, g: 0xfa, b: 0xf1, a: 1 } },
        stroke: { color: ink, width: 0.03 },
      },
      // Re-cover the tail/plate seam.
      {
        id: `${idPrefix}/seam`,
        layer: layer + 1,
        shape: { kind: 'rect', width: 0.34, height: 0.14 },
        transform: translation(-0.1, 0.1),
        fill: { color: { r: 0xfd, g: 0xfa, b: 0xf1, a: 1 } },
      },
      ...run.paths.map((glyph, gi): SceneNode => ({
        id: `${idPrefix}/g${gi}`,
        layer: layer + 2,
        transform: compose(
          translation(-textWidth / 2 + glyph.x * s, bh / 2 - 0.1 + glyph.y * s),
          scaling(s, s),
        ),
        shape: { kind: 'path', d: glyph.d },
        fill: { color: ink },
      })),
    ],
  };
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
  // Camera moves the pose system can't carry (M10.2): zoom-punch zooms
  // about its aim point, whip-dip pulls back mid-whip.
  let camera = {
    pos: vec2(cameraPos.x + cameraShift.x, cameraPos.y + cameraShift.y),
    zoom: sample<number>(scene.timeline, 'camera/zoom', localTick),
  };
  for (const effect of scene.effects) {
    if (effect.target !== 'camera') continue;
    if (localTick < effect.startTick || localTick >= effect.startTick + effect.durationTicks) {
      continue;
    }
    const t = (localTick - effect.startTick) / effect.durationTicks;
    if (effect.verb === 'zoom-punch') {
      const aim = vec2(effect.params.x ?? 0, effect.params.y ?? 0);
      camera = zoomPunchCamera(camera, aim, t, effect.params.punch ?? 1.45);
    } else if (effect.verb === 'whip-dip') {
      camera = { ...camera, zoom: camera.zoom * whipZoomDip(t) };
    } else if (effect.verb === 'camera-track' && effect.text) {
      // Damped-spring follow (M10.3): glide from the current framing onto
      // the target (pos track + effect shifts) and chase it.
      const id = effect.text;
      const ox = effect.params.ox ?? 0;
      const oy = effect.params.oy ?? 1;
      const aimAt = (tk: number): Vec2 => {
        const base = sample<Vec2>(scene.timeline, `${id}/pos`, tk);
        const shift =
          combinePoses(
            scene.effects.filter((e) => e.target === id).map((e) => sampleEffect(e, tk, film.seed)),
          ).translate ?? vec2(0, 0);
        return vec2(base.x + shift.x + ox, base.y + shift.y + oy);
      };
      const initial = sample<Vec2>(scene.timeline, 'camera/pos', effect.startTick);
      camera = {
        pos: dampedTrack(initial, aimAt, effect.startTick, localTick, effect.params.stiffness),
        zoom: camera.zoom,
      };
    }
  }
  const camX = camera.pos.x;
  const camY = camera.pos.y;
  const zoom = camera.zoom;

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

  // World content via the camera rig (M10.1) anchored at the parallax-
  // neutral origin; each node then gets its own depth-scaled camera offset.
  const worldTransform = cameraTransform({ pos: vec2(0, 0), zoom }, film);
  // Overlay content (cards, captions, texture, backdrop): screen-fixed —
  // no camera, no zoom.
  const overlayTransform = cameraTransform({ pos: vec2(0, 0), zoom: 1 }, film);

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

  /** World transform of a mount's saddle at this tick (M6.8). */
  const seatTransformFor = (mountId: string): Transform | undefined => {
    const mount = scene.instances.find((i) => i.id === mountId);
    const c = mount?.character;
    if (!mount || !c) return undefined;
    const template = CHARACTER_TEMPLATES[c.template]?.({ size: c.size, palette: c.palette });
    if (!template?.seat) return undefined;
    const pos = sample<Vec2>(scene.timeline, `${mountId}/pos`, localTick);
    const rot = sample<number>(scene.timeline, `${mountId}/rot`, localTick);
    const scale = sample<number>(scene.timeline, `${mountId}/scale`, localTick);
    const pose = poseFor(mountId);
    const shift = pose.translate ?? vec2(0, 0);
    const poseScale = pose.scale ?? vec2(1, 1);
    const root = compose(
      trs(
        vec2(pos.x + shift.x, pos.y + shift.y),
        rot + (pose.rotate ?? 0),
        vec2(scale * poseScale.x, scale * poseScale.y),
      ),
      scaling(c.facing === 'left' ? -1 : 1, 1),
    );
    const idleFn = template.idle ?? idlePose;
    const bones = fk(template.skeleton, idleFn(localTick, fnv1a(mountId) % 240), root);
    const bone = bones.get(template.seat.bone);
    if (!bone) return undefined;
    return compose(bone.transform, translation(template.seat.at.x, template.seat.at.y));
  };

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
        if (inst.character) {
          const build = CHARACTER_TEMPLATES[inst.character.template];
          if (!build) {
            throw new Error(`Unknown character template "${inst.character.template}"`);
          }
          const bare = build({ size: inst.character.size, palette: inst.character.palette });
          const dressed = applyCostume(
            bare,
            {
              pieces: inst.character.costume,
              mustache: inst.character.mustache,
              held: inst.character.held,
            },
            { idPrefix: `${inst.id}/costume`, layerBase: inst.layer },
          );
          const template = dressed.template;
          // Active reaction (M6.7) takes the face over for its window.
          const reaction = scene.effects.find(
            (e) =>
              e.verb === 'react' &&
              e.target === inst.id &&
              localTick >= e.startTick &&
              localTick < e.startTick + e.durationTicks,
          );
          let expression = FACE_EXPRESSIONS[inst.character.expression] ?? FACE_EXPRESSIONS.neutral!;
          let look = vec2(0.35, -0.08);
          let mouthOpen: number | undefined;
          if (reaction) {
            const rt =
              reaction.durationTicks === 0
                ? 1
                : (localTick - reaction.startTick) / reaction.durationTicks;
            const kind = REACTION_KINDS[reaction.params.kind ?? 0] ?? 'deadpan';
            const over = reactionFace(kind, rt);
            expression = over.expression;
            look = over.look ?? look;
            mouthOpen = over.mouthOpen;
          }
          // A character delivering a line flaps its mouth (M8.4) — a plain
          // two-frame flap at ~7 Hz, the genre's talking cycle.
          const activeLine = (scene.lines ?? []).find(
            (l) =>
              l.speaker === inst.id &&
              localTick >= l.startTick &&
              localTick < l.startTick + l.durationTicks,
          );
          if (activeLine) {
            expression = { ...expression, mouth: 'open' };
            mouthOpen = Math.floor((localTick - activeLine.startTick) / 9) % 2 === 0 ? 1 : 0.2;
          }
          // Quadrupeds draw their own face; bipeds get the face module.
          const face =
            template.hasFace === false
              ? undefined
              : faceNodes(
                  {
                    expression,
                    eyesOpen: blinkOpenness(scene.startTick + localTick, film.seed, inst.id),
                    look,
                    mouthOpen,
                  },
                  {
                    idPrefix: `${inst.id}/face`,
                    layerBase: inst.layer + HEAD_ANCHOR_Z,
                    headRadius: template.headRadius,
                    ink: template.palette.outline,
                    lid: template.palette.skin,
                  },
                );
          const idleFn = template.idle ?? idlePose;
          // A mounted rider sits in the mount's seat and rides its idle.
          const seat = inst.character.mount ? seatTransformFor(inst.character.mount) : undefined;
          let pose = seat
            ? addPoses(SEAT_POSE, idlePose(localTick, fnv1a(inst.id) % 240))
            : idleFn(localTick, fnv1a(inst.id) % 240);
          // Gestures (M8.2) layer on top of the idle/seat pose.
          for (const effect of scene.effects) {
            if (
              effect.verb !== 'gesture' ||
              effect.target !== inst.id ||
              localTick < effect.startTick ||
              localTick >= effect.startTick + effect.durationTicks
            ) {
              continue;
            }
            const gt =
              effect.durationTicks === 0
                ? 1
                : (localTick - effect.startTick) / effect.durationTicks;
            const kind = GESTURE_KINDS[effect.params.kind ?? 0] ?? 'point';
            pose = addPoses(pose, gesturePose(kind, gt));
          }
          // Postures (M8.3): blend from the previous held state, then hold.
          const postures = scene.effects
            .filter((e) => e.verb === 'posture' && e.target === inst.id && localTick >= e.startTick)
            .sort((a, b) => a.startTick - b.startTick);
          let posture = NEUTRAL_POSTURE;
          if (postures.length > 0) {
            const current = postures[postures.length - 1]!;
            const previous =
              postures.length > 1
                ? posturePose(
                    POSTURE_KINDS[postures[postures.length - 2]!.params.kind ?? 3] ?? 'stand',
                  )
                : NEUTRAL_POSTURE;
            const targetPosture = posturePose(POSTURE_KINDS[current.params.kind ?? 3] ?? 'stand');
            const pt =
              current.durationTicks === 0
                ? 1
                : Math.min(1, (localTick - current.startTick) / current.durationTicks);
            posture = blendPostures(previous, targetPosture, ease('cubicInOut', pt));
            pose = addPoses(pose, posture.pose);
          }
          // Bone keyframes (M8.6): `inst.bone` rotate frames join the pose.
          for (const effect of scene.effects) {
            if (effect.verb !== 'keyframes') continue;
            const dot = effect.target.indexOf('.');
            if (dot < 0 || effect.target.slice(0, dot) !== inst.id) continue;
            const boneId = effect.target.slice(dot + 1);
            const sampled = sampleEffect(effect, localTick, film.seed);
            if (sampled.rotate) pose = addPoses(pose, { [boneId]: sampled.rotate });
          }
          const rig = characterNodes(template, {
            idPrefix: inst.id,
            layerBase: inst.layer,
            at: vec2(0, 0),
            facing: inst.character.facing,
            // Per-character phase offset so a cast never breathes in sync.
            pose,
            headNodes: face ? [face, ...dressed.headNodes] : [...dressed.headNodes],
            handNodes: dressed.handNodes,
          });
          // Postures move the whole rig: drop toward the ground and/or tip
          // about the feet (lying down).
          const rooted =
            posture.drop !== 0 || posture.rotate !== 0
              ? {
                  id: `${inst.id}/posture-root`,
                  transform: compose(
                    translation(0, -posture.drop * inst.character.size),
                    rotation(posture.rotate),
                  ),
                  children: [rig],
                }
              : rig;
          // Comic speech bubble above the speaker while the line plays.
          const bubble = activeLine
            ? speechBubble(
                activeLine.text,
                inst.character.size,
                `${inst.id}/bubble`,
                inst.layer + 40,
                Math.min(1, (localTick - activeLine.startTick) / 8),
              )
            : undefined;
          return {
            ...base,
            ...(seat ? { transform: withParallax(inst.depth, seat) } : {}),
            children: bubble ? [rooted, bubble] : [rooted],
          };
        }
        if (!inst.object) {
          return { ...base, shape: inst.shape, fill: inst.fill, stroke: inst.stroke };
        }
        // Part poses: articulation effects targeting `instance.part`. The
        // roll verb reads the instance's cumulative travel track (ω = v/r).
        // Map verbs (M7.3) add overlay geometry from the region's polygons.
        const partPoses = new Map<string, Pose>();
        const mapOverlays: SceneNode[] = [];
        let overlayIndex = 0;
        for (const effect of scene.effects) {
          const dot = effect.target.indexOf('.');
          if (dot < 0 || effect.target.slice(0, dot) !== inst.id) continue;
          const partId = effect.target.slice(dot + 1);
          const active = localTick >= effect.startTick;
          // A morphing region hides; its morphed shape draws as an overlay.
          const partPose =
            effect.verb === 'map-morph' && active
              ? { opacity: 0 }
              : sampleEffect(
                  effect.verb === 'roll'
                    ? {
                        ...effect,
                        params: {
                          ...effect.params,
                          travel: sample<number>(scene.timeline, `${inst.id}/travel`, localTick),
                        },
                      }
                    : effect,
                  localTick,
                  film.seed,
                );
          const existing = partPoses.get(partId);
          partPoses.set(partId, existing ? combinePoses([existing, partPose]) : partPose);

          if (!effect.verb.startsWith('map-') || !active) continue;
          const part = inst.object.spec.parts.find((p) => p.id === partId);
          const rings = (part?.children ?? [])
            .map((c) => (c.shape?.kind === 'polygon' ? c.shape.points : undefined))
            .filter((r): r is Vec2[] => r !== undefined);
          if (rings.length === 0) continue;
          const t =
            effect.durationTicks === 0
              ? 1
              : Math.min(1, (localTick - effect.startTick) / effect.durationTicks);
          const layer = inst.layer + 800 + overlayIndex++;

          if (effect.verb === 'map-recolor') {
            const color = unpackColor(effect.params.color ?? 0);
            let minX = Infinity;
            let maxX = -Infinity;
            for (const ring of rings) {
              for (const p of ring) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
              }
            }
            const front = minX + (maxX - minX + 0.01) * ease('cubicInOut', t);
            rings.forEach((ring, ri) => {
              const clipped = t >= 1 ? [...ring] : clipToFront(ring, front);
              if (clipped.length < 3) return;
              mapOverlays.push({
                id: `${inst.id}/${effect.seed}/${ri}`,
                layer,
                shape: { kind: 'polygon', points: clipped },
                fill: { color },
              });
            });
          } else if (effect.verb === 'map-highlight') {
            if (localTick >= effect.startTick + effect.durationTicks) continue;
            const pulse = highlightPulse(t);
            if (pulse <= 0.01) continue;
            rings.forEach((ring, ri) => {
              mapOverlays.push({
                id: `${inst.id}/${effect.seed}/${ri}`,
                layer,
                opacity: 0.5 * pulse,
                shape: { kind: 'polygon', points: [...ring] },
                fill: { color: { r: 0xf2, g: 0xc1, b: 0x4e, a: 1 } },
              });
            });
          } else if (effect.verb === 'map-morph') {
            const toPart = inst.object.spec.parts[effect.params.to ?? -1];
            const toRing = (toPart?.children ?? [])
              .map((c) => (c.shape?.kind === 'polygon' ? c.shape.points : undefined))
              .find((r) => r !== undefined);
            if (!toRing) continue;
            const largest = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]!);
            const paint = part?.children?.[0];
            mapOverlays.push({
              id: `${inst.id}/${effect.seed}/morph`,
              layer,
              shape: {
                kind: 'polygon',
                points: morphRings(largest, toRing, ease('cubicInOut', t)),
              },
              fill: paint?.fill && 'color' in paint.fill ? paint.fill : undefined,
              stroke: paint?.stroke,
            });
            // Secondary rings (islands) fade during the morph.
            rings
              .filter((ring) => ring !== largest)
              .forEach((ring, ri) => {
                if (t >= 1) return;
                mapOverlays.push({
                  id: `${inst.id}/${effect.seed}/i${ri}`,
                  layer,
                  opacity: 1 - t,
                  shape: { kind: 'polygon', points: [...ring] },
                  fill: paint?.fill && 'color' in paint.fill ? paint.fill : undefined,
                });
              });
          }
        }
        // Arrows, marches, battles, flags (M7.4/M7.5) target the map
        // instance itself and draw in its local frame.
        for (const effect of scene.effects) {
          if (effect.target !== inst.id || !effect.verb.startsWith('map-')) continue;
          if (localTick < effect.startTick) continue;
          const raw =
            effect.durationTicks === 0 ? 1 : (localTick - effect.startTick) / effect.durationTicks;
          const t = Math.min(1, raw);
          const layer = inst.layer + 900 + overlayIndex++;

          if (effect.verb === 'map-arrow') {
            const polygon = arrowPolygon(
              vec2(effect.params.x0 ?? 0, effect.params.y0 ?? 0),
              vec2(effect.params.x1 ?? 0, effect.params.y1 ?? 0),
              ease('cubicOut', t),
              { width: effect.params.width, bow: effect.params.bow },
            );
            if (polygon.length < 3) continue;
            mapOverlays.push({
              id: `${inst.id}/${effect.seed}`,
              layer,
              shape: { kind: 'polygon', points: polygon },
              fill: { color: unpackColor(effect.params.color ?? 0xb5453c) },
              stroke: { color: { r: 0x3a, g: 0x28, b: 0x20, a: 1 }, width: 0.035 },
            });
          } else if (effect.verb === 'map-march') {
            mapOverlays.push({
              id: `${inst.id}/${effect.seed}`,
              layer,
              children: marchNodes(
                vec2(effect.params.x0 ?? 0, effect.params.y0 ?? 0),
                vec2(effect.params.x1 ?? 0, effect.params.y1 ?? 0),
                t,
                {
                  kind: UNIT_KINDS[effect.params.kind ?? 0] ?? 'infantry',
                  count: effect.params.count ?? 5,
                  color: unpackColor(effect.params.color ?? 0x4a4136),
                  bow: effect.params.bow ?? 0.12,
                  idPrefix: `${inst.id}/${effect.seed}`,
                  seed: effect.seed,
                  filmSeed: film.seed,
                },
              ),
            });
          } else if (effect.verb === 'map-battle') {
            if (localTick >= effect.startTick + effect.durationTicks) continue;
            mapOverlays.push({
              id: `${inst.id}/${effect.seed}`,
              layer,
              children: battleNodes(
                vec2(effect.params.x ?? 0, effect.params.y ?? 0),
                t,
                `${inst.id}/${effect.seed}`,
                effect.seed,
                film.seed,
              ),
            });
          } else if (effect.verb === 'map-flag') {
            // Unclamped time keeps the pennant waving after the pop.
            mapOverlays.push({
              id: `${inst.id}/${effect.seed}`,
              layer,
              children: flagNodes(
                vec2(effect.params.x ?? 0, effect.params.y ?? 0),
                raw,
                unpackColor(effect.params.color ?? 0xb5453c),
                `${inst.id}/${effect.seed}`,
              ),
            });
          } else if (effect.verb === 'map-label') {
            // Nameplate (M7.6): haloed text popping in at the anchor,
            // living in the map's frame so it pans/zooms with it.
            if (!effect.text) continue;
            const run = shapeText('noto-sans', effect.text);
            const s = (effect.params.size ?? 0.34) / run.upem;
            const pop = ease('backOut', t);
            const xStart = (-run.width * s) / 2;
            const labelLayer = inst.layer + 1200 + overlayIndex++;
            mapOverlays.push({
              id: `${inst.id}/${effect.seed}`,
              layer: labelLayer,
              transform: compose(
                translation(effect.params.x ?? 0, effect.params.y ?? 0),
                scaling(pop, pop),
              ),
              children: run.paths.flatMap((glyph, gi): SceneNode[] => {
                const glyphTransform = compose(
                  translation(xStart + glyph.x * s, glyph.y * s),
                  scaling(s, s),
                );
                return [
                  {
                    id: `${inst.id}/${effect.seed}/h${gi}`,
                    layer: labelLayer,
                    transform: glyphTransform,
                    shape: { kind: 'path', d: glyph.d },
                    fill: { color: { r: 0xf4, g: 0xed, b: 0xdb, a: 1 } },
                    stroke: {
                      color: { r: 0xf4, g: 0xed, b: 0xdb, a: 1 },
                      width: run.upem * 0.09,
                    },
                  },
                  {
                    id: `${inst.id}/${effect.seed}/g${gi}`,
                    layer: labelLayer + 1,
                    transform: glyphTransform,
                    shape: { kind: 'path', d: glyph.d },
                    fill: { color: { r: 0x3a, g: 0x32, b: 0x26, a: 1 } },
                  },
                ];
              }),
            });
            overlayIndex++; // the ink layer above the halo
          }
        }
        return {
          ...base,
          children: [
            instantiateObject(inst.object.spec, inst.object.options, partPoses),
            ...mapOverlays,
          ],
        };
      }),
      // Cartoon FX geometry, anchored at the target's current position.
      // Characters anchor FX near the head (their position is the feet).
      ...scene.effects.flatMap((effect, ei): SceneNode[] => {
        const emitted = emitEffectNodes(effect, localTick, film.seed);
        if (emitted.length === 0) return [];
        const inst = scene.instances.find((i) => i.id === effect.target);
        const anchor = inst
          ? sample<Vec2>(scene.timeline, `${inst.id}/pos`, localTick)
          : vec2(0, 0);
        const lift = inst?.character ? 1.1 * inst.character.size : 0;
        return [
          {
            id: `fx-${ei}`,
            depth: inst?.depth ?? 0.2,
            layer: (inst?.layer ?? 0) + 30,
            transform: withParallax(inst?.depth ?? 0.2, translation(anchor.x, anchor.y + lift)),
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
