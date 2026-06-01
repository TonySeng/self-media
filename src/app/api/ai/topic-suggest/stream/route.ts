import { z } from 'zod';
import { streamTopicSuggest } from '@/lib/ai-tasks/topic-suggest';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  accountId: z.string().optional().nullable(),
  niche: z.string().min(1).max(100),
  direction: z.string().min(1).max(200),
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

  return createSSEResponse(
    streamTopicSuggest(
      parsed.data.accountId || null,
      parsed.data.niche,
      parsed.data.direction,
    ),
  );
}
