import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

/**
 * 按周聚合数据
 */
function aggregateByWeek<T extends { date: Date; value: number }>(
  items: T[],
): Array<{ week: string; avgValue: number; count: number }> {
  const byWeek = new Map<string, { sum: number; count: number }>();

  for (const item of items) {
    const date = new Date(item.date);
    // 获取周一作为周的起点
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const weekKey = monday.toISOString().split('T')[0]!;

    const existing = byWeek.get(weekKey) || { sum: 0, count: 0 };
    byWeek.set(weekKey, {
      sum: existing.sum + item.value,
      count: existing.count + 1,
    });
  }

  return Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, { sum, count }]) => ({
      week,
      avgValue: Math.round(sum / count),
      count,
    }));
}

async function prepareTrendPrompt(
  accountId: string,
  periodDays: number,
): Promise<{ systemPrompt: string; userPrompt: string }> {
  // 1. 查询账号信息
  const account = await db.platformAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error('Account not found');
  }

  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  // 2. 查询粉丝趋势
  const fansMetrics = await db.accountMetric.findMany({
    where: {
      platformAccountId: accountId,
      snapshotAt: { gte: since },
    },
    orderBy: { snapshotAt: 'asc' },
  });

  let fansTrendText = '暂无数据';
  if (fansMetrics.length > 0) {
    const first = fansMetrics[0]!;
    const last = fansMetrics[fansMetrics.length - 1]!;
    const change = last.totalFans - first.totalFans;
    const changeRate = first.totalFans > 0 ? (change / first.totalFans) * 100 : 0;
    fansTrendText = `起始：${first.totalFans.toLocaleString()} (${first.snapshotAt.toISOString().split('T')[0]})\n结束：${last.totalFans.toLocaleString()} (${last.snapshotAt.toISOString().split('T')[0]})\n变化：${change >= 0 ? '+' : ''}${change.toLocaleString()} (${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(1)}%)`;
  }

  // 3. 查询作品发布频率
  const works = await db.work.findMany({
    where: {
      platformAccountId: accountId,
      publishedAt: { gte: since },
    },
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    orderBy: { publishedAt: 'asc' },
  });

  const totalDays = periodDays;
  const totalWorks = works.length;
  const avgPerWeek = totalDays > 0 ? (totalWorks / totalDays) * 7 : 0;

  const publishFreqText = `近 ${periodDays} 天共发布 ${totalWorks} 个作品，平均每周 ${avgPerWeek.toFixed(1)} 个`;

  // 4. 按周聚合播放量趋势
  const playData = works
    .filter((w) => w.metrics[0])
    .map((w) => ({
      date: w.publishedAt,
      value: w.metrics[0]!.play,
    }));

  const playByWeek = aggregateByWeek(playData);
  const playTrendText =
    playByWeek.length > 0
      ? playByWeek
          .map(
            (w) =>
              `周 ${w.week}：发布 ${w.count} 个，平均播放 ${w.avgValue.toLocaleString()}`,
          )
          .join('\n')
      : '暂无数据';

  // 5. 按周聚合互动率趋势
  const engagementData = works
    .filter((w) => w.metrics[0] && w.metrics[0]!.play > 0)
    .map((w) => {
      const m = w.metrics[0]!;
      const engagement = m.like + m.comment + m.share + m.collect;
      return {
        date: w.publishedAt,
        value: Math.round((engagement / m.play) * 10000), // 万分比
      };
    });

  const engagementByWeek = aggregateByWeek(engagementData);
  const engagementTrendText =
    engagementByWeek.length > 0
      ? engagementByWeek
          .map(
            (w) =>
              `周 ${w.week}：平均互动率 ${(w.avgValue / 100).toFixed(2)}%`,
          )
          .join('\n')
      : '暂无数据';

  // 6. 获取 Prompt 模板
  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'TREND' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.TREND;

  // 7. 填充变量
  const vars = {
    accountName: account.nickname,
    periodDays: String(periodDays),
    fansTrend: fansTrendText,
    publishFreq: publishFreqText,
    playTrend: playTrendText,
    engagementTrend: engagementTrendText,
  };

  const userPrompt = fillTemplate(template.userTemplate, vars);

  return { systemPrompt: template.systemPrompt, userPrompt };
}

export async function executeTrendAnalysis(
  accountId: string,
  periodDays: number = 30,
) {
  const { systemPrompt, userPrompt } = await prepareTrendPrompt(
    accountId,
    periodDays,
  );

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
      type: 'TREND',
      targetRefs: { accountId, periodDays },
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

export async function* streamTrendAnalysis(
  accountId: string,
  periodDays: number = 30,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt } = await prepareTrendPrompt(
    accountId,
    periodDays,
  );

  yield* streamAnalysisTask({
    type: 'TREND',
    systemPrompt,
    userPrompt,
    targetRefs: { accountId, periodDays },
    maxOutputTokens: 2000,
  });
}
