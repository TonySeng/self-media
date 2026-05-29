export interface UploadResult {
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(buffer: Buffer, filename: string, type: string): Promise<UploadResult>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
}
