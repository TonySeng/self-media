import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { LocalStorageProvider } from '@/lib/storage/local';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

const TEST_UPLOAD_DIR = path.resolve(process.cwd(), 'data/uploads-test');

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    provider = new LocalStorageProvider(TEST_UPLOAD_DIR);
    // Clean test directory
    if (existsSync(TEST_UPLOAD_DIR)) {
      await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Cleanup after tests
    if (existsSync(TEST_UPLOAD_DIR)) {
      await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  describe('upload', () => {
    it('uploads a file and returns correct metadata', async () => {
      const buffer = Buffer.from('test content');
      const filename = 'test.txt';
      const type = 'documents';

      const result = await provider.upload(buffer, filename, type);

      expect(result.key).toMatch(/^documents\/\d{4}-\d{2}\/[a-f0-9-]+-test\.txt$/);
      expect(result.size).toBe(buffer.length);
      expect(result.mimeType).toBe('text/plain');
    });

    it('creates directory structure with type and year-month', async () => {
      const buffer = Buffer.from('image data');
      const filename = 'photo.jpg';
      const type = 'images';

      const result = await provider.upload(buffer, filename, type);

      const filePath = path.join(TEST_UPLOAD_DIR, result.key);
      expect(existsSync(filePath)).toBe(true);

      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(result.key).toContain(`images/${yearMonth}/`);
    });

    it('generates unique filenames with UUID prefix', async () => {
      const buffer = Buffer.from('content');
      const filename = 'same.txt';
      const type = 'docs';

      const result1 = await provider.upload(buffer, filename, type);
      const result2 = await provider.upload(buffer, filename, type);

      expect(result1.key).not.toBe(result2.key);
      expect(result1.key).toMatch(/-same\.txt$/);
      expect(result2.key).toMatch(/-same\.txt$/);
    });

    it('detects MIME type from file extension', async () => {
      const tests = [
        { filename: 'image.png', expected: 'image/png' },
        { filename: 'doc.pdf', expected: 'application/pdf' },
        { filename: 'video.mp4', expected: 'video/mp4' },
        { filename: 'unknown.unknownext123', expected: 'application/octet-stream' },
      ];

      for (const { filename, expected } of tests) {
        const result = await provider.upload(Buffer.from('data'), filename, 'test');
        expect(result.mimeType).toBe(expected);
      }
    });

    it('writes file content correctly', async () => {
      const content = 'Hello, World!';
      const buffer = Buffer.from(content);
      const result = await provider.upload(buffer, 'hello.txt', 'text');

      const filePath = path.join(TEST_UPLOAD_DIR, result.key);
      const readContent = await fs.readFile(filePath, 'utf-8');
      expect(readContent).toBe(content);
    });
  });

  describe('getUrl', () => {
    it('returns URL path for a given key', () => {
      const key = 'images/2026-05/abc123-photo.jpg';
      const url = provider.getUrl(key);
      expect(url).toBe('/uploads/images/2026-05/abc123-photo.jpg');
    });

    it('handles keys without leading slash', () => {
      const key = 'docs/2026-01/file.pdf';
      const url = provider.getUrl(key);
      expect(url).toBe('/uploads/docs/2026-01/file.pdf');
    });
  });

  describe('delete', () => {
    it('deletes an existing file', async () => {
      const buffer = Buffer.from('to be deleted');
      const result = await provider.upload(buffer, 'delete-me.txt', 'temp');

      const filePath = path.join(TEST_UPLOAD_DIR, result.key);
      expect(existsSync(filePath)).toBe(true);

      await provider.delete(result.key);
      expect(existsSync(filePath)).toBe(false);
    });

    it('throws error when deleting non-existent file', async () => {
      const key = 'nonexistent/2026-05/fake.txt';
      await expect(provider.delete(key)).rejects.toThrow();
    });

    it('does not delete files outside upload directory', async () => {
      const key = '../../etc/passwd';
      await expect(provider.delete(key)).rejects.toThrow();
    });
  });
});

