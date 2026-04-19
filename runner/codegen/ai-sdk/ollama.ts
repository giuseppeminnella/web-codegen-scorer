import {createOllama} from 'ollama-ai-provider-v2';
import {AiSdkModelOptions} from './ai-sdk-model-options.js';

/**
 * Models served by a local Ollama instance. The identifiers here mirror
 * the tags reported by `ollama list`, so they can be passed directly via
 * the `--model` flag (e.g. `--model=qwen2.5-coder:7b`).
 *
 * To add a new local model:
 *   1. `ollama pull <name>:<tag>`
 *   2. Add `'<name>:<tag>'` to this array.
 */
export const OLLAMA_MODELS = [
  'granite4:3b',
  'qwen2.5-coder:3b',
  'qwen2.5-coder:7b',
  'qwen3.6:35b',
] as const;

export async function getAiSdkModelOptionsForOllama(
  rawModelName: string,
): Promise<AiSdkModelOptions | null> {
  if (!(OLLAMA_MODELS as readonly string[]).includes(rawModelName)) {
    return null;
  }

  const provideModel = createOllama({
    // Can be overridden via env var for remote Ollama servers.
    baseURL: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434/api',
  });

  return {
    model: provideModel(rawModelName),
    providerOptions: {
      ollama: {
        // Thinking is off by default. Set OLLAMA_THINK=1 to enable it for
        // hybrid-reasoning models (e.g. qwen3.*).
        think: process.env['OLLAMA_THINK'] === '1',
      },
    },
  };
}
