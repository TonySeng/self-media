import { NextResponse } from 'next/server';
import { runSync } from '@/lib/platforms/douyin/sync';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ accountId: string }> },
): Promise<NextResponse> {
  const { accountId } = await ctx.params;
  try {
    const job = await runSync(accountId, 'MANUAL');
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      finishedAt: job.finishedAt,
      stats: job.stats,
      error: job.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'sync_failed', message: msg }, { status: 500 });
  }
}
