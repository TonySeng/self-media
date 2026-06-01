import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  importBenchmarkAccount,
  parseSecUidFromUrl,
  syncBenchmarkWorks,
} from '@/lib/platforms/douyin/benchmark-sync';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

const RequestSchema = z.object({
  /** 用户主页 URL 或直接 sec_uid */
  input: z.string().min(1),
  /** 是否同时拉取作品 */
  syncWorks: z.boolean().optional().default(true),
  /** 同步最大翻页数（每页 18 条） */
  maxPages: z.number().int().min(1).max(200).optional().default(50),
  /** 用本机已绑定的某个抖音账号的 cookie 去访问公开接口（可选） */
  cookieFromAccountId: z.string().optional().nullable(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const secUid = parseSecUidFromUrl(parsed.data.input);
    if (!secUid) {
      return NextResponse.json(
        {
          error: 'invalid_input',
          message:
            '无法识别 sec_uid。请粘贴抖音用户主页链接（包含 /user/MS4wLjAB...）或直接粘贴 sec_uid',
        },
        { status: 400 },
      );
    }

    // 取借用的 cookie
    let fetchCookie: string | undefined;
    if (parsed.data.cookieFromAccountId) {
      const acc = await db.platformAccount.findUnique({
        where: { id: parsed.data.cookieFromAccountId },
      });
      if (acc) fetchCookie = decrypt(acc.cookieEncrypted);
    }

    const { accountId, created } = await importBenchmarkAccount(
      secUid,
      fetchCookie,
    );

    let syncStats = null;
    if (parsed.data.syncWorks) {
      syncStats = await syncBenchmarkWorks(accountId, fetchCookie, {
        incremental: !created,
        maxPages: parsed.data.maxPages,
      });
    }

    return NextResponse.json({
      accountId,
      created,
      syncStats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'import_failed', message },
      { status: 500 },
    );
  }
}
