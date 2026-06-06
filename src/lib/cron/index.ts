import cron from 'node-cron';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { runSync } from '@/lib/platforms/douyin/sync';
import { syncWorkComments } from '@/lib/platforms/douyin/comment-sync';
import { syncBenchmarkWorks } from '@/lib/platforms/douyin/benchmark-sync';
import { autoReplyForAccount } from '@/lib/platforms/douyin/auto-reply';

let task: ReturnType<typeof cron.schedule> | null = null;
let currentExpr: string | null = null;

let autoReplyTask: ReturnType<typeof cron.schedule> | null = null;
let autoReplyCronExpr: string | null = null;

const DEFAULT_CRON = '0 2 * * *';
const DEFAULT_AUTO_REPLY_CRON = '*/10 * * * *';

type SyncConfig = {
  cronExpr: string;
  enabled: boolean;
  syncComments: boolean;
  commentTopWorks: number;
  syncBenchmarks: boolean;
  benchmarkMaxPages: number;
  benchmarkCookieFromAccountId: string | null;
};

type AutoReplyConfig = {
  cronExpr: string;
  enabled: boolean;
};

const DEFAULT_CONFIG: SyncConfig = {
  cronExpr: DEFAULT_CRON,
  enabled: true,
  syncComments: false,
  commentTopWorks: 5,
  syncBenchmarks: false,
  benchmarkMaxPages: 5,
  benchmarkCookieFromAccountId: null,
};

const DEFAULT_AUTO_REPLY_CONFIG: AutoReplyConfig = {
  cronExpr: DEFAULT_AUTO_REPLY_CRON,
  enabled: false,
};

/**
 * 从 Setting 表读取自动回复配置
 */
async function loadAutoReplyConfig(): Promise<AutoReplyConfig> {
  const setting = await db.setting.findUnique({
    where: { key: 'auto_reply_config' },
  });

  if (!setting?.value || typeof setting.value !== 'object') {
    return { ...DEFAULT_AUTO_REPLY_CONFIG };
  }

  const v = setting.value as Record<string, unknown>;
  return {
    cronExpr:
      typeof v.cronExpr === 'string' && v.cronExpr ? v.cronExpr : DEFAULT_AUTO_REPLY_CRON,
    enabled: v.enabled === true,
  };
}

/**
 * 从 Setting 表读取同步配置
 */
async function loadSyncConfig(): Promise<SyncConfig> {
  const setting = await db.setting.findUnique({
    where: { key: 'sync_config' },
  });

  if (!setting?.value || typeof setting.value !== 'object') {
    return { ...DEFAULT_CONFIG };
  }

  const v = setting.value as Record<string, unknown>;
  return {
    cronExpr:
      typeof v.cronExpr === 'string' && v.cronExpr ? v.cronExpr : DEFAULT_CRON,
    enabled: v.enabled !== false,
    syncComments: v.syncComments === true,
    commentTopWorks:
      typeof v.commentTopWorks === 'number' && v.commentTopWorks > 0
        ? Math.min(v.commentTopWorks, 50)
        : DEFAULT_CONFIG.commentTopWorks,
    syncBenchmarks: v.syncBenchmarks === true,
    benchmarkMaxPages:
      typeof v.benchmarkMaxPages === 'number' && v.benchmarkMaxPages > 0
        ? Math.min(v.benchmarkMaxPages, 200)
        : DEFAULT_CONFIG.benchmarkMaxPages,
    benchmarkCookieFromAccountId:
      typeof v.benchmarkCookieFromAccountId === 'string' &&
      v.benchmarkCookieFromAccountId
        ? v.benchmarkCookieFromAccountId
        : null,
  };
}

/**
 * 执行一次完整的同步流程（所有账号）
 */
export async function runFullSync(): Promise<{
  accounts: number;
  accountsFailed: number;
  worksTouched: number;
  commentWorksOk: number;
  commentWorksFailed: number;
  commentsTouched: number;
  benchmarksOk: number;
  benchmarksFailed: number;
  benchmarkWorksTouched: number;
}> {
  const config = await loadSyncConfig();
  const accounts = await db.platformAccount.findMany({
    where: { platform: 'DOUYIN', cookieStatus: { not: 'INVALID' } },
    select: { id: true, nickname: true },
  });

  let accountsFailed = 0;
  let worksTouched = 0;
  let commentWorksOk = 0;
  let commentWorksFailed = 0;
  let commentsTouched = 0;
  let benchmarksOk = 0;
  let benchmarksFailed = 0;
  let benchmarkWorksTouched = 0;

  for (const a of accounts) {
    let job;
    try {
      job = await runSync(a.id, 'INCREMENTAL');
    } catch (e) {
      accountsFailed++;
      console.error(`[cron] sync ${a.nickname} failed:`, e);
      continue;
    }

    const stats = (job.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.worksTouched === 'number') {
      worksTouched += stats.worksTouched;
    }

    if (!config.syncComments) continue;

    // 同步该账号的 Top N 作品的评论（按播放量）
    const topWorks = await db.work.findMany({
      where: { platformAccountId: a.id },
      include: {
        metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
      },
      take: 100,
    });

    const sortedTop = topWorks
      .filter((w) => w.metrics[0])
      .sort((x, y) => (y.metrics[0]?.play || 0) - (x.metrics[0]?.play || 0))
      .slice(0, config.commentTopWorks);

    for (const w of sortedTop) {
      try {
        const result = await syncWorkComments(w.id, 5);
        commentWorksOk++;
        commentsTouched += result.fetched;
      } catch (e) {
        commentWorksFailed++;
        console.error(`[cron] sync comments for "${w.title}" failed:`, e);
      }
    }
  }

  // 同步对标账号
  if (config.syncBenchmarks) {
    const benchmarks = await db.benchmarkAccount.findMany({
      where: { platform: 'DOUYIN', secUid: { not: null } },
      select: { id: true, nickname: true },
    });

    let cookie: string | undefined;
    if (config.benchmarkCookieFromAccountId) {
      const acc = await db.platformAccount.findUnique({
        where: { id: config.benchmarkCookieFromAccountId },
      });
      if (acc) cookie = decrypt(acc.cookieEncrypted);
    }

    for (const b of benchmarks) {
      try {
        const result = await syncBenchmarkWorks(b.id, cookie, {
          incremental: true,
          maxPages: config.benchmarkMaxPages,
        });
        benchmarksOk++;
        benchmarkWorksTouched += result.fetched;
      } catch (e) {
        benchmarksFailed++;
        console.error(`[cron] sync benchmark ${b.nickname} failed:`, e);
      }
    }
  }

  return {
    accounts: accounts.length,
    accountsFailed,
    worksTouched,
    commentWorksOk,
    commentWorksFailed,
    commentsTouched,
    benchmarksOk,
    benchmarksFailed,
    benchmarkWorksTouched,
  };
}

