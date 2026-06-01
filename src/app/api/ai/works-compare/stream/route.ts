import { z } from 'zod';
import { streamWorksCompare } from '@/lib/ai-tasks/works-compare';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  workIds: z.array(z.string()).min(2).max(10),
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

  return createSSEResponse(streamWorksCompare(parsed.data.workIds));
}
