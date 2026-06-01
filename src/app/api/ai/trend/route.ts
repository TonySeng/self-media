import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeTrendAnalysis } from '@/lib/ai-tasks/trend';

const RequestSchema = z.object({
  accountId: z.string().min(1),
  periodDays: z.number().int().min(7).max(180).optional(),
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

    const result = await executeTrendAnalysis(
      parsed.data.accountId,
      parsed.data.periodDays || 30,
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
