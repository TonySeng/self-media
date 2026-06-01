import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const analysis = await db.aIAnalysis.findUnique({
      where: { id },
      include: {
        provider: {
          select: { name: true },
        },
      },
    });

    if (!analysis) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({
      id: analysis.id,
      type: analysis.type,
      targetRefs: analysis.targetRefs,
      prompt: analysis.prompt,
      response: analysis.response,
      status: analysis.status,
      modelUsed: analysis.modelUsed,
      providerName: analysis.provider?.name || null,
      tokensUsed: analysis.tokensUsed,
      error: analysis.error,
      createdAt: analysis.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}
