import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, MaterialType } from '@prisma/client';
import { config } from 'dotenv';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

config();

const prisma = new PrismaClient();

describe('VIDEO Material CRUD API', () => {
  let createdMaterialId: string;

  afterAll(async () => {
    if (createdMaterialId) {
      await prisma.material.delete({ where: { id: createdMaterialId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should create a VIDEO material with fileKey, fileSize, fileMime', async () => {
    const payload = {
      type: MaterialType.VIDEO,
      title: 'Product Demo Video',
      fileKey: 'videos/2024/demo-product.mp4',
      fileSize: 15728640,
      fileMime: 'video/mp4',
    };

    const req = new Request('http://localhost:3000/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.type).toBe(MaterialType.VIDEO);
    expect(data.title).toBe(payload.title);
    expect(data.fileKey).toBe(payload.fileKey);
    expect(data.fileSize).toBe(payload.fileSize);
    expect(data.fileMime).toBe(payload.fileMime);

    createdMaterialId = data.id;
  });

  it('should query VIDEO materials by type', async () => {
    const req = new Request(`http://localhost:3000/api/materials?type=${MaterialType.VIDEO}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const videoMaterial = data.find((m: any) => m.id === createdMaterialId);
    expect(videoMaterial).toBeDefined();
    expect(videoMaterial.type).toBe(MaterialType.VIDEO);
  });

  it('should update a VIDEO material', async () => {
    const updatePayload = {
      title: 'Updated Product Demo',
      fileKey: 'videos/2024/demo-product-v2.mp4',
      fileSize: 18874368,
      fileMime: 'video/mp4',
    };

    const req = new Request(`http://localhost:3000/api/materials/${createdMaterialId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: createdMaterialId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.fileKey).toBe(updatePayload.fileKey);
    expect(data.fileSize).toBe(updatePayload.fileSize);
    expect(data.fileMime).toBe(updatePayload.fileMime);
  });

  it('should delete a VIDEO material', async () => {
    const req = new Request(`http://localhost:3000/api/materials/${createdMaterialId}`, {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: createdMaterialId }) });
    expect(res.status).toBe(204);

    const getReq = new Request(`http://localhost:3000/api/materials/${createdMaterialId}`);
    const getRes = await GET_BY_ID(getReq, { params: Promise.resolve({ id: createdMaterialId }) });
    expect(getRes.status).toBe(404);

    createdMaterialId = '';
  });
});
