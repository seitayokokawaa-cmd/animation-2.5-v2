# ADR-0006: Narration spine — hosted Qwen TTS behind an adapter + freeze-cache

Date: 2026-07-26 · Status: accepted (aligner choice pending spike M0.7)

## Context

v2's genre is wall-to-wall narration with visuals anchored to words. Hosted
TTS (chosen: `qwen-audio-3.0-tts` via DashScope; `-plus` for finals, `-flash`
for drafts) is nondeterministic and networked — both violate the render
contract. Qwen returns no word timestamps and has no Bengali voice.

## Decision

- **`TtsAdapter` interface** in `@motionforge/voice`:
  `synthesize(text, voiceSpec) → wav`. Implementations: `qwen` (DashScope
  WebSocket, 48 kHz WAV, `DASHSCOPE_API_KEY`), `recorded` (user-supplied
  WAV/MP3 per segment — the Bengali VO path), `mock` (offline sine-sweep for
  CI).
- **Freeze-cache**: WAVs stored at
  `assets/voice/<sha256(model,voice,params,text)>.wav` with `.align.json`
  beside them; `voice.lock.json` maps narration segments → hashes. **`mf
  voice sync` is the only networked command**; `mf render`/`frame`/`check`
  are offline and fail loudly on cache miss. Changing text/voice changes the
  hash → validator flags stale segments with the exact fix hint.
- **Forced alignment** behind an `Aligner` interface (whisper-class; M0.7
  picks pinned `whisper.cpp` binary vs `faster-whisper` sidecar). The
  transcript is known, so recognition output is only fuzzy-matched to script
  words for **timing** — content is never trusted. Alignment JSON is cached
  and committed with the WAVs.

## Consequences

Determinism contract intact: (screenplay + frozen cache) → byte-identical
MP4; re-recording a line is a visible lockfile diff. Recorded human VO is a
first-class equal path. Character one-liners reuse the same adapter with
per-character voices + deterministic pitch-shift (squeak-synth fallback).
