import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/sync/run/[accountId]/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

vi.mock('@/lib/platforms/douyin/api', () => ({
  listWorks: vi.fn(async () => ({ works: [], metrics: [] })),
  getFansAnalysis: vi.fn(async () => ({
    totalFans: 1,
    genderDist: null,
    ageDist: null,
    regionDist: null,
    rawData: {},
  })),
}));

vi.mock('@/lib/platforms/douyin/http', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/platforms/douyin/http')>(
      '@/lib/platforms/douyin/http',
    );
  return { ...actual, sleep: vi.fn(async () => {}), randomDelayMs: vi.fn(() => 0) };
});

beforeEach(async () => {
  await db.syncJob.deleteMany();
  await db.platformAccount.deleteMany();
});

describe('POST /api/sync/run/[accountId]', () => {
  it('returns job status DONE on success', async () => {
    const a = await db.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: 'A',
        secUid: 'q',
        cookieEncrypted: encrypt('sessionid_ss=v'),
      },
    });
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ accountId: a.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('DONE');
  });
});
