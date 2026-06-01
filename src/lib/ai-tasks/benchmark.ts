import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { formatMetrics, formatDate, getTopWorks } from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

/**
 * 提取 Tiptap HTML 中的纯文本（简单实现）
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function prepareBenchmarkPrompt(
  source:
    | { kind: 'references'; benchmarkIds: string[] }
    | { kind: 'accounts'; benchmarkAccountIds: string[] },
  accountId: string,
  ownTopN: number = 5,
): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  // 1. 查询账号
  const account = await db.platformAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw new Error('Account not found');

  // 2. 构建对标爆款文本
  let benchmarksText = '';
  let benchmarkCount = 0;

  if (source.kind === 'references') {
    if (source.benchmarkIds.length === 0) {
      throw new Error('At least 1 benchmark reference is required');
    }
    if (source.benchmarkIds.length > 10) {
      throw new Error(
        'At most 10 benchmark references can be analyzed at once',
      );
    }

    const benchmarks = await db.material.findMany({
      where: { id: { in: source.benchmarkIds }, type: 'REFERENCE' },
    });

    if (benchmarks.length === 0) {
      throw new Error('No REFERENCE materials found with given IDs');
    }

    benchmarkCount = benchmarks.length;
    benchmarksText = benchmarks
      .map((m, i) => {
        const summary = m.content
          ? stripHtml(m.content).slice(0, 300)
          : '（无摘要）';
        const url = m.url ? `\n   链接：${m.url}` : '';
        return `${i + 1}. ${m.title}${url}\n   摘要：${summary}`;
      })
      .join('\n\n');
  } else {
    if (source.benchmarkAccountIds.length === 0) {
      throw new Error('At least 1 benchmark account is required');
    }
    if (source.benchmarkAccountIds.length > 5) {
      throw new Error('At most 5 benchmark accounts can be analyzed at once');
    }

    const accounts = await db.benchmarkAccount.findMany({
      where: { id: { in: source.benchmarkAccountIds } },
      include: {
        works: {
          orderBy: [{ play: 'desc' }, { like: 'desc' }],
          take: 10,
        },
      },
    });

    if (accounts.length === 0) {
      throw new Error('No benchmark accounts found');
    }

    benchmarkCount = accounts.reduce((s, a) => s + a.works.length, 0);
    benchmarksText = accounts
      .map((acc, i) => {
        const meta = [
          acc.niche && `定位：${acc.niche}`,
          acc.followers != null && `粉丝：${acc.followers.toLocaleString()}`,
          acc.url && `主页：${acc.url}`,
        ]
          .filter(Boolean)
          .join('，');
        const notes = acc.notes ? `\n   备注：${acc.notes}` : '';
        const worksText =
          acc.works.length > 0
            ? acc.works
                .map((w, j) => {
                  const stats = [
                    w.play != null && `播放 ${w.play.toLocaleString()}`,
                    w.like != null && `点赞 ${w.like.toLocaleString()}`,
                    w.comment != null && `评论 ${w.comment.toLocaleString()}`,
                    w.share != null && `分享 ${w.share.toLocaleString()}`,
                    w.collect != null && `收藏 ${w.collect.toLocaleString()}`,
                  ]
                    .filter(Boolean)
                    .join('、');
                  const desc = w.description
                    ? `\n      描述：${w.description.slice(0, 100)}`
                    : '';
                  return `   ${j + 1}) ${w.title}\n      数据：${stats || '（无）'}${desc}`;
                })
                .join('\n')
            : '   （暂无录入作品）';

        return `${i + 1}. 【账号】${acc.nickname}${meta ? ` (${meta})` : ''}${notes}\n   作品：\n${worksText}`;
      })
      .join('\n\n');
  }

  // 3. 查询本账号 Top N 作品
  const ownWorks = await getTopWorks(accountId, ownTopN);

  // 4. 格式化本账号作品
  const ownWorksText =
    ownWorks.length > 0
      ? ownWorks
          .map((w, i) => {
            const metric = w.latestMetric!;
            return `${i + 1}. ${w.title}\n   描述：${w.description?.slice(0, 100) || '无'}\n   发布时间：${formatDate(w.publishedAt)}\n   数据：${formatMetrics(metric)}`;
          })
          .join('\n\n')
      : '（暂无作品数据）';

  // 5. 取 Prompt 模板
  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'BENCHMARK' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.BENCHMARK;

  const vars = {
    accountName: account.nickname,
    benchmarkCount: String(benchmarkCount),
    benchmarks: benchmarksText,
    ownCount: String(ownWorks.length),
    ownWorks: ownWorksText,
  };

  return {
    systemPrompt: template.systemPrompt,
    userPrompt: fillTemplate(template.userTemplate, vars),
  };
}

export async function executeBenchmark(
  benchmarkIds: string[],
  accountId: string,
  ownTopN: number = 5,
) {
  const { systemPrompt, userPrompt } = await prepareBenchmarkPrompt(
    { kind: 'references', benchmarkIds },
    accountId,
    ownTopN,
  );

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 2500,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'BENCHMARK',
      targetRefs: { benchmarkIds, accountId, ownTopN },
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

export async function* streamBenchmark(
  benchmarkIds: string[],
  accountId: string,
  ownTopN: number = 5,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt } = await prepareBenchmarkPrompt(
    { kind: 'references', benchmarkIds },
    accountId,
    ownTopN,
  );

  yield* streamAnalysisTask({
    type: 'BENCHMARK',
    systemPrompt,
    userPrompt,
    targetRefs: { benchmarkIds, accountId, ownTopN },
    maxOutputTokens: 2500,
  });
}

export async function* streamBenchmarkByAccounts(
  benchmarkAccountIds: string[],
  accountId: string,
  ownTopN: number = 5,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt } = await prepareBenchmarkPrompt(
    { kind: 'accounts', benchmarkAccountIds },
    accountId,
    ownTopN,
  );

  yield* streamAnalysisTask({
    type: 'BENCHMARK',
    systemPrompt,
    userPrompt,
    targetRefs: { benchmarkAccountIds, accountId, ownTopN },
    maxOutputTokens: 2500,
  });
}
