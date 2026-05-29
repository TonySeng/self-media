import { beforeAll, describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/lib/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-32!';
});

describe('session', () => {
  it('signs and verifies a session payload', async () => {
    const token = await signSession({ sub: 'admin' });
    const payload = await verifySession(token);
    expect(payload?.sub).toBe('admin');
  });

  it('rejects a tampered token', async () => {
    const token = await signSession({ sub: 'admin' });
    const tampered = token.slice(0, -2) + 'aa';
    expect(await verifySession(tampered)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifySession('not.a.token')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signSession({ sub: 'admin' }, { expiresInSeconds: -10 });
    expect(await verifySession(token)).toBeNull();
  });
});
