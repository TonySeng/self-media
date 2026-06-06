import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { hasRequiredKeys, parseCookieString } from '@/lib/platforms/douyin/cookie';

const PatchBody = z.object({
  nickname: z.string().trim().min(1).max(100).optional(),
  secUid: z.string().regex(/^MS4wLjAB[A-Za-z0-9_-]+$/, 'sec_uid 格式应为 MS4wLjAB 开头').optional(),
  cookie: z.string().min(1).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      { status: 400 },
    );
  }

  const { nickname, secUid, cookie } = parsed.data;

  if (cookie && !hasRequiredKeys(parseCookieString(cookie))) {
    return NextResponse.json(
      { error: 'invalid', message: 'Cookie 缺少 sessionid_ss' },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (nickname !== undefined) data.nickname = nickname;
  if (secUid !== undefined) data.secUid = secUid;
  if (cookie !== undefined) {
    data.cookieEncrypted = encrypt(cookie);
    data.cookieStatus = 'ACTIVE';
    data.lastError = null;
    data.lastErrorAt = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  try {
    const account = await db.platformAccount.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      id: account.id,
      nickname: account.nickname,
      secUid: account.secUid,
      avatar: account.avatar,
      cookieStatus: account.cookieStatus,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'duplicate', message: '该 sec_uid 已被其他账号使用' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    await db.platformAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
