/**
 * 抖音接口抓包参数本地配置示例
 *
 * 使用步骤：
 * 1. 复制此文件为 endpoints.local.ts（已在 .gitignore 中）
 * 2. 按照 docs/douyin-endpoint-capture.md 的步骤抓包
 * 3. 把抓到的完整 URL 替换到下面对应的 urlTemplate
 * 4. 保持 {secUid} / {awemeId} / {maxCursor} 等占位符不变
 *
 * 注意：endpoints.local.ts 不会被提交到 git，仅供本地开发使用
 */

export const DOUYIN_ENDPOINTS_LOCAL = {
  userInfo: {
    urlTemplate: 'https://creator.douyin.com/aweme/v1/creator/check/user/?sec_uid={secUid}&msToken=YOUR_MS_TOKEN&a_bogus=YOUR_A_BOGUS',
  },
  workList: {
    urlTemplate:
      'https://creator.douyin.com/janus/douyin/creator/pc/work_list?scene=star_atlas&device_platform=android&status=0&count=12&max_cursor={maxCursor}&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Mozilla&browser_version=YOUR_BROWSER_VERSION&browser_online=true&timezone_name=Asia%2FShanghai&aid=1128&support_h265=1',
    pageSize: 12,
  },
  publicUserInfo: {
    urlTemplate:
      'https://www.douyin.com/aweme/v1/web/user/profile/other/?device_platform=webapp&aid=6383&channel=channel_pc_web&publish_video_strategy_type=2&source=channel_pc_web&sec_user_id={secUid}&personal_center_strategy=1&profile_other_record_enable=1&land_to=1&update_version_code=170400&pc_client_type=1&pc_libra_divert=Windows&support_h265=1&support_dash=1&cpu_core_num=16&version_code=170400&version_name=17.4.0&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=YOUR_VERSION&browser_online=true&engine_name=Blink&engine_version=YOUR_VERSION&os_name=Windows&os_version=10&device_memory=32&platform=PC&downlink=10&effective_type=4g&round_trip_time=50&webid=YOUR_WEBID&uifid=YOUR_UIFID&verifyFp=YOUR_VERIFY_FP&fp=YOUR_FP&msToken=YOUR_MS_TOKEN&a_bogus=YOUR_A_BOGUS&timestamp=YOUR_TIMESTAMP&x-secsdk-web-signature=YOUR_SIGNATURE',
  },
  publicAwemeList: {
    urlTemplate:
      'https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id={secUid}&max_cursor={maxCursor}&locate_query=false&show_live_replay_strategy=1&need_time_list=1&time_list_query=0&whale_cut_token=&cut_version=1&count=18&publish_video_strategy_type=2&from_user_page=1&update_version_code=170400&pc_client_type=1&pc_libra_divert=Windows&support_h265=1&support_dash=1&cpu_core_num=16&version_code=290100&version_name=29.1.0&cookie_enabled=true&screen_width=1560&screen_height=1040&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=YOUR_VERSION&browser_online=true&engine_name=Blink&engine_version=YOUR_VERSION&os_name=Windows&os_version=10&device_memory=32&platform=PC&downlink=10&effective_type=4g&round_trip_time=50&webid=YOUR_WEBID&uifid=YOUR_UIFID&verifyFp=YOUR_VERIFY_FP&fp=YOUR_FP&msToken=YOUR_MS_TOKEN&a_bogus=YOUR_A_BOGUS&timestamp=YOUR_TIMESTAMP&x-secsdk-web-signature=YOUR_SIGNATURE',
    pageSize: 18,
  },
} as const;
