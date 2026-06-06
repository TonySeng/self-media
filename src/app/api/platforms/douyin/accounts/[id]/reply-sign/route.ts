import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const Body = z.object({
  msToken: z.string().min(1),
  aBogus: z.string().min(1),
});

function key(accountId: string) {
  return `reply_sign_${accountId}`;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const setting = await db.setting.findUnique({ where: { key: key(id) } });
  if (!setting?.value || typeof setting.value !== 'object') {
    return NextResponse.json({ msToken: '', aBogus: '', updatedAt: null });
  }
  const v = setting.value as Record<string, unknown>;
  return NextResponse.json({
    msToken: typeof v.msToken === 'string' ? v.msToken : '',
    aBogus: typeof v.aBogus === 'string' ? v.aBogus : '',
    updatedAt: setting.updatedAt,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid' },
      { status: 400 },
    );
  }
  await db.setting.upsert({
    where: { key: key(id) },
    create: { key: key(id), value: parsed.data },
    update: { value: parsed.data },
  });
  return NextResponse.json({ ok: true });
}
