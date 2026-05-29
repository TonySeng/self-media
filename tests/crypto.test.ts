import { describe, expect, it, beforeAll } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

beforeAll(() => {
  process.env.MASTER_KEY = TEST_KEY;
});

describe('crypto', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const plain = 'hello world';
    const cipher = encrypt(plain);
    expect(cipher).not.toContain(plain);
    expect(cipher.split(':')).toHaveLength(3); // iv:tag:ct
    expect(decrypt(cipher)).toBe(plain);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });

  it('handles unicode strings', () => {
    const plain = '抖音 cookie 中文测试 🎵';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encrypt('payload');
    const parts = cipher.split(':');
    const [iv, tag, ct] = parts as [string, string, string];
    const tampered = `${iv}:${tag}:${ct.slice(0, -2)}ff`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects malformed input', () => {
    expect(() => decrypt('not-a-valid-cipher')).toThrow();
  });
});
