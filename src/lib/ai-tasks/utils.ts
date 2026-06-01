import { db } from '@/lib/db';
import type { Work, WorkMetric } from '@prisma/client';

/**
 * 计算指定账号近 N 天的历史平均指标
 */
export async function getHistoricalAvg(
  accountId: string,
  days: number,
): Promise<{
  avgPlay: number;
  avgLike: number;
  avgComment: number;
  avgShare: number;
  avgCollect: number;
  avgFinishRate: number | null;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const works = await db.work.findMany({
    where: {
      platformAccountId: accountId,
      publishedAt: { gte: since },
    },
    include: {
      metrics: {
        orderBy: { snapshotAt: 'desc' },
        take: 1,
      },
    },
  });

  if (works.length === 0) {
    return {
      avgPlay: 0,
      avgLike: 0,
      avgComment: 0,
      avgShare: 0,
      avgCollect: 0,
      avgFinishRate: null,
    };
  }

  let totalPlay = 0;
  let totalLike = 0;
  let totalComment = 0;
  let totalShare = 0;
  let totalCollect = 0;
  let totalFinishRate = 0;
  let finishRateCount = 0;

  for (const work of works) {
    const metric = work.metrics[0];
    if (metric) {
      totalPlay += metric.play;
      totalLike += metric.like;
      totalComment += metric.comment;
      totalShare += metric.share;
      totalCollect += metric.collect;
      if (metric.finishRate !== null) {
        totalFinishRate += metric.finishRate;
        finishRateCount++;
      }
    }
  }

  const count = works.length;
  return {
    avgPlay: Math.round(totalPlay / count),
    avgLike: Math.round(totalLike / count),
    avgComment: Math.round(totalComment / count),
    avgShare: Math.round(totalShare / count),
    avgCollect: Math.round(totalCollect / count),
    avgFinishRate: finishRateCount > 0 ? totalFinishRate / finishRateCount : null,
  };
}

/**
 * 获取指定账号的 Top N 作品（按播放量排序）
 */
export async function getTopWorks(
  accountId: string,
  limit: number,
): Promise<Array<Work & { latestMetric: WorkMetric | null }>> {
  const works = await db.work.findMany({
    where: { platformAccountId: accountId },
    include: {
      metrics: {
        orderBy: { snapshotAt: 'desc' },
        take: 1,
      },
    },
    take: 100,
  });

  const worksWithMetrics = works
    .map((w) => ({
      ...w,
      latestMetric: w.metrics[0] || null,
    }))
    .filter((w) => w.latestMetric !== null)
    .sort((a, b) => (b.latestMetric?.play || 0) - (a.latestMetric?.play || 0))
    .slice(0, limit);

  return worksWithMetrics;
}

/**
 * 格式化指标为可读文本
 */
export function formatMetrics(metric: WorkMetric): string {
  const parts = [
    `播放：${metric.play.toLocaleString()}`,
    `点赞：${metric.like.toLocaleString()}`,
    `评论：${metric.comment.toLocaleString()}`,
    `分享：${metric.share.toLocaleString()}`,
    `收藏：${metric.collect.toLocaleString()}`,
  ];

  if (metric.finishRate !== null) {
    parts.push(`完播率：${(metric.finishRate * 100).toFixed(1)}%`);
  }

  return parts.join('、');
}

/**
 * 脱敏文案（去掉可能的敏感信息）
 */
export function sanitizeCopy(text: string): string {
  let result = text;

  result = result.replace(/1[3-9]\d{9}/g, '***');
  result = result.replace(/\b\d{6,}\b/g, '***');
  result = result.replace(/@[\w一-龥]+/g, '@***');

  return result;
}

/**
 * 格式化日期为可读字符串
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化时长（秒 → 分:秒）
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
