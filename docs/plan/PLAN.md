# MotionForge — Master Build Plan v2 (Narration-Driven Explainer Pivot)

**A deterministic 2.5D animation compiler, re-aimed at OverSimplified-style narrated explainer films: one screenplay + one narration track in, one finished MP4 out.**

Plan date: 2026-07-26 · Supersedes v1 as the plan of record (`docs/plan/PLAN.md`) · Execution: Claude Code, task by task

---

## 0. What changed from v1, and why (the direct answer)

**Does the pipeline change for OverSimplified-style videos? The core doesn't; the spine and the content systems do.** Everything style-agnostic survives untouched: the deterministic compiler (integer ticks, seeded RNG, frame N as a pure function), YAML screenplay + validator + machine-fixable errors, SVG-per-frame IR → resvg → ffmpeg (bitexact encode verified byte-identical), the action registry as single source of truth, `mf spec`, previews, the agent loop, and the entire git/CI small-commit workflow.

What an OverSimplified-style video *is* forces five real changes:

1. **The narrator's voice becomes the timeline spine.** These videos are wall-to-wall voiceover; every visual lands on a word. v1 timed events in seconds; v2 anchors them to narration phrases (`on: "declares war"`). TTS moves from "post-1.0 idea" to core subsystem — **default engine: `qwen-audio-3.0-tts`**, wrapped in an adapter with a freeze-cache that preserves byte-determinism (§5.1).
2. **An animated map engine is the new signature subsystem.** Borders, territory recolors, sweeping arrows, marching army icons, planted flags, zoom-to-region. v1 had nothing like it; it becomes milestone M7.
3. **Motion simplifies into a motion-graphics grammar.** The genre runs on pop-in, slam, bounce-hop, wiggle, shake, explosion clouds, snap-zooms — cheap, high-energy verbs — plus date cards, name labels, and framed cutaways. v1's hardest systems (footstep-planned gait, PBD ragdoll, deep interactions) are *deferred, not deleted* — they move to a late "realism pack" milestone because hopping potato-people don't need them.
4. **Characters re-prioritize toward caricature.** The v2 flagship template is the potato-biped (round body, thin limbs, big expressive face) plus a **costume/prop system** (hats, crowns, helmets, mustaches, uniforms) so any historical or invented figure is describable in a few lines. A simple horse ships early (cavalry!); the full animal menagerie comes later.
5. **Sound design density goes up.** Whoosh/boink/slam/explosion on nearly every visual event, music beds with tension stingers, and everything ducked under narration.

**If you already started v1: M0–M2 are byte-for-byte the same tasks. Nothing done is wasted; v2 diverges from M3 onward.**

---

## 1. Target product and quality bar

**Output:** 2–20 minute narrated explainer films (history, science, "how X happened", any topic), 1080p30 MP4, in the *genre* of OverSimplified: continuous comedic narration; alternation between **map/exposition segments** and **character skits**; caricature cast; date cards and labels; dense slapstick sound design. (We build in the genre's language — our own art, characters, and branding; no cloning of any channel's specific character designs, logo, or intro.)

**The quality bar that makes it "feel like that", encoded as engine defaults and validator warnings:**

- Something moves on screen at all times; a beat (cut, pop, zoom, reveal) every 2–5 seconds — the validator warns on dead air.
- Visuals react to *words*: the arrow sweeps exactly on "invaded", the card slams exactly on "ultimatum". Phrase-anchored sync is the authoring primitive, not an afterthought.
- Comedy is reaction: characters react to the narrator (jaw-drop, sweat drops, anger steam, deadpan blink); the narrator can address characters and they can squeak back one-liners.
- Fast cinematography: snap-zooms into faces, whip-pans between speakers, camera shake on impacts.
- Sound sells every gag: no visual event without its SFX; music ducks under VO and swells between segments.

### The three contracts (v2 wording)

1. **Determinism.** Given (screenplay, **frozen voice cache**, MotionForge version, pinned toolchain) → byte-identical MP4, enforced by CI double-render. Hosted TTS is inherently non-reproducible, so generated narration audio is **frozen by content hash** the moment it's fetched (§5.1); rendering never calls the network.
2. **Machine-fixable errors.** Unchanged from v1, extended to narration: unknown anchor phrases, ambiguous anchors, sync collisions, dead-air pacing warnings — every finding with code, file:line:col, plain message, fix hint, `--json`.
3. **Self-description.** `mf spec` still generates the complete, always-current LLM handbook from the schemas/registries the engine executes — now including narration, sync, maps, cards, and every verb.

---

## 2. Architecture: what survives, what's new

**Survives from v1 (unchanged designs):** deterministic kernel (ticks/RNG/easing/scene-graph/SVG emitter) · YAML+zod language stack with positioned errors · compiler → timeline IR · resvg rasterizer behind an interface with fallback chain · bundled Noto fonts, multi-script captions (Bengali subtitles still first-class) · painter-sort 2.5D depth/parallax · object part-trees with hinge/spin articulation · rig/FK/IK/skinning core · offline sample-accurate audio mixer + bitexact mux (verified) · golden/determinism test infra · CI-rendered example films · agent-loop skeleton with mock adapter.

