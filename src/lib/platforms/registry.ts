import type { Platform } from '@prisma/client';
import type { PlatformAdapter } from './types';
import { douyinAdapter } from './douyin';

const adapters: Record<Platform, PlatformAdapter> = {
  DOUYIN: douyinAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  return adapters[platform];
}
