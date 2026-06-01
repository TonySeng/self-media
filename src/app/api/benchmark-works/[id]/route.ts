import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    await db.benchmarkWork.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'delete_failed', message: String(error) },
      { status: 500 },
    );
  }
}
