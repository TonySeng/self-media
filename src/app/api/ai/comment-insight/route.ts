import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeCommentInsight } from '@/lib/ai-tasks/comment-insight';

const RequestSchema = z.object({
  workId: z.string().min(1),
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

    const result = await executeCommentInsight(parsed.data.workId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'execution_failed', message },
      { status: 500 },
    );
  }
}
