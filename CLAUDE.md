# MotionForge — repo rules for Claude Code

MotionForge is a deterministic 2.5D animation compiler: one screenplay file
(`.mfs.yaml`) in, one finished MP4 film out. Read `docs/plan/PLAN.md` — it is
the plan of record. `docs/plan/PROGRESS.md` is the task tracker.

## The workflow (PLAN.md §7)

- **One task per session, one commit per task.** Execute exactly one task id
  from PLAN.md §9 per session. Use the task's listed commit message verbatim
  (conventional commits).
- **Tick the tracker in the same commit.** The commit that completes task
  M<x>.<y> ticks its checkbox in `docs/plan/PROGRESS.md`. History and tracker
  must never disagree.
- **Plan changes are committed before code.** If a task needs splitting or a
  design decision changes, update PLAN.md / write the ADR in its own `docs:`
  commit first, then implement.
- When a design question isn't answered by PLAN.md or an ADR, write the ADR
  first (`docs/adr/NNNN-*.md`, small `docs:` commit), then implement.

## The verify gate

```
pnpm verify
```

Run it before **every** commit. Never commit red. Never mark a task done with
red tests. (Currently: lint + format check + typecheck + tests. It grows to
include goldens and the determinism double-render as those land in M1.7/M2.8.)

## Goldens

Golden snapshots update only via `pnpm goldens:update` (arrives with M1.7),
and only after eyeballing the diff. Never hand-edit a golden; never blindly
regenerate to make CI pass.

## Determinism rules

- No `Math.random`, no `Date.now`, no wall-clock or environment-dependent
  input anywhere in engine packages (`core`, `lang`, `motion`, `render`).
  All randomness comes from the seeded PCG32 streams in `@motionforge/core`.
- Authors write seconds; the engine works in integer ticks (120 Hz).
- Bundled fonts only — never system fonts.
- The toolchain is pinned: Node via `.nvmrc` + `engines`, pnpm via
  `packageManager`, everything else via `pnpm-lock.yaml`. Don't upgrade
  toolchain pieces as a side effect of a feature task.

## Style

- Prefer boring code that passes goldens over clever code.
- Keep every example film short (10–20 s) except the M14.5 showcase.
- Packages: `core` (kernel) ← `lang`/`motion`/`render` ← `agent` ← `cli`.
  Respect the dependency direction; `core` depends on nothing.
