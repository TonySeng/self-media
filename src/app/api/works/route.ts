import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100') || 100, 100);

  const items = await db.work.findMany({
    where: {
      ...(accountId ? { platformAccountId: accountId } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      account: { select: { id: true, nickname: true, platform: true } },
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
  });

  return NextResponse.json({
    items: items.map((w) => ({
      id: w.id,
      platformWorkId: w.platformWorkId,
      title: w.title,
      coverUrl: w.coverUrl,
      duration: w.duration,
      publishedAt: w.publishedAt,
      account: w.account,
      latestMetric: w.metrics[0]
        ? {
            snapshotAt: w.metrics[0].snapshotAt,
            play: w.metrics[0].play,
            like: w.metrics[0].like,
            comment: w.metrics[0].comment,
            share: w.metrics[0].share,
            collect: w.metrics[0].collect,
            finishRate: w.metrics[0].finishRate,
          }
        : null,
    })),
  });
}
