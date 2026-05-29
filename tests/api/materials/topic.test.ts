import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, MaterialType } from '@prisma/client';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

const prisma = new PrismaClient();

describe('TOPIC Material CRUD API', () => {
  let createdMaterialId: string;

  afterAll(async () => {
    if (createdMaterialId) {
      await prisma.material.delete({ where: { id: createdMaterialId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should create a TOPIC material with content', async () => {
    const payload = {
      type: MaterialType.TOPIC,
      title: 'AI 发展趋势',
      content: '探讨人工智能在各行业的应用前景和技术演进方向',
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
    expect(data.type).toBe(MaterialType.TOPIC);
    expect(data.title).toBe(payload.title);
    expect(data.content).toBe(payload.content);

    createdMaterialId = data.id;
  });

  it('should query TOPIC materials by type', async () => {
    const req = new Request(`http://localhost:3000/api/materials?type=${MaterialType.TOPIC}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const topicMaterial = data.find((m: { id: string }) => m.id === createdMaterialId);
    expect(topicMaterial).toBeDefined();
    expect(topicMaterial.type).toBe(MaterialType.TOPIC);
  });

  it('should update a TOPIC material', async () => {
    const updatePayload = {
      title: 'AI 技术革新',
      content: '深入分析 AI 技术在医疗、教育、金融等领域的创新应用',
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
    expect(data.content).toBe(updatePayload.content);
  });

  it('should delete a TOPIC material', async () => {
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