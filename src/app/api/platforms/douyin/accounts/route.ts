import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { hasRequiredKeys, parseCookieString } from '@/lib/platforms/douyin/cookie';

const Body = z.object({
  cookie: z.string().min(1),
  secUid: z.string().regex(/^MS4wLjAB[A-Za-z0-9_-]+$/, 'sec_uid 格式应为 MS4wLjAB 开头'),
  nickname: z.string().trim().min(1).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      { status: 400 },
    );
  }
  const { cookie, secUid, nickname } = parsed.data;

  if (!hasRequiredKeys(parseCookieString(cookie))) {
    return NextResponse.json(
      { error: 'invalid', message: 'Cookie 缺少 sessionid_ss' },
      { status: 400 },
    );
  }

  const account = await db.platformAccount.upsert({
    where: { secUid },
    create: {
      platform: 'DOUYIN',
      secUid,
      nickname: nickname ?? '抖音账号',
      avatar: null,
      cookieEncrypted: encrypt(cookie),
      cookieStatus: 'ACTIVE',
    },
    update: {
      ...(nickname ? { nickname } : {}),
      cookieEncrypted: encrypt(cookie),
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
