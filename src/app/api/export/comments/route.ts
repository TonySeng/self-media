import { db } from '@/lib/db';
import { csvResponse, toCsv } from '@/lib/csv';

/**
 * GET /api/export/comments?workId=xxx
 * 导出指定作品的评论
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const workId = searchParams.get('workId');

  if (!workId) {
    return Response.json(
      { error: 'workId is required' },
      { status: 400 },
    );
  }

  const work = await db.work.findUnique({
    where: { id: workId },
    select: { title: true, platformWorkId: true },
  });

  if (!work) {
    return Response.json({ error: 'work_not_found' }, { status: 404 });
  }

  const comments = await db.workComment.findMany({
    where: { workId },
    orderBy: { likeCount: 'desc' },
  });

  const rows = comments.map((c) => ({
    platformCommentId: c.platformCommentId,
    authorName: c.authorName,
    content: c.content,
    likeCount: c.likeCount,
    replyCount: c.replyCount,
    publishedAt: c.publishedAt.toISOString(),
  }));

  const csv = toCsv(rows, [
    { key: 'platformCommentId', label: '评论ID' },
    { key: 'authorName', label: '作者' },
    { key: 'content', label: '内容' },
    { key: 'likeCount', label: '点赞' },
    { key: 'replyCount', label: '回复数' },
    { key: 'publishedAt', label: '发布时间' },
  ]);

  const safeTitle = work.title.slice(0, 30).replace(/[\\/:*?"<>|]/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `comments-${safeTitle}-${date}.csv`);
}
