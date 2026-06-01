import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const CreateSchema = z.object({
  benchmarkAccountId: z.string().min(1),
  title: z.string().min(1).max(500),
  url: z.string().url().optional().or(z.literal('')),
  description: z.string().max(5000).optional(),
  publishedAt: z.string().datetime().optional(),
  play: z.number().int().min(0).optional(),
  like: z.number().int().min(0).optional(),
  comment: z.number().int().min(0).optional(),
  share: z.number().int().min(0).optional(),
  collect: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || undefined;

    const works = await db.benchmarkWork.findMany({
      where: accountId ? { benchmarkAccountId: accountId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        account: { select: { nickname: true } },
      },
    });

    return NextResponse.json({
      items: works.map((w) => ({
        id: w.id,
        benchmarkAccountId: w.benchmarkAccountId,
        accountName: w.account.nickname,
        title: w.title,
        url: w.url,
        description: w.description,
        publishedAt: w.publishedAt,
        play: w.play,
        like: w.like,
        comment: w.comment,
        share: w.share,
        collect: w.collect,
        notes: w.notes,
        createdAt: w.createdAt,
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

    const work = await db.benchmarkWork.create({
      data: {
        benchmarkAccountId: parsed.data.benchmarkAccountId,
        title: parsed.data.title,
        url: parsed.data.url || null,
        description: parsed.data.description || null,
        publishedAt: parsed.data.publishedAt
          ? new Date(parsed.data.publishedAt)
          : null,
        play: parsed.data.play ?? null,
        like: parsed.data.like ?? null,
        comment: parsed.data.comment ?? null,
        share: parsed.data.share ?? null,
        collect: parsed.data.collect ?? null,
        notes: parsed.data.notes || null,
      },
    });

    return NextResponse.json(work, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'creation_failed', message: String(error) },
      { status: 500 },
    );
  }
}
