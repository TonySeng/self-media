import { describe, it, expect, afterEach } from 'vitest';
import { MaterialType } from '@prisma/client';
import { POST } from '@/app/api/materials/upload/route';
import fs from 'node:fs/promises';
import path from 'node:path';

const uploadDir = path.resolve(process.cwd(), 'data/uploads');

describe('POST /api/materials/upload', () => {
  const validVideoBuffer = Buffer.from('fake-video-data');
  const validImageBuffer = Buffer.from('fake-image-data');
  const validAudioBuffer = Buffer.from('fake-audio-data');

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  it('should upload a valid VIDEO file', async () => {
    const formData = new FormData();
    const videoBlob = new Blob([validVideoBuffer], { type: 'video/mp4' });
    formData.append('file', videoBlob, 'test-video.mp4');
    formData.append('type', MaterialType.VIDEO);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBeDefined();
    expect(data.size).toBeGreaterThan(0);
    expect(data.mime).toBe('video/mp4');
    expect(data.url).toBeDefined();
  });

  it('should upload a valid IMAGE file', async () => {
    const formData = new FormData();
    const imageBlob = new Blob([validImageBuffer], { type: 'image/png' });
    formData.append('file', imageBlob, 'test-image.png');
    formData.append('type', MaterialType.IMAGE);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBeDefined();
    expect(data.mime).toBe('image/png');
  });

  it('should upload a valid AUDIO file', async () => {
    const formData = new FormData();
    const audioBlob = new Blob([validAudioBuffer], { type: 'audio/mpeg' });
    formData.append('file', audioBlob, 'test-audio.mp3');
    formData.append('type', MaterialType.AUDIO);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBeDefined();
    expect(data.mime).toBe('audio/mpeg');
  });

  it('should reject invalid MIME type for VIDEO', async () => {
    const formData = new FormData();
    const invalidBlob = new Blob([validVideoBuffer], { type: 'video/avi' });
    formData.append('file', invalidBlob, 'test.avi');
    formData.append('type', MaterialType.VIDEO);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('MIME');
  });

  it('should reject invalid MIME type for IMAGE', async () => {
    const formData = new FormData();
    const invalidBlob = new Blob([validImageBuffer], { type: 'image/gif' });
    formData.append('file', invalidBlob, 'test.gif');
    formData.append('type', MaterialType.IMAGE);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('MIME');
  });

  it('should reject file exceeding VIDEO size limit (100MB)', async () => {
    const formData = new FormData();
    const largeBuffer = Buffer.alloc(101 * 1024 * 1024);
    const largeBlob = new Blob([largeBuffer], { type: 'video/mp4' });
    formData.append('file', largeBlob, 'large-video.mp4');
    formData.append('type', MaterialType.VIDEO);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('size');
  });

  it('should reject file exceeding IMAGE size limit (10MB)', async () => {
    const formData = new FormData();
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
    const largeBlob = new Blob([largeBuffer], { type: 'image/png' });
    formData.append('file', largeBlob, 'large-image.png');
    formData.append('type', MaterialType.IMAGE);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('size');
  });

  it('should reject file exceeding AUDIO size limit (20MB)', async () => {
    const formData = new FormData();
    const largeBuffer = Buffer.alloc(21 * 1024 * 1024);
    const largeBlob = new Blob([largeBuffer], { type: 'audio/mpeg' });
    formData.append('file', largeBlob, 'large-audio.mp3');
    formData.append('type', MaterialType.AUDIO);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('size');
  });

  it('should reject missing file field', async () => {
    const formData = new FormData();
    formData.append('type', MaterialType.VIDEO);

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('file');
  });

  it('should reject missing type field', async () => {
    const formData = new FormData();
    const videoBlob = new Blob([validVideoBuffer], { type: 'video/mp4' });
    formData.append('file', videoBlob, 'test.mp4');

    const req = new Request('http://localhost/api/materials/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('type');
  });
});