/**
 * 启动或重启 cron 任务（基于 Setting 表中的配置）
 *
 * 幂等：相同表达式重复调用不会重复注册；表达式变了会先停旧任务再注册新的。
 */
export async function startCron(): Promise<void> {
  const config = await loadSyncConfig();

  if (!config.enabled) {
    if (task) {
      task.stop();
      task = null;
      currentExpr = null;
      console.log('[cron] disabled, task stopped');
    }
    return;
  }

  if (!cron.validate(config.cronExpr)) {
    console.warn(`[cron] invalid cronExpr="${config.cronExpr}", skipping`);
    return;
  }

  if (task && currentExpr === config.cronExpr) {
    return;
  }

  if (task) {
    task.stop();
    task = null;
  }

  task = cron.schedule(config.cronExpr, async () => {
    console.log('[cron] daily sync started');
    try {
      const result = await runFullSync();
      console.log('[cron] daily sync finished:', result);
    } catch (e) {
      console.error('[cron] daily sync failed:', e);
    }
  });

  currentExpr = config.cronExpr;
  console.log(`[cron] scheduled daily sync at "${config.cronExpr}"`);

  await startAutoReplyCron();
}

/**
 * 配置变更后调用，重新加载 cron 任务
 */
export async function reloadCron(): Promise<void> {
  await startCron();
}

/**
 * 执行一次所有账号的自动回复（串行）
 */
export async function runAutoReplyForAllAccounts(): Promise<{
  accountsOk: number;
  accountsFailed: number;
  repliedTotal: number;
  skippedTotal: number;
}> {
  const config = await loadAutoReplyConfig();

  if (!config.enabled) {
    return { accountsOk: 0, accountsFailed: 0, repliedTotal: 0, skippedTotal: 0 };
  }

  const accounts = await db.platformAccount.findMany({
    where: { platform: 'DOUYIN', cookieStatus: 'ACTIVE' },
    select: { id: true, nickname: true },
  });

  let accountsOk = 0;
  let accountsFailed = 0;
  let repliedTotal = 0;
  let skippedTotal = 0;

  for (const a of accounts) {
    try {
      const result = await autoReplyForAccount(a.id);
      accountsOk++;
      repliedTotal += result.repliedCount;
      skippedTotal += result.skippedCount;
    } catch (e) {
      accountsFailed++;
      console.error(`[cron] auto-reply ${a.nickname} failed:`, e);
      continue;
    }
  }

  return { accountsOk, accountsFailed, repliedTotal, skippedTotal };
}

/**
 * 启动或重启自动回复 cron 任务（基于 Setting 表中的 auto_reply_config）
 *
 * 幂等：相同表达式重复调用不会重复注册；表达式变了会先停旧任务再注册新的。
 */
export async function startAutoReplyCron(): Promise<void> {
  const config = await loadAutoReplyConfig();

  if (!config.enabled) {
    if (autoReplyTask) {
      autoReplyTask.stop();
      autoReplyTask = null;
      autoReplyCronExpr = null;
      console.log('[cron] auto-reply disabled, task stopped');
    }
    return;
  }

  if (!cron.validate(config.cronExpr)) {
    console.warn(`[cron] invalid auto-reply cronExpr="${config.cronExpr}", skipping`);
    return;
  }

  if (autoReplyTask && autoReplyCronExpr === config.cronExpr) {
    return;
  }

  if (autoReplyTask) {
    autoReplyTask.stop();
    autoReplyTask = null;
  }

  autoReplyTask = cron.schedule(config.cronExpr, async () => {
    console.log('[cron] auto-reply started');
    try {
      const result = await runAutoReplyForAllAccounts();
      console.log('[cron] auto-reply finished:', result);
    } catch (e) {
      console.error('[cron] auto-reply failed:', e);
    }
  });

  autoReplyCronExpr = config.cronExpr;
  console.log(`[cron] scheduled auto-reply at "${config.cronExpr}"`);
}

/**
 * 配置变更后调用，重新加载自动回复 cron 任务
 */
export async function reloadAutoReplyCron(): Promise<void> {
  await startAutoReplyCron();
}
