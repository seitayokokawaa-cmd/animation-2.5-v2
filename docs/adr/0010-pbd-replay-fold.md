# ADR 0010 — PBD physics as a bounded replay fold

## Status

Accepted (M14.3).

## Context

The realism pack (M14.3–M14.5) needs 2D dynamics: ragdoll tumbles,
bounces, shatter debris. The plan of record fixes the solver family —
position-based dynamics (Verlet particles + distance/angle constraints +
ground/AABB/circle colliders, fixed substeps, fixed iteration counts) —
because it is a few hundred lines, unconditionally stable, and exactly
fits cartoon slapstick. What the plan does not answer is how a *stateful*
simulation coexists with the kernel invariant that frame N is a pure
function of `(film, tick)` with no simulation warm-up (`mf frame --at`
must work by construction).

Options considered:

1. **Precompute at compile time.** Bake simulated tracks into the film
   during `compile()`. Rejected: physics reacts to pose state the
   compiler does not model (a ragdoll starts from the character's *posed*
   skeleton at the trigger tick, which only the frame builder knows).
2. **Cache across frames.** Let the renderer carry solver state from
   frame N to N+1. Rejected: breaks purity — `mf frame --at 12.5` and
   frame 12.5-of-a-full-render must be byte-identical, and parallel
   rasterization (M15.1) must stay embarrassingly parallel.
3. **Replay fold per frame.** State at tick T = fold of fixed 120 Hz
   substeps from the effect's `startTick` to T, re-run each frame from
   the same initial conditions.

## Decision

Option 3, the pattern `dampedTrack` (M10.3) already set. The PBD kernel
in `@motionforge/motion` (`pbd.ts`) exposes `simulate(world, ticks)`:
build the initial world, step it `ticks` times with fixed substeps
(4 per tick), fixed constraint iterations (8), fixed collider order
(ground, then AABBs, then circles, in declaration order) — and return
the final state. Every frame recomputes the fold from the effect start.

Costs are bounded by construction: physics runs only inside effect
windows, and effect durations are author-bounded (seconds, not minutes),
so a frame replays at most a few thousand substeps of a handful of
particles — microseconds, not milliseconds. Determinism needs no
floating-point escape hatches: identical inputs walk identical code
paths, so the fold is bit-stable on a pinned toolchain.

All randomness (shatter fracture patterns, debris scatter) draws from
the film-seeded PCG32 streams keyed by effect identity; the solver
itself is randomness-free.

## Consequences

- `mf frame --at` keeps working for any instant of any tumble, and the
  double-render hash gate (M2.8) covers physics for free.
- Solver parameters (substeps, iterations, collider order) are frozen
  constants of the engine; changing them is a breaking change to every
  golden, so they are named exports covered by tests, not knobs.
- Long free-running simulations stay out of scope by design: anything
  that must simulate for minutes belongs in a compile-time track, not in
  a per-frame fold.
