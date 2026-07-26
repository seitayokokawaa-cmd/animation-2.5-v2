# ADR-0007: Map engine — vendored Natural Earth compiled to object part-trees

Date: 2026-07-26 · Status: accepted · Informed by: spike M0.8

## Context

Animated maps (recolors, arrows, marches, border changes) are the genre's
signature. Historical borders have no authoritative dataset; the genre style
is cartoon-simplified anyway.

## Decision

- **Data**: vendored **Natural Earth** subsets (110m/50m, public domain) in
  `assets/geodata/` with attribution; properties trimmed to
  `name`/`id`(kebab-case)/`iso_a3`. Historical/fictional borders are
  hand/LLM-authored simplified region overlays — never scraped datasets.
- **Compilation** (`@motionforge/maps`): GeoJSON → equirectangular projection
  (behind one function) → own Douglas–Peucker simplification in pixel space →
  paper-styled **object part-tree** with one named part per region. All
  existing object machinery (instancing, articulation, depth) applies to
  maps for free.
- **Territory morphs**: closed rings resampled to N arc-length-uniform
  points, start-aligned to minimize twist, linearly interpolated. Endpoints
  exact, fully deterministic.
- Verbs (`highlight`, `recolor`, `arrow`, `march`, `plant-flag`,
  `battle-burst`, `label`, `zoom-to region:`) are registry actions like any
  other (ADR-0005).

## Consequences

Spike-verified: 39-country Europe renders in paper style with per-region
recolor and a working border morph (goldens committed). Map work reduces to
solvers on part-trees; no GIS dependencies in the engine.
