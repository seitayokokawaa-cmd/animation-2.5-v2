# Spike M0.5 — Complex-script text shaping

Scripts:

- `run.mjs` — the four test cases through **resvg's native `<text>`**
  (rustybuzz shaping). Goldens: `golden/{bengali-conjuncts,arabic-rtl,cjk,bidi-mixed}.png`.
- `shape2path.mjs` — the same content **pre-shaped with HarfBuzz (WASM,
  `harfbuzzjs`) and emitted as glyph-outline `<path>`s**, rasterized by resvg.
  Golden: `golden/shaped-paths.png`.

All goldens are committed for eyeball review. Both pipelines are
byte-deterministic across repeated renders.

## Verdict per case (resvg native `<text>`, eyeballed 2026-07-26)

| Case                                        | Result                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bengali conjuncts (ক্ষ ষ্ণ ক্ত ন্ধ হ্ম জ্ঞ) | ✅ ligated correctly                                                                                                                                       |
| Bengali words with matras                   | ❌ **FAIL** — word spaces collapse after matra-bearing syllables; in `রুটি চোর` the র overlaps the ো matra                                                 |
| Arabic joining + RTL                        | ✅ correct (incl. الله ligature)                                                                                                                           |
| CJK                                         | ✅ correct                                                                                                                                                 |
| Bidi mixed lines                            | ✅ identical layout to the Skia+HarfBuzz reference (base-direction quirks are inherent to unset `direction`, handled later by the subtitle renderer M10.3) |

The failures were confirmed against a reference render of identical strings +
fonts via `@napi-rs/canvas` 1.0.2 (Skia + real HarfBuzz), which rendered all
cases correctly.

## Decision (to be formalized in ADR-0004/0005, task M0.7)

**Text is pre-shaped to glyph-outline paths; resvg never sees `<text>`.**

- Shaping: real HarfBuzz via `harfbuzzjs` (WASM, pinned in lockfile) —
  `Buffer.guessSegmentProperties()` + `shape()` + `Font.glyphToPath()`.
  Note: `setDirection()` takes the `Direction` enum, not a string — and is
  unnecessary; `guessSegmentProperties` resolves RTL for Arabic.
- Verified through this path: Bengali words/matras/conjuncts ✅, Arabic
  joining/RTL ✅, CJK ✅ (`golden/shaped-paths.png`).
- Wins: one rasterizer (resvg, fast per M0.4); SVG stays the **complete**
  frame IR (text = paths, no font resolution at raster time); golden SVG
  diffs cover text exactly like any other geometry.
- Costs: we own bidi run segmentation + font fallback itemization (M10);
  UBA via a dedicated lib or first-strong heuristics per line, glyph runs
  cached by (font, text) content hash for speed.
- `@napi-rs/canvas` remains the documented fallback rasterizer if resvg's
  path rendering ever falls short (it also shapes correctly, so it can render
  the same shaped output).

## Versions (recorded 2026-07-26)

- `@resvg/resvg-js` 2.6.2, `harfbuzzjs` 1.4.0 — both pinned in pnpm-lock.yaml
- Fonts: see `assets/fonts/README.md` for provenance (Noto, OFL-1.1)
