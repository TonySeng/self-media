import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { douyinPublish } from '@/lib/platforms/douyin/upload';
import * as path from 'node:path';

let busy = false;

export function isWorkerBusy(): boolean {
  return busy;
}

export async function processNextPublish(): Promise<boolean> {
  if (busy) return false;

  const task = await db.publish.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  if (!task) return false;

  busy = true;
  try {
    await db.publish.update({
      where: { id: task.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const account = await db.platformAccount.findUnique({
      where: { id: task.platformAccountId },
    });
    if (!account) throw new Error('账号不存在');

    const material = await db.material.findUnique({
      where: { id: task.materialId },
    });
    if (!material || !material.fileKey) throw new Error('素材不存在或无文件');

    const cookie = decrypt(account.cookieEncrypted);
    const videoPath = path.resolve(process.cwd(), 'data/uploads', material.fileKey);

    let coverPath: string | undefined;
    if (task.coverKey) {
      coverPath = path.resolve(process.cwd(), 'data/uploads', task.coverKey);
    }

    const result = await douyinPublish({
      videoPath,
      title: task.title,
      description: task.description ?? undefined,
      coverPath,
      cookie,
    });

    await db.publish.update({
      where: { id: task.id },
      data: {
        status: result.success ? 'DONE' : 'FAILED',
        error: result.error ?? null,
        screenshotKey: result.screenshotPath ?? null,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    await db.publish.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        error: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      },
    });
  } finally {
    busy = false;
  }

  return true;
}

export function triggerWorker(): void {
  setImmediate(async () => {
    let hasMore = true;
    while (hasMore) {
      hasMore = await processNextPublish();
    }
  });
}
