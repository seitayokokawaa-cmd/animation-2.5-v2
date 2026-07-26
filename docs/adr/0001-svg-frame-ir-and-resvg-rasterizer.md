# ADR-0001: SVG as the frame IR, rasterized by resvg-js behind an interface

Date: 2026-07-26 · Status: accepted · Informed by: spike M0.4

## Context

The engine needs a frame representation that is deterministic, diffable,
previewable, and cheap to rasterize at 1080p. Candidate rasterizers: resvg-js
(Rust, napi), @napi-rs/canvas (Skia), headless Chromium.

## Decision

- The engine emits **one deterministic SVG document per frame** — the frame
  IR. Frames are text: golden tests diff them, humans and LLMs inspect them.
- **@resvg/resvg-js** (pinned 2.6.x) rasterizes SVG → PNG with
  `font.loadSystemFonts: false`. It sits behind a `Rasterizer` interface.
- Fallback chain if resvg falls short: **@napi-rs/canvas**, then headless
  Chromium. Switching is an ADR + one adapter, not an engine change.

## Consequences

Measured (M0.4): ~62 ms/frame at 1920×1080 for target-complexity frames,
byte-identical across repeated renders. A 2-min film ≈ 3.7 min single-threaded
rasterization; the M15.1 worker pool brings longer films inside targets.
