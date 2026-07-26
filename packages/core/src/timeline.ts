/**
 * Timeline core. A timeline is pure data: named tracks of non-overlapping
 * tween clips plus discrete events. Sampling at a tick is a pure function —
 * no cursor, no accumulation — so frame N never depends on frame N−1.
 */

import { ease } from './easing.js';
import { frameCount, tickForFrame, type Tick } from './time.js';

export interface Clip<T> {
  readonly start: Tick;
  readonly duration: Tick;
  readonly from: T;
  readonly to: T;
  /** Easing name (see EASING_NAMES); default linear. */
  readonly easing?: string;
}

export interface Track<T> {
  readonly name: string;
  /** Value before the first clip starts. */
  readonly initial: T;
  /** Clips sorted by start; may touch (end == next start) but not overlap. */
  readonly clips: readonly Clip<T>[];
  readonly lerp: (a: T, b: T, t: number) => T;
}

export interface TimelineEvent {
  readonly tick: Tick;
  readonly name: string;
  readonly payload?: unknown;
}

/**
 * Type-erased track. `Track<T>` is invariant in T (lerp takes T), so a
 * heterogeneous timeline stores tracks with the type parameter erased.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTrack = Track<any>;

export interface Timeline {
  readonly tracks: ReadonlyMap<string, AnyTrack>;
  readonly events: readonly TimelineEvent[];
  readonly durationTicks: Tick;
}

export function createTrack<T>(
  name: string,
  initial: T,
  clips: readonly Clip<T>[],
  lerp: (a: T, b: T, t: number) => T,
): Track<T> {
  const sorted = [...clips].sort((a, b) => a.start - b.start || a.duration - b.duration);
  for (const clip of sorted) {
    if (!Number.isInteger(clip.start) || clip.start < 0) {
      throw new Error(`Track ${name}: clip start ${clip.start} must be a non-negative tick`);
    }
    if (!Number.isInteger(clip.duration) || clip.duration < 0) {
      throw new Error(
        `Track ${name}: clip duration ${clip.duration} must be a non-negative tick count`,
      );
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.start < prev.start + prev.duration) {
      throw new Error(
        `Track ${name}: clips overlap at ticks ${cur.start} < ${prev.start + prev.duration}`,
      );
    }
  }
  return { name, initial, clips: sorted, lerp };
}

/** Sample a track at a tick: hold-before, eased tween inside, hold-after. */
export function sampleTrack<T>(track: Track<T>, tick: Tick): T {
  let value = track.initial;
  for (const clip of track.clips) {
    if (tick < clip.start) break;
    const end = clip.start + clip.duration;
    if (tick >= end) {
      value = clip.to;
      continue;
    }
    const t = clip.duration === 0 ? 1 : (tick - clip.start) / clip.duration;
    return track.lerp(clip.from, clip.to, ease(clip.easing ?? 'linear', t));
  }
  return value;
}

export function createTimeline(
  tracks: readonly AnyTrack[],
  events: readonly TimelineEvent[] = [],
  minDuration: Tick = 0,
): Timeline {
  const map = new Map<string, AnyTrack>();
  for (const track of tracks) {
    if (map.has(track.name)) throw new Error(`Duplicate track name: ${track.name}`);
    map.set(track.name, track);
  }
  const sortedEvents = [...events].sort((a, b) => a.tick - b.tick || a.name.localeCompare(b.name));
  let duration = minDuration;
  for (const track of tracks) {
    for (const clip of track.clips) duration = Math.max(duration, clip.start + clip.duration);
  }
  for (const event of sortedEvents) duration = Math.max(duration, event.tick);
  return { tracks: map, events: sortedEvents, durationTicks: duration };
}

/** Sample one named track (throws on unknown name — validator's job first). */
export function sample<T>(timeline: Timeline, trackName: string, tick: Tick): T {
  const track = timeline.tracks.get(trackName);
  if (!track) throw new Error(`Unknown track: ${JSON.stringify(trackName)}`);
  return sampleTrack(track as Track<T>, tick);
}

/** Events with tick in [fromTick, toTick) — the audio/trigger bus query. */
export const eventsBetween = (timeline: Timeline, fromTick: Tick, toTick: Tick): TimelineEvent[] =>
  timeline.events.filter((e) => e.tick >= fromTick && e.tick < toTick);

/** The frame schedule: every output frame with the tick it samples. */
export function* frames(timeline: Timeline, fps: number): Generator<{ frame: number; tick: Tick }> {
  const n = frameCount(timeline.durationTicks, fps);
  for (let frame = 0; frame < n; frame++) {
    yield { frame, tick: tickForFrame(frame, fps) };
  }
}
