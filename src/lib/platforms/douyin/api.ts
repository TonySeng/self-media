import { douyinFetch } from './http';
import { DOUYIN_ENDPOINTS, fillTemplate } from './endpoints';
import {
  normalizeFansAnalysis,
  normalizeUserInfo,
  normalizeWorkDetail,
  normalizeWorkList,
} from './normalize';
import type {
  StandardizedAccountMetric,
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
): Promise<{ works: StandardizedWork[]; metrics: StandardizedWorkMetric[] }> {
  const works: StandardizedWork[] = [];
  const metrics: StandardizedWorkMetric[] = [];
  let cursor = 0;
  for (let page = 0; page < 50; page++) {
    const url = fillTemplate(DOUYIN_ENDPOINTS.workList.urlTemplate, {
      secUid,
      maxCursor: cursor,
    });
    const res = await douyinFetch(url, { cookie });
    const json = (await res.json()) as Record<string, unknown>;
    const out = normalizeWorkList(json);
    works.push(...out.works);
    metrics.push(...out.metrics);
    if (!json.has_more || typeof json.max_cursor !== 'number') break;
    cursor = json.max_cursor;
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
