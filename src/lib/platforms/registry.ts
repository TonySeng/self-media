import type { Platform } from '@prisma/client';
import type { PlatformAdapter } from './types';
import { douyinAdapter } from './douyin';

const adapters: Record<Platform, PlatformAdapter> = {
  DOUYIN: douyinAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  const a = adapters[platform];
  if (!a) throw new Error(`No adapter for platform: ${platform}`);
  return a;
}
