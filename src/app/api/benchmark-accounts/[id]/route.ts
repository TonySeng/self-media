import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Platform } from '@prisma/client';
import { db } from '@/lib/db';

const UpdateSchema = z.object({
  platform: z.nativeEnum(Platform).optional(),
  nickname: z.string().min(1).max(100).optional(),
  url: z.string().url().optional().or(z.literal('')).nullable(),
  niche: z.string().max(100).optional().nullable(),
  followers: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const account = await db.benchmarkAccount.findUnique({
      where: { id },
      include: {
        works: {
          orderBy: [
            { publishedAt: 'desc' },
            { createdAt: 'desc' },
          ],
        },
      },
    });
    if (!account) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json(
      { error: 'query_failed', message: String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const account = await db.benchmarkAccount.update({
      where: { id },
      data: {
        ...(parsed.data.platform !== undefined && { platform: parsed.data.platform }),
        ...(parsed.data.nickname !== undefined && { nickname: parsed.data.nickname }),
        ...(parsed.data.url !== undefined && { url: parsed.data.url || null }),
        ...(parsed.data.niche !== undefined && { niche: parsed.data.niche || null }),
        ...(parsed.data.followers !== undefined && {
          followers: parsed.data.followers ?? null,
        }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes || null }),
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json(
      { error: 'update_failed', message: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    await db.benchmarkAccount.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'delete_failed', message: String(error) },
      { status: 500 },
    );
  }
}
