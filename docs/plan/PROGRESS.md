# MotionForge — Progress Tracker

Every task from `PLAN.md` §9 as a checkbox. **The rule (§7): the commit that
completes a task ticks its box in the same commit.** The git history and this
tracker can never disagree.

Legend: ☐ pending · ☑ done

## M0 — Bootstrap & de-risk spikes

| Id   | Task                                                                | Done |
| ---- | ------------------------------------------------------------------ | ---- |
| M0.1 | pnpm monorepo, TS strict, vitest, eslint+prettier, `.nvmrc`, package scaffolds | ☑ |
| M0.2 | Commit PLAN.md + PROGRESS.md + CLAUDE.md                            | ☑    |
| M0.3 | GitHub Actions: lint/typecheck/test on push; artifact upload wiring | ☐    |
| M0.4 | Spike: resvg-js renders SVG→PNG; measure ms/frame at 1080p          | ☐    |
| M0.5 | Spike: multi-script text shaping (Bengali, Arabic RTL, CJK)         | ☐    |
| M0.6 | Spike: deterministic encode pipeline (60 frames → bitexact MP4 ×2)  | ☐    |
| M0.7 | ADRs 0001–0005 from spike results                                   | ☐    |

## M1 — Deterministic kernel

| Id   | Task                                                          | Done |
| ---- | ------------------------------------------------------------- | ---- |
| M1.1 | Vec2/Transform/Color, world units, tick clock + seconds↔ticks | ☐    |
| M1.2 | PCG32 + named streams; lint bans Math.random/Date.now         | ☐    |
| M1.3 | Easing library + curve sampling                               | ☐    |
| M1.4 | Scene graph + painter sort (depth band, layer, screen-y)      | ☐    |
| M1.5 | SVG emitter: fixed precision, sorted attrs, deduped defs      | ☐    |
| M1.6 | Timeline core: tracks, clips, events, tick scheduler          | ☐    |
| M1.7 | Determinism harness + golden infra (svg snapshot, png phash)  | ☐    |

## M2 — Screenplay v1 + end-to-end pipeline

| Id   | Task                                                       | Done |
| ---- | ---------------------------------------------------------- | ---- |
| M2.1 | MFS schema v0 (meta/scenes/place/move/camera/caption)      | ☐    |
| M2.2 | YAML loader preserving source ranges per node              | ☐    |
| M2.3 | Validator T1 + MF error codes + pretty/json printers       | ☐    |
| M2.4 | Validator T2 references + did-you-mean                     | ☐    |
| M2.5 | Compiler: screenplay → timeline IR                         | ☐    |
| M2.6 | Render service: IR → frames → encoder; `mf render`         | ☐    |
| M2.7 | `mf frame --at` single-instant preview                     | ☐    |
| M2.8 | `examples/01-shapes` + e2e test + CI artifact              | ☐    |

## M3 — Object system

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M3.1 | Part-tree schema: shapes, gradients, strokes, pivots        | ☐    |
| M3.2 | Object instancing: params, scale/flip/tint at placement     | ☐    |
| M3.3 | Articulation behaviors: hinge, spin (ω=v/r), oscillate, piston | ☐ |
| M3.4 | Library loader (`use:` resolution, project + built-in paths) | ☐   |
| M3.5 | Starter library part 1: 12 objects                          | ☐    |
| M3.6 | Starter library part 2: 18 more objects                     | ☐    |
| M3.7 | Depth/parallax model + background layers + auto-scale       | ☐    |
| M3.8 | `examples/02-street`: bus, parallax town, rolling wheels    | ☐    |

## M4 — Characters

| Id   | Task                                                            | Done |
| ---- | --------------------------------------------------------------- | ---- |
| M4.1 | Skeleton + FK pose system, pose blending                        | ☐    |
| M4.2 | Analytic two-bone IK + tests                                    | ☐    |
| M4.3 | Vector skinning: bone-attached shapes, per-part z, facing flip  | ☐    |
| M4.4 | Biped template: proportions, palette slots, outfit/hair layers  | ☐    |
| M4.5 | Face rig: eyes, look-at, seeded blink scheduler                 | ☐    |
| M4.6 | Brows/lids/mouth expression presets + blending                  | ☐    |
| M4.7 | Viseme mouth set + text→syllable timing                         | ☐    |
| M4.8 | Quadruped, bird, fish, blob/creature-builder templates          | ☐    |
| M4.9 | MFS character defs + `examples/03-cast`                         | ☐    |

## M5 — Locomotion

| Id   | Task                                                           | Done |
| ---- | -------------------------------------------------------------- | ---- |
| M5.1 | Path planner: waypoints, facing, turns                         | ☐    |
| M5.2 | Footstep planner: stride model, duty factors, footfall schedule | ☐   |
| M5.3 | Gait solver: stance pinning + IK, cycloid swing, pelvis bob    | ☐    |
| M5.4 | No-slide + continuity metrics in CI (<0.5 px drift)            | ☐    |
| M5.5 | Gait styles walk/run/sneak/march + speed blending              | ☐    |
| M5.6 | Jump, climb, swim, fly (+ native fish/bird motion)             | ☐    |
| M5.7 | Quadruped gaits: walk/trot/gallop                              | ☐    |
| M5.8 | `examples/04-locomotion`: relay of all gaits, all templates    | ☐    |

## M6 — Acting vocabulary

