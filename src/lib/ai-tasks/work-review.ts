import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import {
  getHistoricalAvg,
  formatMetrics,
  formatDate,
  formatDuration,
} from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

/**
 * 准备复盘所需的 prompt（公共逻辑）
 */
async function prepareWorkReviewPrompt(workId: string): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  const work = await db.work.findUnique({
    where: { id: workId },
    include: {
      account: true,
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
  });

  if (!work) throw new Error('Work not found');
  const latestMetric = work.metrics[0];
  if (!latestMetric) throw new Error('No metrics available for this work');

  const historicalAvg = await getHistoricalAvg(work.platformAccountId, 30);

  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'WORK_REVIEW' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.WORK_REVIEW;

  const vars = {
    title: work.title,
    description: work.description || '（无描述）',
    publishedAt: formatDate(work.publishedAt),
    duration: work.duration
      ? formatDuration(Math.floor(work.duration / 1000))
      : '未知',
    metrics: formatMetrics(latestMetric),
    historicalAvg: [
      `播放：${historicalAvg.avgPlay.toLocaleString()}`,
      `点赞：${historicalAvg.avgLike.toLocaleString()}`,
      `评论：${historicalAvg.avgComment.toLocaleString()}`,
      `分享：${historicalAvg.avgShare.toLocaleString()}`,
      `收藏：${historicalAvg.avgCollect.toLocaleString()}`,
      historicalAvg.avgFinishRate !== null
        ? `完播率：${(historicalAvg.avgFinishRate * 100).toFixed(1)}%`
        : '',
    ]
      .filter(Boolean)
      .join('、'),
  };

  return {
    systemPrompt: template.systemPrompt,
    userPrompt: fillTemplate(template.userTemplate, vars),
  };
}

export async function executeWorkReview(workId: string) {
  const { systemPrompt, userPrompt } = await prepareWorkReviewPrompt(workId);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 1000,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'WORK_REVIEW',
      targetRefs: { workId },
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

export async function* streamWorkReview(
  workId: string,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt } = await prepareWorkReviewPrompt(workId);

  yield* streamAnalysisTask({
    type: 'WORK_REVIEW',
    systemPrompt,
    userPrompt,
    targetRefs: { workId },
    maxOutputTokens: 1000,
  });
}
