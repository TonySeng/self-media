import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const SaveSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        content: z.string().min(1).max(5000),
      }),
    )
    .min(1)
    .max(20),
  ownerAccountId: z.string().nullable().optional(),
  sourceAnalysisId: z.string().optional(),
});

const AI_TAG_NAME = 'AI 生成';
const AI_TAG_COLOR = '#8b5cf6';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { items, ownerAccountId } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const tag = await tx.materialTag.upsert({
        where: { name: AI_TAG_NAME },
        update: {},
        create: { name: AI_TAG_NAME, color: AI_TAG_COLOR },
      });

      const ids: string[] = [];
      for (const item of items) {
        const m = await tx.material.create({
          data: {
            type: 'COPY',
            title: item.title,
            content: item.content,
            platformAccountId: ownerAccountId ?? null,
            tags: { connect: [{ id: tag.id }] },
          },
        });
        ids.push(m.id);
      }
      return ids;
    });

    return NextResponse.json(
      { created: result.length, ids: result },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'save_failed', message: String(error) },
      { status: 500 },
    );
  }
}
