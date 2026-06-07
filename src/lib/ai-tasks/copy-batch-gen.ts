import { db } from '@/lib/db';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { sanitizeCopy } from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

export type CopyBatchGenInput = {
  niche: string;
  direction: string;
  count: number;
  referenceAccountId?: string | null;
  benchmarkAccountId?: string | null;
  benchmarkWorkIds?: string[];
  ownerAccountId?: string | null;
};

async function buildBenchmarksBlock(
  benchmarkAccountId: string | null | undefined,
  benchmarkWorkIds: string[] | undefined,
): Promise<string> {
  if (!benchmarkAccountId || !benchmarkWorkIds || benchmarkWorkIds.length === 0) {
    return '（无对标参考）';
  }
  const works = await db.benchmarkWork.findMany({
    where: { id: { in: benchmarkWorkIds }, benchmarkAccountId },
  });
  if (works.length === 0) return '（无对标参考）';

  const lines = works.map((w, i) => {
    const stats = [
      w.play != null && `播放 ${w.play.toLocaleString()}`,
      w.like != null && `点赞 ${w.like.toLocaleString()}`,
      w.comment != null && `评论 ${w.comment.toLocaleString()}`,
    ]
      .filter(Boolean)
      .join('、');
    const desc = w.description ? `\n   描述：${w.description.slice(0, 100)}` : '';
    return `${i + 1}. ${w.title}${desc}\n   数据：${stats || '（无）'}`;
  });
  return `对标爆款（${works.length} 条）：\n${lines.join('\n\n')}`;
}

async function buildStyleSamplesBlock(
  referenceAccountId: string | null | undefined,
): Promise<string> {
  if (!referenceAccountId) return '（无风格参考）';

  const works = await db.work.findMany({
    where: { platformAccountId: referenceAccountId },
    include: { metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 } },
    take: 100,
  });

  const withMetric = works
    .map((w) => ({ ...w, latestMetric: w.metrics[0] || null }))
    .filter((w) => w.latestMetric !== null);

  if (withMetric.length === 0) return '（无风格参考）';

  const avg =
    withMetric.reduce(
      (sum, w) => sum + (w.latestMetric!.like + w.latestMetric!.comment),
      0,
    ) / withMetric.length;

  const top = withMetric
    .filter(
      (w) => w.latestMetric!.like + w.latestMetric!.comment > avg * 1.5,
    )
    .slice(0, 5);

  if (top.length === 0) return '（无风格参考）';

  const lines = top.map((w, i) => {
    const text = w.description || w.title;
    return `${i + 1}. ${sanitizeCopy(text)}`;
  });
  return `本账号高互动文案样本（脱敏）：\n${lines.join('\n\n')}`;
}

async function preparePrompt(input: CopyBatchGenInput): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'COPY_BATCH_GEN' },
  });
  const template = customTemplate || DEFAULT_PROMPTS.COPY_BATCH_GEN;

  const benchmarksBlock = await buildBenchmarksBlock(
    input.benchmarkAccountId,
    input.benchmarkWorkIds,
  );
  const styleSamplesBlock = await buildStyleSamplesBlock(input.referenceAccountId);

  const userPrompt = fillTemplate(template.userTemplate, {
    niche: input.niche,
    direction: input.direction,
    count: String(input.count),
    benchmarksBlock,
    styleSamplesBlock,
  });

  return { systemPrompt: template.systemPrompt, userPrompt };
}

export function calcMaxOutputTokens(count: number): number {
  return Math.min(8000, 400 * count + 500);
}

export async function* streamCopyBatchGen(
  input: CopyBatchGenInput,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt } = await preparePrompt(input);

  yield* streamAnalysisTask({
    type: 'COPY_BATCH_GEN',
    systemPrompt,
    userPrompt,
    targetRefs: {
      niche: input.niche,
      direction: input.direction,
      count: input.count,
      referenceAccountId: input.referenceAccountId ?? null,
      benchmarkAccountId: input.benchmarkAccountId ?? null,
      benchmarkWorkIds: input.benchmarkWorkIds ?? [],
      ownerAccountId: input.ownerAccountId ?? null,
    },
    maxOutputTokens: calcMaxOutputTokens(input.count),
  });
}

// 暴露给单测
export const __test__ = { preparePrompt };