**New in v2:**

```
story idea ──(agent: script pass)──► narration text ──(TTS adapter: Qwen)──► voice cache (wav, frozen)
                                                            │
                                                    forced alignment (word timestamps, cached)
                                                            │
screenplay (.mfs.yaml) ── narration blocks + sync anchors ──┤
                                                            ▼
                compiler: phrases → ticks ──► timeline IR ──► solvers (motion-graphics verbs,
                maps, skits, cards, camera) ──► SVG frames ──► resvg ──► ffmpeg ◄── mixer
                                                                                  (VO + ducked music + SFX)
```

New packages: `voice` (TTS adapters, freeze-cache, aligner) and `maps` (GeoJSON compiler, territory/arrow/unit solvers). New card/style layer in `render`. Everything else lands in existing packages.

## 3. Technology decisions — v2 delta

| Decision | Choice | Rationale / facts |
|---|---|---|
| Narration TTS | **`qwen-audio-3.0-tts` via Alibaba Cloud Model Studio (DashScope)** — `-plus` tier for final renders, `-flash` for drafts. Hosted-only, bidirectional WebSocket streaming, Node SDK/examples available, PCM/WAV output up to 48 kHz, preset voice library + voice cloning, 16 languages (Arabic, Chinese, English, French, German, Indonesian, Italian, Japanese, Korean, Malay, Portuguese, Russian, Spanish, Tagalog, Thai, Vietnamese) | Quality-tier + cheap-draft-tier fits the write→preview→final loop. ~$28/1M chars ≈ pennies per film. **Caveats designed around:** no word timestamps → we align ourselves; **no Bengali voice** → Bengali films use recorded-VO import or another adapter (open-source Qwen3-TTS voice-clone is a candidate local path), Bengali *captions* unaffected; hosted+nondeterministic → freeze-cache below |
| Determinism vs hosted TTS | **Freeze-cache**: `assets/voice/<sha256(model,voice,params,text)>.wav` + `.align.json`, plus `voice.lock.json` mapping narration segments → hashes. `mf voice sync` is the only networked command; `mf render` is offline and fails loudly on cache miss | Determinism contract preserved exactly; re-recording a line = a visible lockfile diff in git |
| Forced alignment | **whisper-class aligner behind an interface** — spike M0.7 picks pinned `whisper.cpp` binary (preferred, single-binary like ffmpeg-static) vs `faster-whisper` python sidecar; transcript is *known*, so we only fuzzy-match tokens to script words | TTS returns no timestamps; alignment also makes **recorded human VO** a first-class equal path (drop in a WAV, same pipeline) |
| Character voice lines | Same Qwen adapter with per-character preset voices + deterministic pitch-shift post-process; offline squeak-synth as fallback | Squeaky one-liner reactions are a genre staple |
| Map data | **Vendored Natural Earth subsets (110m/50m, public domain)** compiled GeoJSON→stylized part-trees; hand/LLM-authored simplified region overlays for historical borders; path-resample morphing for border changes | Real geography for free where it exists; cartoon-simplified historical blobs are genre-accurate anyway |
| Everything else | As v1: TypeScript/Node≥22 pnpm monorepo, yaml+zod, resvg-js (fallback @napi-rs/canvas → Chromium), bundled Noto, ffmpeg-static bitexact (verified byte-identical), PCG32, vitest, GitHub Actions | Unchanged |

**ADR additions:** 0006 narration spine & freeze-cache · 0007 map engine & data sources · 0008 motion-graphics grammar & style presets (renumber the v1 ADR list after these).

---

## 4. MFS v2 — the screenplay language with a narration spine

Everything from v1 MFS holds (verbs over keyframes, seconds→ticks, names everywhere, `keyframes:` escape hatch). v2 adds `narration:` blocks and **phrase-anchored sync** — the genre's core authoring primitive:

