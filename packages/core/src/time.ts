/**
 * The tick clock. Time inside the engine is *integer ticks* on a fixed
 * 120 Hz clock (ADR-0004). Authors write seconds in MFS; the compiler
 * converts once at the language boundary. Frame N of an fps-rate output
 * samples the tick returned by `tickForFrame`.
 */

/** Ticks per second. 120 divides evenly into 24/30/60 fps frame times. */
export const TICKS_PER_SECOND = 120;

/** A count of whole ticks. Branded number for documentation purposes. */
export type Tick = number;

/** Seconds → whole ticks, round half up. The only seconds→ticks door. */
export function secondsToTicks(seconds: number): Tick {
  if (!Number.isFinite(seconds)) throw new Error(`Invalid seconds: ${seconds}`);
  return Math.round(seconds * TICKS_PER_SECOND);
}

export const ticksToSeconds = (ticks: Tick): number => ticks / TICKS_PER_SECOND;

/** Supported output frame rates divide the tick clock exactly. */
export function ticksPerFrame(fps: number): number {
  if (!Number.isInteger(fps) || fps <= 0 || TICKS_PER_SECOND % fps !== 0) {
    throw new Error(`Unsupported fps ${fps}: must divide ${TICKS_PER_SECOND} evenly`);
  }
  return TICKS_PER_SECOND / fps;
}

/** The tick sampled by frame N (0-based) at the given output fps. */
export const tickForFrame = (frame: number, fps: number): Tick => frame * ticksPerFrame(fps);

/** Number of frames covering `durationTicks` at fps (final partial frame included). */
export const frameCount = (durationTicks: Tick, fps: number): number =>
  Math.ceil(durationTicks / ticksPerFrame(fps));
