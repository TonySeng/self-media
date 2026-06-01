import { Prisma, type SyncJob, type SyncJobType } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { listWorks, getFansAnalysis } from './api';
import { sleep, randomDelayMs } from './http';

function isExpiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 40[13]/.test(msg);
}

function toNullableJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
}

export async function runSync(accountId: string, type: SyncJobType): Promise<SyncJob> {
  const account = await db.platformAccount.findUniqueOrThrow({ where: { id: accountId } });
  const cookie = decrypt(account.cookieEncrypted);

  const job = await db.syncJob.create({
    data: { platformAccountId: accountId, type, status: 'RUNNING' },
  });

  try {
    // 增量模式：遇到比 lastSyncAt 更早的作品就提前停翻页（留 1 小时缓冲，防止边界误判）
    const stopBefore =
      type === 'INCREMENTAL' && account.lastSyncAt
        ? new Date(account.lastSyncAt.getTime() - 60 * 60 * 1000)
        : undefined;
    const { works, metrics } = await listWorks(cookie, account.secUid, {
      stopBefore,
    });
    await sleep(randomDelayMs());
    const fans = await getFansAnalysis(cookie);

    await db.$transaction(async (tx) => {
      for (let i = 0; i < works.length; i++) {
        const w = works[i]!;
        const m = metrics[i]!;
        const upserted = await tx.work.upsert({
          where: {
            platformAccountId_platformWorkId: {
              platformAccountId: accountId,
              platformWorkId: w.platformWorkId,
            },
          },
          create: {
            platformAccountId: accountId,
            platformWorkId: w.platformWorkId,
            title: w.title,
            description: w.description,
            coverUrl: w.coverUrl,
            videoUrl: w.videoUrl,
            duration: w.duration,
            publishedAt: w.publishedAt,
            rawData: w.rawData as object,
          },
          update: {
            title: w.title,
            description: w.description,
            coverUrl: w.coverUrl,
            videoUrl: w.videoUrl,
            duration: w.duration,
            rawData: w.rawData as object,
          },
        });
        await tx.workMetric.create({
          data: {
            workId: upserted.id,
            play: m.play,
            like: m.like,
            comment: m.comment,
            share: m.share,
            collect: m.collect,
            finishRate: m.finishRate,
            rawData: m.rawData as object,
          },
        });
      }
      await tx.accountMetric.create({
        data: {
          platformAccountId: accountId,
          totalFans: fans.totalFans,
          genderDist: toNullableJson(fans.genderDist),
          ageDist: toNullableJson(fans.ageDist),
          regionDist: toNullableJson(fans.regionDist),
          rawData: fans.rawData as Prisma.InputJsonValue,
        },
      });
      await tx.platformAccount.update({
        where: { id: accountId },
        data: {
          lastSyncAt: new Date(),
          cookieStatus: 'ACTIVE',
          lastError: null,
          lastErrorAt: null,
        },
      });
    });

    return db.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        stats: { worksTouched: works.length, totalFans: fans.totalFans },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.platformAccount.update({
      where: { id: accountId },
      data: {
        cookieStatus: isExpiredError(err) ? 'EXPIRED' : account.cookieStatus,
        lastError: msg.slice(0, 500),
        lastErrorAt: new Date(),
      },
    });
    return db.syncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: msg.slice(0, 500) },
    });
  }
}
