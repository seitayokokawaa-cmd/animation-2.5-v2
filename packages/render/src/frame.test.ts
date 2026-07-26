import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { buildFrameSvg } from './frame.js';
import { resvgRasterizer } from './rasterizer.js';

const film = compile(
  mfsSchema.parse({
    motionforge: 1,
    meta: { title: 'T', resolution: '320x180', fps: 30, seed: 1, background: '#1e2733' },
    shapes: {
      box: { kind: 'rect', width: 2, height: 1, fill: '#d94f30' },
      dot: { kind: 'circle', r: 0.4, fill: '#3c6fb5' },
    },
    scenes: [
      {
        id: 'a',
        duration: 2,
        place: [
          { ref: 'box', as: 'b', at: [0, 0] },
          { ref: 'dot', as: 'd', at: [3, 1], depth: 0.2 },
        ],
        actions: [
          { at: 0, move: { target: 'b', to: [2, 0], duration: 1 } },
          { at: 0, caption: { text: 'hello world', duration: 2 } },
          { at: 1, camera: { zoom: 1.5, duration: 0.5 } },
        ],
      },
    ],
  }),
);

describe('buildFrameSvg', () => {
  it('is byte-identical for the same tick', () => {
    expect(buildFrameSvg(film, 60)).toBe(buildFrameSvg(film, 60));
  });

  it('changes between ticks (things move)', () => {
    expect(buildFrameSvg(film, 0)).not.toBe(buildFrameSvg(film, 60));
  });

  it('renders background, shapes, and caption glyph paths', () => {
    const svg = buildFrameSvg(film, 30);
    expect(svg).toContain('fill="#1e2733"');
    expect(svg).toContain('fill="#d94f30"');
    // Caption text arrives as glyph outline paths, never <text> (ADR-0002).
    expect(svg).not.toContain('<text');
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it('applies camera zoom to the root transform', () => {
    const before = buildFrameSvg(film, 120);
    const after = buildFrameSvg(film, 240);
    expect(before).not.toBe(after);
    // zoom 1.5 → world unit becomes 18*1.5 = 27 px in the transform matrix.
    expect(after).toContain('matrix(27 0 0 -27');
  });

  it('rasterizes without loading system fonts', () => {
    const png = resvgRasterizer.toPng(buildFrameSvg(film, 30));
    expect(png.length).toBeGreaterThan(1000);
  });
});
