import { z } from 'zod';
import { streamTrendAnalysis } from '@/lib/ai-tasks/trend';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  accountId: z.string().min(1),
  periodDays: z.number().int().min(7).max(180).optional(),
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
    streamTrendAnalysis(parsed.data.accountId, parsed.data.periodDays || 30),
  );
}
