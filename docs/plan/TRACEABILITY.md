# Traceability audit — v1.0.0 (M15.6)

Audit date: 2026-07-27. Method: every task id in PLAN.md §9 was checked
for (a) a commit whose subject matches the plan's listed message
verbatim, and (b) a ticked box in PROGRESS.md. The §11 genre checklist
and original-brief disposition were then walked item by item against
the shipped subsystems, and the §12 definition of done was re-verified
on this tree.

## §9 task-to-commit audit

- **113 tasks** carry commit messages in the plan's milestone tables.
- **111 commits** exist in history with the exact listed subject, and
  every one of them ticks its PROGRESS.md box in the same commit.
- **2 exceptions:**
  - `M0.7` (Qwen TTS + forced alignment spike) — **permanently blocked**
    in this environment: no `DASHSCOPE_API_KEY` is available. The
    deliverable that mattered shipped anyway in M3.2–M3.4: the
    `TtsAdapter` seam, the Qwen DashScope adapter (live-unvalidated),
    the recorded-VO adapter, the mock adapter, forced alignment, and
    the freeze-cache. Risk register row 1 covers the fallback posture.
  - `M15.6` — this audit; its `release: v1.0.0` commit is the one that
    closes the table.

## §11 genre checklist → delivered

| Essential | Where | Spot-proof |
|---|---|---|
| Wall-to-wall narration synced to visuals | M3 | every example ≥03; anchors resolved from frozen alignment |
| Animated maps: borders, arrows, marches, flags, battles | M7 | `examples/07-warmap`, `13-plassey` |
| Caricature cast, costumes, reactions | M6 | `examples/06-cast` |
| Skits alternating with maps | M8 | `08-skit`, `13-plassey` |
| Date/chapter/list cards + cutaways | M4.5 | `04-kinetic`, list card in `13-plassey` |
| Kinetic pop/slam/shake energy | M4, M10.2 | `04-kinetic`, zoom-punch in `10-bangla` |
| Squeaky character one-liners | M8.4 | lines in `08-skit`, `12-fable`, `13-plassey` |
| Dense SFX + ducked music | M9 | procedural SFX + moods in every film since |
| Fast dramatic camera | M10 | `09-directed` |
| Multi-script captions/subtitles | M11 | `10-bangla`, Bengali subtitles in `13-plassey` |
| One-command authoring + style guide | M13 | `mf author` e2e in CI (`11-authored`) |

## §11 original-brief disposition → delivered

Determinism, validator-with-hints, spec self-description,
previews/storyboards, agent loop, objects with moving parts, parallax,
faces, `keyframes:` — shipped in M1–M13 as re-sequenced. The deferred
realism items all landed in M14: planted gait + no-slide CI metric
(M14.1), swim/fly/climb + bird/fish/creature-builder (M14.2), PBD +
ragdoll + shatter (M14.3–M14.5), take/put/give/throw-catch, sit-on,
doors (M14.6), and the fable film that exercises them (M14.7). Nothing
from the original brief was dropped.

## §12 definition of done — verified on this tree

- `pnpm verify` green from a fresh clone (CI, all three matrix OSes).
- Every example checks clean and renders in CI; MP4 artifacts uploaded.
- Double-render hash equality holds (e2e), including pooled vs
  sequential rendering (M15.1 test).
- Validator corpus + spec drift gates green; `docs/SPEC.md` current.
- `mf voice sync` → offline byte-stable renders from committed caches.
- `07-warmap`, `08-skit`, and the M15.4 showcase (`13-plassey`,
  `14-coffee`) check with **zero pacing findings**.
- `mf author` produces a film from a one-line topic with mocks in CI;
  the live-model path exists behind `ANTHROPIC_API_KEY` (manually
  exercised when a key is present).

## Verdict

v1.0.0 criteria met, with the single documented exception (M0.7 live
TTS validation) carried as an open risk, not a missing capability.
