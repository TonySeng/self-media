import { signSession } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/auth-constants';

export async function createAuthHeaders(userId: string): Promise<HeadersInit> {
  const token = await signSession({ sub: userId });
  return {
    'Content-Type': 'application/json',
    Cookie: `${SESSION_COOKIE}=${token}`,
  };
}

export async function createAuthCookie(userId: string): Promise<string> {
  const token = await signSession({ sub: userId });
  return `${SESSION_COOKIE}=${token}`;
}
