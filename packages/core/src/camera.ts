/**
 * Camera rig (M10.1, plan §5): the film camera as one value — position +
 * zoom over the y-up world — with everything that depends on it defined
 * here once: the world→screen transform, the zoom limits, world-bounds
 * clamping (never show past the edge of a stage or map), and cinematic
 * letterbox bar geometry. The frame builder, the compiler's `zoom-to`,
 * and the M10 camera moves all consume this module, so "what the camera
 * sees" has a single definition.
 */

import {
  clamp,
  compose,
  scaling,
  translation,
  vec2,
  ZERO,
  type Transform,
  type Vec2,
} from './math.js';

/** World units spanning the viewport height at zoom 1 (schema doc). */
export const WORLD_UNITS_PER_VIEW_HEIGHT = 10;

/** Zoom limits: wider than 0.5× shrinks the ink to mush; past 6× the
 * vector shapes read as raw geometry. `zoom-to` and camera moves clamp
 * through here. */
export const CAMERA_MIN_ZOOM = 0.5;
export const CAMERA_MAX_ZOOM = 6;

/** The camera as a value: where it looks and how tight. */
export interface CameraState {
  readonly pos: Vec2;
  readonly zoom: number;
}

export const DEFAULT_CAMERA: CameraState = { pos: ZERO, zoom: 1 };

/** Output pixel viewport. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Axis-aligned world rectangle, y-up. */
export interface WorldRect {
  readonly min: Vec2;
  readonly max: Vec2;
}

/** Screen-pixel rectangle, y-down (SVG convention). */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const clampZoom = (zoom: number): number => clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);

/** The world rectangle visible on the depth-0.5 (parallax-neutral) plane. */
export function cameraView(state: CameraState, viewport: Viewport): WorldRect {
  const halfH = WORLD_UNITS_PER_VIEW_HEIGHT / 2 / state.zoom;
  const halfW = halfH * (viewport.width / viewport.height);
  return {
    min: vec2(state.pos.x - halfW, state.pos.y - halfH),
    max: vec2(state.pos.x + halfW, state.pos.y + halfH),
  };
}

/**
 * World → screen-pixel transform: `pos` lands on the screen center, y is
 * flipped, and `WORLD_UNITS_PER_VIEW_HEIGHT / zoom` world units span the
 * viewport height.
 */
export function cameraTransform(state: CameraState, viewport: Viewport): Transform {
  const unit = (viewport.height / WORLD_UNITS_PER_VIEW_HEIGHT) * state.zoom;
  return compose(
    translation(viewport.width / 2, viewport.height / 2),
    compose(scaling(unit, -unit), translation(-state.pos.x, -state.pos.y)),
  );
}

/**
 * Keep the whole view inside `bounds`: zoom in as far as needed for the
 * view to fit, then clamp the position. An axis whose bounds are still
 * narrower than the view (even at CAMERA_MAX_ZOOM) centers on it instead
 * of jittering between the two edges.
 */
export function clampCamera(
  state: CameraState,
  bounds: WorldRect,
  viewport: Viewport,
): CameraState {
  const aspect = viewport.width / viewport.height;
  const boundsW = bounds.max.x - bounds.min.x;
  const boundsH = bounds.max.y - bounds.min.y;
  const zoom = clampZoom(
    Math.max(
      state.zoom,
      WORLD_UNITS_PER_VIEW_HEIGHT / boundsH,
      (WORLD_UNITS_PER_VIEW_HEIGHT * aspect) / boundsW,
    ),
  );
  const halfH = WORLD_UNITS_PER_VIEW_HEIGHT / 2 / zoom;
  const halfW = halfH * aspect;
  const axis = (value: number, lo: number, hi: number, half: number): number =>
    hi - lo < half * 2 ? (lo + hi) / 2 : clamp(value, lo + half, hi - half);
  return {
    pos: vec2(
      axis(state.pos.x, bounds.min.x, bounds.max.x, halfW),
      axis(state.pos.y, bounds.min.y, bounds.max.y, halfH),
    ),
    zoom,
  };
}

/**
 * Cinematic letterbox: the black bars that mask the frame down to
 * `targetAspect`. Wider targets get top/bottom bars, narrower targets get
 * left/right pillars, a matching aspect gets none.
 */
export function letterboxBars(viewport: Viewport, targetAspect: number): readonly ScreenRect[] {
  const { width, height } = viewport;
  const frameAspect = width / height;
  const epsilon = 1e-6;
  if (targetAspect > frameAspect + epsilon) {
    const bar = (height - width / targetAspect) / 2;
    return [
      { x: 0, y: 0, width, height: bar },
      { x: 0, y: height - bar, width, height: bar },
    ];
  }
  if (targetAspect < frameAspect - epsilon) {
    const bar = (width - height * targetAspect) / 2;
    return [
      { x: 0, y: 0, width: bar, height },
      { x: width - bar, y: 0, width: bar, height },
    ];
  }
  return [];
}
