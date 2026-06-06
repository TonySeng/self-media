import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getPublicUserInfo, listPublicAwemes } from './api';

/**
 * 从抖音用户主页 URL 提取 sec_uid
 */
export function parseSecUidFromUrl(input: string): string | null {
  const trimmed = input.trim();

  // 直接给 sec_uid（MS4wLjAB... 开头）
  if (/^MS4wLjAB[\w-]+$/.test(trimmed)) {
    return trimmed;
  }

  // 主页 URL: https://www.douyin.com/user/MS4wLjABAAAA...
  const match = trimmed.match(/\/user\/(MS4wLjAB[\w-]+)/);
  if (match) return match[1] || null;

  return null;
}

/**
 * 抓取并 upsert 对标账号
 */
export async function importBenchmarkAccount(
  secUid: string,
  fetchCookie?: string,
): Promise<{ accountId: string; created: boolean }> {
  const info = await getPublicUserInfo(secUid, fetchCookie);

  const url = `https://www.douyin.com/user/${info.secUid}`;

  const existing = await db.benchmarkAccount.findUnique({
    where: {
      platform_secUid: {
        platform: 'DOUYIN',
        secUid: info.secUid,
      },
    },
  });

  if (existing) {
    await db.benchmarkAccount.update({
      where: { id: existing.id },
      data: {
        nickname: info.nickname,
        avatar: info.avatar,
        followers: info.followers,
        url,
        notes: existing.notes ?? info.signature,
        lastError: null,
      },
    });
    return { accountId: existing.id, created: false };
  }

  const account = await db.benchmarkAccount.create({
    data: {
      platform: 'DOUYIN',
      secUid: info.secUid,
      nickname: info.nickname,
      avatar: info.avatar,
      followers: info.followers,
      url,
      notes: info.signature,
    },
  });

  return { accountId: account.id, created: true };
}

/**
 * 同步对标账号的作品列表
 */
export async function syncBenchmarkWorks(
  accountId: string,
  fetchCookie?: string,
  options?: { incremental?: boolean; maxPages?: number },
): Promise<{
  fetched: number;
  newCount: number;
  updated: number;
  totalInDb: number;
}> {
  const account = await db.benchmarkAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) throw new Error('Benchmark account not found');
  if (!account.secUid) {
    throw new Error('对标账号缺少 secUid，无法自动同步。请通过"导入"重新创建。');
  }

  console.log('[syncBenchmarkWorks] options:', JSON.stringify(options), 'lastSyncAt:', account.lastSyncAt);

  // 增量：拉取到上次同步时间点的作品就停（不拉旧作品）
  const stopBefore =
    options?.incremental && account.lastSyncAt
      ? account.lastSyncAt
      : undefined;

  console.log('[syncBenchmarkWorks] computed stopBefore:', stopBefore);

  // 全量同步默认翻 50 页（≈900 条），增量同步默认 5 页就够（最近一周新作品很少超过 90 条）
  const maxPages =
    options?.maxPages ?? (options?.incremental ? 5 : 50);

  let works;
  try {
    works = await listPublicAwemes(account.secUid, fetchCookie, {
      maxPages,
      stopBefore,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.benchmarkAccount.update({
      where: { id: accountId },
      data: { lastError: msg.slice(0, 500) },
    });
    throw e;
  }

  let newCount = 0;
  let updated = 0;

  for (const w of works) {
    const result = await db.benchmarkWork.upsert({
      where: {
        benchmarkAccountId_platformWorkId: {
          benchmarkAccountId: accountId,
          platformWorkId: w.platformWorkId,
        },
      },
      create: {
        benchmarkAccountId: accountId,
        platformWorkId: w.platformWorkId,
        title: w.title,
        description: w.description,
        url: w.url,
        coverUrl: w.coverUrl,
        duration: w.duration,
        publishedAt: w.publishedAt,
        play: w.play,
        like: w.like,
        comment: w.comment,
        share: w.share,
        collect: w.collect,
        rawData: w.rawData as Prisma.InputJsonValue,
        source: 'DOUYIN_SYNC',
      },
      update: {
        title: w.title,
        description: w.description,
        coverUrl: w.coverUrl,
        duration: w.duration,
        play: w.play,
        like: w.like,
        comment: w.comment,
        share: w.share,
        collect: w.collect,
        rawData: w.rawData as Prisma.InputJsonValue,
      },
    });

    // 简单判断：createdAt 在 5 秒内就算"刚创建"
    if (result.createdAt.getTime() > Date.now() - 5000) {
      newCount++;
    } else {
      updated++;
    }
  }

  await db.benchmarkAccount.update({
    where: { id: accountId },
    data: {
      lastSyncAt: new Date(),
      lastError: null,
    },
  });

  const totalInDb = await db.benchmarkWork.count({
    where: { benchmarkAccountId: accountId },
  });

  return {
    fetched: works.length,
    newCount,
    updated,
    totalInDb,
  };
}
