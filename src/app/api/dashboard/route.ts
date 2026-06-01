import { NextResponse } from 'next/server';
import {
  getDashboardStats,
  getFansTrend,
  getWorkPerformance,
  getTopWorks,
} from '@/lib/dashboard/stats';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || undefined;

    const [stats, fansTrend, workPerformance, topWorks] = await Promise.all([
      getDashboardStats(accountId),
      getFansTrend(accountId, 30),
      getWorkPerformance(accountId, 30),
      getTopWorks(accountId, 5),
    ]);

    return NextResponse.json({
      stats,
      fansTrend,
      workPerformance,
      topWorks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}
