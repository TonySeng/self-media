import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

describe('password', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('right');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('returns false for invalid hash format', async () => {
    expect(await verifyPassword('any', 'not-a-hash')).toBe(false);
  });
});
