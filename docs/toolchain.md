# The pinned toolchain

MotionForge promises byte-identical output: same screenplay, same
MotionForge version, same toolchain → same MP4, SHA-256 and all. That
promise is only as strong as the pins below.

## What is pinned, and where

| Piece | Pin | Why it matters |
|---|---|---|
| Node | `.nvmrc` (22.22.2) + `engines` | V8 float formatting and `Math` kernels feed every coordinate |
| pnpm | `packageManager` in `package.json` | Install-time resolution |
| Every dependency | `pnpm-lock.yaml` | resvg and ffmpeg builds are part of the render function |
| Rasterizer | `@resvg/resvg-js` via the lockfile | PNG bytes come out of it |
| Encoder | `ffmpeg-static` via the lockfile, bitexact flags (ADR-0003) | MP4 bytes come out of it |
| Fonts | vendored Noto subsets in `assets/fonts` (ADR-0002) | Shaping runs pre-raster; system fonts are never loaded |
| Map data | vendored Natural Earth JSON in `assets/geodata` | Region geometry is source data |
| Voice audio | content-addressed WAVs in `assets/voice` + per-film `*.voice.lock.json` (ADR-0006) | TTS output is frozen, not re-synthesized |
| SFX / music | synthesized in-engine from seeded PCG32 (ADR-0009) | No sample files to drift |

Rules that keep the pins honest:

- **Never upgrade a toolchain piece as a side effect of a feature task.**
  Toolchain bumps are their own commits, with goldens re-eyeballed.
- All randomness flows from the screenplay `seed` through PCG32/hash
  noise (`@motionforge/core`); `Math.random`, `Date.now`, and the
  wall clock are lint-banned in engine packages (ADR-0004).
- Worker-pool rendering (`--jobs`, M15.1) does not weaken the promise:
  frames are pure functions of (film, tick), delivered to the encoder
  in presentation order — CI asserts pooled and sequential renders hash
  identically.

## Platform matrix

CI (`.github/workflows/verify.yml`) runs the full verify gate — lint,
format, typecheck, all tests including goldens and the determinism
double-render — on:

| OS | Status |
|---|---|
| Linux x64 (`ubuntu-latest`) | **Reference platform** — example films render here; published hashes are Linux hashes |
| macOS arm64 (`macos-latest`) | Verify gate |
| Windows x64 (`windows-latest`) | Verify gate |

## Scope of the determinism promise

Byte-identity holds **per platform + toolchain**: rendering the same
film twice on the same machine, or on any two machines with the same
OS/architecture and lockfile, produces identical MP4s. Native builds of
resvg and ffmpeg differ across OS/architecture, so cross-platform
renders are visually identical but not guaranteed bit-identical. The
golden tests compare SVG text and perceptual hashes (stable
everywhere); the double-render SHA-256 gate runs on the reference
platform.
