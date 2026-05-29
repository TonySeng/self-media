import { cookies } from 'next/headers';
import { verifySession, type SessionPayload } from './session';
import { verifyPassword } from './password';
import { SESSION_COOKIE } from './auth-constants';

export { SESSION_COOKIE };

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function checkAdminPassword(plain: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return false;
  return verifyPassword(plain, hash);
}
