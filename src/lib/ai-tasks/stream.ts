import { db } from '@/lib/db';
import type { AIAnalysisType, Prisma } from '@prisma/client';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import type { ChatMessage } from '@/lib/llm/types';

export type StreamAnalysisChunk =
  | { type: 'text'; delta: string }
  | {
      type: 'finish';
      analysisId: string;
      result: string;
      tokensUsed: { input: number; output: number };
    };

export type StreamAnalysisOptions = {
  type: AIAnalysisType;
  systemPrompt: string;
  userPrompt: string;
  targetRefs: Prisma.InputJsonValue;
  maxOutputTokens?: number;
  temperature?: number;
};

/**
 * 通用流式分析任务执行器：
 * 1. 调用 LLM stream
 * 2. 把 text delta 透传给上层
 * 3. 完成后落库一条 AIAnalysis 记录
 * 4. 在 finish 事件里返回 analysisId 和完整结果
 */
export async function* streamAnalysisTask(
  opts: StreamAnalysisOptions,
): AsyncIterable<StreamAnalysisChunk> {
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.userPrompt },
  ];

  const client = await getDefaultLLMClient();

  let fullText = '';
  let usage = { inputTokens: 0, outputTokens: 0 };

  for await (const chunk of client.stream({
    messages,
    maxOutputTokens: opts.maxOutputTokens,
    temperature: opts.temperature,
  })) {
    if (chunk.type === 'text') {
      fullText += chunk.delta;
      yield { type: 'text', delta: chunk.delta };
    } else if (chunk.type === 'finish') {
      fullText = chunk.text;
      usage = chunk.usage;
    }
  }

  const analysis = await db.aIAnalysis.create({
    data: {
      type: opts.type,
      targetRefs: opts.targetRefs,
      prompt: opts.userPrompt,
      response: fullText,
      modelUsed: client.config.defaultModel,
      llmProviderId: client.providerId,
      tokensUsed: { input: usage.inputTokens, output: usage.outputTokens },
      status: 'DONE',
    },
  });

  yield {
    type: 'finish',
    analysisId: analysis.id,
    result: fullText,
    tokensUsed: { input: usage.inputTokens, output: usage.outputTokens },
  };
}
