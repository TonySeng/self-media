import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { getTopWorks, formatMetrics, getHistoricalAvg } from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

async function prepareTopicSuggestPrompt(
  accountId: string | null,
  niche: string,
  direction: string,
): Promise<{
  systemPrompt: string;
  userPrompt: string;
  targetAccountId: string;
}> {
  let targetAccountId: string;
  if (accountId) {
    targetAccountId = accountId;
  } else {
    const firstAccount = await db.platformAccount.findFirst();
    if (!firstAccount) throw new Error('No platform account found');
    targetAccountId = firstAccount.id;
  }

  const topWorks = await getTopWorks(targetAccountId, 10);
  const historicalAvg = await getHistoricalAvg(targetAccountId, 30);

  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'TOPIC_SUGGEST' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.TOPIC_SUGGEST;

  const topWorksText = topWorks
    .map((w, i) => {
      const metric = w.latestMetric!;
      return `${i + 1}. ${w.title}\n   ${formatMetrics(metric)}`;
    })
    .join('\n\n');

  const trendsText = `近 30 天平均数据：\n播放：${historicalAvg.avgPlay.toLocaleString()}、点赞：${historicalAvg.avgLike.toLocaleString()}、评论：${historicalAvg.avgComment.toLocaleString()}`;

  const vars = {
    niche,
    direction,
    topWorks: topWorksText || '（暂无历史爆款数据）',
    trends: trendsText,
  };

  return {
    systemPrompt: template.systemPrompt,
    userPrompt: fillTemplate(template.userTemplate, vars),
    targetAccountId,
  };
}

export async function executeTopicSuggest(
  accountId: string | null,
  niche: string,
  direction: string,
) {
  const { systemPrompt, userPrompt, targetAccountId } =
    await prepareTopicSuggestPrompt(accountId, niche, direction);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 1500,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'TOPIC_SUGGEST',
      targetRefs: { accountId: targetAccountId, niche, direction },
      prompt: userPrompt,
      response: result.text,
      modelUsed: client.config.defaultModel,
      llmProviderId: client.providerId,
      tokensUsed: {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      },
      status: 'DONE',
    },
  });

  return {
    analysisId: analysis.id,
    result: result.text,
    tokensUsed: {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    },
  };
}

export async function* streamTopicSuggest(
  accountId: string | null,
  niche: string,
  direction: string,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt, targetAccountId } =
    await prepareTopicSuggestPrompt(accountId, niche, direction);

  yield* streamAnalysisTask({
    type: 'TOPIC_SUGGEST',
    systemPrompt,
    userPrompt,
    targetRefs: { accountId: targetAccountId, niche, direction },
    maxOutputTokens: 1500,
  });
}