```yaml
motionforge: 2
meta: { title: "The Powder Keg", resolution: 1920x1080, fps: 30, seed: 7, style: explainer-paper }
voices:
  narrator: { engine: qwen-audio-3.0-tts-plus, voice: preset-warm-m, rate: 1.05 }
  franz:    { engine: qwen-audio-3.0-tts-flash, voice: preset-bright-m, pitch: +5st }
cast:
  franz:  { template: potato-biped, size: 0.9, costume: [royal-uniform, plumed-hat], mustache: imperial }
  vilhelm:{ template: potato-biped, size: 1.0, costume: [military-uniform, spiked-helmet], mustache: handlebar }
maps:
  europe: { source: naturalearth/europe-110m, style: paper,
            groups: { central-powers: [germany, austria-hungary], entente: [france, russia, gb] } }
scenes:
  - id: setup
    stage: { map: europe, frame: region:europe }
    narration:
      - voice: narrator
        text: >
          By 1914, Europe had organized itself into two heavily armed
          friend groups, absolutely convinced that this was fine.
        sync:
          - { on: "two heavily armed",  do: { map: { recolor: { central-powers: "#b5453c", entente: "#3c6fb5" }, sweep: 0.6s } } }
          - { on: "friend groups",      do: [ { label: { central-powers: "Central Powers" } },
                                              { label: { entente: "The Entente" } }, { sfx: pop } ] }
          - { on: "this was fine",      do: { card: { text: "IT WAS NOT FINE", style: slam-red }, sfx: slam,
                                              camera: { shake: 0.3 } } }
  - id: skit-ultimatum
    stage: { backdrop: palace-hall, props: [ { ref: library/desk, at: [2, 0] } ] }
    place: [ { ref: franz, at: [-2, 0], facing: right } ]
    narration:
      - voice: narrator
        text: >
          So Austria-Hungary sent Serbia an ultimatum with demands so
          unreasonable that even Austria was like, wow, that is a lot.
        sync:
          - { on: "sent Serbia",   do: { franz: { action: slam-prop, item: library/scroll, on: desk }, sfx: thud } }
          - { on: "so unreasonable", do: { card: { list: ["give us everything", "apologize forever", "also your hats"], style: paper-note } } }
          - { on: "wow",           do: { franz: { react: jaw-drop }, camera: { zoom-punch: franz.face } } }
    lines:
      - { after: "that is a lot", franz: { say: "It really is.", voice: franz, react: deadpan } }
```

Semantics: each scene's duration derives from its narration audio (plus configurable tail padding); `on:` binds to the first occurrence of the phrase in that segment (use `{ phrase, nth }` for repeats, `offset:` for fine timing); the compiler resolves phrases → word timestamps → ticks using the frozen alignment. Absolute `at:` seconds still work everywhere (music-only sequences, skits without narration). `mf timing film.mfs.yaml` prints the resolved marker table so a human or LLM can see exactly where every word lands.

## 5. New subsystem designs

### 5.1 Narration spine (`voice`)

`TtsAdapter` interface: `synthesize(text, voiceSpec) → wav`. Implementations: **qwen** (DashScope WebSocket client, flash + plus model IDs, 48 kHz WAV, `DASHSCOPE_API_KEY` env), **recorded** (user-supplied WAV/MP3 per segment — the path for Bengali VO until an adapter supports it), **mock** (sine-sweep placeholder for CI and offline dev). Workflow: `mf voice sync` walks all narration segments → synthesizes missing ones → writes content-hashed WAVs + runs the aligner → updates `voice.lock.json`; everything else (`render`, `frame`, `check`) is offline and deterministic against the cache. Changing text/voice changes the hash → the validator flags stale segments with the exact `mf voice sync` fix hint. The aligner fuzzy-matches known transcript tokens to recognized tokens, emitting per-word `[start,end]` — robust to TTS pronunciation quirks and proper nouns because we never trust recognition *content*, only timing.

### 5.2 Map engine (`maps`)

A map is a compiled **object part-tree** (so all existing object machinery applies): the GeoJSON compiler simplifies (Douglas–Peucker), projects (equirectangular default), styles (paper palette, subtle coast outline), and names each region as a part. Historical/fictional borders: author simplified region paths as overlays or replacements — genre-appropriately blobby, LLM-authorable. Verbs: `highlight` (pulse/outline), `recolor` (animated sweep or edge-morph for territory change), `arrow` (curved, growing, with head; multi-arrow offensives), `march` (unit icons — infantry/cavalry/ship/plane silhouettes — along a path with dust trail), `plant-flag`, `battle-burst` (clash stars + smoke at a point), `label` (region names with pop), `zoom-to region:` (camera framing from region bbox). Border morphs resample both paths to N points and interpolate — cartoon-correct, deterministic.

### 5.3 Motion-graphics grammar (`motion`)

The genre's kinetic vocabulary as first-class registry verbs, all seeded/deterministic: `pop-in/pop-out` (scale overshoot), `spin-in`, `slam` (drop + squash + camera-shake trigger), `wiggle`, `pulse`, `bounce-to` (the default character move: hop-slide with body bob — no foot IK needed, no slide possible because feet aren't planted), `fling` (ballistic arc + tumble + squash-land), `explode` (cloud puffs + flash + debris), impact stars, speedlines, sweat/steam/heart emitters. Plus a `squash-stretch` modifier applicable to any node. These are cheap to build (no solvers) and carry 80% of the genre's motion.

### 5.4 Characters: caricature-first (`motion`)

Rig core unchanged from v1 (skeleton, FK, analytic two-bone IK for arm reaches, bone-attached vector skinning, proportions perfect by construction). v2 templates in priority order: **potato-biped** (round body, thin limbs, oversized head, big eyes) with **costume/prop slots** — headwear (crowns, spiked helmets, plumed hats, turbans, berets), facial hair (imperial/handlebar/chevron/goatee), outfits (royal, military, peasant, suit, robes), held items — so "Napoleon-ish general" or "angry tsar" is a 3-line description; **reaction pack** for faces: jaw-drop, eye-bulge, sweat drop, anger steam, hearts, deadpan blink, nervous smile; **simple quadruped** (horse first — cavalry — plus dog/cat) with a rider attach point. Full menagerie (birds, fish, creature-builder) moves to M14.

