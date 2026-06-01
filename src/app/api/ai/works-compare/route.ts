import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeWorksCompare } from '@/lib/ai-tasks/works-compare';

const RequestSchema = z.object({
  workIds: z.array(z.string()).min(2).max(10),
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

    const result = await executeWorksCompare(parsed.data.workIds);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'execution_failed', message },
      { status: 500 },
    );
  }
}