| Id   | Task                                                             | Done |
| ---- | ---------------------------------------------------------------- | ---- |
| M6.1 | Action registry framework: interface, layering/conflict, docs    | ☐    |
| M6.2 | Postures: sit, kneel, lie-down, stand-up + transitions           | ☐    |
| M6.3 | Gestures: wave, point, nod, shake-head, shrug, clap, bow, look-at | ☐   |
| M6.4 | Talk (visemes + beat gestures), laugh, cry, cheer, mourn         | ☐    |
| M6.5 | Dance ×3, hug, fight set, celebrate, sleep, eat, drink           | ☐    |
| M6.6 | `keyframes:` escape hatch on bones/parts/properties              | ☐    |
| M6.7 | `examples/05-acting-reel` exercising every verb                  | ☐    |

## M7 — Interaction

| Id   | Task                                                    | Done |
| ---- | ------------------------------------------------------- | ---- |
| M7.1 | Sockets/grips/seats + attach/detach timeline events     | ☐    |
| M7.2 | take / put / carry (IK reach + re-parent)               | ☐    |
| M7.3 | give/take hand-off between characters                   | ☐    |
| M7.4 | throw & catch (analytic ballistic arc + intercept IK)   | ☐    |
| M7.5 | Operate articulated parts: doors, levers, push/pull     | ☐    |
| M7.6 | sit-on seats; ride vehicles & animals (mount adapters)  | ☐    |
| M7.7 | `examples/06-market`: bread hand-off, door, cart ride   | ☐    |

## M8 — Physics & ragdoll

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M8.1 | PBD core: particles, distance/angle constraints, substeps   | ☐    |
| M8.2 | Colliders (ground/AABB/circle), friction, restitution       | ☐    |
| M8.3 | Object dynamics presets: fall, bounce, float, orbit, slide, spin | ☐ |
| M8.4 | Ragdoll: skeleton↔particle mapping, go-limp switch          | ☐    |
| M8.5 | Blend-back: settle capture → recovery pose → resume acting  | ☐    |
| M8.6 | Shatter: seeded silhouette fracture + shards + debris       | ☐    |
| M8.7 | `examples/07-slapstick`: trip → tumble → shatter → bow      | ☐    |

## M9 — Cinematography & atmosphere

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M9.1 | Camera rig: transform, zoom, world bounds, letterbox        | ☐    |
| M9.2 | pan-to / zoom-to / cut + eases; seeded shake                | ☐    |
| M9.3 | track: damped-spring follow, lead-room, dead-zone           | ☐    |
| M9.4 | Framing presets from rig queries                            | ☐    |
| M9.5 | Transitions: fade, crossfade, wipe, iris                    | ☐    |
| M9.6 | Sky system: gradients, sun/moon/stars, day-part grading     | ☐    |
| M9.7 | Weather particles: rain+splash, snow, fog, clouds           | ☐    |
| M9.8 | `examples/08-moods`: dawn / noon / storm / night + tracking | ☐    |

## M10 — Typography & i18n

| Id    | Task                                                        | Done |
| ----- | ----------------------------------------------------------- | ---- |
| M10.1 | Font pipeline: bundle Noto set + licenses + fallback chain  | ☐    |
| M10.2 | Title cards + styles; lower-thirds; world-anchored labels   | ☐    |
| M10.3 | Subtitles: auto-timing from say, wrapping, contrast plate   | ☐    |
| M10.4 | Golden frames: Bengali, Arabic (RTL+bidi), CJK, bidi mixed  | ☐    |
| M10.5 | `examples/09-trilingual`: বাংলা / العربية / 中文 captions    | ☐    |

## M11 — Audio

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M11.1 | Audio event bus: timeline cues + solver events             | ☐    |
| M11.2 | CC0 SFX library + license manifest + `sfx:` cues           | ☐    |
| M11.3 | Speech blips synth (per-character voice from size+seed)    | ☐    |
| M11.4 | Music beds by mood + clean loop-cuts + ducking             | ☐    |
| M11.5 | Offline mixer → WAV, limiter; WAV hash test                | ☐    |
| M11.6 | Mux into encode (bitexact), full-film hash test            | ☐    |
| M11.7 | Re-render 07-slapstick with full audio                     | ☐    |

## M12 — Validator T3 + the LLM handbook

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M12.1 | Conflict rules from registry declarations                  | ☐    |
| M12.2 | Continuity: teleport detection, presence, held-item state  | ☐    |
| M12.3 | Plausibility warnings: gait speeds, overlaps, overruns     | ☐    |
| M12.4 | Error catalog: docs page per MF code, style guide, hints   | ☐    |
| M12.5 | `mf spec` generator + committed SPEC.md + CI drift check   | ☐    |
| M12.6 | `mf check --json` machine format + exit codes finalized    | ☐    |
| M12.7 | Broken-screenplay corpus (30+) asserting codes+hints       | ☐    |

## M13 — Agent mode

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M13.1 | LLM adapter interface + Anthropic impl + mock adapter      | ☐    |
| M13.2 | `mf author`: draft → check → fix loop → render             | ☐    |
| M13.3 | `mf storyboard` contact sheets + `--review` critique pass  | ☐    |
| M13.4 | Response cache by content hash; resumable runs             | ☐    |
| M13.5 | CI e2e with mock adapter (bad draft → errors → fixed → MP4) | ☐   |
| M13.6 | `examples/10-authored` + committed transcript              | ☐    |

## M14 — Hardening, performance, showcase, v1.0

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M14.1 | Worker-pool rasterization, in-order encode, perf target    | ☐    |
| M14.2 | Streaming pipeline (no whole-film buffering), memory budget | ☐   |
| M14.3 | CLI UX: progress bars, timings, friendly failures          | ☐    |
| M14.4 | README + quickstart + language tour + authoring cookbook   | ☐    |
| M14.5 | Showcase: 5 finished films in CI                           | ☐    |
| M14.6 | Cross-platform verify, pinned-toolchain doc                | ☐    |
| M14.7 | Traceability audit → tag `v1.0.0` + release notes          | ☐    |
