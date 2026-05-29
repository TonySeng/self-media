import type {
  StandardizedAccountInfo,
  StandardizedAccountMetric,
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
      const { work, metric } = normalizeAweme(item as Record<string, unknown>);
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
