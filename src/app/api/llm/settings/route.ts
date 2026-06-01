import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const KEY = 'default_llm_provider';

export async function GET(): Promise<NextResponse> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row?.value || typeof row.value !== 'object') {
    return NextResponse.json({ providerId: null, model: null });
  }
  return NextResponse.json(row.value);
}

const Body = z.object({
  providerId: z.string().min(1),
  model: z.string().optional(),
});

export async function PUT(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const provider = await db.lLMProvider.findUnique({
    where: { id: parsed.data.providerId },
  });
  if (!provider) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 });
  }
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: parsed.data },
    update: { value: parsed.data },
  });
  return NextResponse.json({ ok: true });
}
