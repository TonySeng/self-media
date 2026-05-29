import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from '@/app/api/platforms/douyin/accounts/route';
import { db } from '@/lib/db';

vi.mock('@/lib/platforms/douyin', () => ({
  douyinAdapter: {
    platform: 'DOUYIN',
    validateCookie: vi.fn(async () => ({
      ok: true,
      account: { secUid: 'sec_1', nickname: '某人', avatar: null },
    })),
  },
}));

beforeEach(async () => {
  await db.platformAccount.deleteMany();
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/platforms/douyin/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/platforms/douyin/accounts', () => {
  it('rejects empty cookie', async () => {
    const res = await POST(req({ cookie: '' }));
    expect(res.status).toBe(400);
  });

  it('creates account on valid cookie', async () => {
    const res = await POST(req({ cookie: 'sessionid_ss=v' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; nickname: string };
    expect(json.nickname).toBe('某人');
    const row = await db.platformAccount.findUnique({ where: { secUid: 'sec_1' } });
    expect(row).not.toBeNull();
    expect(row?.cookieEncrypted).not.toContain('sessionid_ss=v');
  });
});

describe('GET /api/platforms/douyin/accounts', () => {
  it('returns accounts without cookieEncrypted', async () => {
    await db.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: 'A',
        secUid: 'x',
        cookieEncrypted: 'encrypted-blob',
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<Record<string, unknown>>;
    expect(json[0]?.nickname).toBe('A');
    expect('cookieEncrypted' in (json[0] ?? {})).toBe(false);
  });
});
