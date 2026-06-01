# 抖音创作者中心接口抓包指南

第一版的抖音 Adapter **不实现签名算法**（`_signature` / `X-Bogus` / `msToken` / `a_bogus`），而是把签名 query 作为 URL 模板的一部分，由用户从浏览器抓包后粘贴到 `src/lib/platforms/douyin/endpoints.ts`。

## 抓包步骤

1. 打开 Chrome / Edge，登录 `https://creator.douyin.com`
2. 打开 DevTools（F12）→ Network 面板，勾上 `Preserve log`
3. 触发对应页面操作，找到 XHR 请求：
   - **userInfo**：刷新首页，找请求路径含 `/web/api/media/user/info` 的 XHR
   - **workList**：进入"作品管理"，找路径含 `/web/api/media/aweme/list` 的 XHR
   - **workDetail**：点开任意作品详情，找路径含 `/web/api/media/aweme/detail` 的 XHR
   - **commentList**：在作品详情页打开评论区，找路径含 `/web/api/media/comment/list` 的 XHR
   - **fansAnalysis**：进入"数据中心 → 粉丝"，找路径含 `creator/data/fans/distribution` 的 XHR
4. 右键请求 → Copy → Copy URL，得到完整 URL（含所有 query）
5. 把 URL 粘贴到 `src/lib/platforms/douyin/endpoints.ts` 对应字段的 `urlTemplate`
6. 在 URL 中找到表示动态参数的 query，替换为占位：
   - `sec_user_id=...` → `sec_user_id={secUid}`
   - `max_cursor=...` → `max_cursor={maxCursor}`
   - `aweme_id=...` / `item_id=...` → `aweme_id={awemeId}` / `item_id={awemeId}`
   - `cursor=...`（评论分页） → `cursor={cursor}`
   - 其余 `_signature` / `X-Bogus` / `msToken` / `a_bogus` **保持原值**

## 何时需要重抓

- Cookie 仍正常但 API 返回 `status_code != 0` / 空数据（通常是 msToken 过期）
- 抖音前端版本更新后接口路径变化（少见，几个月一次）

## 真实响应 fixture（脱敏）

抓包后建议把脱敏的真实响应 JSON 替换 `tests/fixtures/douyin/*.json`，并重跑：

```bash
pnpm test tests/lib/platforms/douyin/normalize.test.ts
```

如果失败说明字段路径变了，修 `src/lib/platforms/douyin/normalize.ts` 即可。

## 风险提示

- 仅用自己账号的 Cookie 同步自己的数据
- 限频：默认每天凌晨 2:00 自动同步一次，单次同步内每个接口之间随机 sleep 1–3 秒
- Cookie 失效：失败 5xx 自动 3 次指数退避重试；401/403 视为失效，前端会显示红条提示重新导入
