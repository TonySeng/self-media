import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type {
  GenerateOptions,
  GenerateResult,
  LLMClient,
  LLMProviderConfig,
  StreamChunk,
} from './types';

/**
 * 根据模型 id 选择协议：
 * - `claude-*` / `anthropic.*` → Anthropic 协议（POST {baseUrl}/v1/messages, x-api-key 头）
 * - 其他 → OpenAI 兼容协议（POST {baseUrl}/chat/completions, Authorization: Bearer 头）
 *
 * 讯飞 CC（one.iflytek.com）走 Anthropic 协议，参考 PM-Tools 的 llm_client.py。
 */
function isAnthropicModel(modelId: string): boolean {
  return /^(claude-|anthropic\.)/i.test(modelId);
}

export function createLLMClient(config: LLMProviderConfig): LLMClient {
  const openaiProvider = createOpenAICompatible({
    name: config.name,
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  // Anthropic SDK 的 baseURL 末尾会自动拼 `/messages`，所以需要包含 `/v1`。
  // 用户填的 baseUrl 通常没有 `/v1`（例如 `https://one.iflytek.com/api/llm/console/chat`），
  // 这里自动补上，参考 PM-Tools 的 llm_client.py（拼 `{base_url}/v1/messages`）。
  const anthropicBaseUrl = (() => {
    const trimmed = config.baseUrl.replace(/\/$/, '');
    if (/\/v\d+$/.test(trimmed)) return trimmed;
    return `${trimmed}/v1`;
  })();
  const anthropicProvider = createAnthropic({
    baseURL: anthropicBaseUrl,
    apiKey: config.apiKey,
    headers: { 'anthropic-version': '2023-06-01' },
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const t0 = Date.now();
      try {
        const res = await fetch(input, init);
        if (!res.ok) {
          const text = await res.clone().text().catch(() => '');
          console.error(`[anthropic ${res.status}] ${url} (${Date.now() - t0}ms): ${text.slice(0, 400)}`);
        } else {
          console.log(`[anthropic ${res.status}] ${url} (${Date.now() - t0}ms) content-type=${res.headers.get('content-type')}`);
        }
        return res;
      } catch (e) {
        console.error(`[anthropic NETWORK_ERR] ${url} (${Date.now() - t0}ms):`, e);
        throw e;
      }
    },
  });

  function model(modelId?: string): LanguageModel {
    const id = modelId ?? config.defaultModel;
    return isAnthropicModel(id) ? anthropicProvider(id) : openaiProvider(id);
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
      onError: (event) => {
        console.error('[LLM stream onError]', event.error);
      },
    });

    let fullText = '';

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        const delta = part.text;
        fullText += delta;
        yield { type: 'text', delta };
      } else if (part.type === 'error') {
        console.error('[LLM stream error chunk]', part.error);
      }
    }

    const usage = await result.usage;
    const finishReason = await result.finishReason;

    if (fullText.length === 0) {
      console.warn(
        `[LLM stream] empty result. provider=${config.name} model=${opts.model ?? config.defaultModel} finishReason=${finishReason} input=${usage.inputTokens ?? 0} output=${usage.outputTokens ?? 0}`,
      );
    }

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
