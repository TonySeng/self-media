import COS from 'cos-nodejs-sdk-v5';
import { randomUUID } from 'node:crypto';
import { lookup } from 'mime-types';
import type { StorageProvider, UploadResult } from './types';

export type COSConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain?: string;
};

export class COSStorageProvider implements StorageProvider {
  private cos: COS;
  private bucket: string;
  private region: string;
  private cdnDomain?: string;

  constructor(config: COSConfig) {
    this.cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });
    this.bucket = config.bucket;
    this.region = config.region;
    this.cdnDomain = config.cdnDomain;
  }

  async upload(
    buffer: Buffer,
    filename: string,
    type: string,
  ): Promise<UploadResult> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uuid = randomUUID();
    const uniqueFilename = `${uuid}-${filename}`;
    const key = `${type}/${yearMonth}/${uniqueFilename}`;

    const mimeType = lookup(filename) || 'application/octet-stream';

    await new Promise<void>((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    return {
      key,
      size: buffer.length,
      mimeType,
    };
  }

  getUrl(key: string): string {
    if (this.cdnDomain) {
      return `${this.cdnDomain.replace(/\/$/, '')}/${key}`;
    }
    return `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
  }

  async delete(key: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.cos.deleteObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }
}
