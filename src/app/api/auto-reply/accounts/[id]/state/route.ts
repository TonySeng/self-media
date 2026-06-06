import { NextResponse } from 'next/server';
import { loadAccountState, saveAccountState } from '@/lib/auto-reply/config';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;

  try {
    const state = await loadAccountState(id);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: 'load_failed', message: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await saveAccountState(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'save_failed', message: String(error) },
      { status: 500 }
    );
  }
}
