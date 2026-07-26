# ADR-0002: Text is pre-shaped to glyph paths with HarfBuzz; bundled Noto only

Date: 2026-07-26 · Status: accepted · Informed by: spike M0.5

## Context

Multi-script captions (Bengali first-class, Arabic RTL, CJK) must render
correctly and deterministically. resvg's native `<text>` (rustybuzz) ligates
Bengali conjuncts but **fails on word spacing after matra-bearing syllables**
(confirmed against a Skia+HarfBuzz reference).

## Decision

- **resvg never sees `<text>`.** All text is shaped by real HarfBuzz
  (`harfbuzzjs`, WASM, pinned) — `guessSegmentProperties()` + `shape()` +
  `glyphToPath()` — and emitted as glyph-outline `<path>` elements.
- **Bundled Noto fonts only** (`assets/fonts/`, OFL-1.1); system fonts are
  never loaded. Fonts are inputs to the determinism contract.
- We own bidi run segmentation and font-fallback itemization (lands M11);
  glyph runs are cached by (font, text) content hash.

## Consequences

One rasterizer; SVG remains the complete frame IR (text is geometry); golden
SVG diffs cover text. All M0.5 cases pass through this path (goldens
committed). Cost: our own bidi/itemization layer in M11.
