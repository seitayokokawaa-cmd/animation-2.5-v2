# ADR-0008: Motion-graphics grammar first; realism deferred; style presets

Date: 2026-07-26 · Status: accepted

## Context

The genre runs on cheap, high-energy motion (pop, slam, hop, wiggle, shake,
explosion clouds) and a consistent paper look. v1's hardest systems
(footstep-planned gait, PBD ragdoll, deep interactions) are not needed for
hopping caricatures.

## Decision

- **Motion-graphics verbs are first-class registry actions**, all
  seeded/deterministic, no physics solver: `pop-in/out`, `spin-in`, `slam`
  (+ camera-shake trigger), `wiggle`, `pulse`, `bounce-to` (default
  locomotion — hop-slide with body bob; no foot IK, no foot-slide possible),
  `fling` (analytic ballistic arc), `explode`, impact stars, speedlines,
  sweat/steam/heart emitters, plus a `squash-stretch` modifier on any node.
  Every verb declares its default SFX (ADR-0005 registry field).
- **Realism pack is deferred, not deleted**: gait/PBD/ragdoll/shatter/deep
  interactions land in M14 against v1's designs, after the explainer studio
  ships (M13).
- **Style presets** are first-class config in `render`: palette, paper-grain
  texture, outline weights, fonts, shadow treatment, and motion defaults
  (overshoot, shake intensity). Ships `explainer-paper` and `clean-flat`;
  per-film overrides allowed; one golden frame per preset locks the look.

## Consequences

80% of genre motion arrives cheaply in M4 and is stable long before physics
exists. "Looks like the genre" is a config, tested by goldens, not a hope.
