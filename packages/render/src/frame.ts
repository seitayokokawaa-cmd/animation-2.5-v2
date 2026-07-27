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
  emitSvgLayers,
  fnv1a,
  IDENTITY,
  instantiateObject,
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
  type Color,
  type DrawItem,
  type Film,
  type FilmScene,
  type FilmSubtitle,
  type FilmTransition,
  type Pose,
  type SceneNode,
  type SvgLayer,
  type Tick,
  type Transform,
  type Vec2,
} from '@motionforge/core';
import {
  addPoses,
  applyCostume,
  blinkOpenness,
  GAIT_KINDS,
  gaitSample,
  holdersAt,
  LOCOMOTION_KINDS,
  locomotionPose,
  RAGDOLL_IMPULSE,
  ragdollPose,
  twoBoneIk,
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

/** Painter-sorted draw items for one scene at a film-global tick. */
function sceneDrawItems(film: Film, scene: FilmScene, tick: Tick): DrawItem[] {
  const localTick = Math.max(0, Math.min(tick - scene.startTick, scene.durationTicks));
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

  // Interactions (M14.6): who holds which item right now. Held shape
  // instances hide and ride their holder's hand instead.
  const heldBy = holdersAt(scene.effects, localTick);

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
          // Planted gait (M14.1): solve the legs from the pos track's
          // travel; the body drop/lean joins the posture root below.
          let gaitDrop = 0;
          let gaitLean = 0;
          for (const effect of scene.effects) {
            if (
              effect.verb !== 'gait' ||
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
            const kind = GAIT_KINDS[effect.params.kind ?? 0] ?? 'walk';
            const gait = gaitSample(
              kind,
              (effect.params.distance ?? 0) * gt,
              inst.character.size,
              effect.params.dir ?? 1,
            );
            pose = addPoses(pose, gait.pose);
            gaitDrop += gait.drop;
            gaitLean += gait.lean * (inst.character.facing === 'left' ? 1 : -1);
          }
          // Locomotion cycles (M14.2): climb/swim/fly bone curves layer on
          // like gestures; the registry sample carries the body bob/roll.
          for (const effect of scene.effects) {
            const kind = LOCOMOTION_KINDS.find((k) => k === effect.verb);
            if (
              !kind ||
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
            pose = addPoses(pose, locomotionPose(kind, (effect.params.cycles ?? 1) * gt));
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
          // Reach (M14.6): IK the near arm toward a character-relative
          // point, blending in and back out across the window.
          for (const effect of scene.effects) {
            if (
              effect.verb !== 'reach' ||
              effect.target !== inst.id ||
              localTick < effect.startTick ||
              localTick >= effect.startTick + effect.durationTicks
            ) {
              continue;
            }
            const rt =
              effect.durationTicks === 0
                ? 1
                : (localTick - effect.startTick) / effect.durationTicks;
            const blend = Math.sin(Math.PI * rt);
            const dir = inst.character.facing === 'left' ? -1 : 1;
            // Rig space is facing-right; mirror the world-x offset.
            const target = vec2((effect.params.dx ?? 0.6) * dir, effect.params.dy ?? 0.6);
            const bones = fk(template.skeleton, pose);
            const upper = bones.get('arm-r-upper');
            const lower = bones.get('arm-r-lower');
            if (!upper || !lower) continue;
            const sol = twoBoneIk(upper.start, target, upper.bone.length, lower.bone.length, -1);
            const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
            const dUpper = wrap(sol.upper - upper.angle);
            const dLower = wrap(sol.lower - lower.angle - dUpper);
            pose = addPoses(pose, {
              'arm-r-upper': dUpper * blend,
              'arm-r-lower': dLower * blend,
            });
          }
          // Ragdoll (M14.4): a full-body physics takeover — the tumbled
          // pose replaces the acting pose and the root shift carries the
          // body to where it fell (blended back during recovery).
          let ragdollShiftX = 0;
          let ragdollShiftY = 0;
          for (const effect of scene.effects) {
            if (
              effect.verb !== 'ragdoll' ||
              effect.target !== inst.id ||
              localTick < effect.startTick ||
              localTick >= effect.startTick + effect.durationTicks
            ) {
              continue;
            }
            const sampled = ragdollPose(
              template,
              idleFn(effect.startTick, fnv1a(inst.id) % 240),
              vec2(effect.params.ix ?? RAGDOLL_IMPULSE.x, effect.params.iy ?? RAGDOLL_IMPULSE.y),
              localTick - effect.startTick,
              effect.durationTicks,
            );
            pose = sampled.pose;
            posture = NEUTRAL_POSTURE;
            gaitDrop = 0;
            gaitLean = 0;
            // Rig space is facing-right; the mirror flips world x.
            ragdollShiftX = sampled.shift.x * (inst.character.facing === 'left' ? -1 : 1);
            ragdollShiftY = sampled.shift.y;
          }
          // Carried items (M14.6): shapes attached to this character draw
          // in the hand-anchor frame and follow the arm through poses.
          const carriedNodes = scene.instances
            .filter((it) => it.shape && heldBy.get(it.id) === inst.id)
            .map((it): SceneNode => ({
              id: `${inst.id}/carry/${it.id}`,
              // The grip frame's +x points world-up at rest; rotate the
              // item back so it rides upright in the palm.
              transform: compose(
                translation(0.06 * inst.character!.size, 0),
                rotation(-Math.PI / 2),
              ),
              shape: it.shape,
              ...(it.fill ? { fill: it.fill } : {}),
              ...(it.stroke ? { stroke: it.stroke } : {}),
            }));
          const rig = characterNodes(template, {
            idPrefix: inst.id,
            layerBase: inst.layer,
            at: vec2(0, 0),
            facing: inst.character.facing,
            // Per-character phase offset so a cast never breathes in sync.
            pose,
            headNodes: face ? [face, ...dressed.headNodes] : [...dressed.headNodes],
            handNodes: [...dressed.handNodes, ...carriedNodes],
          });
          // Postures move the whole rig: drop toward the ground and/or tip
          // about the feet (lying down).
          const rootDrop = posture.drop * inst.character.size + gaitDrop;
          const rootRotate = posture.rotate + gaitLean;
          const rooted =
            rootDrop !== 0 || rootRotate !== 0 || ragdollShiftX !== 0 || ragdollShiftY !== 0
              ? {
                  id: `${inst.id}/posture-root`,
                  transform: compose(
                    translation(ragdollShiftX, ragdollShiftY - rootDrop),
                    rotation(rootRotate),
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
          // A held shape hides here — its holder draws it in-hand (M14.6).
          if (heldBy.has(inst.id)) return { ...base, opacity: 0 };
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

  return painterSort(flattenScene(root));
}

/** Screen-tint stacks per grade (M10.5) — the "light version" of grading. */
const GRADE_OVERLAYS: Record<string, Array<{ color: Color; opacity: number }>> = {
  day: [],
  dawn: [{ color: { r: 0xe9, g: 0xa0, b: 0x5c, a: 1 }, opacity: 0.13 }],
  dusk: [
    { color: { r: 0xd9, g: 0x7b, b: 0x3f, a: 1 }, opacity: 0.15 },
    { color: { r: 0x2b, g: 0x1a, b: 0x3a, a: 1 }, opacity: 0.1 },
  ],
  night: [
    { color: { r: 0x22, g: 0x3a, b: 0x8c, a: 1 }, opacity: 0.38 },
    { color: { r: 0x05, g: 0x09, b: 0x14, a: 1 }, opacity: 0.08 },
  ],
};

/**
 * Drop items that lie fully outside the viewport. Only applied to
 * opacity-wrapped crossfade layers (M10.5): the pinned resvg build
 * panics on offscreen geometry inside a `<g opacity>` layer, and culling
 * there is invisible by definition. Paths are kept (no cheap safe bbox).
 */
function cullOffscreen(
  items: readonly DrawItem[],
  width: number,
  height: number,
): readonly DrawItem[] {
  return items.filter((item) => {
    const s = item.shape;
    let corners: Vec2[];
    if (s.kind === 'rect') {
      const hw = s.width / 2;
      const hh = s.height / 2;
      corners = [vec2(-hw, -hh), vec2(hw, -hh), vec2(-hw, hh), vec2(hw, hh)];
    } else if (s.kind === 'circle') {
      corners = [vec2(-s.r, -s.r), vec2(s.r, -s.r), vec2(-s.r, s.r), vec2(s.r, s.r)];
    } else if (s.kind === 'ellipse') {
      corners = [vec2(-s.rx, -s.ry), vec2(s.rx, -s.ry), vec2(-s.rx, s.ry), vec2(s.rx, s.ry)];
    } else if (s.kind === 'polygon') {
      if (s.points.length === 0) return false;
      corners = [...s.points];
    } else {
      return true; // path: keep
    }
    const m = item.worldTransform;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      const x = m.a * c.x + m.c * c.y + m.e;
      const y = m.b * c.x + m.d * c.y + m.f;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = item.stroke
      ? item.stroke.width * Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d))
      : 0;
    return maxX + pad >= 0 && minX - pad <= width && maxY + pad >= 0 && minY - pad <= height;
  });
}

/**
 * The active subtitle as a broadcast lower-third (M11.2): translucent ink
 * plate + warm-white shaped text, bottom-center, own emit layer so grading
 * never dims it. When chunks overlap (a character line over narration) the
 * latest-starting one wins — one subtitle at a time.
 */
function subtitleItems(film: Film, scene: FilmScene, tick: Tick): DrawItem[] {
  const localTick = Math.max(0, Math.min(tick - scene.startTick, scene.durationTicks));
  let sub: FilmSubtitle | undefined;
  for (const candidate of scene.subtitles ?? []) {
    if (localTick < candidate.startTick) continue;
    if (localTick >= candidate.startTick + candidate.durationTicks) continue;
    if (!sub || candidate.startTick >= sub.startTick) sub = candidate;
  }
  if (!sub) return [];
  const run = shapeText(sub.font, sub.text);
  const s = sub.size / run.upem;
  const textWidth = run.width * s;
  const baseUnit = film.height / WORLD_UNITS_PER_VIEW_HEIGHT;
  const overlay = compose(
    translation(film.width / 2, film.height / 2),
    scaling(baseUnit, -baseUnit),
  );
  const y = -4.15; // baseline, world units — a caption-safe lower band
  return flattenScene({
    id: 'subtitle',
    transform: overlay,
    children: [
      {
        id: 'subtitle-plate',
        shape: { kind: 'rect', width: textWidth + 0.6, height: sub.size * 1.9, rx: 0.1 },
        transform: translation(0, y + sub.size * 0.32),
        fill: { color: { r: 0x14, g: 0x10, b: 0x0c, a: 0.62 } },
      },
      ...run.paths.map((glyph, gi): SceneNode => ({
        id: `subtitle-g${gi}`,
        transform: compose(
          translation(-textWidth / 2 + glyph.x * s, y + glyph.y * s),
          scaling(s, s),
        ),
        shape: { kind: 'path', d: glyph.d },
        fill: { color: { r: 0xfd, g: 0xfa, b: 0xf1, a: 1 } },
      })),
    ],
  });
}

/** A scene's grade tints as draw items (screen-space px). */
function gradeItems(film: Film, grade: string | undefined, idPrefix: string): DrawItem[] {
  const tints = GRADE_OVERLAYS[grade ?? 'day'] ?? [];
  if (tints.length === 0) return [];
  return flattenScene({
    id: idPrefix,
    children: tints.map((tint, i) => ({
      id: `${idPrefix}-${i}`,
      opacity: tint.opacity,
      transform: translation(film.width / 2, film.height / 2),
      shape: { kind: 'rect', width: film.width, height: film.height },
      fill: { color: tint.color },
    })),
  });
}

/** Default masking ink for fade/wipe/iris. */
const TRANSITION_INK: Color = { r: 0x1f, g: 0x1a, b: 0x14, a: 1 };

/**
 * The cover geometry for fade/wipe/iris at whole-window progress T ∈
 * [0,1] (fully covering at T = 0.5, the scene boundary). Screen-space px.
 */
function transitionCoverNodes(film: Film, transition: FilmTransition, T: number): SceneNode[] {
  const w = film.width;
  const h = film.height;
  const fill = { color: transition.color ?? TRANSITION_INK };
  if (transition.kind === 'fade') {
    const opacity = 1 - Math.abs(1 - 2 * T);
    if (opacity <= 0) return [];
    return [
      {
        id: 'transition-fade',
        opacity,
        transform: translation(w / 2, h / 2),
        shape: { kind: 'rect', width: w, height: h },
        fill,
      },
    ];
  }
  if (transition.kind === 'wipe') {
    // One cover sweeping left → right: offscreen, covering at the cut,
    // offscreen again.
    const x = (2 * T - 1) * w;
    if (x <= -w || x >= w) return [];
    return [
      {
        id: 'transition-wipe',
        transform: translation(x + w / 2, h / 2),
        shape: { kind: 'rect', width: w, height: h },
        fill,
      },
    ];
  }
  // Iris: a ring covering everything outside a shrinking/growing circle.
  const rMax = Math.hypot(w, h) / 2;
  const r = rMax * Math.abs(1 - 2 * T);
  if (r >= rMax) return [];
  const cx = w / 2;
  const cy = h / 2;
  // Outer rect clockwise, inner circle counter-clockwise — nonzero fill
  // leaves the ring.
  const d =
    `M0 0H${film.width}V${film.height}H0Z ` +
    `M${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}Z`;
  return [{ id: 'transition-iris', shape: { kind: 'path', d }, fill }];
}

/** Build the complete SVG frame for a film-global tick (M10.5 layers). */
export function buildFrameSvg(film: Film, tick: Tick): string {
  const scene = sceneAtTick(film, tick);
  const sceneIndex = film.scenes.indexOf(scene);
  const layers: SvgLayer[] = [];

  // Crossfade (M10.5): the previous scene holds its final pose underneath
  // while this scene dissolves in as one composited group.
  const cross =
    scene.transition?.kind === 'crossfade' &&
    tick - scene.startTick < scene.transition.durationTicks
      ? scene.transition
      : undefined;
  if (cross) {
    const prev = film.scenes[sceneIndex - 1];
    if (prev) {
      // The outgoing scene keeps its own grade while it dissolves away.
      layers.push({
        items: [...sceneDrawItems(film, prev, tick), ...gradeItems(film, prev.grade, 'grade-prev')],
      });
    }
    // This scene's grade rides inside its dissolving group.
    const t = (tick - scene.startTick) / cross.durationTicks;
    layers.push({
      items: cullOffscreen(
        [...sceneDrawItems(film, scene, tick), ...gradeItems(film, scene.grade, 'grade')],
        film.width,
        film.height,
      ),
      opacity: ease('cubicInOut', t),
    });
  } else {
    // Grading (M10.5): tint the finished frame.
    layers.push({ items: sceneDrawItems(film, scene, tick) });
    const grade = gradeItems(film, scene.grade, 'grade');
    if (grade.length > 0) layers.push({ items: grade });
  }

  // Subtitles (M11.2) paint above the grade so night scenes stay readable.
  const subtitle = subtitleItems(film, scene, tick);
  if (subtitle.length > 0) layers.push({ items: subtitle });

  // Masked transitions (fade/wipe/iris) straddle the boundary: the tail
  // of the outgoing scene covers up, the head of this scene reveals.
  const coverNodes: SceneNode[] = [];
  const own = scene.transition;
  if (own && own.kind !== 'crossfade' && tick - scene.startTick < own.durationTicks / 2) {
    const T = 0.5 + (tick - scene.startTick) / own.durationTicks;
    coverNodes.push(...transitionCoverNodes(film, own, T));
  }
  const next = film.scenes[sceneIndex + 1];
  if (next?.transition && next.transition.kind !== 'crossfade') {
    const d = next.transition.durationTicks;
    const untilCut = next.startTick - tick;
    if (untilCut <= d / 2 && untilCut > 0) {
      const T = 0.5 - untilCut / d;
      coverNodes.push(...transitionCoverNodes(film, next.transition, T));
    }
  }
  if (coverNodes.length > 0) {
    layers.push({ items: flattenScene({ id: 'transition', children: coverNodes }) });
  }

  const preset = stylePreset(film.style);
  return emitSvgLayers(layers, {
    width: film.width,
    height: film.height,
    background: formatColor(film.background ?? preset.background),
  });
}
