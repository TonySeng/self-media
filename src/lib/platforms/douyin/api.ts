import { douyinFetch, randomDelayMs, sleep } from './http';
import { DOUYIN_ENDPOINTS, fillTemplate } from './endpoints';
import {
  normalizeCommentList,
  normalizeFansAnalysis,
  normalizePublicAwemeList,
  normalizePublicUserInfo,
  normalizeUserInfo,
  normalizeWorkDetail,
  normalizeWorkList,
  type StandardizedBenchmarkAccount,
  type StandardizedBenchmarkWork,
} from './normalize';
import type {
  StandardizedAccountMetric,
  StandardizedComment,
  StandardizedWork,
  StandardizedWorkMetric,
  StandardizedAccountInfo,
} from '../types';

export async function getUserInfo(cookie: string): Promise<StandardizedAccountInfo> {
  const res = await douyinFetch(DOUYIN_ENDPOINTS.userInfo.urlTemplate, { cookie });
  return normalizeUserInfo(await res.json());
}

export async function listWorks(
  cookie: string,
  secUid: string,
  options?: { stopBefore?: Date; maxPages?: number },
): Promise<{ works: StandardizedWork[]; metrics: StandardizedWorkMetric[] }> {
  const works: StandardizedWork[] = [];
  const metrics: StandardizedWorkMetric[] = [];
  const stopBefore = options?.stopBefore;
  const maxPages = options?.maxPages ?? 50;
  let cursor = 0;

  // 抖音作品列表按时间倒序返回。增量同步时，遇到 publishedAt < stopBefore
  // 的作品就可以提前结束（再翻只会更老）。这里仍把当前页所有作品入库，
  // 因为列表里夹杂的定时发布作品也算近期更新，前端会忽略。
  for (let page = 0; page < maxPages; page++) {
    const url = fillTemplate(DOUYIN_ENDPOINTS.workList.urlTemplate, {
      secUid,
      maxCursor: cursor,
    });
    const res = await douyinFetch(url, { cookie });
    const json = (await res.json()) as Record<string, unknown>;
    const out = normalizeWorkList(json);
    works.push(...out.works);
    metrics.push(...out.metrics);

    if (stopBefore) {
      const oldest = out.works.reduce<Date | null>(
        (acc, w) => (acc && acc < w.publishedAt ? acc : w.publishedAt),
        null,
      );
      if (oldest && oldest < stopBefore) break;
    }

    if (!json.has_more) break;
    const nextCursor = json.max_cursor;
    if (typeof nextCursor !== 'number' || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return { works, metrics };
}

export async function getWorkDetail(
  cookie: string,
  awemeId: string,
): Promise<{ work: StandardizedWork; metric: StandardizedWorkMetric }> {
  const url = fillTemplate(DOUYIN_ENDPOINTS.workDetail.urlTemplate, { awemeId });
  const res = await douyinFetch(url, { cookie });
  return normalizeWorkDetail(await res.json());
}

export async function getFansAnalysis(cookie: string): Promise<StandardizedAccountMetric> {
  const res = await douyinFetch(DOUYIN_ENDPOINTS.fansAnalysis.urlTemplate, { cookie });
  return normalizeFansAnalysis(await res.json());
}

export async function listComments(
  cookie: string,
  awemeId: string,
  maxPages: number = 10,
  ownerUid?: string,
): Promise<StandardizedComment[]> {
  const all: StandardizedComment[] = [];
  let cursor = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = fillTemplate(DOUYIN_ENDPOINTS.commentList.urlTemplate, {
      awemeId,
      cursor,
    });
    const res = await douyinFetch(url, { cookie });
    const json = (await res.json()) as Record<string, unknown>;
    const out = normalizeCommentList(json, ownerUid);
    all.push(...out.comments);

    if (!out.hasMore) break;
    if (out.cursor === cursor) break;
    cursor = out.cursor;
  }

  return all;
}

/**
 * 拉取对标账号公开信息（cookie 可选；需要先在 endpoints.publicUserInfo 抓包替换签名参数）
 */
export async function getPublicUserInfo(
  secUid: string,
  cookie?: string,
): Promise<StandardizedBenchmarkAccount> {
  console.log('[getPublicUserInfo] secUid:', secUid, 'cookie:', cookie ? 'provided' : 'none');
  const url = fillTemplate(DOUYIN_ENDPOINTS.publicUserInfo.urlTemplate, {
    secUid,
  });
  console.log('[getPublicUserInfo] url:', url);
  const res = await douyinFetch(url, { cookie: cookie || '' });
  const json = await res.json();
  console.log('[getPublicUserInfo] raw response:', JSON.stringify(json).slice(0, 200));
  return normalizePublicUserInfo(json);
}

/**
 * 拉取对标账号公开作品列表
 */
export async function listPublicAwemes(
  secUid: string,
  cookie?: string,
  options?: { maxPages?: number; stopBefore?: Date },
): Promise<StandardizedBenchmarkWork[]> {
  const all: StandardizedBenchmarkWork[] = [];
  const maxPages = options?.maxPages ?? 10;
  const stopBefore = options?.stopBefore;
  let cursor = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = fillTemplate(DOUYIN_ENDPOINTS.publicAwemeList.urlTemplate, {
      secUid,
      maxCursor: cursor,
    });
    const res = await douyinFetch(url, { cookie: cookie || '' });
    const json = (await res.json()) as Record<string, unknown>;
    const out = normalizePublicAwemeList(json);
    all.push(...out.works);

    console.log(
      `[listPublicAwemes] page=${page + 1}/${maxPages}, works=${out.works.length}, total=${all.length}, hasMore=${out.hasMore}, cursor=${cursor}->${out.maxCursor}`,
    );

    if (stopBefore) {
      const oldest = out.works.reduce<Date | null>(
        (acc, w) => (acc && acc < w.publishedAt ? acc : w.publishedAt),
        null,
      );
      if (oldest && oldest < stopBefore) {
        console.log('[listPublicAwemes] stop: oldest work before stopBefore');
        break;
      }
    }

    if (!out.hasMore) {
      console.log('[listPublicAwemes] stop: hasMore=false');
      break;
    }
    // 抖音 max_cursor 是时间戳；只在第二页之后才用相等判断停止
    // （首页 cursor=0 是合法的初始值，不能作为终止信号）
    if (out.maxCursor === cursor) {
      console.log('[listPublicAwemes] stop: cursor not advancing');
      break;
    }
    if (page > 0 && out.maxCursor === 0) {
      console.log('[listPublicAwemes] stop: maxCursor returned to 0');
      break;
    }
    cursor = out.maxCursor;

    // 翻页间延迟，降低触发风控的概率（模拟人工浏览节奏）
    if (page + 1 < maxPages) {
      const delay = randomDelayMs(1500, 3000);
      console.log(`[listPublicAwemes] sleep ${delay}ms before next page`);
      await sleep(delay);
    }
  }

  return all;
}

