import { describe, expect, it } from 'vitest';

import { lerp } from './math.js';
import {
  createTimeline,
  createTrack,
  eventsBetween,
  frames,
  sample,
  sampleTrack,
} from './timeline.js';

const numTrack = (name: string, clips: Parameters<typeof createTrack<number>>[2]) =>
  createTrack<number>(name, 0, clips, lerp);

describe('createTrack', () => {
  it('sorts clips and rejects overlaps', () => {
    const track = numTrack('x', [
      { start: 120, duration: 60, from: 1, to: 2 },
      { start: 0, duration: 120, from: 0, to: 1 },
    ]);
    expect(track.clips.map((c) => c.start)).toEqual([0, 120]);
    expect(() =>
      numTrack('x', [
        { start: 0, duration: 100, from: 0, to: 1 },
        { start: 99, duration: 10, from: 1, to: 2 },
      ]),
    ).toThrow(/overlap/);
  });

  it('allows touching clips and rejects bad ticks', () => {
    expect(() =>
      numTrack('x', [
        { start: 0, duration: 100, from: 0, to: 1 },
        { start: 100, duration: 10, from: 1, to: 2 },
      ]),
    ).not.toThrow();
    expect(() => numTrack('x', [{ start: -1, duration: 10, from: 0, to: 1 }])).toThrow(
      /non-negative tick/,
    );
    expect(() => numTrack('x', [{ start: 0.5, duration: 10, from: 0, to: 1 }])).toThrow(
      /non-negative tick/,
    );
  });
});

describe('sampleTrack', () => {
  const track = numTrack('x', [{ start: 100, duration: 100, from: 10, to: 20 }]);

  it('holds initial before, tweens inside, holds final after', () => {
    expect(sampleTrack(track, 0)).toBe(0);
    expect(sampleTrack(track, 99)).toBe(0);
    expect(sampleTrack(track, 100)).toBe(10);
    expect(sampleTrack(track, 150)).toBe(15);
    expect(sampleTrack(track, 200)).toBe(20);
    expect(sampleTrack(track, 9999)).toBe(20);
  });

  it('applies easing', () => {
    const eased = numTrack('x', [{ start: 0, duration: 100, from: 0, to: 1, easing: 'quadIn' }]);
    expect(sampleTrack(eased, 50)).toBeCloseTo(0.25, 12);
  });

  it('treats zero-duration clips as steps', () => {
    const step = numTrack('x', [{ start: 50, duration: 0, from: 0, to: 7 }]);
    expect(sampleTrack(step, 49)).toBe(0);
    expect(sampleTrack(step, 50)).toBe(7);
  });

  it('is a pure function of tick (order of queries is irrelevant)', () => {
    const a = [200, 0, 150, 99, 100].map((t) => sampleTrack(track, t));
    const b = [200, 0, 150, 99, 100].map((t) => sampleTrack(track, t));
    expect(a).toEqual(b);
  });
});

describe('createTimeline', () => {
  it('computes duration from clips, events, and minimum', () => {
    const tl = createTimeline(
      [numTrack('x', [{ start: 0, duration: 240, from: 0, to: 1 }])],
      [{ tick: 500, name: 'boom' }],
    );
    expect(tl.durationTicks).toBe(500);
    expect(createTimeline([], [], 120).durationTicks).toBe(120);
  });

  it('rejects duplicate track names', () => {
    expect(() => createTimeline([numTrack('x', []), numTrack('x', [])])).toThrow(/Duplicate track/);
  });

  it('samples tracks by name and throws on unknown', () => {
    const tl = createTimeline([numTrack('x', [{ start: 0, duration: 120, from: 0, to: 12 }])]);
    expect(sample<number>(tl, 'x', 60)).toBe(6);
    expect(() => sample(tl, 'nope', 0)).toThrow(/Unknown track/);
  });

  it('sorts events deterministically and queries half-open ranges', () => {
    const tl = createTimeline(
      [],
      [
        { tick: 10, name: 'b' },
        { tick: 10, name: 'a' },
        { tick: 4, name: 'z' },
      ],
    );
    expect(tl.events.map((e) => `${e.tick}:${e.name}`)).toEqual(['4:z', '10:a', '10:b']);
    expect(eventsBetween(tl, 0, 10).map((e) => e.name)).toEqual(['z']);
    expect(eventsBetween(tl, 10, 11).map((e) => e.name)).toEqual(['a', 'b']);
  });
});

describe('frames', () => {
  it('yields every output frame with its sampled tick', () => {
    const tl = createTimeline([], [], 120); // 1 s
    const list = [...frames(tl, 30)];
    expect(list).toHaveLength(30);
    expect(list[0]).toEqual({ frame: 0, tick: 0 });
    expect(list[29]).toEqual({ frame: 29, tick: 116 });
  });
});
