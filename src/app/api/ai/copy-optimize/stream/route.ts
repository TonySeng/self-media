import { z } from 'zod';
import { streamCopyOptimize } from '@/lib/ai-tasks/copy-optimize';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  draft: z.string().min(1).max(5000),
  accountId: z.string().optional().nullable(),
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
    streamCopyOptimize(parsed.data.draft, parsed.data.accountId || null),
  );
}
