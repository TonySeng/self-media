import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const work = await db.work.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, nickname: true, platform: true } },
      metrics: { orderBy: { snapshotAt: 'asc' } },
    },
  });
  if (!work) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    id: work.id,
    platformWorkId: work.platformWorkId,
    title: work.title,
    description: work.description,
    coverUrl: work.coverUrl,
    videoUrl: work.videoUrl,
    duration: work.duration,
    publishedAt: work.publishedAt,
    account: work.account,
    metrics: work.metrics.map((m) => ({
      snapshotAt: m.snapshotAt,
      play: m.play,
      like: m.like,
      comment: m.comment,
      share: m.share,
      collect: m.collect,
      finishRate: m.finishRate,
    })),
  });
}
