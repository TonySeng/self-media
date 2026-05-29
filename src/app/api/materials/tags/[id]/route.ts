import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(
  _req: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const tag = await db.materialTag.findUnique({
    where: { id },
  });

  if (!tag) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await db.materialTag.delete({
    where: { id },
  });

  return new NextResponse(null, { status: 204 });
}
