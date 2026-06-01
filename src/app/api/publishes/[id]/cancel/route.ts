import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const publish = await db.publish.findUnique({ where: { id } });
  if (!publish) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (publish.status !== 'PENDING') {
    return NextResponse.json({ error: '仅排队中的任务可取消' }, { status: 400 });
  }
  await db.publish.update({ where: { id }, data: { status: 'CANCELLED' } });
  return NextResponse.json({ id, status: 'CANCELLED' });
}
