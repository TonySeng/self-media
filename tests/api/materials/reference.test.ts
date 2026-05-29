import { describe, it, expect, afterAll } from 'vitest';
import { MaterialType } from '@prisma/client';
import { db } from '@/lib/db';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

describe('REFERENCE Material CRUD API', () => {
  let createdMaterialId: string;

  afterAll(async () => {
    if (createdMaterialId) {
      await db.material.delete({ where: { id: createdMaterialId } }).catch(() => {});
    }
  });

  function createRequest(url: string, method: string, body?: unknown): Request {
    return new Request(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it('should create a REFERENCE material with url and content', async () => {
    const payload = {
      type: MaterialType.REFERENCE,
      title: 'AI Research Paper',
      url: 'https://arxiv.org/abs/2024.12345',
      content: 'Summary of the latest AI research findings on transformer architectures.',
    };

    const res = await POST(createRequest('http://localhost/api/materials', 'POST', payload));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.type).toBe(MaterialType.REFERENCE);
    expect(data.title).toBe(payload.title);
    expect(data.url).toBe(payload.url);
    expect(data.content).toBe(payload.content);

    createdMaterialId = data.id;
  });

  it('should query REFERENCE materials by type', async () => {
    const res = await GET(
      createRequest(`http://localhost/api/materials?type=${MaterialType.REFERENCE}`, 'GET')
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const refMaterial = data.find((m: any) => m.id === createdMaterialId);
    expect(refMaterial).toBeDefined();
    expect(refMaterial.type).toBe(MaterialType.REFERENCE);
  });

  it('should update a REFERENCE material', async () => {
    const updatePayload = {
      title: 'Updated AI Research Paper',
      url: 'https://arxiv.org/abs/2024.54321',
      content: 'Updated summary with new findings.',
    };

    const res = await PUT(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'PUT', updatePayload),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.url).toBe(updatePayload.url);
    expect(data.content).toBe(updatePayload.content);
  });

  it('should delete a REFERENCE material', async () => {
    const res = await DELETE(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'DELETE'),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );

    expect(res.status).toBe(204);

    const getRes = await GET_BY_ID(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'GET'),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );
    expect(getRes.status).toBe(404);

    createdMaterialId = '';
  });
});
