import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getTags, POST as createTag } from '@/app/api/materials/tags/route';
import { DELETE as deleteTag } from '@/app/api/materials/tags/[id]/route';
import { db } from '@/lib/db';

beforeEach(async () => {
  await db.material.deleteMany();
  await db.materialTag.deleteMany();
});

describe('GET /api/materials/tags', () => {
  it('returns empty array when no tags exist', async () => {
    const res = await getTags();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { tags: unknown[] };
    expect(json.tags).toEqual([]);
  });

  it('returns all tags with usage count', async () => {
    const tag1 = await db.materialTag.create({
      data: { name: 'Marketing', color: '#ff0000' },
    });
    const tag2 = await db.materialTag.create({
      data: { name: 'Tutorial' },
    });

    await db.material.create({
      data: {
        type: 'COPY',
        title: 'Test Material',
        tags: { connect: [{ id: tag1.id }] },
      },
    });

    const res = await getTags();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      tags: Array<{ id: string; name: string; color: string | null; usageCount: number }>;
    };

    expect(json.tags).toHaveLength(2);
    const marketing = json.tags.find((t) => t.name === 'Marketing');
    const tutorial = json.tags.find((t) => t.name === 'Tutorial');

    expect(marketing?.usageCount).toBe(1);
    expect(marketing?.color).toBe('#ff0000');
    expect(tutorial?.usageCount).toBe(0);
  });
});

describe('POST /api/materials/tags', () => {
  it('creates a tag with name only', async () => {
    const req = new Request('http://localhost/api/materials/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Tag' }),
    });

    const res = await createTag(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; name: string; color: string | null };
    expect(json.name).toBe('New Tag');
    expect(json.color).toBeNull();
    expect(json.id).toBeDefined();
  });

  it('creates a tag with name and color', async () => {
    const req = new Request('http://localhost/api/materials/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'Colored Tag', color: '#00ff00' }),
    });

    const res = await createTag(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { name: string; color: string | null };
    expect(json.name).toBe('Colored Tag');
    expect(json.color).toBe('#00ff00');
  });

  it('returns 400 for invalid body', async () => {
    const req = new Request('http://localhost/api/materials/tags', {
      method: 'POST',
      body: JSON.stringify({ color: '#ff0000' }),
    });

    const res = await createTag(req);
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate tag name', async () => {
    await db.materialTag.create({ data: { name: 'Existing' } });

    const req = new Request('http://localhost/api/materials/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'Existing' }),
    });

    const res = await createTag(req);
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/materials/tags/[id]', () => {
  it('deletes a tag and unbinds all materials', async () => {
    const tag = await db.materialTag.create({
      data: { name: 'ToDelete' },
    });

    const material = await db.material.create({
      data: {
        type: 'COPY',
        title: 'Test',
        tags: { connect: [{ id: tag.id }] },
      },
    });

    const req = new Request(`http://localhost/api/materials/tags/${tag.id}`, {
      method: 'DELETE',
    });

    const res = await deleteTag(req, { params: Promise.resolve({ id: tag.id }) });
    expect(res.status).toBe(204);

    const deletedTag = await db.materialTag.findUnique({ where: { id: tag.id } });
    expect(deletedTag).toBeNull();

    const updatedMaterial = await db.material.findUnique({
      where: { id: material.id },
      include: { tags: true },
    });
    expect(updatedMaterial?.tags).toHaveLength(0);
  });

  it('returns 404 for non-existent tag', async () => {
    const req = new Request('http://localhost/api/materials/tags/nonexistent', {
      method: 'DELETE',
    });

    const res = await deleteTag(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });
});
