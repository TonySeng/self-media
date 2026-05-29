import { describe, it, expect, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/platforms/douyin/accounts/[id]/route';
import { db } from '@/lib/db';

beforeEach(async () => { await db.platformAccount.deleteMany(); });

describe('DELETE /api/platforms/douyin/accounts/[id]', () => {
  it('deletes existing account (cascades works/metrics)', async () => {
    const a = await db.platformAccount.create({
      data: { platform: 'DOUYIN', nickname: 'X', secUid: 'sx', cookieEncrypted: 'e' },
    });
    const res = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: a.id }) });
    expect(res.status).toBe(200);
    expect(await db.platformAccount.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it('returns 404 on unknown id', async () => {
    const res = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
