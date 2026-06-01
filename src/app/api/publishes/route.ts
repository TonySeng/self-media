import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { triggerWorker } from '@/lib/publish/worker';
import { z } from 'zod';

const CreateBody = z.object({
  platformAccountId: z.string().min(1),
  materialId: z.string().min(1),
  title: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  coverKey: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { platformAccountId, materialId, title, description, coverKey } = parsed.data;

  const account = await db.platformAccount.findUnique({ where: { id: platformAccountId } });
  if (!account) return NextResponse.json({ error: '账号不存在' }, { status: 404 });

  const material = await db.material.findUnique({ where: { id: materialId } });
  if (!material || material.type !== 'VIDEO' || !material.fileKey) {
    return NextResponse.json({ error: '素材不存在或非视频类型' }, { status: 400 });
  }

  const publish = await db.publish.create({
    data: { platformAccountId, materialId, title, description, coverKey },
  });

  triggerWorker();

  return NextResponse.json({ id: publish.id, status: publish.status }, { status: 201 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);

  const where = accountId ? { platformAccountId: accountId } : {};
  const items = await db.publish.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, title: true, status: true, error: true,
      startedAt: true, finishedAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ items });
}
