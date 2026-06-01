import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { sanitizeCopy } from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

async function prepareCopyOptimizePrompt(
  draft: string,
  accountId: string | null,
): Promise<{
  systemPrompt: string;
  userPrompt: string;
  targetAccountId: string | null;
}> {
  let targetAccountId: string | null = accountId;
  if (!targetAccountId) {
    const firstAccount = await db.platformAccount.findFirst();
    targetAccountId = firstAccount?.id || null;
  }

  let samplesText = '（暂无历史高互动文案样本）';

  if (targetAccountId) {
    const highEngagementWorks = await db.work.findMany({
      where: { platformAccountId: targetAccountId },
      include: {
        metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
      },
      take: 100,
    });

    const worksWithMetrics = highEngagementWorks
      .map((w) => ({ ...w, latestMetric: w.metrics[0] || null }))
      .filter((w) => w.latestMetric !== null);

    if (worksWithMetrics.length > 0) {
      const avgEngagement =
        worksWithMetrics.reduce(
          (sum, w) => sum + (w.latestMetric!.like + w.latestMetric!.comment),
          0,
        ) / worksWithMetrics.length;

      const highEngagement = worksWithMetrics
        .filter(
          (w) =>
            w.latestMetric!.like + w.latestMetric!.comment >
            avgEngagement * 1.5,
        )
        .slice(0, 5);

      if (highEngagement.length > 0) {
        samplesText = highEngagement
          .map((w, i) => {
            const text = w.description || w.title;
            return `${i + 1}. ${sanitizeCopy(text)}`;
          })
          .join('\n\n');
      }
    }
  }

  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'COPY_OPTIMIZE' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.COPY_OPTIMIZE;

  const vars = { draft, samples: samplesText };

  return {
    systemPrompt: template.systemPrompt,
    userPrompt: fillTemplate(template.userTemplate, vars),
    targetAccountId,
  };
}

export async function executeCopyOptimize(
  draft: string,
  accountId: string | null,
) {
  const { systemPrompt, userPrompt, targetAccountId } =
    await prepareCopyOptimizePrompt(draft, accountId);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 1200,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'COPY_OPTIMIZE',
      targetRefs: { accountId: targetAccountId, draftLength: draft.length },
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

export async function* streamCopyOptimize(
  draft: string,
  accountId: string | null,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt, targetAccountId } =
    await prepareCopyOptimizePrompt(draft, accountId);

  yield* streamAnalysisTask({
    type: 'COPY_OPTIMIZE',
    systemPrompt,
    userPrompt,
    targetRefs: { accountId: targetAccountId, draftLength: draft.length },
    maxOutputTokens: 1200,
  });
}
