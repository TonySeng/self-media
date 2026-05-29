/**
 * 抖音创作者中心接口配置。
 *
 * 抓包步骤：
 *   1. 浏览器登录 https://creator.douyin.com
 *   2. 打开 DevTools → Network
 *   3. 触发对应页面操作（如打开"作品管理"），找到对应 XHR
 *   4. 右键 → Copy → Copy URL，把完整 URL 替换到下面的 `urlTemplate`
 *   5. 用 `{secUid}` / `{awemeId}` / `{maxCursor}` 占位（保留其它 query 不动）
 *
 * 如果 sessionid_ss 仍有效但接口返回签名失败（status 0 / data null），
 * 通常是 msToken/a_bogus 已过期，重抓即可。
 */
export const DOUYIN_ENDPOINTS = {
  /** 用户信息（也用于 Cookie 健康检查） */
  userInfo: {
    urlTemplate: 'https://creator.douyin.com/web/api/media/user/info/?TODO_REPLACE_WITH_DEVTOOLS_CAPTURE',
  },
  /** 作品列表 */
  workList: {
    urlTemplate:
      'https://creator.douyin.com/web/api/media/aweme/list/?sec_user_id={secUid}&max_cursor={maxCursor}&count=20&TODO_REPLACE_WITH_DEVTOOLS_CAPTURE',
    pageSize: 20,
  },
  /** 单作品详情 */
  workDetail: {
    urlTemplate:
      'https://creator.douyin.com/web/api/media/aweme/detail/?aweme_id={awemeId}&TODO_REPLACE_WITH_DEVTOOLS_CAPTURE',
  },
  /** 粉丝画像（性别 / 年龄 / 地域） */
  fansAnalysis: {
    urlTemplate:
      'https://creator.douyin.com/aweme/v1/creator/data/fans/distribution/?TODO_REPLACE_WITH_DEVTOOLS_CAPTURE',
  },
} as const;

export function fillTemplate(
  tpl: string,
  vars: Record<string, string | number>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    encodeURIComponent(String(vars[k] ?? '')),
  );
}