### 5.5 Skits, stages, and character lines (`motion`, `render`)

Stage presets: flat ground + backdrop (palace hall, battlefield, throne room, street, generic gradient) + props, with enter/exit wings (`bounce-in from: left`). Gestures (point, wave, salute, facepalm, shrug, clap, nod/shake) and postures (sit/kneel/lie) carry over from v1's registry design. **Character lines**: short `say:` one-liners synthesized with per-character Qwen voices + deterministic pitch-shift (or squeak-synth fallback), simple 2-frame mouth flaps, optional comic speech bubble; narration auto-ducks under lines. Slapstick-lite: `bonk` (impulse + stars + wobble), `fling`, `squash-land`, `chase` (loop two bounce-to actors) — parametric, no physics engine needed yet.

### 5.6 Cards, labels, cutaways (`render`)

`card:` system with slam/pop/paper-note styles: **date cards** ("1914" — huge, centered, slammed), **chapter cards**, **list cards** (comedy bullet lists that pop item-by-item), **framed cutaways** (paper-framed panel that wobbles in, containing any object/scene snippet), **name labels** (nametag popping under a character), **quote plates**. All text through the existing multi-script pipeline — Bengali/Arabic/CJK cards work day one.

### 5.7 Style system (`render`)

A first-class `style:` preset bundling palette, paper-grain background texture, outline weights, fonts (bold condensed for cards, clean sans for subtitles), shadow treatment, and motion defaults (overshoot amounts, shake intensity). Ships with `explainer-paper` (the genre look) and `clean-flat`; every parameter overridable per film. Presets keep films consistent and make "looks like the genre" a config, not a hope.

### 5.8 Audio (`render`) — carried from v1, promoted and extended

Event bus unchanged; adds **ducking automation** (music −10 dB under any voice, smooth ramps), tension stingers, and the rule that every registry verb declares its default SFX (slam→thud, explode→boom, pop-in→pop) so sound density is automatic unless muted. Offline mixer → WAV → bitexact mux (already verified byte-identical).

### 5.9 Validator & spec additions (`lang`)

