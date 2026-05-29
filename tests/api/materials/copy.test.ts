import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, MaterialType } from '@prisma/client';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

const prisma = new PrismaClient();

describe('COPY Material CRUD API', () => {
  let createdMaterialId: string;

  afterAll(async () => {
    if (createdMaterialId) {
      await prisma.material.delete({ where: { id: createdMaterialId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should create a COPY material with Tiptap HTML content', async () => {
    const payload = {
      type: MaterialType.COPY,
      title: 'Product Launch Copy',
      content: '<p>Introducing our <strong>revolutionary</strong> new product!</p><ul><li>Feature 1</li><li>Feature 2</li></ul>',
    };

    const res = await POST(
      new Request('http://localhost/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.type).toBe(MaterialType.COPY);
    expect(data.title).toBe(payload.title);
    expect(data.content).toBe(payload.content);

    createdMaterialId = data.id;
  });

  it('should query COPY materials by type', async () => {
    const res = await GET(
      new Request(`http://localhost/api/materials?type=${MaterialType.COPY}`)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const copyMaterial = data.find((m: { id: string }) => m.id === createdMaterialId);
    expect(copyMaterial).toBeDefined();
    expect(copyMaterial.type).toBe(MaterialType.COPY);
  });

  it('should update a COPY material', async () => {
    const updatePayload = {
      title: 'Updated Product Launch Copy',
      content: '<p>Updated: Now with <em>even more</em> features!</p>',
    };

    const res = await PUT(
      new Request(`http://localhost/api/materials/${createdMaterialId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      }),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.content).toBe(updatePayload.content);
  });

  it('should delete a COPY material', async () => {
    const res = await DELETE(
      new Request(`http://localhost/api/materials/${createdMaterialId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );

    expect(res.status).toBe(204);

    const getRes = await GET_BY_ID(
      new Request(`http://localhost/api/materials/${createdMaterialId}`),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );
    expect(getRes.status).toBe(404);

    createdMaterialId = '';
  });
});
