# The language tour

One `.mfs.yaml` file describes one finished film. Authors write
**seconds** and **degrees**; the world is y-up, origin at screen center,
10 world units tall. Same file, same bytes, every render.

This tour covers every concept once. The generated
[`SPEC.md`](SPEC.md) lists every verb, choice list, and default.

## Scenes and time

A film is a list of scenes. Each scene needs a duration — explicit
(`duration: 8`) or derived from its narration audio. Scenes cut together
by default; `transition: { kind: fade | crossfade | wipe | iris }` eases
them, and `grade: day | dawn | dusk | night` sets time of day.

## The narration spine

These films are wall-to-wall voiceover, so the narration is the
timeline:

```yaml
narration:
  - voice: narrator
    text: The empire declared war, loudly and twice.
    sync:
      - { on: 'declared war', do: { sfx: drumroll } }
      - { on: 'twice', nth: 1, offset: 0.2, do: { bonk: { target: king } } }
```

`mf voice sync` synthesizes each segment once (TTS or recorded takes),
freezes the audio in a content-addressed cache, and force-aligns the
words. Sync anchors quote a phrase from the text; the frozen alignment
turns them into exact ticks. `lines:` give characters short squeaked
one-liners with speech bubbles; the narration ducks under them.
`meta.subtitles` auto-generates timed subtitles, and per-segment
`subtitle:` overrides carry translations (Bengali under English VO in
`examples/10-bangla`).

## Timed actions

Anything a sync anchor can do, `actions:` can do at a fixed `at:`
second. Both share the same verbs:

- **Motion-graphics verbs** — `pop-in`, `slam`, `wiggle`, `pulse`,
  `spin-in`, `fling`, `explode`, `impact-stars`, `speedlines`,
  `squash-stretch` — the genre's high-energy grammar.
- **Cards** — `card:` styles `date`, `chapter`, `list`, `quote`,
  `note`, `label`, `title`, `lower-third`; plus `caption:` for world
  text and `cutaway:` for framed snippets.
- **Movement** — `move` (tween), `bounce-to` (comic hop), and the
  planted gaits `walk` / `run` / `sneak` whose feet cannot slide, plus
  `jump`, `climb`, `swim`, `fly`.
- **Acting** — `gesture:` (point, wave, salute, facepalm, shrug, clap,
  nod, shake-head, bow), `posture:` (sit, kneel, lie-down, stand),
  `react:` face takeovers (jaw-drop, eye-bulge, sweat, …), `enter:` /
  `exit:` through the wings.
- **Physics** — `ragdoll:` (go limp, tumble, recover), `shatter:`
  (seeded fracture into shards + dust), and the slapstick set `bonk`,
  `fling`, `squash-land`, `chase`.
- **Interactions** — `take` / `put` / `give` / `throw` (with a catcher),
  `sit-on`, `open` / `close` hinged parts. Attach/detach are timeline
  events, so the validator knows who holds what.
- **The escape hatch** — `keyframes:` poses any bone/part/property at
  explicit times with easing, and composes with everything else.

## Cast

```yaml
cast:
  king:
    template: potato-biped        # potato-biped | horse | dog | bird | fish
    size: 0.95
    palette: { outfit: '#8a1c1c' }
    costume: [royal-uniform, crown]
    mustache: imperial
    expression: angry
```

The potato-biped is the flagship caricature; horses and dogs carry
saddles (`place.on` rides them); birds fly and fish swim. Costume
pieces, mustaches, and held items make any historical or invented
figure describable in a few lines.

## Maps

```yaml
maps:
  europe:
    source: naturalearth/europe-110m   # world-110m | world-50m | europe-110m
    groups: { entente: [france, serbia] }
scenes:
  - id: war
    place: [{ ref: europe, as: map, at: [0, 0] }]
    actions:
      - { at: 1, map: { recolor: { entente: '#3c6fb5' } } }
      - { at: 2, arrow: { from: germany, to: france } }
      - { at: 3, 'zoom-to': { region: france } }
```

Region recolors sweep, arrows grow, unit icons march, battles burst,
flags plant, labels pop. The 50m world basemap keeps real coastlines
under close zooms; custom `regions:` draw historical borders.

## Camera

`camera:` glides, cuts (`cut: true`), whip-pans (`whip: true`),
zoom-punches, shakes, and damp-spring `track:`s a moving actor.
`shot:` gives framing presets — `wide`, `medium`, `close-up`,
`two-shot`, `region` — computed from the rig, not hand-tuned numbers.

## Sound

Nearly every verb carries a default cartoon SFX (whoosh, boink, slam,
boom…), all synthesized in-engine — no sample files. Scenes take a
`music:` bed (`jaunty`, `tense`, `somber`, `triumphant`) that ducks
under the voiceover. `sfx:` cues anything explicitly.

## Determinism, in one paragraph

Frame N is a pure function of (film, tick). All wobble comes from the
screenplay's `seed`. Authors write seconds; the engine works on an
integer 120 Hz tick clock. Fonts, ffmpeg, and map data are bundled and
pinned. CI renders every example twice and compares SHA-256 hashes —
that is the contract everything above sits on.
