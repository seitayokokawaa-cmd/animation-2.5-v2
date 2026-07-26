/**
 * Qwen TTS adapter (ADR-0006): `qwen-audio-3.0-tts-{plus,flash}` over the
 * DashScope WebSocket inference API. Networked — only ever invoked by
 * `mf voice sync`. Requires `DASHSCOPE_API_KEY`.
 *
 * Protocol: open wss://dashscope.aliyuncs.com/api-ws/v1/inference with a
 * bearer header, send `run-task` (task_group audio / task tts) with the
 * text payload, collect binary audio frames until `task-finished`.
 * NOTE: written to the documented protocol; live validation is the pending
 * M0.7 spike (blocked on the API key). The freeze-cache isolates everything
 * downstream from this adapter either way.
 */

import { randomUUID } from 'node:crypto';

import type { TtsAdapter, VoiceSpec } from './adapter.js';

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const SAMPLE_RATE = 48000;

interface TaskMessage {
  header: { task_id: string; event?: string; error_message?: string; action?: string };
  payload?: unknown;
}

export function createQwenAdapter(model: string): TtsAdapter {
  return {
    name: model,
    async synthesize(text: string, spec: VoiceSpec): Promise<Uint8Array> {
      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        throw new Error(
          'DASHSCOPE_API_KEY is not set. The qwen adapter is networked and only runs during `mf voice sync`; use engine `mock` or `recorded` for offline work.',
        );
      }

      const taskId = randomUUID();
      const socket = new WebSocket(WS_URL, {
        // Node's undici WebSocket supports custom headers via this option.
        headers: { Authorization: `bearer ${apiKey}` },
      } as unknown as string[]);
      socket.binaryType = 'arraybuffer';

      const chunks: Uint8Array[] = [];

      return new Promise<Uint8Array>((resolve, reject) => {
        const fail = (reason: string) => {
          socket.close();
          reject(new Error(`qwen tts: ${reason}`));
        };

        socket.addEventListener('open', () => {
          socket.send(
            JSON.stringify({
              header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
              payload: {
                task_group: 'audio',
                task: 'tts',
                function: 'SpeechSynthesizer',
                model,
                parameters: {
                  voice: spec.voice,
                  format: 'wav',
                  sample_rate: SAMPLE_RATE,
                  rate: spec.rate ?? 1,
                },
                input: { text },
              },
            }),
          );
        });

        socket.addEventListener('message', (event: MessageEvent) => {
          if (typeof event.data === 'string') {
            const message = JSON.parse(event.data) as TaskMessage;
            switch (message.header.event) {
              case 'task-finished': {
                socket.close();
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const wav = new Uint8Array(total);
                let offset = 0;
                for (const chunk of chunks) {
                  wav.set(chunk, offset);
                  offset += chunk.length;
                }
                if (total === 0) return reject(new Error('qwen tts: no audio received'));
                resolve(wav);
                return;
              }
              case 'task-failed':
                fail(message.header.error_message ?? 'task failed');
                return;
              default:
                return; // task-started / result-generated metadata
            }
          } else {
            chunks.push(new Uint8Array(event.data as ArrayBuffer));
          }
        });

        socket.addEventListener('error', () => fail('websocket error'));
        socket.addEventListener('close', (event: CloseEvent) => {
          if (chunks.length === 0) fail(`connection closed (${event.code}) before audio arrived`);
        });
      });
    },
  };
}

export const qwenPlusAdapter = createQwenAdapter('qwen-audio-3.0-tts-plus');
export const qwenFlashAdapter = createQwenAdapter('qwen-audio-3.0-tts-flash');
