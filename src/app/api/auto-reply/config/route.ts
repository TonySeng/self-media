import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { loadAutoReplyConfig } from '@/lib/auto-reply/config';
import { reloadAutoReplyCron } from '@/lib/cron';

const AutoReplyConfigSchema = z.object({
  enabled: z.boolean(),
  cronExpr: z.string().min(1),
  fixedReply: z.string(),
  blacklistKeywords: z.array(z.string()),
  perWorkLimit: z.number().int().positive(),
  perAccountDailyLimit: z.number().int().positive(),
  intervalMinSec: z.number().int().positive(),
  intervalMaxSec: z.number().int().positive(),
  notifyEmail: z.string(),
  notifyWebhook: z.string(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const config = await loadAutoReplyConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: 'load_failed', message: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = AutoReplyConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const config = parsed.data;

  try {
    // Upsert Setting.key='auto_reply_config'
    await db.setting.upsert({
      where: { key: 'auto_reply_config' },
      create: { key: 'auto_reply_config', value: config },
      update: { value: config },
    });

    // Reload auto-reply cron task
    await reloadAutoReplyCron();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'save_failed', message: String(error) },
      { status: 500 }
    );
  }
}
