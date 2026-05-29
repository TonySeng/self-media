import { StorageProvider, UploadResult } from './types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lookup } from 'mime-types';

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly uploadDir: string) {}

  async upload(buffer: Buffer, filename: string, type: string): Promise<UploadResult> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uuid = randomUUID();
    const uniqueFilename = `${uuid}-${filename}`;
    const relativePath = path.join(type, yearMonth, uniqueFilename);
    const fullPath = path.join(this.uploadDir, relativePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    const mimeType = lookup(filename) || 'application/octet-stream';

    return {
      key: relativePath.replace(/\\/g, '/'),
      size: buffer.length,
      mimeType,
    };
  }

  getUrl(key: string): string {
    return `/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, key);
    const normalizedUploadDir = path.resolve(this.uploadDir);
    const normalizedFullPath = path.resolve(fullPath);

    if (!normalizedFullPath.startsWith(normalizedUploadDir)) {
      throw new Error('Invalid file path: attempted path traversal');
    }

    await fs.unlink(fullPath);
  }
}
