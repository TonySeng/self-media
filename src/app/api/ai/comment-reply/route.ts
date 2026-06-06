import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeCommentReply } from '@/lib/ai-tasks/comment-reply';

const RequestSchema = z.object({
  commentId: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }
    const result = await executeCommentReply(parsed.data.commentId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'execution_failed', message },
      { status: 500 },
    );
  }
}
