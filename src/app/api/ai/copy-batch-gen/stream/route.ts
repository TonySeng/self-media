import { z } from 'zod';
import { streamCopyBatchGen } from '@/lib/ai-tasks/copy-batch-gen';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  niche: z.string().min(1).max(50),
  direction: z.string().min(1).max(500),
  count: z.number().int().min(1).max(20),
  referenceAccountId: z.string().nullable().optional(),
  benchmarkAccountId: z.string().nullable().optional(),
  benchmarkWorkIds: z.array(z.string()).max(10).optional(),
  ownerAccountId: z.string().nullable().optional(),
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

  return createSSEResponse(streamCopyBatchGen(parsed.data));
}
