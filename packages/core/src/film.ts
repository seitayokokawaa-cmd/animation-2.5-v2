/**
 * Film IR — the compiled, engine-facing form of a screenplay. The language
 * package compiles MFS into this; the render package consumes it. It lives
 * in core so the two stay independent (core ← lang/render, ADR-0005 tiers).
 *
 * All values are engine units: ticks, radians, world units, parsed colors.
 */

import type { Color } from './color.js';
import type { Vec2 } from './math.js';
import type { Fill, Shape, Stroke } from './scene.js';
import type { Tick } from './time.js';
import type { Timeline } from './timeline.js';

export interface FilmInstance {
  readonly id: string;
  readonly shape: Shape;
  readonly fill?: Fill;
  readonly stroke?: Stroke;
  readonly depth: number;
  readonly layer: number;
}

export interface FilmCaption {
  readonly text: string;
  /** Scene-local. */
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  /** World units. */
  readonly at: Vec2;
  /** World units tall (cap height ≈ em). */
  readonly size: number;
  readonly color: Color;
  /** Bundled font name, e.g. `noto-sans`. */
  readonly font: string;
}

/** A frozen narration segment scheduled inside a scene (audio mixed M3.6). */
export interface FilmNarrationSegment {
  /** Lock key, `sceneId/index`. */
  readonly key: string;
  /** Voice-cache content hash of the frozen WAV. */
  readonly hash: string;
  /** Scene-local. */
  readonly startTick: Tick;
  readonly durationTicks: Tick;
}

/**
 * A motion-graphics verb applied to an instance (or `camera`) for a tick
 * window. Sampled by the verb registry (in `motion`) at render time —
 * pure per tick, seeded via `seed` (ADR-0008).
 */
export interface FilmEffect {
  /** Instance id, or `camera`. */
  readonly target: string;
  /** Registry verb name, e.g. `pop-in`, `wiggle`, `shake`. */
  readonly verb: string;
  /** Scene-local. */
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly params: Readonly<Record<string, number>>;
  /** Noise stream name, unique per effect. */
  readonly seed: string;
}

export type CardStyle = 'date' | 'chapter' | 'list' | 'quote' | 'note' | 'label';
export type CardEntrance = 'pop' | 'slam';

/** A card/label/cutaway (M4.5) — timed overlay panels with text or content. */
export interface FilmCard {
  readonly style: CardStyle;
  readonly text?: string;
  /** List cards: items pop in one by one. */
  readonly items?: readonly string[];
  /** World units; default screen center. */
  readonly at: Vec2;
  /** Scene-local. */
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  /** Text height in world units. */
  readonly size: number;
  readonly entrance: CardEntrance;
  readonly font: string;
  /** Framed cutaway content (a shape snippet inside a paper frame). */
  readonly content?: {
    readonly shape: Shape;
    readonly fill?: Fill;
    readonly stroke?: Stroke;
    readonly scale: number;
  };
}

export interface FilmScene {
  readonly id: string;
  /** Film-global tick where this scene starts. */
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly narration: readonly FilmNarrationSegment[];
  readonly effects: readonly FilmEffect[];
  readonly cards: readonly FilmCard[];
  readonly instances: readonly FilmInstance[];
  /**
   * Scene-local tracks: `<instance>/pos` (Vec2), `<instance>/rot` (radians),
   * `<instance>/scale` (number), `camera/pos` (Vec2), `camera/zoom` (number).
   */
  readonly timeline: Timeline;
  readonly captions: readonly FilmCaption[];
}

export interface Film {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly seed: number;
  readonly background?: Color;
  readonly durationTicks: Tick;
  readonly scenes: readonly FilmScene[];
}

/** The scene covering a film tick (the last scene owns the final instant). */
export function sceneAtTick(film: Film, tick: Tick): FilmScene {
  for (const scene of film.scenes) {
    if (tick >= scene.startTick && tick < scene.startTick + scene.durationTicks) return scene;
  }
  const last = film.scenes[film.scenes.length - 1];
  if (!last) throw new Error('Film has no scenes');
  return last;
}
