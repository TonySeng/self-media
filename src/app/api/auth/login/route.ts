import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAdminPassword, SESSION_COOKIE } from '@/lib/auth';
import { signSession } from '@/lib/session';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const ok = await checkAdminPassword(parsed.password);
  if (!ok) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const token = await signSession({ sub: 'admin' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
