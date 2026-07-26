# ADR-0003: Byte-exact encoding via pinned ffmpeg-static with bitexact flags

Date: 2026-07-26 · Status: accepted · Informed by: spike M0.6

## Context

The determinism contract promises byte-identical MP4s. Encoders embed
timestamps, version strings, and nondeterministic metadata by default.

## Decision

- Encode with **ffmpeg-static** (pinned; currently ffmpeg 7.0.2 static
  build), libx264, `-fflags +bitexact -flags:v +bitexact` (+ `-flags:a
  +bitexact` once audio lands), `-map_metadata -1`, `-movflags +faststart`.
- Frames are piped as PNGs over stdin (`image2pipe`) — no temp frame files.
- CI enforces determinism by **double-render + SHA-256 compare** (M1.7).
- pnpm 10 blocks dependency build scripts; `onlyBuiltDependencies` in
  `pnpm-workspace.yaml` allowlists ffmpeg-static/resvg so binaries install.

## Consequences

Verified (M0.6): two encodes of 60 1080p frames are SHA-256 identical, with
default multithreaded x264. Encoding is ~2.5 s for 60 frames — not the
bottleneck.
