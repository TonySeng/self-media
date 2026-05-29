import type { PlatformAdapter, CookieValidationResult } from '../types';
import { hasRequiredKeys, parseCookieString } from './cookie';
import { HttpError } from './http';
import { getFansAnalysis, getUserInfo, getWorkDetail, listWorks } from './api';

export const douyinAdapter: PlatformAdapter = {
  platform: 'DOUYIN',

  async validateCookie(cookie: string): Promise<CookieValidationResult> {
    if (!hasRequiredKeys(parseCookieString(cookie))) {
      return { ok: false, reason: 'invalid', message: 'Cookie 缺少 sessionid_ss' };
    }
    try {
      const account = await getUserInfo(cookie);
      return { ok: true, account };
    } catch (e) {
      if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
        return { ok: false, reason: 'expired', message: 'Cookie 已失效，请重新导入' };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: 'invalid', message: msg };
    }
  },

  fetchWorks: (cookie, secUid) => listWorks(cookie, secUid),
  fetchWorkDetail: (cookie, awemeId) => getWorkDetail(cookie, awemeId),
  fetchAccountMetric: (cookie) => getFansAnalysis(cookie),
};
