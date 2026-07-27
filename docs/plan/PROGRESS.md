# MotionForge — Progress Tracker (plan v2)

Every task from `PLAN.md` §9 as a checkbox. **The rule (§7): the commit that
completes a task ticks its box in the same commit.** The git history and this
tracker can never disagree.

M0.1–M0.5 were completed under plan v1; v2 keeps them verbatim, so they carry
over as done.

Legend: ☐ pending · ☑ done

## M0 — Bootstrap & de-risk spikes

| Id   | Task                                                                | Done |
| ---- | ------------------------------------------------------------------- | ---- |
| M0.1 | pnpm monorepo, TS strict, vitest, eslint+prettier, `.nvmrc`, package scaffolds | ☑ |
| M0.2 | Commit PLAN.md + PROGRESS.md + CLAUDE.md                            | ☑    |
| M0.3 | GitHub Actions: lint/typecheck/test on push; artifact upload wiring | ☑    |
| M0.4 | Spike: resvg-js renders SVG→PNG; measure ms/frame at 1080p          | ☑    |
| M0.5 | Spike: multi-script text shaping (Bengali, Arabic RTL, CJK)         | ☑    |
| M0.6 | Spike: deterministic encode pipeline (60 frames → bitexact MP4 ×2)  | ☑    |
| M0.7 | Spike: Qwen TTS + forced alignment + freeze-cache byte-stability    | ☐    |
| M0.8 | Spike: map render (Natural Earth → stylized SVG, recolor, morph)    | ☑    |
| M0.9 | ADRs incl. narration spine, map engine, motion-graphics grammar     | ☑    |

## M1 — Deterministic kernel

| Id   | Task                                                          | Done |
| ---- | ------------------------------------------------------------- | ---- |
| M1.1 | Vec2/Transform/Color, world units, tick clock + seconds↔ticks | ☑    |
| M1.2 | PCG32 + named streams; lint bans Math.random/Date.now         | ☑    |
| M1.3 | Easing library + curve sampling                               | ☑    |
| M1.4 | Scene graph + painter sort (depth band, layer, screen-y)      | ☑    |
| M1.5 | SVG emitter: fixed precision, sorted attrs, deduped defs      | ☑    |
| M1.6 | Timeline core: tracks, clips, events, tick scheduler          | ☑    |
| M1.7 | Determinism harness + golden infra (svg snapshot, png phash)  | ☑    |

## M2 — Screenplay v1 + end-to-end pipeline

| Id   | Task                                                       | Done |
| ---- | ---------------------------------------------------------- | ---- |
| M2.1 | MFS schema v0 (meta/scenes/place/move/camera/caption)      | ☑    |
| M2.2 | YAML loader preserving source ranges per node              | ☑    |
| M2.3 | Validator T1 + MF error codes + pretty/json printers       | ☑    |
| M2.4 | Validator T2 references + did-you-mean                     | ☑    |
| M2.5 | Compiler: screenplay → timeline IR                         | ☑    |
| M2.6 | Render service: IR → frames → encoder; `mf render`         | ☑    |
| M2.7 | `mf frame --at` single-instant preview                     | ☑    |
| M2.8 | `examples/01-shapes` + e2e test + CI artifact              | ☑    |

## M3 — Narration spine

| Id   | Task                                                             | Done |
| ---- | ---------------------------------------------------------------- | ---- |
| M3.1 | `voices:` + `narration:` schema (segments, pauses, emphasis)     | ☑    |
| M3.2 | `TtsAdapter` + Qwen DashScope impl + mock adapter                | ☑    |
| M3.3 | Freeze-cache: hashed WAVs, `voice.lock.json`, `mf voice sync`    | ☑    |
| M3.4 | Aligner + fuzzy transcript matching → per-word timestamps        | ☑    |
| M3.5 | Sync anchors: `on:` phrase→tick, nth/offset, `mf timing`         | ☑    |
| M3.6 | Narration in the mix + mux; recorded-VO adapter                  | ☑    |
| M3.7 | Validator: missing/ambiguous anchors, stale cache + fix hints    | ☑    |
| M3.8 | `examples/03-narrated`: 45 s narrated piece                      | ☑    |

