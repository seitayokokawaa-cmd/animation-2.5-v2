import { compile, mfsSchema } from '@motionforge/lang';
import { describe, expect, it } from 'vitest';

import { buildFrameSvg } from './frame.js';

const film = compile(
  mfsSchema.parse({
    motionforge: 2,
    meta: { title: 'P', resolution: '640x360', fps: 30, seed: 2 },
    shapes: {
      dot: { kind: 'circle', r: 0.3, fill: '#d94f30' },
    },
    scenes: [
      {
        id: 's',
        duration: 3,
        backdrop: { top: '#2b3a55', bottom: '#6e8aa8' },
        place: [
          { ref: 'dot', as: 'near', at: [0, 1], depth: 0.1 },
          { ref: 'dot', as: 'mid', at: [0, 0], depth: 0.5 },
          { ref: 'dot', as: 'far', at: [0, -1], depth: 0.9 },
        ],
        actions: [
          { at: 0, camera: { to: [3, 0], duration: 2, easing: 'linear' } },
          { at: 0.2, card: { style: 'label', text: 'hud', at: [4, -4], duration: 2.5 } },
        ],
      },
    ],
  }),
);

/** X position of the nth circle in the emitted SVG. */
function circleXs(svg: string): number[] {
  return [...svg.matchAll(/<circle[^>]*transform="matrix\(([^)]+)\)"/g)].map((m) =>
    Number(m[1]!.split(' ')[4]),
  );
}

describe('parallax depth (M5.7)', () => {
  it('camera pans move near layers more than far layers', () => {
    const before = circleXs(buildFrameSvg(film, 0));
    const after = circleXs(buildFrameSvg(film, 240));
    expect(before).toHaveLength(3);
    // Painter order: farthest first — [far, mid, near].
    const shifts = before.map((x, i) => Math.abs(after[i]! - x));
    const [farShift, midShift, nearShift] = shifts;
    expect(nearShift!).toBeGreaterThan(midShift!);
    expect(midShift!).toBeGreaterThan(farShift!);
    // Depth 0.5 tracks the camera exactly: 3 world units * 36 px/unit.
    expect(midShift!).toBeCloseTo(3 * 36, 0);
  });

  it('cards stay screen-fixed under camera pans', () => {
    // The card plate's screen position must not move with the camera
    // (its scale wobbles by design, so compare the translation only).
    const platePos = (svg: string) => {
      const m = svg.match(/<rect fill="#b5453c"[^>]*matrix\(([^)]+)\)/)![1]!.split(' ');
      return [m[4], m[5]];
    };
    expect(platePos(buildFrameSvg(film, 60))).toEqual(platePos(buildFrameSvg(film, 240)));
  });

  it('renders the scene backdrop gradient screen-fixed', () => {
    const svg = buildFrameSvg(film, 120);
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('#2b3a55');
    expect(svg).toContain('#6e8aa8');
  });
});