/**
 * 回复评论
 * @throws {Error} 如果未配置 reply_sign 或抖音接口返回错误
 */
export async function postCommentReply(params: {
  accountId: string;
  awemeId: string;
  commentId: string;
  text: string;
}): Promise<{ ok: true }> {
  const { accountId, awemeId, commentId, text } = params;

  // 从 Setting 表读取该账号的签名参数
  const { db } = await import('@/lib/db');
  const setting = await db.setting.findUnique({
    where: { key: `reply_sign_${accountId}` },
  });

  if (!setting) {
    throw new Error(`未配置 reply_sign_${accountId}，请到 /api/platforms/douyin/accounts/${accountId}/reply-sign 配置`);
  }

  const signData = setting.value as { msToken?: string; aBogus?: string };
  if (!signData.msToken || !signData.aBogus) {
    throw new Error(`reply_sign_${accountId} 缺少 msToken 或 aBogus 字段`);
  }

  // 读取账号 cookie
  const account = await db.platformAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    throw new Error('账号不存在');
  }

  const { decrypt } = await import('@/lib/crypto');
  const cookie = decrypt(account.cookieEncrypted);

  // 拼接 URL（text 已在 fillTemplate 内部 URL-encode）
  const url = fillTemplate(DOUYIN_ENDPOINTS.commentReply.urlTemplate, {
    awemeId,
    commentId,
    text,
    msToken: signData.msToken,
    aBogus: signData.aBogus,
  });

  const res = await douyinFetch(url, { cookie, method: 'POST' });
  const json = (await res.json()) as { status_code?: number; status_msg?: string };

  if (!res.status || res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  if (json.status_code !== 0) {
    throw new Error(`抖音回复失败: status_code=${json.status_code}, msg=${json.status_msg}`);
  }

  return { ok: true };
}
