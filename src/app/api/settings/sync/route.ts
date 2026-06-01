import { NextResponse } from 'next/server';
import { z } from 'zod';
import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { reloadCron, runFullSync } from '@/lib/cron';

const ConfigSchema = z.object({
  cronExpr: z.string().min(1).max(50),
  enabled: z.boolean(),
  syncComments: z.boolean(),
  commentTopWorks: z.number().int().min(1).max(50),
  syncBenchmarks: z.boolean(),
  benchmarkMaxPages: z.number().int().min(1).max(200),
  benchmarkCookieFromAccountId: z.string().nullable(),
});

const DEFAULT_CONFIG = {
  cronExpr: '0 2 * * *',
  enabled: true,
  syncComments: false,
  commentTopWorks: 5,
  syncBenchmarks: false,
  benchmarkMaxPages: 5,
  benchmarkCookieFromAccountId: null,
};

/**
 * GET /api/settings/sync
 * 返回当前同步配置
 */
export async function GET(): Promise<NextResponse> {
  try {
    const setting = await db.setting.findUnique({
      where: { key: 'sync_config' },
    });

    if (!setting?.value || typeof setting.value !== 'object') {
      return NextResponse.json(DEFAULT_CONFIG);
    }

    const v = setting.value as Record<string, unknown>;
    return NextResponse.json({
      cronExpr:
        typeof v.cronExpr === 'string' && v.cronExpr
          ? v.cronExpr
          : DEFAULT_CONFIG.cronExpr,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/settings/sync
 * 更新同步配置（重新调度 cron）
 */
export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = ConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    if (!cron.validate(parsed.data.cronExpr)) {
      return NextResponse.json(
        { error: 'invalid_cron_expression' },
        { status: 400 },
      );
    }

    await db.setting.upsert({
      where: { key: 'sync_config' },
      create: {
        key: 'sync_config',
        value: parsed.data as Prisma.InputJsonValue,
      },
      update: {
        value: parsed.data as Prisma.InputJsonValue,
      },
    });

    await reloadCron();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'update_failed', message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/settings/sync
 * 立即触发一次全量同步
 */
export async function POST(): Promise<NextResponse> {
  try {
    const result = await runFullSync();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'sync_failed', message },
      { status: 500 },
    );
  }
}
