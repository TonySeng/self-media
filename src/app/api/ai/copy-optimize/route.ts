import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeCopyOptimize } from '@/lib/ai-tasks/copy-optimize';

const RequestSchema = z.object({
  draft: z.string().min(1).max(5000),
  accountId: z.string().optional().nullable(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await executeCopyOptimize(
      parsed.data.draft,
      parsed.data.accountId || null,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'execution_failed', message },
      { status: 500 },
    );
  }
}
