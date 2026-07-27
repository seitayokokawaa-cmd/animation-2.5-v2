# Quickstart

MotionForge turns one screenplay file (`.mfs.yaml`) into one finished,
narrated MP4. Nobody draws and nobody keyframes — you describe the film,
the engine performs it, and the same file always produces the same bytes.

## Setup

Requirements are pinned; use the versions the repo asks for:

```sh
# Node from .nvmrc, pnpm from the packageManager field
nvm use
corepack enable
pnpm install
```

Everything else (ffmpeg, fonts, map data) is bundled — there is nothing
to install system-wide.

## Your first film

Save this as `hello.mfs.yaml`:

```yaml
motionforge: 2
meta: { title: Hello, resolution: 1280x720, fps: 30, seed: 7, style: explainer-paper }
voices:
  narrator: { engine: mock, voice: warm }
cast:
  hero: { template: potato-biped, costume: [beret] }
scenes:
  - id: hello
    stage: { preset: meadow }
    place:
      - { ref: hero, as: hero, at: [-3, -2.6] }
    narration:
      - voice: narrator
        text: A small hero walked into a large meadow, and waved.
        sync:
          - { on: 'walked into', do: { walk: { target: hero, to: [0, -2.6] } } }
          - { on: 'and waved', do: { gesture: { target: hero, kind: wave } } }
```

Then:

```sh
pnpm mf voice sync hello.mfs.yaml   # freeze the narration audio + word timings
pnpm mf check hello.mfs.yaml        # validate — if this passes, render succeeds
pnpm mf render hello.mfs.yaml -o hello.mp4
```

That's the whole workflow. `voice sync` is only needed again when
narration text changes; `check` explains problems with error codes,
line numbers, and fix hints (see [`errors/`](errors/README.md)).

## Useful commands

| Command | What it does |
|---|---|
| `mf frame film.mfs.yaml --at 12.5 -o f.png` | Render any single instant (no warm-up — frames are pure functions) |
| `mf storyboard film.mfs.yaml` | Contact sheet of every scene for cheap whole-film review |
| `mf timing film.mfs.yaml` | Where every narration phrase lands on the clock |
| `mf render … --jobs 8` | Rasterize on 8 worker threads (output is byte-identical) |
| `mf author "topic" -o out.mp4` | Agent mode: research → script → direct → render (needs `ANTHROPIC_API_KEY`) |
| `mf spec` | The full generated language reference |

## Where to go next

- [The language tour](language-tour.md) — every concept in one pass.
- [The cookbook](cookbook.md) — war maps, caricature casts, skits, physics gags.
- [YAML rules for authors](authoring-rules.md) — conventions that keep films valid and well-paced.
- [`docs/SPEC.md`](SPEC.md) — the exhaustive generated reference (also the LLM handbook).
- [`examples/`](../examples) — twelve working films, from shapes to a full fable.
