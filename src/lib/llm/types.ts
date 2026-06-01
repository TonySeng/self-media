import type { LanguageModel } from 'ai';

export type LLMProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GenerateOptions = {
  model?: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type GenerateResult = {
  text: string;
  usage: TokenUsage;
  finishReason: string;
};

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'finish'; text: string; usage: TokenUsage; finishReason: string };

export type LLMClient = {
  config: LLMProviderConfig;
  providerId: string;
  model(modelId?: string): LanguageModel;
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  stream(opts: GenerateOptions): AsyncIterable<StreamChunk>;
};