## M4 — Motion-graphics grammar & cards

| Id   | Task                                                          | Done |
| ---- | ------------------------------------------------------------- | ---- |
| M4.1 | Emphasis verbs: pop-in/out, spin-in, slam, wiggle, pulse      | ☑    |
| M4.2 | `bounce-to` hop locomotion + slide-with-bob                   | ☑    |
| M4.3 | Cartoon FX: explode, impact stars, speedlines, emitters       | ☑    |
| M4.4 | `squash-stretch` modifier on any node                         | ☑    |
| M4.5 | Cards: date/chapter/list/quote + cutaways + name labels       | ☑    |
| M4.6 | Style presets: `explainer-paper` + `clean-flat`               | ☑    |
| M4.7 | `examples/04-kinetic`: narrated kinetic reel                  | ☑    |

## M5 — Object system

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M5.1 | Part-tree schema (shapes/gradients/strokes/pivots)          | ☑    |
| M5.2 | Instancing: params, scale/flip/tint at placement            | ☑    |
| M5.3 | Articulation: hinge, spin (ω=v/r), oscillate, piston        | ☑    |
| M5.4 | Library loader (`use:` project + built-in paths)            | ☑    |
| M5.5 | Starter library 1: stage/props (12 objects)                 | ☑    |
| M5.6 | Starter library 2: world (18 objects)                       | ☑    |
| M5.7 | Depth/parallax model + background layers                    | ☑    |
| M5.8 | `examples/05-props`: narrated prop showcase                 | ☑    |

## M6 — Characters: caricature-first

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M6.1 | Skeleton + FK + pose blending                               | ☑    |
| M6.2 | Analytic two-bone IK (arm reaches)                          | ☑    |
| M6.3 | Vector skinning + facing flips                              | ☑    |
| M6.4 | Potato-biped template                                       | ☑    |
| M6.5 | Face: eyes/blink/look-at, brows, flap-mouth; expressions    | ☑    |
| M6.6 | Costume/prop system: headwear, facial hair, outfits, items  | ☑    |
| M6.7 | Reaction pack: jaw-drop, eye-bulge, sweat, steam, deadpan   | ☑    |
| M6.8 | Simple quadruped (horse/dog) + rider seat                   | ☑    |
| M6.9 | `examples/06-cast`: caricature lineup                       | ☑    |

## M7 — Map engine

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M7.1 | Vendor Natural Earth + GeoJSON→stylized part-tree compiler  | ☑    |
| M7.2 | Custom/historical region overlays + `groups:`               | ☑    |
| M7.3 | highlight / recolor sweeps / territory-change morphs        | ☑    |
| M7.4 | Curved growing arrows + multi-arrow offensives              | ☑    |
| M7.5 | Unit icons marching; battle-burst; plant-flag               | ☑    |
| M7.6 | Map labels + `zoom-to region:` camera framing               | ☑    |
| M7.7 | `examples/07-warmap`: fully narrated war map                | ☑    |

## M8 — Skits & slapstick-lite

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M8.1 | Stage presets (backdrops, ground, wings) + enter/exit verbs | ☑    |
| M8.2 | Gestures: point, wave, salute, facepalm, shrug, clap, …     | ☑    |
| M8.3 | Postures: sit, kneel, lie-down, stand-up + transitions      | ☑    |
| M8.4 | Character lines: voices + pitch-shift, flaps, bubbles       | ☑    |
| M8.5 | Slapstick-lite: bonk, fling, squash-land, chase loop        | ☑    |
| M8.6 | `keyframes:` escape hatch on bones/parts/properties         | ☑    |
| M8.7 | `examples/08-skit`: two leaders argue, bonk, explosion      | ☑    |

## M9 — Audio: dense sound design

