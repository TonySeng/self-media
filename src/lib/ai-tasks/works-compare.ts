import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { formatMetrics, formatDate } from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

async function prepareWorksComparePrompt(workIds: string[]): Promise<{
  systemPrompt: string;
  userPrompt: string;
  accountId: string;
}> {
  if (workIds.length < 2) {
    throw new Error('At least 2 works are required for comparison');
  }
  if (workIds.length > 10) {
    throw new Error('At most 10 works can be compared at once');
  }

  const works = await db.work.findMany({
    where: { id: { in: workIds } },
    include: {
      account: true,
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
  });

  if (works.length === 0) throw new Error('No works found');

  const accountIds = new Set(works.map((w) => w.platformAccountId));
  if (accountIds.size > 1) {
    throw new Error('All works must be from the same account');
  }

  const account = works[0]!.account;

  const worksList = works
    .map((work, index) => {
      const metric = work.metrics[0];
      if (!metric) {
        return `${index + 1}. ${work.title}\n   发布时间：${formatDate(work.publishedAt)}\n   （暂无指标数据）`;
      }
      return `${index + 1}. ${work.title}\n   描述：${work.description?.slice(0, 100) || '无'}\n   发布时间：${formatDate(work.publishedAt)}\n   数据：${formatMetrics(metric)}`;
    })
    .join('\n\n');

  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'WORKS_COMPARE' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.WORKS_COMPARE;

  const vars = {
    accountName: account.nickname,
    worksCount: String(works.length),
    worksList,
  };

  return {
    systemPrompt: template.systemPrompt,
    userPrompt: fillTemplate(template.userTemplate, vars),
    accountId: account.id,
  };
}

export async function executeWorksCompare(workIds: string[]) {
  const { systemPrompt, userPrompt, accountId } =
    await prepareWorksComparePrompt(workIds);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 2000,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'WORKS_COMPARE',
      targetRefs: { workIds, accountId },
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

export async function* streamWorksCompare(
  workIds: string[],
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt, accountId } =
    await prepareWorksComparePrompt(workIds);

  yield* streamAnalysisTask({
    type: 'WORKS_COMPARE',
    systemPrompt,
    userPrompt,
    targetRefs: { workIds, accountId },
    maxOutputTokens: 2000,
  });
}
