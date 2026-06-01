import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/ai/chat/refs?workIds=a,b&materialIds=c,d
 * 批量查询引用对象的标题，用于在 UI 中显示 chip
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const workIds = (searchParams.get('workIds') || '')
      .split(',')
      .filter(Boolean);
    const materialIds = (searchParams.get('materialIds') || '')
      .split(',')
      .filter(Boolean);

    const [works, materials] = await Promise.all([
      workIds.length > 0
        ? db.work.findMany({
            where: { id: { in: workIds } },
            select: { id: true, title: true, coverUrl: true },
          })
        : Promise.resolve([]),
      materialIds.length > 0
        ? db.material.findMany({
            where: { id: { in: materialIds } },
            select: { id: true, type: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({ works, materials });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}
