import { db } from '@/lib/db';
import { csvResponse, toCsv } from '@/lib/csv';

/**
 * GET /api/export/works?accountId=xxx
 * 导出作品（含最新指标）
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('accountId') || undefined;

  const works = await db.work.findMany({
    where: accountId ? { platformAccountId: accountId } : {},
    include: {
      account: { select: { nickname: true } },
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    orderBy: { publishedAt: 'desc' },
  });

  const rows = works.map((w) => {
    const m = w.metrics[0];
    return {
      platformWorkId: w.platformWorkId,
      title: w.title,
      account: w.account.nickname,
      publishedAt: w.publishedAt.toISOString(),
      duration: w.duration ?? '',
      play: m?.play ?? '',
      like: m?.like ?? '',
      comment: m?.comment ?? '',
      share: m?.share ?? '',
      collect: m?.collect ?? '',
      finishRate:
        m?.finishRate != null
          ? `${(m.finishRate * 100).toFixed(2)}%`
          : '',
      description: w.description ?? '',
    };
  });

  const csv = toCsv(rows, [
    { key: 'platformWorkId', label: '作品ID' },
    { key: 'title', label: '标题' },
    { key: 'account', label: '账号' },
    { key: 'publishedAt', label: '发布时间' },
    { key: 'duration', label: '时长(ms)' },
    { key: 'play', label: '播放' },
    { key: 'like', label: '点赞' },
    { key: 'comment', label: '评论' },
    { key: 'share', label: '分享' },
    { key: 'collect', label: '收藏' },
    { key: 'finishRate', label: '完播率' },
    { key: 'description', label: '描述' },
  ]);

  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `works-${date}.csv`);
}
