/**
 * Minimal WAV (RIFF PCM16) encode/decode — enough for the voice cache and
 * the offline mixer. Mono, little-endian, deterministic bytes.
 */

export interface WavData {
  readonly sampleRate: number;
  /** Mono samples in [-1, 1]. */
  readonly samples: Float32Array;
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buffer);
}

export function decodeWav(bytes: Uint8Array): WavData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, len: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + len));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }
  // Walk chunks for fmt + data (some writers insert extra chunks).
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      const format = view.getUint16(offset + 8, true);
      if (format !== 1) throw new Error(`Unsupported WAV format ${format} (need PCM)`);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataLength = size;
    }
    offset += 8 + size + (size % 2);
  }
  if (!sampleRate || dataOffset < 0) throw new Error('WAV missing fmt or data chunk');
  if (bits !== 16) throw new Error(`Unsupported WAV bit depth ${bits} (need 16)`);
  const frames = Math.floor(dataLength / 2 / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    // Downmix to mono by averaging channels.
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += view.getInt16(dataOffset + (i * channels + c) * 2, true);
    }
    samples[i] = sum / channels / 32768;
  }
  return { sampleRate, samples };
}

/** Duration in seconds of decoded WAV data. */
export const wavDurationSeconds = (wav: WavData): number => wav.samples.length / wav.sampleRate;
