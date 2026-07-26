# Spike M0.8 — Map rendering

**Question:** can we go Natural Earth GeoJSON → simplified, stylized SVG map
with per-region recolor and border morphing, using only our own code (no GIS
dependencies)?

**Answer: yes.** Everything the M7 map engine needs is demonstrated:

- **Vendored data:** `assets/geodata/ne_110m_europe.json` — 39 European
  countries from Natural Earth 110m Admin 0 (public domain, see
  `assets/geodata/ATTRIBUTION.md`), properties trimmed to `name`/`id`/`iso_a3`
  with stable kebab-case ids (`germany`, `united-kingdom`, …).
- **Projection:** equirectangular over a Europe viewport (lon −12…42,
  lat 34…62 → 1280×960). Fine for the genre; the projection sits behind one
  function and can be swapped later.
- **Simplification:** own ~40-line Douglas–Peucker in pixel space
  (tol 1.5 px): 2018 → 1885 points (110m is already coarse; DP matters more
  for 50m and custom overlays).
- **Style:** paper palette (sea `#cfdbd5`, land `#efe6d0`, coast stroke),
  each region a named `<path id="…">` — the part-tree shape M7.1 compiles to.
- **Recolor:** per-region fill override by id (`germany` red, `france` blue) —
  see `golden/europe-recolor.png`.
- **Border morph:** closed-ring resampling to N=128 arc-length-uniform points,
  start-point aligned to minimize twist, then linear interpolation — Germany's
  outline morphs into an inflated "wartime gains" blob
  (`golden/morph-mid.png`). Deterministic, endpoints exact.

Committed golden PNGs (eyeballed): `europe.png`, `europe-recolor.png`,
`morph-mid.png`. Rerun with: `node spikes/m0.8-map/run.mjs`.
