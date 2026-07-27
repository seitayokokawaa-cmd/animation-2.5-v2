# MotionForge

A deterministic 2.5D animation compiler: one declarative screenplay file
(`.mfs.yaml`) in, one finished narrated MP4 film out. Nobody draws, nobody
keyframes by hand, nobody writes code — humans and LLMs author films purely by
describing them.

```sh
pnpm mf voice sync film.mfs.yaml   # freeze narration audio + word timings
pnpm mf check film.mfs.yaml        # if this passes, render succeeds
pnpm mf render film.mfs.yaml -o film.mp4
```

Same file, same bytes, every time: frame N is a pure function of the film and
the tick, all randomness is seeded from the screenplay, and CI proves it by
rendering every example twice and comparing SHA-256 hashes.

## Documentation

- [Quickstart](docs/quickstart.md) — setup and a first film in five minutes.
- [Language tour](docs/language-tour.md) — every concept in one pass.
- [Cookbook](docs/cookbook.md) — war maps, caricature casts, physics gags.
- [YAML rules for authors](docs/authoring-rules.md) — the conventions `mf author` follows and `mf check` enforces.
- [`docs/SPEC.md`](docs/SPEC.md) — the exhaustive generated reference (the LLM handbook).
- [Error catalog](docs/errors/README.md) — every `MF` code with fixes.
- [`examples/`](examples) — twelve working films, from moving shapes to a full fable.

## What's inside

Narration-spine timing (TTS + forced alignment, sync anchors on spoken
phrases), an animated map engine (recolors, arrows, marching units, real
Natural Earth coastlines), caricature characters (costumes, faces, gestures,
planted no-slide gaits), a physics pack (PBD ragdolls, shatter,
take/throw/catch interactions), procedural sound design, a three-tier
validator, and an agent mode (`mf author`) that goes from a one-line topic to
a finished film.

- Plan of record: [`docs/plan/PLAN.md`](docs/plan/PLAN.md)
- Task tracker: [`docs/plan/PROGRESS.md`](docs/plan/PROGRESS.md)
- Design decisions: [`docs/adr/`](docs/adr)
