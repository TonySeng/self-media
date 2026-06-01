import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type {
  GenerateOptions,
  GenerateResult,
  LLMClient,
  LLMProviderConfig,
  StreamChunk,
} from './types';

export function createLLMClient(config: LLMProviderConfig): LLMClient {
  const provider = createOpenAICompatible({
    name: config.name,
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  function model(modelId?: string): LanguageModel {
    return provider(modelId ?? config.defaultModel);
  }

  async function generate(opts: GenerateOptions): Promise<GenerateResult> {
    const result = await generateText({
      model: model(opts.model),
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
    });
    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
      finishReason: result.finishReason,
    };
  }

  async function* stream(opts: GenerateOptions): AsyncIterable<StreamChunk> {
    const result = streamText({
      model: model(opts.model),
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
    });

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
      yield { type: 'text', delta: chunk };
    }

    const usage = await result.usage;
    const finishReason = await result.finishReason;

    yield {
      type: 'finish',
      text: fullText,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      finishReason,
    };
  }

  return { config, providerId: config.id, model, generate, stream };
}
