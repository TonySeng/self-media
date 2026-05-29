import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/works/[id]/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(async () => {
  await db.workMetric.deleteMany();
  await db.work.deleteMany();
  await db.platformAccount.deleteMany();
});

describe('GET /api/works/[id]', () => {
  it('returns work with metrics array sorted asc by snapshotAt', async () => {
    const a = await db.platformAccount.create({
      data: { platform: 'DOUYIN', nickname: 'A', secUid: 's',
              cookieEncrypted: encrypt('sessionid_ss=v') },
    });
    const w = await db.work.create({
      data: { platformAccountId: a.id, platformWorkId: 'p1',
              title: 'T', publishedAt: new Date(), rawData: {} },
    });
    await db.workMetric.create({
      data: { workId: w.id, snapshotAt: new Date('2026-05-21'),
              play: 100, like: 0, comment: 0, share: 0, collect: 0, rawData: {} },
    });
    await db.workMetric.create({
      data: { workId: w.id, snapshotAt: new Date('2026-05-22'),
              play: 200, like: 0, comment: 0, share: 0, collect: 0, rawData: {} },
    });

    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ id: w.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { metrics: Array<{ play: number }> };
    expect(json.metrics.map((m) => m.play)).toEqual([100, 200]);
  });

  it('returns 404 on unknown id', async () => {
    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ id: 'unknown' }),
    });
    expect(res.status).toBe(404);
  });
});
