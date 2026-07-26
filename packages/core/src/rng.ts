/**
 * Seeded randomness (ADR-0004). All "random" variation in the engine —
 * blinks, shake, debris, crowd jitter — comes from PCG32 streams derived
 * from the film seed. `Math.random`/`Date.now` are lint-banned in engine
 * packages; this module is the only randomness door.
 *
 * PCG32 (XSH-RR variant), reference implementation semantics
 * (O'Neill, pcg-random.org), computed with BigInt 64-bit state.
 */

const MULT = 6364136223846793005n;
const MASK64 = (1n << 64n) - 1n;
const MASK32 = 0xffffffffn;

export class Pcg32 {
  private state = 0n;
  private readonly inc: bigint;

  constructor(seed: number | bigint, streamId: number | bigint = 0) {
    this.inc = (((BigInt(streamId) & MASK64) << 1n) | 1n) & MASK64;
    this.step();
    this.state = (this.state + (BigInt(seed) & MASK64)) & MASK64;
    this.step();
  }

  private step(): void {
    this.state = (this.state * MULT + this.inc) & MASK64;
  }

  /** Next uniform uint32. */
  nextUint32(): number {
    const old = this.state;
    this.step();
    const xorshifted = (((old >> 18n) ^ old) >> 27n) & MASK32;
    const rot = old >> 59n;
    const out = ((xorshifted >> rot) | (xorshifted << (-rot & 31n & 31n))) & MASK32;
    return Number(out);
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  /** Uniform integer in [0, bound) without modulo bias. */
  nextInt(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error(`Invalid bound: ${bound}`);
    }
    const threshold = 0x1_0000_0000 % bound;
    for (;;) {
      const r = this.nextUint32();
      if (r >= threshold) return r % bound;
    }
  }

  /** Uniform float in [min, max). */
  nextRange(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }
}

/** FNV-1a 32-bit — stable stream-name hashing. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Named streams derived from one film seed. The same (seed, name) pair
 * always yields the same sequence, and distinct names are decorrelated by
 * using the name hash as the PCG stream selector.
 */
export class RngStreams {
  private readonly streams = new Map<string, Pcg32>();

  constructor(private readonly seed: number) {
    if (!Number.isInteger(seed)) throw new Error(`Film seed must be an integer: ${seed}`);
  }

  /** Get (or create) the stream with this name, e.g. `blink/franz`. */
  get(name: string): Pcg32 {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = new Pcg32(this.seed, fnv1a(name));
      this.streams.set(name, rng);
    }
    return rng;
  }
}
