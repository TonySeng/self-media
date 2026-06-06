import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { douyinFetch } from '@/lib/platforms/douyin/http';
import { DOUYIN_ENDPOINTS, fillTemplate } from '@/lib/platforms/douyin/endpoints';

const Body = z.object({
  commentId: z.string().min(1),
  text: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workId } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid' },
      { status: 400 },
    );
  }

  const { commentId, text } = parsed.data;

  const work = await db.work.findUnique({
    where: { id: workId },
    include: { account: true },
  });
  if (!work) {
    return NextResponse.json({ error: 'work_not_found' }, { status: 404 });
  }

  // 从账号的签名配置中读取 msToken/aBogus
  const signSetting = await db.setting.findUnique({
    where: { key: `reply_sign_${work.account.id}` },
  });
  if (!signSetting?.value || typeof signSetting.value !== 'object') {
    return NextResponse.json(
      { error: 'no_sign', message: '该账号未配置回复签名，请在「设置 → 平台账号」中配置' },
      { status: 400 },
    );
  }
  const sv = signSetting.value as Record<string, unknown>;
  const msToken = typeof sv.msToken === 'string' ? sv.msToken : '';
  const aBogus = typeof sv.aBogus === 'string' ? sv.aBogus : '';
  if (!msToken || !aBogus) {
    return NextResponse.json(
      { error: 'no_sign', message: '该账号的回复签名不完整，请重新配置' },
      { status: 400 },
    );
  }

  const cookie = decrypt(work.account.cookieEncrypted);

  const url = fillTemplate(DOUYIN_ENDPOINTS.commentReply.urlTemplate, {
    awemeId: work.platformWorkId,
    text,
    commentId,
    msToken,
    aBogus,
  });

  try {
    const res = await douyinFetch(url, {
      cookie,
      method: 'POST',
      maxRetries: 0,
    });
    const json = (await res.json()) as Record<string, unknown>;

    if (typeof json.status_code === 'number' && json.status_code !== 0) {
      return NextResponse.json(
        { error: 'douyin_rejected', message: `抖音返回 status_code=${json.status_code}，签名可能已过期，请重新获取` },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: json });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'reply_failed', message: msg },
      { status: 500 },
    );
  }
}
