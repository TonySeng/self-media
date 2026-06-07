import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/ai/copy-batch-gen/save/route';

const prisma = new PrismaClient();

describe('POST /api/ai/copy-batch-gen/save', () => {
  const createdIds: string[] = [];
  let ownerAccountId: string;

  beforeAll(async () => {
    const acc = await prisma.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: 'save-test',
        secUid: 'save-test-secuid-' + Date.now(),
        cookieEncrypted: 'encrypted-placeholder',
      },
    });
    ownerAccountId = acc.id;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.material.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.platformAccount.deleteMany({ where: { id: ownerAccountId } });
    const tag = await prisma.materialTag.findUnique({ where: { name: 'AI 生成' } });
    if (tag) {
      const cnt = await prisma.material.count({
        where: { tags: { some: { id: tag.id } } },
      });
      if (cnt === 0) {
        await prisma.materialTag.delete({ where: { id: tag.id } });
      }
    }
    await prisma.$disconnect();
  });

  it('creates N COPY materials with AI-generated tag', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { title: '标题A', content: '正文A' },
            { title: '标题B', content: '正文B' },
          ],
          ownerAccountId,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.ids).toHaveLength(2);
    createdIds.push(...data.ids);

    const materials = await prisma.material.findMany({
      where: { id: { in: data.ids } },
      include: { tags: true },
    });
    expect(materials).toHaveLength(2);
    for (const m of materials) {
      expect(m.type).toBe('COPY');
      expect(m.platformAccountId).toBe(ownerAccountId);
      expect(m.tags.some((t) => t.name === 'AI 生成')).toBe(true);
    }
  });

  it('reuses existing AI 生成 tag (idempotent)', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ title: '标题C', content: '正文C' }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    createdIds.push(...data.ids);

    const tags = await prisma.materialTag.findMany({ where: { name: 'AI 生成' } });
    expect(tags).toHaveLength(1);
  });

  it('rejects empty items', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects more than 20 items', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      title: `t${i}`,
      content: `c${i}`,
    }));
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
