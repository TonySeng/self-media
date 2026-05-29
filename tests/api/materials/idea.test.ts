import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialType, IdeaStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { POST, GET } from '@/app/api/materials/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/materials/[id]/route';

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/materials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(params?: Record<string, string>): Request {
  const url = new URL('http://localhost/api/materials');
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }
  return new Request(url.toString());
}

function updateRequest(body: unknown): Request {
  return new Request('http://localhost/api/materials/id', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('IDEA Material CRUD API', () => {
  let createdMaterialId: string;

  beforeEach(async () => {
    await db.material.deleteMany({ where: { type: MaterialType.IDEA } });
  });

  it('should create an IDEA material with DRAFT status', async () => {
    const payload = {
      type: MaterialType.IDEA,
      title: 'New Video Concept',
      content: 'A tutorial series about Next.js 15 features',
      ideaStatus: IdeaStatus.DRAFT,
    };

    const res = await POST(createRequest(payload));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.type).toBe(MaterialType.IDEA);
    expect(data.title).toBe(payload.title);
    expect(data.content).toBe(payload.content);
    expect(data.ideaStatus).toBe(IdeaStatus.DRAFT);

    createdMaterialId = data.id;
  });

  it('should query IDEA materials by type', async () => {
    const createRes = await POST(createRequest({
      type: MaterialType.IDEA,
      title: 'Test Idea',
      content: 'Test content',
      ideaStatus: IdeaStatus.DRAFT,
    }));
    const created = await createRes.json();
    createdMaterialId = created.id;

    const res = await GET(getRequest({ type: MaterialType.IDEA }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const ideaMaterial = data.find((m: any) => m.id === createdMaterialId);
    expect(ideaMaterial).toBeDefined();
    expect(ideaMaterial.type).toBe(MaterialType.IDEA);
  });

  it('should filter IDEA materials by ideaStatus', async () => {
    await POST(createRequest({
      type: MaterialType.IDEA,
      title: 'Draft Idea',
      content: 'Draft content',
      ideaStatus: IdeaStatus.DRAFT,
    }));
    await POST(createRequest({
      type: MaterialType.IDEA,
      title: 'Adopted Idea',
      content: 'Adopted content',
      ideaStatus: IdeaStatus.ADOPTED,
    }));

    const res = await GET(getRequest({ type: MaterialType.IDEA, ideaStatus: IdeaStatus.DRAFT }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    data.forEach((m: any) => {
      expect(m.type).toBe(MaterialType.IDEA);
      expect(m.ideaStatus).toBe(IdeaStatus.DRAFT);
    });
  });

  it('should update an IDEA material status to ADOPTED', async () => {
    const createRes = await POST(createRequest({
      type: MaterialType.IDEA,
      title: 'Video Concept',
      content: 'Tutorial series',
      ideaStatus: IdeaStatus.DRAFT,
    }));
    const created = await createRes.json();
    createdMaterialId = created.id;

    const updatePayload = {
      title: 'Updated Video Concept',
      content: 'Expanded tutorial series with advanced topics',
      ideaStatus: IdeaStatus.ADOPTED,
    };

    const res = await PUT(updateRequest(updatePayload), { params: Promise.resolve({ id: createdMaterialId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(updatePayload.title);
    expect(data.content).toBe(updatePayload.content);
    expect(data.ideaStatus).toBe(IdeaStatus.ADOPTED);
  });

  it('should delete an IDEA material', async () => {
    const createRes = await POST(createRequest({
      type: MaterialType.IDEA,
      title: 'To Delete',
      content: 'Will be deleted',
      ideaStatus: IdeaStatus.DISCARDED,
    }));
    const created = await createRes.json();
    createdMaterialId = created.id;

    const res = await DELETE(new Request('http://localhost/api/materials/id'), { params: Promise.resolve({ id: createdMaterialId }) });
    expect(res.status).toBe(204);

    const getRes = await GET_BY_ID(new Request('http://localhost/api/materials/id'), { params: Promise.resolve({ id: createdMaterialId }) });
    expect(getRes.status).toBe(404);
  });
});
