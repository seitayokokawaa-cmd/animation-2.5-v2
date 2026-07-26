# ADR-0004: Time is integer ticks at 120 Hz; all randomness is seeded PCG32

Date: 2026-07-26 · Status: accepted

## Context

Determinism dies by float accumulation and wall-clock leakage. Authors think
in seconds; encoders think in frames; solvers need a fixed timestep.

## Decision

- Internal clock is **integer ticks at 120 Hz** (LCM-friendly with 24/30/60
  fps). Authors write seconds in MFS; the compiler converts once
  (round-half-up) at the language boundary. Frame N samples tick
  `round(N * 120 / fps)`.
- Frame N is a **pure function** of (screenplay, N). No solver may keep
  hidden mutable state across frames except state derived from ticks.
- All randomness comes from **PCG32** streams in `@motionforge/core`, keyed
  by `(filmSeed, streamName)` — e.g. `blink/franz`, `shake/cam`. Consuming
  order within a stream is defined by the timeline, not call timing.
- `Math.random`, `Date.now`, `new Date()`, `performance.now` are **banned by
  lint** in engine packages (`core`, `lang`, `motion`, `render`, `maps`,
  `voice`).

## Consequences

Determinism by construction; previews of any instant for free; seeded
variation (blinks, debris, shake) reproducible per film seed.
