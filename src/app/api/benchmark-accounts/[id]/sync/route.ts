import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { syncBenchmarkWorks } from '@/lib/platforms/douyin/benchmark-sync';

const RequestSchema = z.object({
  cookieFromAccountId: z.string().optional().nullable(),
  incremental: z.boolean().optional().default(true),
  maxPages: z.number().int().min(1).max(200).optional().default(50),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    let fetchCookie: string | undefined;
    if (parsed.data.cookieFromAccountId) {
      const acc = await db.platformAccount.findUnique({
        where: { id: parsed.data.cookieFromAccountId },
      });
      if (acc) fetchCookie = decrypt(acc.cookieEncrypted);
    }

    const stats = await syncBenchmarkWorks(id, fetchCookie, {
      incremental: parsed.data.incremental,
      maxPages: parsed.data.maxPages,
    });

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'sync_failed', message },
      { status: 500 },
    );
  }
}
