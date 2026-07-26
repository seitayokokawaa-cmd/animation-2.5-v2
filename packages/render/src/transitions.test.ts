import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { buildFrameSvg } from './frame.js';

/** Five 2 s scenes: plain, wipe+night, crossfade, iris, fade. */
const doc = mfsSchema.parse({
  motionforge: 2,
  meta: { title: 'T', resolution: '320x180', fps: 30, seed: 1 },
  shapes: { box: { kind: 'rect', width: 2, height: 1, fill: '#d94f30' } },
  scenes: [
    { id: 'a', duration: 2, place: [{ ref: 'box', as: 'b1', at: [0, 0] }] },
    {
      id: 'b',
      duration: 2,
      transition: { kind: 'wipe' },
      grade: 'night',
      place: [{ ref: 'box', as: 'b2', at: [1, 0] }],
    },
    { id: 'c', duration: 2, transition: { kind: 'crossfade' } },
    { id: 'd', duration: 2, transition: { kind: 'iris', color: '#000000' } },
    { id: 'e', duration: 2, transition: { kind: 'fade' } },
  ],
});
const film = compile(doc);

describe('transitions and grading (M10.5)', () => {
  it('fade covers the frame fully at the cut and not far from it', () => {
    // Scene e starts at tick 960; T = 0.5 at the boundary → opaque ink.
    expect(buildFrameSvg(film, 960)).toContain('#1f1a14');
    expect(buildFrameSvg(film, 60)).not.toContain('#1f1a14');
    // Half-way through the closing half-window the cover is translucent.
    const closing = buildFrameSvg(film, 960 - 15);
    expect(closing).toMatch(/#1f1a14" height="180" opacity="0\.5/);
  });

  it('wipe slides its cover through the frame around the cut', () => {
    // Boundary at 240, d = 60 ticks. 24 ticks before: T = 0.1 → x = -256.
    expect(buildFrameSvg(film, 216)).toContain('matrix(1 0 0 1 -96 90)');
    // At the cut the cover is centered (fully covering).
    expect(buildFrameSvg(film, 240)).toContain('matrix(1 0 0 1 160 90)');
    // Well after the window there is no cover.
    expect(buildFrameSvg(film, 360)).not.toContain('#1f1a14');
  });

  it('crossfade composites this scene as a translucent group over the last', () => {
    // Scene c starts at 480, d = 72 ticks; t = 1/3 → cubicInOut = 4/27.
    const svg = buildFrameSvg(film, 504);
    expect(svg).toContain('<g opacity="0.1481">');
    expect(svg).toContain('</g>');
    // After the window: no group wrapper.
    expect(buildFrameSvg(film, 600)).not.toContain('<g opacity');
  });

  it('iris covers via a ring path with an authored color', () => {
    const svg = buildFrameSvg(film, 726);
    expect(svg).toContain('M0 0H320V180H0Z');
    expect(svg).toContain('fill="#000000"');
  });

  it('night grade tints the finished frame', () => {
    const svg = buildFrameSvg(film, 360);
    expect(svg).toMatch(/#223a8c" height="180" opacity="0\.38"/);
    // Ungraded scenes carry no tint.
    expect(buildFrameSvg(film, 60)).not.toContain('#223a8c');
  });

  it('is byte-deterministic across builds', () => {
    expect(buildFrameSvg(film, 504)).toBe(buildFrameSvg(film, 504));
    expect(buildFrameSvg(film, 216)).toBe(buildFrameSvg(film, 216));
  });
});
