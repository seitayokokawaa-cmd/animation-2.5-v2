# Spike M0.4 — SVG rasterization via resvg-js

Run: `node spikes/m0.4-resvg/run.mjs` (writes `out/frame.png`, gitignored).

## Result: PASS

Rendered a frame representative of target complexity (sky gradient, 8 parallax
hills, house, 60-blob tree, cart with two spoked wheels, simple figure — a few
hundred vector elements) at 1920×1080.

| Measurement                    | Value                                  |
| ------------------------------ | -------------------------------------- |
| ms/frame (mean over 30 frames) | ~61.6 ms                               |
| ms/frame (median / min / max)  | 61.4 / 58.5 / 67.0 ms                  |
| Double-render PNG bytes        | **identical** (SHA-256 equal)          |
| Visual check                   | correct (gradient, shapes, transforms) |

## Versions (recorded 2026-07-26)

- `@resvg/resvg-js` 2.6.2 (pinned via pnpm-lock.yaml)
- Node 22.22.2 (pinned via .nvmrc)

## Implications

- ~61 ms/frame single-threaded → a 2-min 1080p30 film (3600 frames) ≈ 3.7 min
  of rasterization before the M14.1 worker pool — comfortably inside the plan's
  perf target (< 10 min on 8 cores).
- `font.loadSystemFonts: false` works; fonts must be supplied explicitly, as
  the determinism contract requires.
- Rasterization is byte-deterministic, as required for the golden/PNG-hash
  test layers.
