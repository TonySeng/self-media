import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { IdeaStatus } from '@prisma/client';

const UpdateMaterialSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  fileKey: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  fileMime: z.string().optional(),
  url: z.string().url().optional(),
  ideaStatus: z.nativeEnum(IdeaStatus).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const material = await db.material.findUnique({
      where: { id },
    });

    if (!material) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(material);
  } catch (error) {
    return NextResponse.json(
      { error: 'query_failed', message: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const parsed = UpdateMaterialSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const material = await db.material.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(material);
  } catch (error) {
    return NextResponse.json(
      { error: 'update_failed', message: String(error) },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    await db.material.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
