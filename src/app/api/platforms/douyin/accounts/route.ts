import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { douyinAdapter } from '@/lib/platforms/douyin';

const Body = z.object({ cookie: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const validation = await douyinAdapter.validateCookie(parsed.data.cookie);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason, message: validation.message },
      { status: 400 },
    );
  }
  const { secUid, nickname, avatar } = validation.account;
  const account = await db.platformAccount.upsert({
    where: { secUid },
    create: {
      platform: 'DOUYIN',
      secUid,
      nickname,
      avatar,
      cookieEncrypted: encrypt(parsed.data.cookie),
      cookieStatus: 'ACTIVE',
    },
    update: {
      nickname,
      avatar,
      cookieEncrypted: encrypt(parsed.data.cookie),
      cookieStatus: 'ACTIVE',
      lastError: null,
      lastErrorAt: null,
    },
  });
  return NextResponse.json(
    {
      id: account.id,
      platform: account.platform,
      nickname: account.nickname,
      avatar: account.avatar,
      cookieStatus: account.cookieStatus,
      lastSyncAt: account.lastSyncAt,
      createdAt: account.createdAt,
    },
    { status: 201 },
  );
}

export async function GET(): Promise<NextResponse> {
  const accounts = await db.platformAccount.findMany({
    where: { platform: 'DOUYIN' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      platform: true,
      nickname: true,
      avatar: true,
      secUid: true,
      cookieStatus: true,
      lastSyncAt: true,
      lastError: true,
      lastErrorAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(accounts);
}
