import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, MaterialType } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000/api/materials';

describe('IMAGE Material CRUD API', () => {
  let createdMaterialId: string;

  afterAll(async () => {
    if (createdMaterialId) {
      await prisma.material.delete({ where: { id: createdMaterialId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should create an IMAGE material with fileKey, fileSize, fileMime', async () => {
    const payload = {
      type: MaterialType.IMAGE,
      title: 'Product Photo',
      fileKey: 'uploads/2026/05/product-photo.jpg',
      fileSize: 204800,
      fileMime: 'image/jpeg',
    };

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

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
    const res = await fetch(`${BASE_URL}?type=${MaterialType.IMAGE}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const imgMaterial = data.find((m: { id: string }) => m.id === createdMaterialId);
    expect(imgMaterial).toBeDefined();
    expect(imgMaterial.type).toBe(MaterialType.IMAGE);
  });

  it('should update an IMAGE material', async () => {
    const updatePayload = {
      title: 'Updated Product Photo',
      fileKey: 'uploads/2026/05/product-photo-v2.jpg',
      fileSize: 307200,
      fileMime: 'image/jpeg',
    };

    const res = await fetch(`${BASE_URL}/${createdMaterialId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.fileKey).toBe(updatePayload.fileKey);
    expect(data.fileSize).toBe(updatePayload.fileSize);
    expect(data.fileMime).toBe(updatePayload.fileMime);
  });

  it('should delete an IMAGE material', async () => {
    const res = await fetch(`${BASE_URL}/${createdMaterialId}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);

    const getRes = await fetch(`${BASE_URL}/${createdMaterialId}`);
    expect(getRes.status).toBe(404);

    createdMaterialId = '';
  });
});
