import { z } from 'zod';
import { streamCommentInsight } from '@/lib/ai-tasks/comment-insight';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  workId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  return createSSEResponse(streamCommentInsight(parsed.data.workId));
}
