/**
 * The TtsAdapter interface (ADR-0006): text + voice spec in, WAV bytes out.
 * Adapters may hit the network (`qwen`) — but only `mf voice sync` ever
 * calls them; rendering reads the freeze-cache exclusively.
 */

export interface VoiceSpec {
  readonly engine: string;
  readonly voice: string;
  /** Speaking-rate multiplier; default 1. */
  readonly rate?: number;
  /** Pitch shift in semitones; default 0. */
  readonly pitch?: number;
}

export interface TtsAdapter {
  readonly name: string;
  /** Synthesize `text` to mono PCM16 WAV bytes (48 kHz preferred). */
  readonly synthesize: (text: string, spec: VoiceSpec) => Promise<Uint8Array>;
}
