import { z } from 'zod';
import { streamWorkReview } from '@/lib/ai-tasks/work-review';
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

  return createSSEResponse(streamWorkReview(parsed.data.workId));
}