New rule families: anchor phrase not found / ambiguous (with did-you-mean against the segment text); sync collisions (two slams within 0.3s); stale voice cache; dead-air pacing warnings (no visual event for >5s of narration); card overlap; region name unknown (with map's region list); line-speaker not on stage. `mf spec` gains chapters for narration/sync/maps/cards/style — still generated, still drift-checked in CI.

### 5.10 Agent mode (`agent`) — two-pass authoring

`mf author "how the French Revolution spiraled"` now runs: **script pass** (LLM writes the narration screenplay-style — hook, chapters, gags) → optional **research pass** (`--research`: LLM outlines facts first) → **direction pass** (LLM attaches sync events, skits, maps, cards to its own phrases, guided by a committed `docs/style-guide.md` of genre pacing rules and **beat templates** — reusable parameterized patterns like `ultimatum-beat`, `alliance-map-beat`, `battle-beat`) → `mf voice sync` → `mf check` fix loop → storyboard `--review` (vision model judges pacing/composition) → render. Mock adapters keep the whole loop CI-testable offline.

## 6. Repository layout (v2 delta)

```
packages/
  core/    lang/    motion/    render/    cli/    agent/        # as v1
  voice/   # NEW: tts adapters (qwen, recorded, mock), freeze-cache, aligner, voice.lock
  maps/    # NEW: geojson compiler, region overlays, territory/arrow/march solvers
assets/
  library/  fonts/  audio/                                      # as v1
  geodata/  # NEW: vendored Natural Earth subsets (public domain) + attribution
  voice/    # NEW: frozen narration wavs + alignment json (content-hashed)
docs/plan/PLAN.md  docs/plan/PROGRESS.md  docs/adr/  docs/SPEC.md  docs/style-guide.md  docs/errors/
examples/  CLAUDE.md
```

## 7. Engineering workflow — unchanged rules, restated in one breath

One task = one commit = one push, with the plan's commit message · `docs/plan/PROGRESS.md` checkbox ticked in the same commit · plans and ADRs committed before the code they govern · every milestone ends with an example film rendered by CI as a downloadable artifact + a `m<N>-<name>` tag · `pnpm verify` (lint, typecheck, tests, goldens, determinism double-render) green before every commit · goldens only change via `pnpm goldens:update` with eyeballed diffs.

## 8. Testing strategy — v2 additions

All v1 layers stand (determinism double-render SHA-256, golden SVGs + PNG phashes, validator corpus, e2e examples, spec drift, mock-agent e2e). New:

| Layer | Test |
|---|---|
| Voice cache | Cache hit → zero network, byte-stable WAV hashes; stale-cache detection fixture; `voice.lock.json` round-trip |
| Alignment | Known-transcript fixtures: every script word gets a timestamp, monotonic, gaps bounded; proper-noun fuzz cases |
| Sync resolution | Phrase→tick unit tests: uniqueness, nth-occurrence, offsets; ambiguity fixtures assert error codes |
| Maps | Golden frames per verb (recolor sweep, arrow, march, morph); region-name resolution tests; morph endpoint equality |
| Pacing lints | Dead-air and sync-collision fixtures assert warning codes |
| Ducking/mix | Gain-automation snapshots; full-film WAV + MP4 hashes with VO + lines + music + SFX |
| Style presets | One golden frame per preset to lock the look |

## 9. Milestone plan v2

**M0–M2 are identical to v1** (M0 gains two spikes; the v1 task tables are inlined below verbatim so this plan is self-contained). ~110 tasks total. Path to first watchable narrated video: **M0→M3 (then every milestone adds genre power)**.

### M0 — Bootstrap & de-risk spikes *(v1 M0 + two new spikes)*

| Id | Task | Commit |
|---|---|---|
| M0.1 | pnpm monorepo, TS strict, vitest, eslint+prettier, `.nvmrc`, package scaffolds | `chore: bootstrap monorepo and toolchain` |
| M0.2 | Commit PLAN.md + PROGRESS.md (all tasks as checkboxes) + CLAUDE.md (repo rules, verify gate, commit style) | `docs: add master plan, progress tracker, claude rules` |
| M0.3 | GitHub Actions: lint/typecheck/test on push; artifact upload wiring | `ci: add verify pipeline` |
| M0.4 | Spike: resvg-js renders SVG→PNG; measure ms/frame at 1080p; record versions | `spike: svg rasterization via resvg-js` |
| M0.5 | **Spike: multi-script text** — Bengali conjuncts/matra, Arabic joining+RTL, CJK through resvg with bundled Noto; eyeball + commit golden PNGs; **if shaping fails: run same test on @napi-rs/canvas and switch backends via ADR** | `spike: complex-script text shaping` |
| M0.6 | Spike: 60 generated frames → ffmpeg (ffmpeg-static) bitexact → MP4; render twice, hashes equal | `spike: deterministic encode pipeline` |
| M0.7 | **Spike: Qwen TTS + alignment** — DashScope WebSocket client synthesizes one paragraph (flash + plus), save 48 kHz WAV; run whisper.cpp (pinned binary) vs faster-whisper sidecar on it; pick aligner; verify freeze-cache → repeat renders byte-stable with zero network | `spike: qwen tts and forced alignment` |
| M0.8 | **Spike: map render** — vendor Natural Earth Europe 110m, GeoJSON→simplified stylized SVG, recolor one region, morph one border | `spike: map rendering` |
| M0.9 | ADRs incl. narration spine, map engine, motion-graphics grammar | `docs: v2 adrs` |

**Exit:** moving rectangle + multi-script caption MP4 (v1) **plus** a spoken sentence with a word-timestamp table and a recolorable Europe. Every new bet proven before building on it.

### M1 — Deterministic kernel *(unchanged from v1)*

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

### M2 — Screenplay v1 + end-to-end pipeline *(unchanged from v1)*

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

### M3 — Narration spine (the genre's core, moved way up)

| Id | Task | Commit |
|---|---|---|
| M3.1 | `voices:` + `narration:` schema (segments, per-scene, pauses, emphasis) | `feat(lang): narration schema` |
| M3.2 | `TtsAdapter` + **Qwen DashScope impl** (flash/plus, WS→WAV 48 kHz) + mock adapter | `feat(voice): qwen tts adapter` |
| M3.3 | Freeze-cache: content-hashed WAVs, `voice.lock.json`, `mf voice sync`, offline-render guarantee | `feat(voice): freeze cache` |
| M3.4 | Aligner (choice from M0.7) + fuzzy transcript matching → per-word timestamps, cached | `feat(voice): forced alignment` |
| M3.5 | Sync anchors: `on:` phrase→tick resolution, nth/offset, auto scene duration, `mf timing` table | `feat(lang): phrase-anchored timing` |
| M3.6 | Narration in the mix + mux; recorded-VO adapter (drop-in WAV per segment) | `feat(voice): narration mux and recorded vo` |
| M3.7 | Validator: missing/ambiguous anchors, stale cache, absent segments — with fix hints | `feat(lang): narration validation` |
| M3.8 | `examples/03-narrated`: 45 s narrated piece, captions + camera moves synced to words | `feat(examples): 03-narrated` |

**Exit:** type a script → hear it narrated over synced visuals. The genre's skeleton exists.

### M4 — Motion-graphics grammar & cards

| Id | Task | Commit |
|---|---|---|
| M4.1 | Emphasis verbs: pop-in/out, spin-in, slam (+shake trigger), wiggle, pulse | `feat(motion): emphasis verbs` |
| M4.2 | `bounce-to` hop locomotion + slide-with-bob (genre default movement) | `feat(motion): bounce locomotion` |
| M4.3 | Cartoon FX: explode (puffs/flash/debris), impact stars, speedlines, sweat/steam emitters | `feat(motion): cartoon fx` |
| M4.4 | `squash-stretch` modifier on any node | `feat(motion): squash stretch` |
| M4.5 | Cards: date/chapter/list/quote + framed cutaways + name labels, pop/slam styles | `feat(render): cards and labels` |
| M4.6 | Style presets: `explainer-paper` + `clean-flat` (palette, texture, fonts, motion defaults) | `feat(render): style presets` |
| M4.7 | `examples/04-kinetic`: narrated reel where every phrase triggers a verb or card | `feat(examples): 04-kinetic` |

**Exit:** narration + kinetic typography + FX — already a publishable "animated essay" tier.

### M5 — Object system *(v1 M3, trimmed and re-flavored)*

| Id | Task | Commit |
|---|---|---|
| M5.1 | Part-tree schema (shapes/gradients/strokes/pivots) | `feat(lang): object part-tree schema` |
| M5.2 | Instancing: params, scale/flip/tint at placement | `feat(core): object instancing` |
| M5.3 | Articulation: hinge, spin (ω=v/r), oscillate, piston | `feat(motion): articulated parts` |
| M5.4 | Library loader (`use:` project + built-in paths) | `feat(lang): object library loader` |
| M5.5 | Starter library 1: stage/props (desk, throne, scroll, flagpole, cannon, tent, well, table, chair, lamp, fence, crate) | `feat(assets): starter objects 1` |
| M5.6 | Starter library 2: world (house, palace, tower, bridge, tree, hills, ship, cart, train, bus, windmill, monument, food set, tool set, flags) | `feat(assets): starter objects 2` |
| M5.7 | Depth/parallax model + background layers | `feat(core): parallax depth` |
| M5.8 | `examples/05-props`: narrated prop showcase (door opens on cue, cannon fires on "fired") | `feat(examples): 05-props` |

### M6 — Characters: caricature-first *(v1 M4 re-prioritized)*

| Id | Task | Commit |
|---|---|---|
| M6.1 | Skeleton + FK + pose blending | `feat(motion): skeleton and fk` |
| M6.2 | Analytic two-bone IK (arm reaches) | `feat(motion): two-bone ik` |
| M6.3 | Vector skinning + facing flips | `feat(motion): vector skinning` |
| M6.4 | **Potato-biped template** (round body, thin limbs, big head; size/proportion/palette params) | `feat(motion): potato-biped` |
| M6.5 | Face: eyes/blink/look-at, brows, flap-mouth; expression presets | `feat(motion): face module` |
| M6.6 | **Costume/prop system**: headwear, facial hair, outfits, held items — caricature-by-description | `feat(motion): costumes and props` |
| M6.7 | Reaction pack: jaw-drop, eye-bulge, sweat, anger steam, hearts, deadpan | `feat(motion): reactions` |
| M6.8 | Simple quadruped (horse/dog) + rider seat | `feat(motion): quadruped and rider` |
| M6.9 | `examples/06-cast`: caricature lineup reacting to narration beats | `feat(examples): 06-cast` |

**Exit:** any historical or invented figure describable in ~3 lines, reacting on cue.

### M7 — Map engine (the signature)

| Id | Task | Commit |
|---|---|---|
| M7.1 | Vendor Natural Earth subsets + GeoJSON→stylized part-tree compiler (simplify, project, paper style) | `feat(maps): geojson compiler` |
| M7.2 | Custom/historical region overlays + `groups:` (alliances) | `feat(maps): custom regions and groups` |
| M7.3 | highlight / recolor sweeps / territory-change morphs | `feat(maps): territory animation` |
| M7.4 | Curved growing arrows + multi-arrow offensives | `feat(maps): arrows` |
| M7.5 | Unit icons (infantry/cavalry/ship/plane) marching along paths; battle-burst; plant-flag | `feat(maps): units and battles` |
| M7.6 | Map labels + `zoom-to region:` camera framing | `feat(maps): labels and framing` |
| M7.7 | `examples/07-warmap`: alliances color in, ultimatum card, arrows sweep, armies march — fully narrated | `feat(examples): 07-warmap` |

**Exit:** the map sequences the genre is famous for, driven by phrases.

### M8 — Skits & slapstick-lite

| Id | Task | Commit |
|---|---|---|
| M8.1 | Stage presets (backdrops, ground, wings) + enter/exit verbs | `feat(motion): skit stages` |
| M8.2 | Gestures: point, wave, salute, facepalm, shrug, clap, nod, shake-head, bow | `feat(motion): gestures` |
| M8.3 | Postures: sit, kneel, lie-down, stand-up + transitions | `feat(motion): postures` |
| M8.4 | **Character lines**: per-character Qwen voices + deterministic pitch-shift (squeak-synth fallback), flap-mouth, speech bubbles, narration ducks under lines | `feat(voice): character lines` |
| M8.5 | Slapstick-lite: bonk (impulse+stars), fling (arc+tumble), squash-land, chase loop | `feat(motion): slapstick` |
| M8.6 | `keyframes:` escape hatch on bones/parts/properties | `feat(motion): declarative keyframes` |
| M8.7 | `examples/08-skit`: two leaders argue over narration, bonk, explosion, title card | `feat(examples): 08-skit` |

**Exit:** the map/skit alternation — the full genre structure — is authorable.

### M9 — Audio: dense sound design

| Id | Task | Commit |
|---|---|---|
| M9.1 | Audio event bus (timeline cues + verb-default SFX + solver events) | `feat(render): audio event bus` |
| M9.2 | CC0 SFX library (whoosh, pop, slam, boink, explosion, crowd, quill, ding, drumroll) + license manifest | `feat(assets): sfx library` |
| M9.3 | Music beds by mood + tension stingers + clean loop cuts | `feat(render): music beds` |
| M9.4 | **Ducking automation** (music under VO/lines, ramps) + VO leveling | `feat(render): ducking` |
| M9.5 | Offline mixer → WAV determinism test; full-film mux hash test | `feat(render): deterministic mix` |
| M9.6 | Re-render `08-skit` fully sounded | `feat(examples): 08 with sound` |

### M10 — Cinematography

| Id | Task | Commit |
|---|---|---|
| M10.1 | Camera rig: transform/zoom/bounds/letterbox | `feat(core): camera rig` |
| M10.2 | pan-to / zoom-to / cut / **zoom-punch** / whip-pan / seeded shake | `feat(core): camera moves` |
| M10.3 | Track with damped spring (follow marches, chases) | `feat(core): tracking` |
| M10.4 | Framing presets: wide/medium/close-up/two-shot/region | `feat(core): framing presets` |
| M10.5 | Transitions: fade, crossfade, wipe, iris + day/night grading (light version) | `feat(render): transitions and grading` |
| M10.6 | `examples/09-directed`: `08-skit` re-cut with snap-zooms and whip-pans | `feat(examples): 09-directed` |

### M11 — Typography & i18n *(v1 M10 carried)*

| Id | Task | Commit |
|---|---|---|
| M11.1 | Bundled Noto set + fallback chain + licenses | `feat(render): bundled fonts` |
| M11.2 | Titles/lower-thirds; subtitles auto-generated from narration text + alignment | `feat(render): subtitles from narration` |
| M11.3 | Multi-script goldens: Bengali, Arabic (RTL+bidi), CJK, mixed-direction | `test(render): multi-script goldens` |
| M11.4 | `examples/10-bangla`: English VO + **Bengali subtitles** short (recorded-VO Bengali path documented) | `feat(examples): 10-bangla` |

### M12 — Validator T3 + the LLM handbook *(v1 M12 + narration/pacing rules)*

| Id | Task | Commit |
|---|---|---|
| M12.1 | Action conflict matrix from registry declarations | `feat(lang): conflict validation` |
| M12.2 | Continuity: presence, teleports, held items, line-speaker on stage | `feat(lang): continuity validation` |
| M12.3 | **Pacing lints**: dead air >5 s, sync collisions, card overlaps, overlong cards | `feat(lang): pacing lints` |
| M12.4 | Error catalog docs (page per MF code) + message style audit | `docs: error catalog` |
| M12.5 | `mf spec` generator (incl. narration/maps/cards/style chapters) + CI drift check | `feat(lang): spec generator` |
| M12.6 | `mf check --json` finalized + exit codes | `feat(cli): machine-readable check` |
| M12.7 | Broken-screenplay corpus (40+, incl. narration/map cases) | `test(lang): validator corpus` |

### M13 — Agent mode: script-first authoring

| Id | Task | Commit |
|---|---|---|
| M13.1 | LLM adapter interface + Anthropic impl + mock transcript adapter | `feat(agent): llm adapters` |
| M13.2 | `docs/style-guide.md`: genre pacing rules, gag patterns, **beat templates** (ultimatum-beat, alliance-map-beat, battle-beat, betrayal-beat) as parameterized macros | `feat(agent): style guide and beats` |
| M13.3 | Two-pass `mf author`: script pass → direction pass → voice sync → check-fix loop → render; `--research` outline option | `feat(agent): author loop` |
| M13.4 | `mf storyboard` contact sheets + `--review` vision-critique pass | `feat(agent): storyboard review` |
| M13.5 | Response caching + resumable runs | `feat(agent): caching` |
| M13.6 | CI e2e with mocks (bad draft → errors → fixed → MP4) | `test(agent): loop e2e` |
| M13.7 | `examples/11-authored`: film authored end-to-end by the loop, transcript committed | `feat(examples): 11-authored` |

**Exit:** one command: topic in, narrated explainer out. *You can cut an early release tag here — the explainer studio is complete.*

### M14 — Realism & physics pack *(v1's deferred depth — completes the original brief)*

| Id | Task | Commit |
|---|---|---|
| M14.1 | Footstep-planned gait (walk/run/sneak) + no-slide CI metric | `feat(motion): planted gait` |
| M14.2 | Jump/climb/swim/fly + bird/fish/creature-builder templates | `feat(motion): full menagerie` |
| M14.3 | PBD solver + colliders (particles, constraints, ground/AABB/circle) | `feat(motion): pbd physics` |
| M14.4 | Ragdoll + blend-back recovery | `feat(motion): ragdoll` |
| M14.5 | Shatter + debris | `feat(motion): shatter` |
| M14.6 | Full interactions: take/put/carry/give, throw & catch, operate doors/levers, sit-on, ride | `feat(motion): interactions` |
| M14.7 | `examples/12-fable`: the v1 fox-and-bread film, now trivial | `feat(examples): 12-fable` |

### M15 — Hardening, performance, showcase, v1.0

| Id | Task | Commit |
|---|---|---|
| M15.1 | Worker-pool rasterization + streaming pipeline; target: 10-min 1080p30 film renders < 30 min on 8 cores | `perf(render): parallel and streaming` |
| M15.2 | CLI UX: progress, timings, friendly failures | `feat(cli): ux polish` |
| M15.3 | Docs: quickstart, language tour, map/caricature cookbook, YAML-for-authors rules | `docs: user documentation` |
| M15.4 | **Showcase**: "The Battle of Plassey" 3–4 min (English VO, Bengali subtitles) + "How Coffee Conquered the World" mini + the authored film — rendered in CI | `feat(examples): showcase` |
| M15.5 | Platform matrix + pinned-toolchain doc | `chore: platform matrix` |
| M15.6 | Traceability audit (§11) → tag `v1.0.0` | `release: v1.0.0` |

---

## 10. Risk register — v2

| Risk | Mitigation / fallback |
|---|---|
| Qwen TTS API changes, quota, or regional access issues | Adapter interface isolates it; recorded-VO and mock adapters always work; freeze-cache means finished films never re-contact the API; open-source Qwen3-TTS (self-hosted) is a candidate second adapter |
| No Bengali voice in Qwen's 16 languages | Recorded-VO path is first-class (same alignment pipeline); Bengali captions/subtitles unaffected; adapter slot ready for any engine that adds Bengali |
| Alignment errors on proper nouns / comedy pronunciations | Known-transcript fuzzy matching (we take timing, not content); `mf timing` table makes drift visible; manual `offset:` override per anchor |
| Hosted TTS nondeterminism breaking the contract | Freeze-cache + `voice.lock.json`; render is offline by design; CI renders only from committed caches |
| Map data for historical borders doesn't exist | Genre-accurate answer: simplified authored region blobs (LLM-writable); Natural Earth only for modern/physical bases |
| Comedy/pacing quality (the real product risk) | Style guide + beat templates + pacing lints + storyboard vision review; examples corpus doubles as few-shot library |
| Complex-script shaping in resvg | Unchanged from v1: M0.5 spike first, fallback @napi-rs/canvas → Chromium |
| Scope: two new subsystems (voice, maps) | Both spiked in M0 before commitment; maps reuse the object system wholesale; voice is adapters + cache + one aligner |

## 11. Traceability — genre checklist and original-brief disposition

**OverSimplified-genre essentials → where delivered:** wall-to-wall narration synced to visuals → M3; animated maps (borders, arrows, marches, flags, battles) → M7; caricature cast with costumes/reactions → M6; skits alternating with maps → M8; date/chapter/list cards + framed cutaways → M4.5; kinetic pop/slam/shake energy → M4, M10.2; squeaky character one-liners → M8.4; dense SFX + ducked music → M9; fast dramatic camera → M10; multi-script captions → M11; one-command authoring with genre style guide → M13.

**Original v1 brief items — all still land by v1.0, some re-sequenced:** determinism, validator-with-hints, spec self-description, previews/storyboards, agent loop, objects with moving parts, parallax depth, expressive faces, custom `keyframes:` → **unchanged or earlier**. Footstep gait + no-slide metric, swim/fly/climb, bird/fish/creature templates, full ragdoll/PBD/shatter, deep interactions (throw-catch, ride, hand-off) → **M14** (after the explainer studio ships, before v1.0.0). Nothing from the original brief is dropped.

## 12. Definition of done, v1.0

Everything from v1's DoD (fresh-clone verify, CI-rendered examples, double-render hash equality, validator corpus, spec drift, traceability audit) **plus**: `mf voice sync` → offline byte-stable renders from cache; `examples/07-warmap`, `08-skit`, and the M15.4 showcase watchable and *paced* (no pacing lints); `mf author` produces a narrated explainer from a one-line topic with mocks in CI and a live model manually.

## 13. Working with Claude Code

Same session loop as v1 (read PLAN + PROGRESS → execute exactly one task → `pnpm verify` → commit with the listed message + tick the box → push; split tasks via a `docs:` commit first). Note: M0.7's Qwen spike needs `DASHSCOPE_API_KEY` in the environment — stop and ask for it when you reach that task if it's absent.

**Post-1.0 ideas (parked):** Bengali/other-language TTS adapters as they appear · voice-clone narrator via Qwen cloning (with consent + cache) · live preview server · beat-template marketplace · GPU raster · YouTube chaptering/thumbnail exporter.

---

*End of plan v2. It replaces v1 as the plan of record; v1's fully-detailed subsystem designs for the M14 systems (gait, PBD, interactions) remain valid specifications for those tasks — the full v1 text is preserved in git history (`docs: add master plan, progress tracker, claude rules`).*
