import {createOpenAI, OpenAIResponsesProviderOptions} from '@ai-sdk/openai';
import {AiSdkModelOptions} from './ai-sdk-model-options.js';

export const OPENAI_MODELS = [
  'gpt-5.1-no-thinking',
  'gpt-5.1-thinking-low',
  'gpt-5.1-thinking-high',
  'gpt-5.1-thinking-medium',
  'gpt-5.2-no-thinking',
  'gpt-5.2-thinking-low',
  'gpt-5.2-thinking-medium',
  'gpt-5.2-thinking-high',
  'gpt-5.2-thinking-xhigh',
  'gpt-5.4-no-thinking',
  'gpt-5.4-thinking-low',
  'gpt-5.4-thinking-medium',
  'gpt-5.4-thinking-high',
  'gpt-5.4-mini-no-thinking',
  'gpt-5.4-mini-thinking-low',
  'gpt-5.4-mini-thinking-medium',
  'gpt-5.4-mini-thinking-high',
] as const;

export async function getAiSdkModelOptionsForOpenAI(
  rawModelName: string,
): Promise<AiSdkModelOptions | null> {
  const provideModel = createOpenAI({apiKey: process.env['OPENAI_API_KEY']});
  const modelName = rawModelName as (typeof OPENAI_MODELS)[number];

  switch (modelName) {
    case 'gpt-5.1-no-thinking':
    case 'gpt-5.1-thinking-low':
    case 'gpt-5.1-thinking-medium':
    case 'gpt-5.1-thinking-high':
    case 'gpt-5.2-no-thinking':
    case 'gpt-5.2-thinking-low':
    case 'gpt-5.2-thinking-medium':
    case 'gpt-5.2-thinking-high':
    case 'gpt-5.2-thinking-xhigh':
    case 'gpt-5.4-no-thinking':
    case 'gpt-5.4-thinking-low':
    case 'gpt-5.4-thinking-medium':
    case 'gpt-5.4-thinking-high':
    case 'gpt-5.4-mini-no-thinking':
    case 'gpt-5.4-mini-thinking-low':
    case 'gpt-5.4-mini-thinking-medium':
    case 'gpt-5.4-mini-thinking-high':
      let reasoningEffort: string = 'none';
      if (modelName.endsWith('-thinking-xhigh')) {
        reasoningEffort = 'xhigh';
      } else if (modelName.endsWith('-thinking-high')) {
        reasoningEffort = 'high';
      } else if (modelName.endsWith('-thinking-medium')) {
        reasoningEffort = 'medium';
      } else if (modelName.endsWith('-thinking-low')) {
        reasoningEffort = 'low';
      }

      let apiModelName: string = 'gpt-5.1';
      if (modelName.startsWith('gpt-5.2')) {
        apiModelName = 'gpt-5.2';
      } else if (modelName.startsWith('gpt-5.4-mini')) {
        apiModelName = 'gpt-5.4-mini';
      } else if (modelName.startsWith('gpt-5.4')) {
        apiModelName = 'gpt-5.4';
      }

      return {
        model: provideModel(apiModelName),
        providerOptions: {
          openai: {
            reasoningEffort,
            reasoningSummary: 'detailed',
          } satisfies OpenAIResponsesProviderOptions,
        },
      };
    default:
      return null;
  }
}
