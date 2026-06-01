import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as fs from 'node:fs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const publish = await db.publish.findUnique({ where: { id } });
  if (!publish?.screenshotKey) return NextResponse.json({ error: 'No screenshot' }, { status: 404 });

  try {
    const buffer = fs.readFileSync(publish.screenshotKey);
    return new NextResponse(buffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'Screenshot file not found' }, { status: 404 });
  }
}
