/**
 * 抖音接口配置。
 *
 * ## 公开接口（www.douyin.com）
 *
 * 默认走浏览器签名器（`signer.ts`）：用 Playwright 启动 headless Chromium 加载抖音首页，
 * 让 webmssdk 自动给请求注入 `a_bogus` / `msToken` / `x-secsdk-web-signature`。
 * 签名永远跟主站同步，无需手抓。
 *
 * 通过环境变量 `DOUYIN_BROWSER_SIGNER=0` 关闭签名器，回退到手抓签名模式：
 * 复制 `endpoints.local.example.ts` 为 `endpoints.local.ts`（已在 .gitignore），
 * 把抓包来的完整 URL 填进去。
 *
 * ## 创作者中心接口（creator.douyin.com）
 *
 * 这类接口需要登录态 cookie（`sessionid_ss`），仍走 cookie + 静态签名。
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

const BASE_ENDPOINTS = {
  /** 用户信息（也用于 Cookie 健康检查） */
  userInfo: {
    urlTemplate: 'https://creator.douyin.com/aweme/v1/creator/check/user/?sec_uid={secUid}&msToken={msToken}&a_bogus={aBogus}',
  },
  /** 作品列表 */
  workList: {
    urlTemplate:
      'https://creator.douyin.com/janus/douyin/creator/pc/work_list?scene=star_atlas&device_platform=android&status=0&count=12&max_cursor={maxCursor}&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Mozilla&browser_version=5.0+(Windows+NT+10.0%3B+Win64%3B+x64)+AppleWebKit%2F537.36+(KHTML,+like+Gecko)+Chrome%2F130.0.0.0+Safari%2F537.36&browser_online=true&timezone_name=Asia%2FShanghai&aid=1128&support_h265=1',
    pageSize: 12,
  },
  /** 单作品详情 */
  workDetail: {
    urlTemplate:
      'https://creator.douyin.com/web/api/media/aweme/detail/?aweme_id={awemeId}&TODO_REPLACE_WITH_DEVTOOLS_CAPTURE',
  },
  /** 评论列表 */
  commentList: {
    urlTemplate:
      'https://creator.douyin.com/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/?aweme_id={awemeId}&cursor={cursor}&count=10&aid=2906&device_platform=webapp&msToken={msToken}&a_bogus={aBogus}',
    pageSize: 10,
  },
  /** 粉丝画像（性别 / 年龄 / 地域） */
  fansAnalysis: {
    urlTemplate:
      'https://creator.douyin.com/aweme/v1/creator/data/fans/distribution/?TODO_REPLACE_WITH_DEVTOOLS_CAPTURE',
  },
  /**
   * 公开用户信息（对标账号）
   *
   * 默认走浏览器签名器（src/lib/platforms/douyin/signer.ts），无需手填签名参数。
   * 关闭签名器（DOUYIN_BROWSER_SIGNER=0）时，需在 endpoints.local.ts 里覆盖此模板，
   * 把抓包来的 msToken/a_bogus/x-secsdk-web-signature/timestamp 等填回去。
   */
  publicUserInfo: {
    urlTemplate:
      'https://www.douyin.com/aweme/v1/web/user/profile/other/?device_platform=webapp&aid=6383&channel=channel_pc_web&publish_video_strategy_type=2&source=channel_pc_web&sec_user_id={secUid}&personal_center_strategy=1&profile_other_record_enable=1&land_to=1&pc_client_type=1&support_h265=1&support_dash=1&cpu_core_num=16&version_code=170400&version_name=17.4.0&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=148.0.0.0&browser_online=true&engine_name=Blink&engine_version=148.0.0.0&os_name=Windows&os_version=10&device_memory=32&platform=PC',
  },
  /**
   * 公开作品列表（对标账号作品）
   *
   * 默认走浏览器签名器；关闭时需在 endpoints.local.ts 覆盖填入手抓签名参数。
   */
  publicAwemeList: {
    urlTemplate:
      'https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id={secUid}&max_cursor={maxCursor}&locate_query=false&show_live_replay_strategy=1&need_time_list=1&time_list_query=0&whale_cut_token=&cut_version=1&count=18&publish_video_strategy_type=2&from_user_page=1&pc_client_type=1&support_h265=1&support_dash=1&cpu_core_num=16&version_code=290100&version_name=29.1.0&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=148.0.0.0&browser_online=true&engine_name=Blink&engine_version=148.0.0.0&os_name=Windows&os_version=10&device_memory=32&platform=PC',
    pageSize: 18,
  },
  /** 回复评论 */
  commentReply: {
    urlTemplate:
      'https://creator.douyin.com/aweme/janus/creator/comment/aweme/v1/web/comment/multi_publish/?aweme_id={awemeId}&text={text}&reply_to_comment_ids={commentId}&channel_id=618&aid=2906&device_platform=webapp&msToken={msToken}&a_bogus={aBogus}',
  },
} as const;

// 尝试加载本地覆盖配置（包含真实抓包参数）
// 注意：endpoints.local.ts 在 .gitignore 中，仅本地开发使用
// 用 eval('require') 绕过 webpack 静态分析，避免编译时尝试打包此可选文件
let LOCAL_ENDPOINTS: typeof BASE_ENDPOINTS | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dynamicRequire = eval('require');
  LOCAL_ENDPOINTS = dynamicRequire('./endpoints.local').DOUYIN_ENDPOINTS;
} catch {
  // endpoints.local.ts 不存在或加载失败，使用占位符版本
}

export const DOUYIN_ENDPOINTS = LOCAL_ENDPOINTS ?? BASE_ENDPOINTS;

export function fillTemplate(
  tpl: string,
  vars: Record<string, string | number>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    encodeURIComponent(String(vars[k] ?? '')),
  );
}
