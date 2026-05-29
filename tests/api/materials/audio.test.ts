import { describe, it, expect, afterAll } from 'vitest';
import { MaterialType } from '@prisma/client';
import { db } from '@/lib/db';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

describe('AUDIO Material CRUD API', () => {
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

  it('should create an AUDIO material with fileKey, fileSize, fileMime', async () => {
    const payload = {
      type: MaterialType.AUDIO,
      title: 'Background Music Track',
      fileKey: 'audio/2024/05/bgm-track-001.mp3',
      fileSize: 2048576,
      fileMime: 'audio/mpeg',
    };

    const res = await POST(createRequest('http://localhost/api/materials', 'POST', payload));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.type).toBe(MaterialType.AUDIO);
    expect(data.title).toBe(payload.title);
    expect(data.fileKey).toBe(payload.fileKey);
    expect(data.fileSize).toBe(payload.fileSize);
    expect(data.fileMime).toBe(payload.fileMime);

    createdMaterialId = data.id;
  });

  it('should query AUDIO materials by type', async () => {
    const res = await GET(
      createRequest(`http://localhost/api/materials?type=${MaterialType.AUDIO}`, 'GET')
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const audioMaterial = data.find((m: any) => m.id === createdMaterialId);
    expect(audioMaterial).toBeDefined();
    expect(audioMaterial.type).toBe(MaterialType.AUDIO);
  });

  it('should update an AUDIO material', async () => {
    const updatePayload = {
      title: 'Updated Background Music',
      fileKey: 'audio/2024/05/bgm-track-002.mp3',
      fileSize: 3145728,
      fileMime: 'audio/mpeg',
    };

    const res = await PUT(
      createRequest(`http://localhost/api/materials/${createdMaterialId}`, 'PUT', updatePayload),
      { params: Promise.resolve({ id: createdMaterialId }) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.fileKey).toBe(updatePayload.fileKey);
    expect(data.fileSize).toBe(updatePayload.fileSize);
    expect(data.fileMime).toBe(updatePayload.fileMime);
  });

  it('should delete an AUDIO material', async () => {
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
