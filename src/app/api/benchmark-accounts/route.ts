import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Platform } from '@prisma/client';
import { db } from '@/lib/db';

const CreateSchema = z.object({
  platform: z.nativeEnum(Platform).optional().default(Platform.DOUYIN),
  nickname: z.string().min(1).max(100),
  url: z.string().url().optional().or(z.literal('')),
  niche: z.string().max(100).optional(),
  followers: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const accounts = await db.benchmarkAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { works: true } },
      },
    });

    return NextResponse.json({
      items: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        nickname: a.nickname,
        url: a.url,
        niche: a.niche,
        followers: a.followers,
        notes: a.notes,
        worksCount: a._count.works,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'query_failed', message: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const account = await db.benchmarkAccount.create({
      data: {
        platform: parsed.data.platform,
        nickname: parsed.data.nickname,
        url: parsed.data.url || null,
        niche: parsed.data.niche || null,
        followers: parsed.data.followers ?? null,
        notes: parsed.data.notes || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'creation_failed', message: String(error) },
      { status: 500 },
    );
  }
}
