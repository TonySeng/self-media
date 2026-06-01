import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AIAnalysisType } from '@prisma/client';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as AIAnalysisType | null;
    const limit = Math.min(Number(searchParams.get('limit') ?? '50') || 50, 100);

    const where: { type?: AIAnalysisType } = {};
    if (type) {
      where.type = type;
    }

    const analyses = await db.aIAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        provider: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      items: analyses.map((a) => ({
        id: a.id,
        type: a.type,
        targetRefs: a.targetRefs,
        status: a.status,
        modelUsed: a.modelUsed,
        providerName: a.provider?.name || null,
        tokensUsed: a.tokensUsed,
        error: a.error,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}
