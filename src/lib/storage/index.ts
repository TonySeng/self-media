import { StorageProvider } from './types';
import { LocalStorageProvider } from './local';
import { COSStorageProvider } from './cos';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import * as path from 'node:path';

export type StorageType = 'local' | 'cos';

export type StorageConfig = {
  type: StorageType;
  cos?: {
    secretId: string;
    secretKey: string;
    bucket: string;
    region: string;
    cdnDomain?: string;
  };
};

let cachedProvider: StorageProvider | null = null;
let cachedConfigKey: string | null = null;

/**
 * 从 Setting 表读取存储配置
 */
async function loadStorageConfig(): Promise<StorageConfig> {
  const setting = await db.setting.findUnique({
    where: { key: 'storage_config' },
  });

  if (!setting?.value || typeof setting.value !== 'object') {
    return { type: 'local' };
  }

  const value = setting.value as Record<string, unknown>;
  if (value.type === 'cos' && value.cos && typeof value.cos === 'object') {
    const cos = value.cos as Record<string, unknown>;
    return {
      type: 'cos',
      cos: {
        secretId:
          typeof cos.secretIdEncrypted === 'string'
            ? decrypt(cos.secretIdEncrypted)
            : '',
        secretKey:
          typeof cos.secretKeyEncrypted === 'string'
            ? decrypt(cos.secretKeyEncrypted)
            : '',
        bucket: typeof cos.bucket === 'string' ? cos.bucket : '',
        region: typeof cos.region === 'string' ? cos.region : '',
        cdnDomain:
          typeof cos.cdnDomain === 'string' ? cos.cdnDomain : undefined,
      },
    };
  }

  return { type: 'local' };
}

/**
 * 获取存储 Provider（基于 DB 配置，默认本地）
 */
export async function getStorageProvider(): Promise<StorageProvider> {
  const config = await loadStorageConfig();
  const configKey = JSON.stringify(config);

  if (cachedProvider && cachedConfigKey === configKey) {
    return cachedProvider;
  }

  if (config.type === 'cos' && config.cos) {
    if (
      !config.cos.secretId ||
      !config.cos.secretKey ||
      !config.cos.bucket ||
      !config.cos.region
    ) {
      throw new Error('COS storage configuration is incomplete');
    }
    cachedProvider = new COSStorageProvider(config.cos);
  } else {
    const env = getEnv();
    const uploadDir = path.isAbsolute(env.LOCAL_STORAGE_PATH)
      ? env.LOCAL_STORAGE_PATH
      : path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH);
    cachedProvider = new LocalStorageProvider(uploadDir);
  }

  cachedConfigKey = configKey;
  return cachedProvider;
}

/**
 * 清除缓存（配置变更后调用）
 */
export function clearStorageCache(): void {
  cachedProvider = null;
  cachedConfigKey = null;
}

export * from './types';
export { LocalStorageProvider } from './local';
export { COSStorageProvider } from './cos';
