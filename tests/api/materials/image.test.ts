import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MaterialType } from '@prisma/client';
import { db } from '@/lib/db';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

function createRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('IMAGE Material CRUD API', () => {
  let createdMaterialId: string;

  beforeEach(async () => {
    await db.material.deleteMany({ where: { type: MaterialType.IMAGE } });
  });

  afterAll(async () => {
    if (createdMaterialId) {
      await db.material.delete({ where: { id: createdMaterialId } }).catch(() => {});
    }
  });

  it('should create an IMAGE material with fileKey, fileSize, fileMime', async () => {
    const payload = {
      type: MaterialType.IMAGE,
      title: 'Product Photo',
      fileKey: 'uploads/2026/05/product-photo.jpg',
      fileSize: 204800,
      fileMime: 'image/jpeg',
    };

    const res = await POST(createRequest('http://localhost/api/materials', 'POST', payload));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.type).toBe(MaterialType.IMAGE);
    expect(data.title).toBe(payload.title);
    expect(data.fileKey).toBe(payload.fileKey);
    expect(data.fileSize).toBe(payload.fileSize);
    expect(data.fileMime).toBe(payload.fileMime);

    createdMaterialId = data.id;
  });

  it('should query IMAGE materials by type', async () => {
    const createRes = await POST(
      createRequest('http://localhost/api/materials', 'POST', {
        type: MaterialType.IMAGE,
        title: 'Photo',
        fileKey: 'uploads/2026/05/p.jpg',
        fileSize: 1024,
        fileMime: 'image/jpeg',
      }),
    );
    const created = await createRes.json();
    createdMaterialId = created.id;

    const res = await GET(
      createRequest(`http://localhost/api/materials?type=${MaterialType.IMAGE}`, 'GET'),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const imgMaterial = data.find((m: { id: string }) => m.id === createdMaterialId);
    expect(imgMaterial).toBeDefined();
    expect(imgMaterial.type).toBe(MaterialType.IMAGE);
  });

  it('should update an IMAGE material', async () => {
    const createRes = await POST(
      createRequest('http://localhost/api/materials', 'POST', {
        type: MaterialType.IMAGE,
        title: 'Photo',
        fileKey: 'uploads/2026/05/p.jpg',
        fileSize: 1024,
        fileMime: 'image/jpeg',
      }),
    );
    const created = await createRes.json();
    createdMaterialId = created.id;

    const updatePayload = {
      title: 'Updated Product Photo',
      fileKey: 'uploads/2026/05/product-photo-v2.jpg',
      fileSize: 307200,
      fileMime: 'image/jpeg',
    };

    const res = await PUT(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'PUT', updatePayload),
      { params: Promise.resolve({ id: createdMaterialId }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.fileKey).toBe(updatePayload.fileKey);
    expect(data.fileSize).toBe(updatePayload.fileSize);
    expect(data.fileMime).toBe(updatePayload.fileMime);
  });

  it('should delete an IMAGE material', async () => {
    const createRes = await POST(
      createRequest('http://localhost/api/materials', 'POST', {
        type: MaterialType.IMAGE,
        title: 'Photo',
        fileKey: 'uploads/2026/05/p.jpg',
        fileSize: 1024,
        fileMime: 'image/jpeg',
      }),
    );
    const created = await createRes.json();
    createdMaterialId = created.id;

    const res = await DELETE(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'DELETE'),
      { params: Promise.resolve({ id: createdMaterialId }) },
    );
    expect(res.status).toBe(204);

    const getRes = await GET_BY_ID(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'GET'),
      { params: Promise.resolve({ id: createdMaterialId }) },
    );
    expect(getRes.status).toBe(404);

    createdMaterialId = '';
  });
});
