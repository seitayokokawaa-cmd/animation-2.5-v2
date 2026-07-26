import { describe, expect, it } from 'vitest';

import {
  frameCount,
  secondsToTicks,
  tickForFrame,
  TICKS_PER_SECOND,
  ticksPerFrame,
  ticksToSeconds,
} from './time.js';

describe('tick clock', () => {
  it('runs at 120 Hz, divisible by all target frame rates', () => {
    expect(TICKS_PER_SECOND).toBe(120);
    for (const fps of [24, 30, 60]) expect(TICKS_PER_SECOND % fps).toBe(0);
  });

  it('converts seconds to whole ticks, round half up', () => {
    expect(secondsToTicks(1)).toBe(120);
    expect(secondsToTicks(0.5)).toBe(60);
    expect(secondsToTicks(1 / 3)).toBe(40);
    expect(secondsToTicks(0.0042)).toBe(1); // 0.504 ticks → 1
    expect(secondsToTicks(0.004)).toBe(0); // 0.48 ticks → 0
    expect(ticksToSeconds(180)).toBe(1.5);
  });

  it('rejects non-finite seconds', () => {
    expect(() => secondsToTicks(Number.NaN)).toThrow(/Invalid seconds/);
    expect(() => secondsToTicks(Infinity)).toThrow(/Invalid seconds/);
  });

  it('maps frames to ticks exactly', () => {
    expect(ticksPerFrame(30)).toBe(4);
    expect(ticksPerFrame(24)).toBe(5);
    expect(ticksPerFrame(60)).toBe(2);
    expect(tickForFrame(0, 30)).toBe(0);
    expect(tickForFrame(29, 30)).toBe(116);
    expect(tickForFrame(30, 30)).toBe(120);
  });

  it('rejects fps that do not divide the clock', () => {
    for (const fps of [25, 50, 0, -30, 29.97]) {
      expect(() => ticksPerFrame(fps)).toThrow(/Unsupported fps/);
    }
  });

  it('counts frames covering a duration', () => {
    expect(frameCount(120, 30)).toBe(30); // exactly 1 s
    expect(frameCount(121, 30)).toBe(31); // partial frame included
    expect(frameCount(0, 30)).toBe(0);
  });
});
