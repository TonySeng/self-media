import { db } from '@/lib/db';

export type DashboardStats = {
  totalWorks: number;
  totalPlays: number;
  totalEngagement: number;
  recentWorks: number;
  avgPlay: number;
  avgEngagement: number;
};

export type FansTrend = {
  date: string;
  fans: number;
};

export type WorkPerformance = {
  date: string;
  play: number;
  like: number;
  comment: number;
};

export type TopWork = {
  id: string;
  title: string;
  coverUrl: string | null;
  play: number;
  like: number;
  comment: number;
  publishedAt: Date;
};

/**
 * 获取统计卡片数据
 */
export async function getDashboardStats(accountId?: string): Promise<DashboardStats> {
  const where = accountId ? { platformAccountId: accountId } : {};
  const since = new Date();
  since.setDate(since.getDate() - 30);

  // 总作品数
  const totalWorks = await db.work.count({ where });

  // 近 30 天作品
  const recentWorks = await db.work.count({
    where: { ...where, publishedAt: { gte: since } },
  });

  // 获取所有作品的最新指标
  const works = await db.work.findMany({
    where,
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
  });

  let totalPlays = 0;
  let totalEngagement = 0;
  let recentPlays = 0;
  let recentEngagement = 0;
  let recentCount = 0;

  for (const work of works) {
    const metric = work.metrics[0];
    if (metric) {
      const engagement =
        metric.like + metric.comment + metric.share + metric.collect;
      totalPlays += metric.play;
      totalEngagement += engagement;

      if (work.publishedAt >= since) {
        recentPlays += metric.play;
        recentEngagement += engagement;
        recentCount++;
      }
    }
  }

  return {
    totalWorks,
    totalPlays,
    totalEngagement,
    recentWorks,
    avgPlay: recentCount > 0 ? Math.round(recentPlays / recentCount) : 0,
    avgEngagement:
      recentCount > 0 ? Math.round(recentEngagement / recentCount) : 0,
  };
}

/**
 * 获取粉丝趋势（近 N 天）
 */
export async function getFansTrend(
  accountId?: string,
  days: number = 30,
): Promise<FansTrend[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = accountId ? { platformAccountId: accountId } : {};

  const metrics = await db.accountMetric.findMany({
    where: {
      ...where,
      snapshotAt: { gte: since },
    },
    orderBy: { snapshotAt: 'asc' },
  });

  return metrics.map((m) => ({
    date: m.snapshotAt.toISOString().split('T')[0]!,
    fans: m.totalFans,
  }));
}

/**
 * 获取作品表现（近 N 天，按日期聚合）
 */
export async function getWorkPerformance(
  accountId?: string,
  days: number = 30,
): Promise<WorkPerformance[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = accountId ? { platformAccountId: accountId } : {};

  const works = await db.work.findMany({
    where: {
      ...where,
      publishedAt: { gte: since },
    },
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    orderBy: { publishedAt: 'asc' },
  });

  // 按日期聚合
  const byDate = new Map<
    string,
    { play: number; like: number; comment: number }
  >();

  for (const work of works) {
    const date = work.publishedAt.toISOString().split('T')[0]!;
    const metric = work.metrics[0];

    if (metric) {
      const existing = byDate.get(date) || { play: 0, like: 0, comment: 0 };
      byDate.set(date, {
        play: existing.play + metric.play,
        like: existing.like + metric.like,
        comment: existing.comment + metric.comment,
      });
    }
  }

  return Array.from(byDate.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));
}

/**
 * 获取 Top N 作品
 */
export async function getTopWorks(
  accountId?: string,
  limit: number = 5,
): Promise<TopWork[]> {
  const where = accountId ? { platformAccountId: accountId } : {};

  const works = await db.work.findMany({
    where,
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    take: 100,
  });

  return works
    .filter((w) => w.metrics[0])
    .sort((a, b) => (b.metrics[0]?.play || 0) - (a.metrics[0]?.play || 0))
    .slice(0, limit)
    .map((w) => ({
      id: w.id,
      title: w.title,
      coverUrl: w.coverUrl,
      play: w.metrics[0]!.play,
      like: w.metrics[0]!.like,
      comment: w.metrics[0]!.comment,
      publishedAt: w.publishedAt,
    }));
}
