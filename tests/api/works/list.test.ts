import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/works/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(async () => {
  await db.workMetric.deleteMany();
  await db.work.deleteMany();
  await db.platformAccount.deleteMany();
});

async function setup() {
  const a = await db.platformAccount.create({
    data: { platform: 'DOUYIN', nickname: 'A', secUid: 's',
            cookieEncrypted: encrypt('sessionid_ss=v') },
  });
  const w = await db.work.create({
    data: {
      platformAccountId: a.id, platformWorkId: 'p1',
      title: '示例', publishedAt: new Date('2026-05-20'), rawData: {},
    },
  });
  await db.workMetric.create({
    data: { workId: w.id, play: 100, like: 10, comment: 1, share: 0, collect: 0,
            rawData: {} },
  });
  return { account: a, work: w };
}

describe('GET /api/works', () => {
  it('returns list with latestMetric', async () => {
    await setup();
    const res = await GET(new Request('http://localhost/api/works'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ title: string; latestMetric: { play: number } | null }>;
    };
    expect(json.items[0]?.title).toBe('示例');
    expect(json.items[0]?.latestMetric?.play).toBe(100);
  });

  it('filters by q', async () => {
    await setup();
    const res = await GET(new Request('http://localhost/api/works?q=不存在'));
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(0);
  });
});
