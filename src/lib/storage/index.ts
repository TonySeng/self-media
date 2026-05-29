import { StorageProvider } from './types';
import { LocalStorageProvider } from './local';
import * as path from 'node:path';

export function getStorageProvider(): StorageProvider {
  const uploadDir = path.resolve(process.cwd(), 'data/uploads');
  return new LocalStorageProvider(uploadDir);
}

export * from './types';
export { LocalStorageProvider } from './local';
