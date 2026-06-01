import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

const SAFE_SELECT = {
  id: true, name: true, baseUrl: true, defaultModel: true,
  enabled: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const row = await db.lLMProvider.findUnique({ where: { id }, select: SAFE_SELECT });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(row);
}

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { apiKey, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (apiKey) data.apiKeyEncrypted = encrypt(apiKey);
  try {
    const row = await db.lLMProvider.update({ where: { id }, data, select: SAFE_SELECT });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    await db.lLMProvider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