| Id   | Task                                                        | Done |
| ---- | ----------------------------------------------------------- | ---- |
| M9.1 | Audio event bus (cues + verb-default SFX + solver events)   | ☑    |
| M9.2 | CC0 SFX library + license manifest                          | ☑    |
| M9.3 | Music beds by mood + tension stingers + clean loop cuts     | ☑    |
| M9.4 | Ducking automation + VO leveling                            | ☑    |
| M9.5 | Offline mixer → WAV determinism test; mux hash test         | ☑    |
| M9.6 | Re-render `08-skit` fully sounded                           | ☑    |

## M10 — Cinematography

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M10.1 | Camera rig: transform/zoom/bounds/letterbox                | ☑    |
| M10.2 | pan-to / zoom-to / cut / zoom-punch / whip-pan / shake     | ☑    |
| M10.3 | Track with damped spring                                   | ☑    |
| M10.4 | Framing presets: wide/medium/close-up/two-shot/region      | ☑    |
| M10.5 | Transitions: fade, crossfade, wipe, iris + grading         | ☑    |
| M10.6 | `examples/09-directed`: `08-skit` re-cut                   | ☑    |

## M11 — Typography & i18n

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M11.1 | Bundled Noto set + fallback chain + licenses               | ☑    |
| M11.2 | Titles/lower-thirds; subtitles from narration + alignment  | ☑    |
| M11.3 | Multi-script goldens: Bengali, Arabic, CJK, mixed          | ☑    |
| M11.4 | `examples/10-bangla`: English VO + Bengali subtitles       | ☑    |

## M12 — Validator T3 + the LLM handbook

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M12.1 | Action conflict matrix from registry declarations          | ☑    |
| M12.2 | Continuity: presence, teleports, held items, line-speaker  | ☑    |
| M12.3 | Pacing lints: dead air, sync collisions, card overlaps     | ☑    |
| M12.4 | Error catalog docs + message style audit                   | ☑    |
| M12.5 | `mf spec` generator + CI drift check                       | ☑    |
| M12.6 | `mf check --json` finalized + exit codes                   | ☑    |
| M12.7 | Broken-screenplay corpus (40+)                             | ☑    |

## M13 — Agent mode: script-first authoring

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M13.1 | LLM adapter interface + Anthropic impl + mock adapter      | ☑    |
| M13.2 | `docs/style-guide.md`: pacing rules + beat templates       | ☑    |
| M13.3 | Two-pass `mf author` + `--research`                        | ☑    |
| M13.4 | `mf storyboard` contact sheets + `--review`                | ☑    |
| M13.5 | Response caching + resumable runs                          | ☑    |
| M13.6 | CI e2e with mocks                                          | ☑    |
| M13.7 | `examples/11-authored` + committed transcript              | ☑    |

## M14 — Realism & physics pack

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M14.1 | Footstep-planned gait + no-slide CI metric                 | ☑    |
| M14.2 | Jump/climb/swim/fly + bird/fish/creature-builder templates | ☑    |
| M14.3 | PBD solver + colliders                                     | ☑    |
| M14.4 | Ragdoll + blend-back recovery                              | ☑    |
| M14.5 | Shatter + debris                                           | ☑    |
| M14.6 | Full interactions: take/put/give, throw & catch, ride, …   | ☑    |
| M14.7 | `examples/12-fable`: the v1 fox-and-bread film             | ☑    |

## M15 — Hardening, performance, showcase, v1.0

| Id    | Task                                                       | Done |
| ----- | ---------------------------------------------------------- | ---- |
| M15.1 | Worker-pool rasterization + streaming pipeline             | ☑    |
| M15.2 | CLI UX: progress, timings, friendly failures               | ☑    |
| M15.3 | Docs: quickstart, language tour, cookbooks                 | ☑    |
| M15.4 | Showcase films rendered in CI                              | ☐    |
| M15.5 | Platform matrix + pinned-toolchain doc                     | ☐    |
| M15.6 | Traceability audit → tag `v1.0.0`                          | ☐    |
