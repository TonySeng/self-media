import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  const [expiredCount, lastAccount] = await Promise.all([
    db.platformAccount.count({ where: { cookieStatus: { in: ['EXPIRED', 'INVALID'] } } }),
    db.platformAccount.findFirst({
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true },
    }),
  ]);
  return NextResponse.json({
    expiredCount,
    lastSyncAt: lastAccount?.lastSyncAt ?? null,
  });
}
