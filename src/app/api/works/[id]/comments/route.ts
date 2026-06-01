import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncWorkComments } from '@/lib/platforms/douyin/comment-sync';

/**
 * GET /api/works/:id/comments
 * 获取作品的评论列表
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: workId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '50') || 50, 200);
    const orderBy = searchParams.get('orderBy') || 'publishedAt';

    const comments = await db.workComment.findMany({
      where: { workId },
      orderBy:
        orderBy === 'likeCount'
          ? { likeCount: 'desc' }
          : { publishedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      items: comments.map((c) => ({
        id: c.id,
        platformCommentId: c.platformCommentId,
        content: c.content,
        authorName: c.authorName,
        authorAvatar: c.authorAvatar,
        likeCount: c.likeCount,
        replyCount: c.replyCount,
        publishedAt: c.publishedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/works/:id/comments
 * 触发同步评论
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: workId } = await params;

    const result = await syncWorkComments(workId, 10);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'sync_failed', message },
      { status: 500 },
    );
  }
}
