import { jwtVerify, SignJWT } from 'jose';

const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  sub: string;
  [key: string]: unknown;
}

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('SESSION_SECRET must be ≥ 32 chars');
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(
  payload: SessionPayload,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== 'string') return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
