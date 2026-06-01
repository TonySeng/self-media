import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeTopicSuggest } from '@/lib/ai-tasks/topic-suggest';

const RequestSchema = z.object({
  accountId: z.string().optional().nullable(),
  niche: z.string().min(1).max(100),
  direction: z.string().min(1).max(200),
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

    const result = await executeTopicSuggest(
      parsed.data.accountId || null,
      parsed.data.niche,
      parsed.data.direction,
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
