import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const CreateTagBody = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function GET(): Promise<NextResponse> {
  const tags = await db.materialTag.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { materials: true },
      },
    },
  });

  const result = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    usageCount: tag._count.materials,
  }));

  return NextResponse.json({ tags: result });
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = CreateTagBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const existing = await db.materialTag.findUnique({
    where: { name: parsed.data.name },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'duplicate_name', message: 'Tag name already exists' },
      { status: 409 },
    );
  }

  const tag = await db.materialTag.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color ?? null,
    },
  });

  return NextResponse.json(
    {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt,
    },
    { status: 201 },
  );
}
