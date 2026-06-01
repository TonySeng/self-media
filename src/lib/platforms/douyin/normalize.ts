import type {
  StandardizedAccountInfo,
  StandardizedAccountMetric,
  StandardizedComment,
  StandardizedWork,
  StandardizedWorkMetric,
} from '../types';

function pickUrl(obj: unknown): string | null {
  if (obj && typeof obj === 'object' && 'url_list' in obj) {
    const list = (obj as { url_list?: unknown }).url_list;
    if (Array.isArray(list) && typeof list[0] === 'string') return list[0];
  }
  return null;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function expectOk(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') throw new Error('Empty response');
  const obj = payload as Record<string, unknown>;
  if (typeof obj.status_code === 'number' && obj.status_code !== 0) {
    throw new Error(`Douyin status_code=${obj.status_code}`);
  }
  return obj;
}

export function normalizeUserInfo(raw: unknown): StandardizedAccountInfo {
  const obj = expectOk(raw);
  const user = obj.user as Record<string, unknown> | null;
  if (!user) throw new Error('user field missing');
  return {
    secUid: asString(user.sec_uid),
    nickname: asString(user.nickname),
    avatar: pickUrl(user.avatar_thumb),
  };
}

function normalizeAweme(aweme: Record<string, unknown>): {
  work: StandardizedWork;
  metric: StandardizedWorkMetric;
} {
  const id = asString(aweme.aweme_id);
  const video = (aweme.video ?? {}) as Record<string, unknown>;
  const stats = (aweme.statistics ?? {}) as Record<string, unknown>;
  const createTime = asNumber(aweme.create_time);
  const work: StandardizedWork = {
    platformWorkId: id,
    title: asString(aweme.desc),
    description: asString(aweme.desc) || null,
    coverUrl: pickUrl(video.cover),
    videoUrl: pickUrl(video.play_addr),
    duration: video.duration === undefined ? null : asNumber(video.duration),
    publishedAt: new Date(createTime * 1000),
    rawData: aweme,
  };
  const metric: StandardizedWorkMetric = {
    platformWorkId: id,
    play: asNumber(stats.play_count),
    like: asNumber(stats.digg_count),
    comment: asNumber(stats.comment_count),
    share: asNumber(stats.share_count),
    collect: asNumber(stats.collect_count),
    finishRate:
      typeof stats.finish_rate === 'number' && Number.isFinite(stats.finish_rate)
        ? stats.finish_rate
        : null,
    rawData: stats,
  };
  return { work, metric };
}

export function normalizeWorkList(raw: unknown): {
  works: StandardizedWork[];
  metrics: StandardizedWorkMetric[];
} {
  const obj = expectOk(raw);
  const list = Array.isArray(obj.aweme_list) ? obj.aweme_list : [];
  const works: StandardizedWork[] = [];
  const metrics: StandardizedWorkMetric[] = [];
  for (const item of list) {
    if (item && typeof item === 'object') {
      const aweme = item as Record<string, unknown>;
      const timer = aweme.timer as Record<string, unknown> | undefined;
      if (timer && typeof timer.status === 'number' && timer.status !== 1) {
        continue;
      }
      const { work, metric } = normalizeAweme(aweme);
      works.push(work);
      metrics.push(metric);
    }
  }
  return { works, metrics };
}

export function normalizeWorkDetail(raw: unknown): {
  work: StandardizedWork;
  metric: StandardizedWorkMetric;
} {
  const obj = expectOk(raw);
  const detail = obj.aweme_detail as Record<string, unknown> | undefined;
  if (!detail) throw new Error('aweme_detail missing');
  return normalizeAweme(detail);
}

export function normalizeFansAnalysis(raw: unknown): StandardizedAccountMetric {
  const obj = expectOk(raw);
  const data = (obj.data ?? {}) as Record<string, unknown>;
  return {
    totalFans: asNumber(data.total_fans),
    genderDist: data.gender_distribution ?? null,
    ageDist: data.age_distribution ?? null,
    regionDist: data.region_distribution ?? null,
    rawData: data,
  };
}

export function normalizeCommentList(raw: unknown): {
  comments: StandardizedComment[];
  hasMore: boolean;
  cursor: number;
} {
  const obj = expectOk(raw);
  const list = Array.isArray(obj.comments) ? obj.comments : [];
  const comments: StandardizedComment[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const user = (c.user ?? {}) as Record<string, unknown>;

    comments.push({
      platformCommentId: asString(c.cid),
      content: asString(c.text),
      authorName: asString(user.nickname),
      authorAvatar: pickUrl(user.avatar_thumb),
      authorUid: typeof user.uid === 'string' ? user.uid : null,
      likeCount: asNumber(c.digg_count),
      replyCount: asNumber(c.reply_comment_total),
      publishedAt: new Date(asNumber(c.create_time) * 1000),
      rawData: c,
    });
  }

  return {
    comments,
    hasMore: Boolean(obj.has_more),
    cursor: asNumber(obj.cursor),
  };
}

/**
 * 公开主页 - 对标账号信息
 *
 * 字段位置：response.user.{nickname, avatar_thumb, sec_uid, follower_count, signature, ...}
 */
export type StandardizedBenchmarkAccount = {
  secUid: string;
  nickname: string;
  avatar: string | null;
  followers: number;
  signature: string | null;
};

export function normalizePublicUserInfo(
  raw: unknown,
): StandardizedBenchmarkAccount {
  const obj = expectOk(raw);
  const user = obj.user as Record<string, unknown> | null;
  if (!user) throw new Error('user field missing');

  return {
    secUid: asString(user.sec_uid),
    nickname: asString(user.nickname),
    avatar: pickUrl(user.avatar_thumb),
    followers: asNumber(user.follower_count),
    signature:
      typeof user.signature === 'string' && user.signature
        ? user.signature
        : null,
  };
}

/**
 * 公开主页 - 对标账号作品（含数据快照）
 */
export type StandardizedBenchmarkWork = {
  platformWorkId: string;
  title: string;
  description: string | null;
  url: string;
  coverUrl: string | null;
  duration: number | null;
  publishedAt: Date;
  play: number;
  like: number;
  comment: number;
  share: number;
  collect: number;
  rawData: unknown;
};

export function normalizePublicAwemeList(raw: unknown): {
  works: StandardizedBenchmarkWork[];
  hasMore: boolean;
  maxCursor: number;
} {
  const obj = expectOk(raw);
  const list = Array.isArray(obj.aweme_list) ? obj.aweme_list : [];
  const works: StandardizedBenchmarkWork[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const aweme = item as Record<string, unknown>;
    const id = asString(aweme.aweme_id);
    if (!id) continue;

    const video = (aweme.video ?? {}) as Record<string, unknown>;
    const stats = (aweme.statistics ?? {}) as Record<string, unknown>;
    const desc = asString(aweme.desc);
    const createTime = asNumber(aweme.create_time);

    works.push({
      platformWorkId: id,
      title: desc.split('\n')[0]?.slice(0, 100) || '（无标题）',
      description: desc || null,
      url: `https://www.douyin.com/video/${id}`,
      coverUrl: pickUrl(video.cover) || pickUrl(video.origin_cover),
      duration: aweme.duration === undefined ? null : asNumber(aweme.duration),
      publishedAt: new Date(createTime * 1000),
      play: asNumber(stats.play_count),
      like: asNumber(stats.digg_count),
      comment: asNumber(stats.comment_count),
      share: asNumber(stats.share_count),
      collect: asNumber(stats.collect_count),
      rawData: aweme,
    });
  }

  return {
    works,
    hasMore: Boolean(obj.has_more),
    maxCursor: asNumber(obj.max_cursor),
  };
}
