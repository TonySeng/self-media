import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

const Body = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, baseUrl, apiKey, defaultModel, enabled } = parsed.data;
  const row = await db.lLMProvider.create({
    data: {
      name,
      baseUrl,
      apiKeyEncrypted: encrypt(apiKey),
      defaultModel,
      enabled: enabled ?? true,
    },
    select: {
      id: true, name: true, baseUrl: true, defaultModel: true,
      enabled: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(row, { status: 201 });
}

export async function GET(): Promise<NextResponse> {
  const rows = await db.lLMProvider.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, baseUrl: true, defaultModel: true,
      enabled: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(rows);
}
