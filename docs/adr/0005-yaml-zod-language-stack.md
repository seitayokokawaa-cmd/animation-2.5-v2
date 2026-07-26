# ADR-0005: YAML + zod language stack, positioned errors, registry-driven spec

Date: 2026-07-26 · Status: accepted

## Context

The screenplay must be authorable by humans and LLMs, validated with
machine-fixable errors, and self-describing (`mf spec`).

## Decision

- MFS files are **YAML**, parsed with the `yaml` package's AST so every node
  keeps its source range; schemas are **zod** with types inferred for the
  whole toolchain.
- Every finding carries: stable `MF####` code, `file:line:col`, plain
  message, concrete fix hint; printers for pretty terminal output and
  `--json`. Validation tiers: T1 structural (schema), T2 references +
  did-you-mean, T3 semantic/continuity/pacing (M12).
- Every action verb is a **registry module** declaring its parameter schema,
  prerequisites, duration model, tick function, default SFX, and docs. The
  validator, `mf spec`, and the engine all read the same registry — the LLM
  handbook cannot drift (CI drift check).

## Consequences

One source of truth for language, validation, docs, and execution. Cost:
positioned-YAML plumbing (M2.2) and registry discipline for every verb.
