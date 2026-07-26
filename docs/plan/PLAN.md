# MotionForge — Master Build Plan
**A deterministic 2.5D animation compiler: one screenplay file in, one finished MP4 film out.**
Plan date: 2026-07-26 · Author: Claude (architecture) for Abir · Execution: Claude Code, task by task
Status: this document is the plan of record. Commit it as `docs/plan/PLAN.md` in task M0.2 and keep it updated as the build proceeds.
---
## 0. How to read this document
- §1–§5 explain **what we build and why this architecture wins** — read once before starting.
- §6–§8 define **the repo, the engineering workflow, and the testing strategy** — the rules every Claude Code session follows.
- §9 is the **milestone plan**: 15 milestones, ~100 small tasks, each task sized to be one commit. This is the part you execute.
- §10–§13: risks, the traceability matrix (every promise in the product brief mapped to tasks), v1.0 definition of done, and the exact prompts to drive Claude Code with.
**Verified up front (in a cloud sandbox, 2026-07-26):** `ffmpeg 6.1.1` with `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact -map_metadata -1` produces **byte-identical MP4s across repeated runs**, for video-only and for video+AAC-audio muxes, even with default multithreaded x264. The "same screenplay → same video, every time" promise is achievable down to the byte. The complex-script text rendering bet (Bengali/Arabic via resvg) could not be tested in that sandbox (registry blocked) — it is deliberately the **first spike in M0**, with a documented fallback chain, before anything is built on top of it.
---
## 1. Vision and product contract
MotionForge is a **compiler for films**. The input is a single declarative screenplay file (`.mfs.yaml`) describing scenes, characters, objects, actions, camera, captions, and sound. The output is a polished 1080p MP4. Nobody draws, nobody keyframes by hand, nobody writes code — humans and LLMs alike author films purely by describing them.
**2.5D** means: flat vector art staged in depth — every element sits at a depth `0..1`, near things pass in front of far things, the camera's movement produces true parallax, and depth also drives automatic scale. Think modern motion-graphics explainer films and paper-cutout animation, but generated, rigged, and physically grounded.
### The three contracts
1. **Determinism.** Given (screenplay bytes, MotionForge version, pinned toolchain), the MP4 is byte-identical on every render. Enforced in CI by rendering twice and comparing SHA-256. Everything "random" (blinks, rain, debris, crowd variation) comes from a seeded PRNG whose seed lives in the screenplay.
2. **Machine-fixable errors.** Every invalid screenplay produces errors with a stable code, exact file/line/column, a plain-language message, and a concrete fix hint — structured JSON an LLM can act on without guessing. The validator is strict enough that *if it passes, the film renders*.
3. **Self-description.** One command (`mf spec`) emits the complete, current language reference — generated from the same schemas and action registry the engine executes, so it can never drift from reality. This document is the entire API an LLM needs to author films.
### Non-goals for v1.0
3D rendering; recorded human voice / TTS (characters speak via animated mouths + subtitles + stylized speech blips — a TTS adapter is a post-1.0 idea with a caching design to preserve determinism); a GUI editor; real-time playback (we render offline, fast); networked services (everything runs locally as a CLI).
---
## 2. Why this architecture wins (the "think first" section)
The naive approaches all fail the brief. Frame-by-frame LLM generation (or video-model generation) is non-deterministic, glitchy, and can't hold character identity. Driving a game engine (Godot/Unity) fights non-deterministic frame timing, heavyweight tooling, and painful headless video export. Remotion-style browser rendering leans on headless Chromium — heavy, slow, and hard to make bit-stable. Manim is built for math diagrams, not rigged characters. Rive/After Effects are editor-first, not text-first.
The winning shape is a **declarative animation compiler with procedural motion solvers**:
- **Compiler, not simulator-with-a-wall-clock.** Time is integer ticks on a fixed 120 Hz internal clock; the screenplay compiles to a timeline IR; frame N is a pure function of (screenplay, N). Determinism by construction, previews of any instant for free.
- **Everything is described, nothing is drawn.** Objects are declarative vector part-trees; characters are parametric rigs (skeleton + attached vector shapes + face module). "Any object, any character" falls out of composition + parameters, not out of an asset store. An LLM can author a new windmill or a six-legged creature in 30 lines of YAML.
- **Procedural motion instead of canned clips.** Locomotion is *footstep-planned*: the solver plants feet at world positions and IK-solves legs to those plants — feet **cannot** slide, by construction, and continuity checks make teleports a validation error. Ragdoll is position-based dynamics (Verlet + constraints) on the same fixed timestep — stable, simple, deterministic, and blendable back into acting.
- **One registry to rule docs, validation, and execution.** Every action verb (walk, hug, throw…) is a small module declaring its parameter schema, prerequisites, duration model, tick function, and documentation. The validator's semantic rules, `mf spec`'s language reference, and the engine all read the same registry — the "always up to date explainer for AIs" is structural, not a maintained document.
- **SVG as the frame IR.** The engine emits one deterministic SVG per frame; a rasterizer turns it into pixels; ffmpeg encodes. Frames are human- and LLM-inspectable text, golden tests can diff them textually, any frame is a preview, and the rasterizer sits behind an interface so it can be swapped without touching the engine.
- **The agent loop closes the gap to "finished film".** spec → draft → check → fix → storyboard-review → render, fully scripted, with a mock LLM adapter so the loop itself is CI-testable.
## 3. Technology decisions
| Decision | Choice | Rationale |
|---|---|---|
| Language / runtime | **TypeScript, Node ≥ 22, strict mode** | Best LLM-assisted-development ergonomics (Claude Code writes excellent TS), one language across engine/CLI/tests, fast enough since rasterization and encoding are native |
| Repo shape | **pnpm monorepo** | Clean package boundaries (`core`, `lang`, `motion`, `render`, `cli`, `assets`), one lockfile pinning everything |
| Screenplay format | **YAML + JSON-Schema-style validation (`yaml` parser for line/col ranges, `zod` for types) + custom semantic validator** | LLMs are highly fluent in YAML; the `yaml` package preserves source positions for precise errors; a bespoke DSL was rejected (ADR-0002) — parsing effort buys no expressiveness |
| Frame IR | **SVG per frame, fixed numeric precision, sorted attributes** | Deterministic text output, golden-testable, previewable, debuggable |
| Rasterizer | **`@resvg/resvg-js`** (Rust resvg via napi; shaping by rustybuzz/HarfBuzz-port, bidi support, `loadSystemFonts: false` + bundled fonts only) | Fast, deterministic, no browser; **fallback chain if the M0 spike finds shaping gaps:** `@napi-rs/canvas` (Skia+HarfBuzz, draw scene graph directly, skip SVG-to-pixels) → headless Chromium via Playwright (last resort, screenshots of the same SVG) |
| Fonts | **Bundled Noto family** (Sans LGC, Sans Bengali, Naskh Arabic, Sans SC; OFL-licensed, committed to repo), never system fonts | Identical text rendering on every machine; Bengali conjuncts, Arabic joining/RTL, CJK all covered |
| Encoder | **ffmpeg (pinned via `ffmpeg-static` npm package), libx264 + AAC, bitexact flags** | Verified byte-identical across runs; lockfile pins the exact binary |
| Physics | **Custom position-based dynamics (Verlet particles + distance/angle constraints), fixed substeps** | ~600 lines, unconditionally stable, deterministic, exactly fits 2D ragdoll/tumble/shatter; a general engine (Box2D/Rapier) adds WASM/determinism risk for features we don't need |
| IK | **Analytic two-bone IK (law of cosines)** | Closed-form = deterministic, fast, no iteration-count tuning |
| Audio | **Offline sample-accurate mixer in TS → WAV → ffmpeg mux; CC0 asset library + tiny procedural synth for speech blips** | Deterministic bytes; no runtime audio deps |
| RNG | **PCG32, named streams** (`rng("blink/mina")`), seed from screenplay | Stable results per subsystem even when other subsystems change their draw counts |
| Tests | **vitest** + golden SVG snapshots + PNG perceptual hashes + full-film SHA-256 | Every layer testable headlessly in CI |
| CI | **GitHub Actions** (lint, typecheck, test, determinism double-render, example films as artifacts) | You watch progress as rendered MP4s per push |
| Toolchain pinning | `.nvmrc` + `engines` + `packageManager` field + lockfile; ffmpeg via lockfile | The determinism contract is scoped to the pinned toolchain (ADR-0003) |
**ADRs to write as you go** (`docs/adr/NNNN-*.md`, one commit each, part of milestone tasks): 0001 stack & monorepo · 0002 YAML over custom DSL · 0003 determinism policy & toolchain pinning · 0004 SVG frame IR + rasterizer interface · 0005 font strategy · 0006 footstep-planned locomotion · 0007 PBD physics · 0008 action registry as single source of truth · 0009 audio pipeline · 0010 agent loop design.
---
## 4. The MotionForge Screenplay language (MFS)
File extension `.mfs.yaml`, top-level `motionforge: 1` version field. Design principles: **verbs over keyframes** (authors say `walk to the well`, solvers produce motion); **seconds in, ticks inside** (authors write `2.5s`, the compiler converts to integer ticks — no float drift); **everything referenced by name** (characters, objects, scenes — so the validator can catch every typo with a "did you mean" suggestion); **escape hatch included** (raw `keyframes:` on any bone/part/property for motion the verb library doesn't cover).
Illustrative example (the real grammar is defined incrementally by the milestones; `mf spec` is always the authority):
```yaml
motionforge: 1
meta: { title: "The Fox and the Bread", resolution: 1920x1080, fps: 30, seed: 42 }
characters:
  mina:  { template: biped,  size: 0.9, palette: { skin: "#c68642", dress: "#d94f30" }, hair: bun }
  fox:   { template: quadruped, species: fox, size: 0.7, palette: { fur: "#c3572a" } }
objects:
  bakery: { use: library/house, params: { wall: "#e8d8b0", roof: "#8a3324" },
            parts+: { door: { hinge: left-edge } } }
  cart:   { use: library/handcart }
  bread:  { shape: ellipse, w: 0.5, h: 0.25, fill: "#c9954a", detail: crust-lines }
audio: { music: { mood: playful, volume: 0.7 } }
scenes:
  - id: market-morning
    duration: 14s
    world: { sky: dawn, weather: none,
             layers: [ { use: library/hills, depth: 0.15 },
                       { use: library/trees-row, depth: 0.45 } ] }
    place:
      - { ref: bakery, at: [12, 0], depth: 0.8 }
      - { ref: cart,   at: [6, 0],  depth: 0.85 }
      - { ref: bread,  on: cart.top }
      - { ref: mina,   at: [7, 0],  depth: 0.85, facing: right }
      - { ref: fox,    at: [-2, 0], depth: 0.85, facing: right }   # off-screen left
    camera: { frame: wide, at: [8, 2] }
    timeline:
      - { at: 0s,   title: { text: "রুটি চোর", style: film-title, hold: 2.5s } }
      - { at: 1s,   fox: { action: sneak, to: [4.5, 0] } }
      - { at: 2s,   camera: { track: fox, ease: in-out, over: 1.5s } }
      - { at: 4.5s, fox: { action: take, item: bread } }
      - { at: 5s,   mina: { action: turn, facing: left } }
      - { at: 5.4s, mina: { say: "এই! থামো!", emotion: angry, subtitle: true } }
      - { at: 6s,   fox: { action: run, to: [-3, 0], carrying: bread } }
      - { at: 6s,   mina: { action: run, follow: fox, gap: 1.5 } }
      - { at: 9s,   sfx: door-slam }
      - { at: 12s,  transition: { fade: out, over: 2s } }
```
Notes on the grammar: positions are world units (1 unit ≈ 1 m; y up; ground at 0); `depth` ∈ [0,1] drives parallax and auto-scale; timeline entries are `at:`/`over:` with named easings; concurrent actions on one actor are either layerable (walk + wave) or conflicting (walk + sit) — the registry declares which, the validator enforces it.
## 5. Subsystem designs
Concise blueprints — enough for Claude Code to implement each without re-deciding architecture. Package names in parentheses.
### 5.1 Deterministic kernel (`core`)
Integer tick clock at 120 Hz (LCM-friendly for 24/30/60 fps output; physics substeps align). `Vec2`, affine `Transform`, `Color` (OKLCH internally for tasteful auto-palettes, hex in/out). PCG32 RNG with named streams derived from (seed, path) so subsystems never steal each other's draws. Easing library (standard 12 + cubic-bezier). Scene graph: nodes with transform, depth, z-hint, style; painter sort by (depth band, explicit layer, then screen-y of anchor so downstage actors overlap upstage ones). SVG emitter: fixed 3-decimal precision, sorted attributes, deduped defs — **stable text output is what makes golden tests trivial**. Lint rules ban `Math.random` and `Date.now` in engine packages.
### 5.2 Objects (`lang` schema + `core` build)
An object is a **part tree**: parts have shapes (rect/circle/ellipse/polygon/path/star), fills (solid/gradient), strokes, a pivot, and children. Named parts + pivots make articulation declarative: `door: { hinge: left-edge }`, `wheel: { spin: auto }` (auto wheel spin derives ω = v/r from the carrier's velocity — wheels never skid). Behaviors: `hinge`, `spin`, `oscillate`, `piston`, `turn` (windmill/crane). Objects take `params` (color slots, dimensions) and placement-time `scale / flip / tint / depth`. A **starter library of ~30 objects** (buildings, vehicles with rolling wheels, trees, furniture, tools, food, flags, monuments) ships in `assets/library`, serving as both content and as the idiom examples the LLM learns from. Reuse across films = `use: library/<name>` or any relative path.
### 5.3 Characters (`motion`)
Parametric rigs: skeleton (hierarchical 2D bones) + vector shapes bound to bones + face module. Templates: **biped** (humans), **quadruped** (species presets: dog, cat, fox, horse, elephant…), **bird**, **fish**, **blob/creature builder** (compose body/head/limbs×N/tail/wings/ears freely — any shape and size). Parameters: overall `size`, proportion knobs, palette slots, outfit/hair layers. Proportions are constant by construction — shapes are bone-attached, so no frame can distort them. Face: eyes (pupil look-at, eyelid blink via seeded scheduler, 2–6 s intervals), brows, lids, and a **viseme mouth set** (rest, A, E, I, O, U, M/B/P, F/V, L) driven by a per-script syllable estimator when a character `say:`s. Expression presets (happy, sad, angry, scared, surprised, tired, determined, neutral) blendable over time.
### 5.4 Locomotion (`motion`) — the no-slide guarantee
`walk/run/sneak/march/jump/climb/swim/fly` are solved, not played back: a path planner turns `to:`/`follow:` into a trajectory; a **footstep planner** lays footfalls along it (stride from leg length × speed, duty factor per gait — walk ~0.62, run < 0.5 with flight phase); during stance each foot is **pinned to its world-space plant point** and the leg is IK-solved to it; swing feet travel a cycloid arc to the next plant; the pelvis follows with per-gait bob/lean; arms counter-swing. Foot slide is impossible because stance-foot world position is a constant. CI enforces it numerically: max planted-foot drift < 0.5 px at 1080p across the golden walks. Quadrupeds run the same planner with four legs and gait patterns (walk/trot/gallop); birds/fish get flap/undulate cycles plus physics-lite drift. Speed changes blend by re-planning future footfalls only — no teleports, ever (continuity is also a validator rule, §5.10).
### 5.5 Acting (`motion` action registry)
Every verb is a module implementing one interface: `{ name, paramsSchema, doc, examples, posture prerequisites, conflictsWith, durationModel, tick(state) → pose deltas }`. Registered verbs for v1.0: talk, laugh, cry, cheer, mourn, wave, point, nod, shake-head, shrug, clap, bow, sit, kneel, lie-down, stand-up, turn, look-at, dance (3 loops), hug, fight (punch/kick/dodge/block with contact timing), celebrate, sleep, eat, drink. Gestures layer over postures and locomotion (walk **and** wave); conflicts are declared, so the validator rejects impossible stacks with a helpful message. **Custom motion escape hatch:** a `keyframes:` block poses any bone/part/property at explicit times with easing — "describe it frame-by-frame in plain declarative text" — and it composes with everything else.
### 5.6 Interaction (`motion`)
A socket/attachment system: characters expose sockets (hand-L/R, back, head); objects expose grips, seats, and mounts. `take / put / carry / give (hand-off between characters) / throw / catch / open / close / push / pull / sit-on / ride`. Reach uses arm IK to the grip, then re-parents the item to the socket (attach/detach are timeline events, so the validator can track who holds what). Throw/catch solves the ballistic arc analytically from (release point, catch point, flight time) — gravity does the rest and the catcher's hand IKs to the intercept. Riding = mounting a seat socket with a pose adapter (sit pose on cart, straddle on horse) while the vehicle/animal carries the rider.
### 5.7 Physics & ragdoll (`motion`)
Position-based dynamics: particles + distance constraints (bones) + angle limits (joints), ground/AABB/circle colliders, friction + restitution, fixed iteration counts, substeps aligned to the 120 Hz clock — fully deterministic. Characters flip per-limb or whole-body from kinematic (acting) to dynamic (ragdoll) at any timeline moment — trip, tumble, collapse, get hit — then **blend back**: capture the settled ragdoll pose, interpolate to the nearest recovery pose, resume acting. Objects get dynamic presets: `fall`, `bounce`, `float`, `orbit`, `spin`, `slide`, and `shatter` (seeded radial fracture of the silhouette into shards that fly as rigid pieces, plus debris particles).
### 5.8 Cinematography (`core` camera + `render` post)
The camera is a world-space transform with zoom. Moves: `cut / pan-to / zoom-to / track <actor>` (critically-damped spring with fixed dt — deterministic, with lead-room and dead-zone), `shake` (seeded noise), framing presets (`wide / medium / close-up / two-shot`) computed from rig queries (e.g. close-up = head bounds + margin). Letterbox for drama. Transitions: cut, fade, crossfade, wipe, iris. World dressing: sky gradient system with sun/moon/stars and day/dawn/dusk/night grading curves; weather as seeded particle systems (rain streaks + splashes, snow, fog layers, drifting clouds); all depth-aware so parallax stays honest.
### 5.9 Typography & i18n (`render` text)
Titles, lower-thirds, positioned labels, and subtitles (auto-timed from `say:` via per-script reading-speed models, wrapped, with a contrast plate). All text is shaped by the rasterizer's HarfBuzz-class shaper using **bundled Noto fonts only** — Bengali conjuncts (ক্ষ, ষ্ণ, matra reordering), Arabic joining + RTL + bidi mixed lines, CJK. Golden-frame tests lock all four scripts. Font fallback chain is explicit config, and adding a script = dropping in one OFL font + one golden test.
### 5.10 Validator (`lang`) — the AI-facing contract
Three tiers, all sourced from the same schemas/registry the engine runs:
- **T1 structural**: types/enums/required fields, with YAML line/col from source ranges.
- **T2 referential**: unknown character/object/scene/action names, duplicate ids, bad `use:` paths — with Levenshtein "did you mean `mina`?" suggestions.
- **T3 semantic/temporal**: conflicting concurrent actions (from registry conflict declarations); position-continuity (an actor can't act from a place it never reached — catches teleports); actions overrunning scene duration; speaking while off-stage; holding an item never taken; gait speed limits ("2.4 u/s exceeds walk max 1.9 — use `run`, or set `speed:` explicitly"); camera targets that don't exist; overlapping dialogue warnings.
Every finding: `{ code: "MF0412", severity, path, file:line:col, message, hint, docsUrl }` — emitted as pretty text and as `--json`. Exit codes: 0 clean, 1 warnings-only (pass with `--strict` off), 2 errors. **Guarantee to build toward: if `mf check` passes, `mf render` succeeds.**
### 5.11 Spec generation & previews (`lang`, `cli`)
`mf spec` walks (schema + action registry + object library + font/audio manifests) and emits one markdown document: the full language tour, every verb with params and examples, every library asset, every error code — the always-current LLM handbook. CI fails if the committed `docs/SPEC.md` drifts from generated output. `mf frame film.mfs.yaml --at 12.5s -o out.png` renders any instant (pure function of tick — no simulation warm-up); `mf storyboard` renders a contact sheet (scene starts + action midpoints) for cheap whole-film judgment by human or vision model.
### 5.12 Audio (`render` audio)
An **audio event bus** collects cues from the timeline (explicit `sfx:`, `music:`) and from solvers (footfalls per plant event — sneakers on grass vs. boots on stone; impacts from physics; door hinges). Assets: curated CC0 library with a license manifest; music beds tagged by mood, loop-cut cleanly, auto-duck under dialogue; **speech blips** are synthesized per character (pitch/timbre from size + seed — big characters rumble, small ones chirp) in Animal-Crossing style. Everything mixes offline in TS (sample-accurate, float64, soft limiter) to one WAV; ffmpeg muxes with bitexact flags. Verified: byte-identical output.
### 5.13 Agent mode (`agent`)
`mf author "a fox steals bread from a village market" -o film.mp4` runs the loop: load `mf spec` + few-shot examples from `examples/` → LLM drafts screenplay → `mf check --json` → feed errors back verbatim → revise (bounded retries, default 6) → optional `--review`: render storyboard, send frames to a vision model for composition/staging notes, one revision pass → `mf render`. LLM access via a provider-agnostic adapter (Anthropic API default; any OpenAI-compatible endpoint; a **mock adapter** replaying recorded transcripts makes the whole loop CI-testable with zero API calls). All drafts/errors/responses are saved beside the output for auditability; LLM responses cached by content hash. Contract note, stated in docs: screenplay→video is bit-deterministic; idea→screenplay is creative and model-dependent by nature.
## 6. Repository layout
```
motionforge/
  docs/
    plan/PLAN.md            # this document (M0.2), kept current
    plan/PROGRESS.md        # checkbox tracker, ticked in the same commit as each task
    adr/NNNN-*.md           # architecture decision records
    SPEC.md                 # generated language handbook (CI-checked, never hand-edited)
    errors/MFnnnn.md        # one page per error code
  packages/
    core/     # ticks, math, rng, easing, scene graph, svg emitter, camera
    lang/     # schema, yaml loader w/ positions, validator T1-T3, compiler → timeline IR, spec-gen
    motion/   # rigs, templates, ik, footstep/gait, action registry, interaction, physics
    render/   # rasterizer interface + resvg backend, frame pipeline, text, audio mixer, encoder
    cli/      # `mf` binary: render, check, frame, storyboard, spec, author, init, assets
    agent/    # llm adapters, author loop, storyboard critique
  assets/
    library/  # starter objects (yaml)     fonts/  # bundled Noto (OFL)
    audio/    # cc0 sfx + music + manifest
  examples/   # numbered example films — regression corpus AND few-shot prompts
  CLAUDE.md   # repo rules Claude Code reads every session (M0.2)
```
## 7. Engineering workflow — small tasks, visible progress
This is how you get the "commit and push small tasks so I can track" property:
1. **One task = one commit = one push.** Every task in §9 is sized for a single focused Claude Code session (roughly 30–90 minutes of agent work). Its listed commit message is the actual message to use (conventional commits).
2. **The tracker lives in the repo.** `docs/plan/PROGRESS.md` holds every task as a checkbox table (`| M5.3 | gait solver | ☐ |`). The rule: the commit that completes a task ticks its box **in the same commit**. Your GitHub history and the tracker can never disagree.
3. **Plans are committed before code.** M0.2 commits this PLAN.md and PROGRESS.md. If a task needs splitting or a decision changes, update PLAN.md/ADRs in their own `docs:` commit first — the plan stays the source of truth you can audit.
4. **Milestones end with proof.** Every milestone's last task adds/updates an example film in `examples/`, green in CI, uploaded as a build artifact — so you can literally watch capability grow as MP4s, milestone by milestone. Tag `m<N>-<name>` on completion.
5. **Verify gate.** `pnpm verify` = lint + typecheck + unit tests + goldens + determinism double-render of a smoke film. Claude Code runs it before every commit; CI repeats it on every push. Goldens update only via `pnpm goldens:update` with the diff eyeballed.
6. **Branching:** trunk-based; work directly on `main` (solo project, every commit green) or short-lived `m<N>` branches merged fast — your choice; the plan assumes `main`.
## 8. Testing strategy
| Layer | Test |
|---|---|
| Determinism | Render smoke film twice per CI run → SHA-256 equal (frames, WAV, MP4). The flagship invariant. |
| Kernel/math | Unit tests: transforms, easing, RNG stream stability (recorded sequences), tick conversions |
| Frames | Golden SVGs (textual snapshot diff) + PNG perceptual hashes for rasterizer output |
| Locomotion | **No-slide metric**: planted-foot world drift < 0.5 px across golden walks/runs — a CI number, not a vibe; continuity metric: max inter-frame root displacement bounded |
| Actions | Per-verb pose snapshot tests + conflict-matrix unit tests |
| Physics | Seeded scenario snapshots (positions at ticks 0/60/240), energy sanity bounds |
| Validator | Corpus of 30+ deliberately broken screenplays, each asserting exact error codes + hints (this corpus is also what teaches the LLM error style) |
| Text/i18n | Golden frames: Bengali conjuncts, Arabic RTL+joining, CJK, bidi mixed line |
| Audio | Mixer output WAV hashes; event-bus unit tests (footfall count = plant count) |
| E2E | Every `examples/*.mfs.yaml` must check clean and render in CI; MP4 artifacts uploaded |
| Agent loop | Mock-adapter transcript replay: broken draft → errors → fixed draft → render, no network |
| Spec drift | `mf spec` output must equal committed `docs/SPEC.md` |
## 9. Milestone plan
~100 tasks across 15 milestones. **Id · task · commit message.** Sequence is dependency-ordered; M9/M10/M11 can be permuted if you want visible variety sooner. Do them in order within a milestone.
### M0 — Bootstrap & de-risk spikes (the bets get proven first)
| Id | Task | Commit |
|---|---|---|
| M0.1 | pnpm monorepo, TS strict, vitest, eslint+prettier, `.nvmrc`, package scaffolds | `chore: bootstrap monorepo and toolchain` |
| M0.2 | Commit PLAN.md + PROGRESS.md (all tasks as checkboxes) + CLAUDE.md (repo rules, verify gate, commit style) | `docs: add master plan, progress tracker, claude rules` |
| M0.3 | GitHub Actions: lint/typecheck/test on push; artifact upload wiring | `ci: add verify pipeline` |
| M0.4 | Spike: resvg-js renders SVG→PNG; measure ms/frame at 1080p; record versions | `spike: svg rasterization via resvg-js` |
| M0.5 | **Spike: multi-script text** — Bengali conjuncts/matra, Arabic joining+RTL, CJK through resvg with bundled Noto; eyeball + commit golden PNGs; **if shaping fails: run same test on @napi-rs/canvas and switch backends via ADR** | `spike: complex-script text shaping` |
| M0.6 | Spike: 60 generated frames → ffmpeg (ffmpeg-static) bitexact → MP4; render twice, hashes equal | `spike: deterministic encode pipeline` |
| M0.7 | ADRs 0001–0005 from spike results | `docs: initial adrs` |
**Exit:** a moving-rectangle MP4 with Bengali/Arabic/CJK caption, byte-stable across two renders, built by CI. *Every risky bet is now proven or consciously swapped.*
### M1 — Deterministic kernel
| Id | Task | Commit |
|---|---|---|
| M1.1 | Vec2/Transform/Color, world units, tick clock + seconds↔ticks | `feat(core): math, color, tick clock` |
| M1.2 | PCG32 + named streams; lint bans Math.random/Date.now in engine | `feat(core): seeded rng streams` |
| M1.3 | Easing library + curve sampling | `feat(core): easing` |
| M1.4 | Scene graph + painter sort (depth band, layer, screen-y) | `feat(core): scene graph and depth sort` |
| M1.5 | SVG emitter: fixed precision, sorted attrs, deduped defs | `feat(core): deterministic svg emitter` |
| M1.6 | Timeline core: tracks, clips, events, tick scheduler | `feat(core): timeline` |
| M1.7 | Determinism harness + golden infra (svg snapshot, png phash) | `test(core): determinism and golden harness` |
**Exit:** kernel fully unit-tested; same scene twice → identical SVG bytes.
### M2 — Screenplay v1 + end-to-end pipeline
| Id | Task | Commit |
|---|---|---|
| M2.1 | MFS schema v0 (meta/scenes/place/move/camera/caption) as zod + types | `feat(lang): mfs schema v0` |
| M2.2 | YAML loader preserving source ranges per node | `feat(lang): positioned yaml loader` |
| M2.3 | Validator T1 + MF error codes + pretty/json printers | `feat(lang): structural validator` |
| M2.4 | Validator T2 references + did-you-mean | `feat(lang): reference validator` |
| M2.5 | Compiler: screenplay → timeline IR | `feat(lang): compiler to timeline ir` |
| M2.6 | Render service: IR → frames → encoder; `mf render` | `feat(cli): render command` |
| M2.7 | `mf frame --at` single-instant preview | `feat(cli): frame preview` |
| M2.8 | `examples/01-shapes` + e2e test + CI artifact | `feat(examples): 01-shapes end to end` |
**Exit:** YAML in → MP4 out, deterministic, previewable. The product exists; everything after is capability.
### M3 — Object system
| Id | Task | Commit |
|---|---|---|
| M3.1 | Part-tree schema: shapes, gradients, strokes, pivots | `feat(lang): object part-tree schema` |
| M3.2 | Object instancing: params, scale/flip/tint at placement | `feat(core): object instancing and params` |
| M3.3 | Articulation behaviors: hinge, spin (ω=v/r), oscillate, piston | `feat(motion): articulated parts` |
| M3.4 | Library loader (`use:` resolution, project + built-in paths) | `feat(lang): object library loader` |
| M3.5 | Starter library part 1: 12 objects (house, tree, well, cart, table, chair, flag, lamp, fence, rock, bush, boat) | `feat(assets): starter objects 1` |
| M3.6 | Starter library part 2: 18 more (bus, car, bicycle, windmill, crane, tower, bridge, mosque/temple/monument, shop, food set, tools set) | `feat(assets): starter objects 2` |
| M3.7 | Depth/parallax model + background layers + auto-scale | `feat(core): parallax depth model` |
| M3.8 | `examples/02-street`: bus drives past parallax town, wheels rolling, door opens | `feat(examples): 02-street` |
**Exit:** any describable object, articulated, reusable, staged in believable depth.
### M4 — Characters
| Id | Task | Commit |
|---|---|---|
| M4.1 | Skeleton + FK pose system, pose blending | `feat(motion): skeleton and fk` |
| M4.2 | Analytic two-bone IK + tests | `feat(motion): two-bone ik` |
| M4.3 | Vector skinning: bone-attached shapes, per-part z, facing flip rules | `feat(motion): vector skinning` |
| M4.4 | Biped template: proportions, palette slots, outfit/hair layers | `feat(motion): biped template` |
| M4.5 | Face rig: eyes, look-at, seeded blink scheduler | `feat(motion): eyes and blink` |
| M4.6 | Brows/lids/mouth expression presets + blending | `feat(motion): expressions` |
| M4.7 | Viseme mouth set + text→syllable timing (Latin + Bengali estimators, universal fallback) | `feat(motion): visemes and lip timing` |
| M4.8 | Quadruped (species presets), bird, fish, blob/creature-builder templates | `feat(motion): animal and creature templates` |
| M4.9 | MFS character defs + `examples/03-cast`: lineup blinking, emoting, mouthing a line | `feat(examples): 03-cast` |
**Exit:** humans, animals, birds, fish, creatures — parameterized, expressive, proportion-perfect in every frame.
### M5 — Locomotion (the hard promise)
| Id | Task | Commit |
|---|---|---|
| M5.1 | Path planner: waypoints, facing, turns | `feat(motion): path planner` |
| M5.2 | Footstep planner: stride model, duty factors, footfall schedule | `feat(motion): footstep planner` |
| M5.3 | Gait solver: stance pinning + IK, cycloid swing, pelvis bob, arm swing | `feat(motion): gait solver` |
| M5.4 | **No-slide + continuity metrics in CI** (<0.5 px drift) | `test(motion): no-slide guarantee` |
| M5.5 | Gait styles walk/run/sneak/march + speed blending via re-planning | `feat(motion): gait styles` |
| M5.6 | Jump, climb, swim, fly (+ native fish/bird motion) | `feat(motion): jump climb swim fly` |
| M5.7 | Quadruped gaits: walk/trot/gallop | `feat(motion): quadruped gaits` |
| M5.8 | `examples/04-locomotion`: relay of all gaits, all templates | `feat(examples): 04-locomotion` |
**Exit:** feet mathematically cannot slide; bodies cannot teleport; CI proves both forever.
### M6 — Acting vocabulary
| Id | Task | Commit |
|---|---|---|
| M6.1 | Action registry framework: interface, layering/conflict arbitration, doc metadata | `feat(motion): action registry` |
| M6.2 | Postures: sit, kneel, lie-down, stand-up + transitions | `feat(motion): posture actions` |
| M6.3 | Gestures: wave, point, nod, shake-head, shrug, clap, bow, look-at | `feat(motion): gesture actions` |
| M6.4 | Talk (visemes + beat gestures), laugh, cry, cheer, mourn | `feat(motion): dialogue and emotion actions` |
| M6.5 | Dance ×3, hug, fight set (punch/kick/dodge/block), celebrate, sleep, eat, drink | `feat(motion): performance actions` |
| M6.6 | `keyframes:` escape hatch on bones/parts/properties | `feat(motion): declarative keyframes` |
| M6.7 | `examples/05-acting-reel` exercising every verb | `feat(examples): 05-acting-reel` |
**Exit:** the ready-made performance vocabulary of the brief, plus the frame-by-frame escape hatch.
### M7 — Interaction
| Id | Task | Commit |
|---|---|---|
| M7.1 | Sockets/grips/seats + attach/detach timeline events | `feat(motion): attachment system` |
| M7.2 | take / put / carry (IK reach + re-parent) | `feat(motion): take put carry` |
| M7.3 | give/take hand-off between characters | `feat(motion): handoff` |
| M7.4 | throw & catch (analytic ballistic arc + intercept IK) | `feat(motion): throw and catch` |
| M7.5 | Operate articulated parts: open/close doors, levers, push/pull | `feat(motion): operate objects` |
| M7.6 | sit-on seats; ride vehicles & animals (mount adapters) | `feat(motion): sit and ride` |
| M7.7 | `examples/06-market`: bread hand-off, door, cart ride | `feat(examples): 06-market` |
**Exit:** characters manipulate the world and each other, with held-item state validated.
### M8 — Physics & ragdoll
| Id | Task | Commit |
|---|---|---|
| M8.1 | PBD core: particles, distance/angle constraints, substeps | `feat(motion): pbd solver` |
| M8.2 | Colliders (ground/AABB/circle), friction, restitution | `feat(motion): colliders` |
| M8.3 | Object dynamics presets: fall, bounce, float, orbit, slide, spin | `feat(motion): object dynamics` |
| M8.4 | Ragdoll: skeleton↔particle mapping, go-limp switch (whole/partial) | `feat(motion): ragdoll` |
| M8.5 | Blend-back: settle capture → recovery pose → resume acting | `feat(motion): ragdoll recovery` |
| M8.6 | Shatter: seeded silhouette fracture + shards + debris | `feat(motion): shatter` |
| M8.7 | `examples/07-slapstick`: trip → tumble → vase shatters → get up → bow | `feat(examples): 07-slapstick` |
**Exit:** limp, tumble, collide, collapse — then stand back up and keep acting. Deterministically.
### M9 — Cinematography & atmosphere
| Id | Task | Commit |
|---|---|---|
| M9.1 | Camera rig: transform, zoom, world bounds, letterbox | `feat(core): camera rig` |
| M9.2 | pan-to / zoom-to / cut + eases; seeded shake | `feat(core): camera moves` |
| M9.3 | track: damped-spring follow, lead-room, dead-zone | `feat(core): tracking shots` |
| M9.4 | Framing presets from rig queries (wide/medium/close-up/two-shot) | `feat(core): framing presets` |
| M9.5 | Transitions: fade, crossfade, wipe, iris | `feat(render): transitions` |
| M9.6 | Sky system: gradients, sun/moon/stars, day-part grading | `feat(render): skies and day-night` |
| M9.7 | Weather particles: rain+splash, snow, fog, clouds (seeded, depth-aware) | `feat(render): weather` |
| M9.8 | `examples/08-moods`: one scene at dawn / noon / storm / night with tracking shots | `feat(examples): 08-moods` |
**Exit:** the film *looks directed* — movement of the frame, weather, time of day.
### M10 — Typography & i18n
| Id | Task | Commit |
|---|---|---|
| M10.1 | Font pipeline: bundle Noto set + licenses + fallback chain config | `feat(render): bundled fonts` |
| M10.2 | Title cards + styles; lower-thirds; world-anchored labels | `feat(render): titles and lower thirds` |
| M10.3 | Subtitles: auto-timing from say, wrapping, contrast plate | `feat(render): subtitles` |
| M10.4 | Golden frames: Bengali, Arabic (RTL+bidi), CJK, mixed-direction line | `test(render): multi-script goldens` |
| M10.5 | `examples/09-trilingual`: same short in বাংলা / العربية / 中文 captions | `feat(examples): 09-trilingual` |
**Exit:** captions in any script, pixel-locked by goldens.
### M11 — Audio
| Id | Task | Commit |
|---|---|---|
| M11.1 | Audio event bus: timeline cues + solver events (footfalls, impacts, hinges) | `feat(render): audio event bus` |
| M11.2 | CC0 SFX library + license manifest + `sfx:` cues | `feat(assets): sfx library` |
| M11.3 | Speech blips synth (per-character voice from size+seed) wired to talk | `feat(render): speech blips` |
| M11.4 | Music beds by mood + clean loop-cuts + ducking | `feat(render): music beds` |
| M11.5 | Offline mixer → WAV, limiter; WAV hash test | `feat(render): deterministic mixer` |
| M11.6 | Mux into encode (bitexact), full-film hash test | `feat(render): av mux` |
| M11.7 | Re-render 07-slapstick with full audio | `feat(examples): 07 with sound` |
**Exit:** films have footsteps, doors, crashes, voices, and music — still byte-deterministic.
### M12 — Validator T3 + the LLM handbook
| Id | Task | Commit |
|---|---|---|
| M12.1 | Conflict rules from registry declarations | `feat(lang): action conflict validation` |
| M12.2 | Continuity: teleport detection, presence, held-item state | `feat(lang): continuity validation` |
| M12.3 | Plausibility warnings: gait speed limits, overlapping dialogue, overruns | `feat(lang): plausibility warnings` |
| M12.4 | Error catalog: docs page per MF code, message style guide, hints audit | `docs: error catalog` |
| M12.5 | `mf spec` generator + committed SPEC.md + CI drift check | `feat(lang): spec generator` |
| M12.6 | `mf check --json` machine format + exit codes finalized | `feat(cli): machine-readable check` |
| M12.7 | Broken-screenplay corpus (30+) asserting codes+hints | `test(lang): validator corpus` |
**Exit:** an LLM can go from wrong to right on error messages alone; the language documents itself.
### M13 — Agent mode (one command, no human)
| Id | Task | Commit |
|---|---|---|
| M13.1 | LLM adapter interface + Anthropic impl + mock transcript adapter | `feat(agent): llm adapters` |
| M13.2 | `mf author`: spec+few-shot → draft → check → fix loop (bounded) → render; transcripts saved | `feat(agent): author loop` |
| M13.3 | `mf storyboard` contact sheets + `--review` vision-critique pass | `feat(agent): storyboard review` |
| M13.4 | Response cache by content hash; resumable runs | `feat(agent): caching` |
| M13.5 | CI e2e with mock adapter (bad draft → errors → fixed → MP4) | `test(agent): loop e2e` |
| M13.6 | `examples/10-authored`: a film authored by the loop, with its transcript committed | `feat(examples): 10-authored` |
**Exit:** `mf author "<one line>"` → finished film, unattended.
### M14 — Hardening, performance, showcase, v1.0
| Id | Task | Commit |
|---|---|---|
| M14.1 | Worker-pool rasterization (per-frame pure → parallel safe), in-order encode; perf target: 2-min 1080p30 film < 10 min on 8 cores | `perf(render): parallel rasterization` |
| M14.2 | Streaming pipeline (no whole-film buffering), memory budget | `perf(render): streaming frames` |
| M14.3 | CLI UX: progress bars, timings, friendly failures | `feat(cli): ux polish` |
| M14.4 | README + quickstart + language tour + object/character authoring cookbook | `docs: user documentation` |
| M14.5 | Showcase: 5 finished films in CI (fox fable, **Bengali folk tale with Bengali captions**, rain-noir chase, slapstick physics short, AI-authored film) | `feat(examples): showcase gallery` |
| M14.6 | Cross-platform verify (Linux/macOS; Windows note), pinned-toolchain doc | `chore: platform matrix` |
| M14.7 | Traceability audit (§11 all green) → tag `v1.0.0` + release notes | `release: v1.0.0` |
**Exit:** v1.0 — the full brief, demonstrated by watchable films built in CI.
---
## 10. Risk register
| Risk | Mitigation / fallback |
|---|---|
| Complex-script shaping gaps in resvg (Bengali conjuncts, bidi) | **M0.5 is the first real task.** Fallback chain: @napi-rs/canvas (Skia+HarfBuzz, engine draws scene graph directly — rasterizer already sits behind an interface) → headless Chromium screenshots (last resort). Decision recorded in ADR-0004 either way. |
| Float/libm drift across machines or Node versions | Pin Node (`.nvmrc`, engines, CI matrix uses same); goldens catch any drift immediately; determinism contract explicitly scoped to pinned toolchain (ADR-0003). |
| Render throughput too slow for long films | SVG complexity budget per frame; worker pool (M14.1); backend swap to direct Skia drawing is the pressure valve — engine code unchanged. |
| Acting vocabulary scope explosion | Registry makes each verb a ~100-line isolated module; v1 list is fixed in M6; `keyframes:` escape hatch absorbs the long tail. |
| ffmpeg version variance | Binary pinned via ffmpeg-static in lockfile; bitexact flags (verified); encoder settings frozen in one module. |
| Audio licensing | CC0 only, manifest with provenance per file, checked in CI. |
| LLM cost/nondeterminism in author mode | Mock adapter for all CI; response caching; bounded retries; determinism contract scoped to screenplay→video. |
| YAML foot-guns for LLMs (implicit types, anchors) | Strict schema rejects surprises; validator hints teach quoting; spec doc includes "YAML rules for authors" section; corpus tests cover the classics. |
## 11. Traceability matrix — every promise → where it's delivered
| Promise (from the brief) | Delivered by |
|---|---|
| Any 2D object by description; moving parts (doors, wheels, windmills, cranes) | M3.1–M3.4 |
| Object reuse, resize, recolor, flip; depth + true parallax | M3.2, M3.4 libs, M3.7 |
| Full-bodied humans/animals/birds/fish/creatures, any size/style/color | M4.4, M4.8 |
| Blinking/looking eyes, expressions, talking mouths | M4.5–M4.7 |
| Perfect proportions every frame | Rig-attached shapes by construction (M4.3) + goldens |
| Walk/run/sneak/jump/climb/swim/fly/ride — no foot-slide, no teleports | M5 (+M7.6 ride); CI metrics M5.4; validator M12.2 |
| Acting vocabulary (talk…mourn, dance, hug, fight, celebrate) | M6.2–M6.5 |
| Objects move/spin/bounce/float/orbit/fall/shatter | M3.3 (kinematic), M8.3, M8.6 |
| Pick up / carry / hand off / throw & catch / doors / vehicles / chairs | M7 |
| Ragdoll anytime, then recover and continue acting | M8.4–M8.5 |
| Custom frame-by-frame motion in declarative text | M6.6 |
| Camera pans/zooms/tracking/dramatic framing | M9.1–M9.4 |
| Titles/subtitles/lower-thirds in any script (Bengali, Arabic, Chinese) | M10 |
| Fades/transitions, day/night, weather, skies, sun/moon | M9.5–M9.7 |
| Music + SFX in the final video | M11 |
| Same screenplay → same video, always | M1.7 harness; M11.6 full-film hash; CI double-render (verified achievable up front) |
| LLM can author alone; language explained in one always-current doc | M12.5 spec-gen + drift check; examples as few-shot |
| Plain, specific, instantly-fixable error reports | M2.3–M2.4, M12.1–M12.7 |
| Single-frame previews for judgment | M2.7, M13.3 |
| One-command idea → finished film | M13.2 |
| Polished MP4 output | M2.6, M11.6, M14 |
| No drawing, no manual animating, no coding by the user | The product shape itself: one declarative file in, MP4 out |
## 12. Definition of done, v1.0
`pnpm verify` green on a fresh clone; CI green with all example films rendering as artifacts; double-render SHA-256 equality on every example; no-slide metric green; validator corpus green; spec-drift check green; the five showcase films watchable and smooth; `mf author` produces a film from a one-line idea with the mock adapter in CI and with a live model manually; traceability matrix above fully checked off; tag `v1.0.0` pushed.
## 13. Working with Claude Code — the execution loop
Commit a `CLAUDE.md` (task M0.2) containing: the verify gate command, commit-message convention, "one task per session" rule, golden-update policy, and a pointer to PLAN.md + PROGRESS.md. Then drive every session with the same prompt shape:
> Read docs/plan/PLAN.md and docs/plan/PROGRESS.md. Execute exactly task **M5.3** as specified in the plan (design details in §5.4). Write tests alongside. Run `pnpm verify`. Commit with the plan's commit message, tick M5.3 in PROGRESS.md in the same commit, and push. If the task turns out to need splitting, split it in PLAN.md/PROGRESS.md in a `docs:` commit first, then implement the first piece only.
Kickoff prompt for the very first session:
> Create a private GitHub repo `motionforge` (gh CLI), then execute tasks M0.1 and M0.2 from the attached PLAN.md: bootstrap the pnpm/TypeScript monorepo as specified in §3/§6, commit this PLAN.md as docs/plan/PLAN.md, generate docs/plan/PROGRESS.md with every task from §9 as a checkbox table, add CLAUDE.md per §13, and push. One commit per task.
Rules of thumb while executing: never mark a task done with red tests; prefer boring code that passes goldens over clever code; when a design question isn't answered by PLAN.md or an ADR, write the ADR first (small `docs:` commit), then implement; keep every example film short (10–20 s) except the M14.5 showcase.
### Post-1.0 ideas (parked, not planned)
TTS voice adapter with content-hash audio caching (preserves determinism), live preview server with hot reload, GPU rasterization, community object/action plugin packages, a web gallery that replays `examples/` with their screenplays side by side.
---
*End of plan. First command: run the kickoff prompt in §13.*
