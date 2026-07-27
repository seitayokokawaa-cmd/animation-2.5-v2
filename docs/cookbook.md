# Cookbook — maps and caricatures

Working recipes for the two signature subsystems. Every snippet is in
the shipping dialect; the numbered examples referenced at the end of
each recipe render in CI.

## A war map segment

```yaml
maps:
  europe:
    source: naturalearth/europe-110m
    groups:
      entente: [france, united-kingdom, serbia]
      central: [germany, austria]

scenes:
  - id: the-plan
    place: [{ ref: europe, as: map, at: [0, 0] }]
    narration:
      - voice: narrator
        text: The plan was simple. March through Belgium, wheel south, and be home by Christmas.
        sync:
          - { on: 'plan was simple', do: { map: { recolor: { central: '#8a6d3b' } } } }
          - { on: 'through Belgium', do: { arrow: { from: germany, to: france, bow: 0.4 } } }
          - { on: 'wheel south', do: { march: { from: germany, to: france, kind: infantry } } }
          - { on: 'home by Christmas', do: { battle: { at: france } } }
          - { on: 'home by Christmas', do: { 'zoom-to': { region: france } } }
```

Notes:

- **Recolors are territory changes** — they sweep across the region and
  stay. Use one per beat; simultaneous recolors read as noise.
- **`zoom-to` a region, then cut wide** when the action moves on. The
  region framing adds a generous margin on its own.
- For close zooms use `source: naturalearth/world-50m` — it keeps real
  coastlines at country scale. Custom historical borders are hand-drawn
  lon/lat rings under `regions:`, optionally replacing a base country.
- Label sparingly (`label:` pops a nameplate at the centroid); the
  narrator carries most of the naming.

See `examples/07-warmap` for a fully narrated front.

## A caricature cast

```yaml
cast:
  kaiser:
    template: potato-biped
    size: 0.95
    palette: { outfit: '#3b4a6b', skin: '#f2cfa6' }
    costume: [royal-uniform, spiked-helmet]
    mustache: imperial
    expression: angry
  advisor:
    template: potato-biped
    size: 0.8
    costume: [suit]
    held: scroll
    expression: deadpan
```

Recipe rules that keep a lineup readable:

- **One silhouette cue per character** — a hat, a mustache, a held item.
  Two characters with the same outfit color read as twins.
- **Size is a character trait**: advisors 0.8, monarchs 0.95, the
  occasional 1.1 giant.
- **The face does the acting.** Set a resting `expression`, then let
  `react:` (jaw-drop, eye-bulge, sweat, anger-steam, hearts) take over
  the face for beats. Gestures + reactions together carry a whole skit.
- Mount cavalry with `place: { ref: general, as: general, on: horse-1 }`.

See `examples/06-cast` (lineup) and `examples/08-skit` (a full argument
with lines, a bonk, and an explosion).

## A physics gag

```yaml
actions:
  - { at: 1, take: { target: fox, item: bread } }
  - { at: 3, throw: { target: fox, item: bread, to: crow } }   # the crow catches
  - { at: 5, ragdoll: { target: fox, impulse: [1.5, 2.8] } }   # collapse, recover
  - { at: 8, shatter: { target: vase } }                        # shards + dust
```

- `take`/`give`/`throw` track possession — `mf check` flags a throw of
  something nobody holds (MF2011/MF2012).
- `ragdoll` tumbles under real solver physics and blends back to acting
  in place; pair with a `react: deadpan` on recovery for the genre's
  signature beat.
- `shatter` picks up the target's fill color so the pieces read as the
  broken thing.

See `examples/12-fable` — walk, take, throw-and-catch, a flying crow, a
jump, a ragdoll, and a moral card in twenty-seven seconds.

## Pacing defaults that make it feel right

- A visual event on roughly every narration phrase; the validator warns
  on dead air longer than 5 s (MF3006).
- Cards: one on screen at a time (MF3008), and long enough to read
  (MF3009 computes read time).
- Cut or move the camera at least once per scene; `shot:` presets are
  cheaper than hand-tuned `camera:` moves and always frame correctly.
