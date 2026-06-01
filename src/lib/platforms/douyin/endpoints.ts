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
      'https://creator.douyin.com/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/?aweme_id={awemeId}&cursor={cursor}&count=10&comment_select_options=0&sort_options=0&channel_id=618&app_id=2906&aid=2906&device_platform=webapp&msToken=zbj8AmL-NrTDIvPm5UeawE5xr6bSf6KoxGBoPlPnvu8MH2yxLq_iPMer6Owyit5pj5a2_D4yDrPge6jhY2hWYu4GMi3RSK6p8LcEn0hGs0dUYLOQUtK5HcMbbyeJDv8Mlx_xjn_L38xottuyzLvlkybWPPx5vUnMj7ZuwSmgD4QfOYRUTbU_3lFJ&a_bogus=xJ4VgzX7YNWna3KtYOTue5xUR7fANBSyFpi%2FWc8nSPoqaq0cpZeyFcbbJxKFnhOHibB5iq2H5fPlGVxcuGkwZAHpLmkkuMX6NGQCVysLMqw6YMkQEHDYCzszFw0CWbGqeQnjNlR5UsMNZDQWIrIgWQVGy5FqBQYDSHFbd%2Fbbn9AxVWjHIndteBYpqhIx',
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
   * 抓包来源：在隐身/未登录浏览器打开 https://www.douyin.com/user/<sec_uid>
   * 找路径含 /aweme/v1/web/user/profile/ 的 XHR
   */
  publicUserInfo: {
    urlTemplate:
      'https://www.douyin.com/aweme/v1/web/user/profile/other/?device_platform=webapp&aid=6383&channel=channel_pc_web&publish_video_strategy_type=2&source=channel_pc_web&sec_user_id={secUid}&personal_center_strategy=1&profile_other_record_enable=1&land_to=1&update_version_code=170400&pc_client_type=1&pc_libra_divert=Windows&support_h265=1&support_dash=1&cpu_core_num=16&version_code=170400&version_name=17.4.0&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=148.0.0.0&browser_online=true&engine_name=Blink&engine_version=148.0.0.0&os_name=Windows&os_version=10&device_memory=32&platform=PC&downlink=10&effective_type=4g&round_trip_time=50&webid={webid}&uifid={uifid}&verifyFp={verifyFp}&fp={fp}&msToken={msToken}&a_bogus={aBogus}&timestamp={timestamp}&x-secsdk-web-signature={xSecsdkWebSignature}',
  },
  /**
   * 公开作品列表（对标账号作品）
   *
   * 抓包来源：在用户主页滚动加载更多作品，找 /aweme/v1/web/aweme/post/
   */
  publicAwemeList: {
    urlTemplate:
      'https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id={secUid}&max_cursor={maxCursor}&locate_query=false&show_live_replay_strategy=1&need_time_list=1&time_list_query=0&whale_cut_token=&cut_version=1&count=18&publish_video_strategy_type=2&from_user_page=1&update_version_code=170400&pc_client_type=1&pc_libra_divert=Windows&support_h265=1&support_dash=1&cpu_core_num=16&version_code=290100&version_name=29.1.0&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=148.0.0.0&browser_online=true&engine_name=Blink&engine_version=148.0.0.0&os_name=Windows&os_version=10&device_memory=32&platform=PC&downlink=10&effective_type=4g&round_trip_time=50&webid={webid}&uifid={uifid}&verifyFp={verifyFp}&fp={fp}&msToken={msToken}&a_bogus={aBogus}&timestamp={timestamp}&x-secsdk-web-signature={xSecsdkWebSignature}',
    pageSize: 18,
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
