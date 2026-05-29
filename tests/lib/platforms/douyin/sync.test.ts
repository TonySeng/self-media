import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { runSync } from '@/lib/platforms/douyin/sync';

vi.mock('@/lib/platforms/douyin/api', () => ({
  listWorks: vi.fn(),
  getFansAnalysis: vi.fn(),
}));

vi.mock('@/lib/platforms/douyin/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/platforms/douyin/http')>();
  return {
    ...actual,
    sleep: vi.fn(async () => {}),
    randomDelayMs: () => 0,
  };
});

import { listWorks, getFansAnalysis } from '@/lib/platforms/douyin/api';

beforeEach(async () => {
  await db.workMetric.deleteMany();
  await db.work.deleteMany();
  await db.accountMetric.deleteMany();
  await db.syncJob.deleteMany();
  await db.platformAccount.deleteMany();
  vi.clearAllMocks();
});

async function makeAccount() {
  return db.platformAccount.create({
    data: {
      platform: 'DOUYIN',
      nickname: 'T',
      secUid: 'sec',
      cookieEncrypted: encrypt('sessionid_ss=v'),
    },
  });
}

describe('runSync', () => {
  it('upserts works, snapshots metrics, and account metric', async () => {
    vi.mocked(listWorks).mockResolvedValue({
      works: [{
        platformWorkId: 'a1', title: 't', description: null, coverUrl: null,
        videoUrl: null, duration: 30, publishedAt: new Date('2026-01-01'),
        rawData: {},
      }],
      metrics: [{
        platformWorkId: 'a1', play: 10, like: 1, comment: 0, share: 0,
        collect: 0, finishRate: null, rawData: {},
      }],
    });
    vi.mocked(getFansAnalysis).mockResolvedValue({
      totalFans: 100, genderDist: null, ageDist: null, regionDist: null, rawData: {},
    });

    const a = await makeAccount();
    const job = await runSync(a.id, 'MANUAL');

    expect(job.status).toBe('DONE');
    expect(await db.work.count()).toBe(1);
    expect(await db.workMetric.count()).toBe(1);
    expect(await db.accountMetric.count()).toBe(1);
    const updated = await db.platformAccount.findUnique({ where: { id: a.id } });
    expect(updated?.lastSyncAt).not.toBeNull();
    expect(updated?.cookieStatus).toBe('ACTIVE');
  });

  it('snapshots a new WorkMetric on second run for same work', async () => {
    vi.mocked(listWorks).mockResolvedValue({
      works: [{
        platformWorkId: 'a1', title: 't', description: null, coverUrl: null,
        videoUrl: null, duration: 30, publishedAt: new Date('2026-01-01'),
        rawData: {},
      }],
      metrics: [{
        platformWorkId: 'a1', play: 10, like: 1, comment: 0, share: 0,
        collect: 0, finishRate: null, rawData: {},
      }],
    });
    vi.mocked(getFansAnalysis).mockResolvedValue({
      totalFans: 100, genderDist: null, ageDist: null, regionDist: null, rawData: {},
    });

    const a = await makeAccount();
    await runSync(a.id, 'MANUAL');
    await runSync(a.id, 'MANUAL');
    expect(await db.work.count()).toBe(1);
    expect(await db.workMetric.count()).toBe(2);
  });

  it('marks cookie expired when listWorks throws HTTP 401', async () => {
    vi.mocked(listWorks).mockRejectedValue(new Error('HTTP 401: unauthorized'));
    vi.mocked(getFansAnalysis).mockResolvedValue({
      totalFans: 0, genderDist: null, ageDist: null, regionDist: null, rawData: {},
    });

    const a = await makeAccount();
    const job = await runSync(a.id, 'MANUAL');
    expect(job.status).toBe('FAILED');
    const updated = await db.platformAccount.findUnique({ where: { id: a.id } });
    expect(updated?.cookieStatus).toBe('EXPIRED');
    expect(updated?.lastError).toContain('401');
  });
});
