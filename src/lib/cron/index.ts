import cron from 'node-cron';
import { db } from '@/lib/db';
import { runSync } from '@/lib/platforms/douyin/sync';

let started = false;

/**
 * Register the daily incremental-sync cron job.
 *
 * Idempotent: subsequent calls within the same Node.js process are no-ops,
 * which matters because Next.js' `register()` may run more than once during
 * dev (e.g. on HMR-triggered reloads of `instrumentation.ts`).
 *
 * Reads the cron expression from `process.env.SYNC_CRON` (defaults to
 * `0 2 * * *` — every day at 02:00). Invalid expressions are logged and the
 * job is skipped instead of crashing the server.
 */
export function startCron(): void {
  if (started) return;
  started = true;

  const expr = process.env.SYNC_CRON ?? '0 2 * * *';
  if (!cron.validate(expr)) {
    console.warn(`[cron] invalid SYNC_CRON="${expr}", skipping`);
    return;
  }

  cron.schedule(expr, async () => {
    const accounts = await db.platformAccount.findMany({
      where: { platform: 'DOUYIN', cookieStatus: { not: 'INVALID' } },
      select: { id: true, nickname: true },
    });
    for (const a of accounts) {
      try {
        await runSync(a.id, 'INCREMENTAL');
      } catch (e) {
        console.error(`[cron] sync ${a.nickname} failed:`, e);
      }
    }
  });

  console.log(`[cron] scheduled daily sync at "${expr}"`);
}
