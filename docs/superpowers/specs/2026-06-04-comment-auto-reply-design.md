# 评论自动同步与 AI 自动回复 · 设计文档

- **创建日期**：2026-06-04
- **作者**：Qiansheng / Claude Code 协作
- **状态**：Draft（待用户复审）
- **适用范围**：v0.x 增量功能，不修改现有同步主流程

---

## 1. 概述

### 1.1 目标

在现有"抖音作品/评论同步"基础上，新增**自动回复**能力：

1. 定时同步关联抖音账号的作品和评论（已具备，沿用现有 `runFullSync`）
2. 对**新增未回复的顶层评论**，按配置自动生成并发送回复
3. 全程在风控可控的节奏内运行，失败优先选择"停手 + 通知"而非"硬重试"

### 1.2 范围

- 平台：仅抖音（与现有 v0.1 一致）
- 触发：独立 cron，与现有同步 cron 解耦（默认 `*/30 * * * *`）
- 内容来源：全局固定模板优先；为空则走 AI 生成（`COMMENT_REPLY` 任务）
- 过滤：所有顶层评论 + 黑名单关键词排除
- 节流：每条间隔 30~90s + 每作品每轮 10 条上限 + 每账号每天 10 条上限
- 失败策略：抖音回写失败立即停账号本轮 + 红条提示 + 邮件/webhook 通知

### 1.3 非目标

- 多平台：仍只抖音
- 草稿/审核队列：不引入"先生成后人工审核"的中间态
- 复杂任务表：不新建 `CommentReplyJob` 表
- 关键词路由（不同关键词回不同模板）：MVP 仅支持单一全局模板
- 多档风控等级、自动签名刷新

---

## 2. 关键设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 触发方式 | 独立 cron `auto_reply_cron` | 评论可比作品同步更频繁地回（默认 30 分钟） |
| 回复内容来源 | 全局固定模板优先，为空走 AI | 简单，省 token；用户保留灵活性 |
| 回复范围 | 顶层 + 未回复 + 黑名单过滤 | 覆盖面广，黑名单兜底负面/spam |
| 节流 | 30~90s 随机间隔 + 10/作品/轮 + 10/账号/天 | 模拟人类节奏，规避风控 |
| 失败处理 | 立即停账号本轮 + 红条 + 通知 | 一旦风控信号即收手，避免连环触发 |
| 状态存储 | `WorkComment` 加 4 字段 | 直接、查询快、不与 `AIAnalysis` 职责重叠 |
| 配置存储 | `Setting` 表（`auto_reply_config` + `auto_reply_state_<accountId>`） | 沿用现有模式，无需新表 |
| 任务编排 | cron 串行调单账号编排器 | 规模小（10 条/账号/天），无需队列/并发 |
| AI 生成审计 | 复用 `AIAnalysis.type=COMMENT_REPLY` | 用现成的 token 计费/历史；固定模板路径不写 |

---

## 3. 模块边界与文件分布

```
src/
├── lib/
│   ├── cron/
│   │   └── index.ts                          # 新增 startAutoReplyCron() / runAutoReplyForAllAccounts()
│   ├── platforms/douyin/
│   │   ├── auto-reply.ts                     # 新增 autoReplyForAccount() 单账号编排
│   │   ├── api.ts                            # 新增 postCommentReply()
│   │   └── endpoints.ts                      # 已有 commentReply 端点定义
│   └── auto-reply/                           # 新增（平台无关编排层）
│       ├── filter.ts                         # 黑名单 + 顶层 + 未回复 过滤逻辑
│       ├── config.ts                         # Setting 表读写 auto_reply_config / state
│       └── notify.ts                         # 邮件/webhook 失败通知
└── app/
    ├── api/auto-reply/
    │   ├── config/route.ts                   # GET/POST 自动回复配置
    │   └── run/route.ts                      # POST 手动触发一轮（调试用）
    ├── (app)/settings/auto-reply/page.tsx    # 配置页
    └── (app)/works/[id]/comments/page.tsx    # 已有，加状态徽章 + 手动跳过/重置按钮

prisma/migrations/
└── 20260604_xxx_add_comment_auto_reply_fields/
    └── migration.sql                         # WorkComment 加 4 字段 + AutoReplyStatus enum
```

### 3.1 职责划分

- **`auto-reply/filter.ts`** — 纯函数，输入评论列表 + 黑名单，输出"该回的"和"该跳过的"。无副作用，可独立测试。
- **`auto-reply/config.ts`** — 配置读写 + 默认值兜底；账号级 state（today date / count / token expired）。
- **`auto-reply/notify.ts`** — 失败/token 失效时发邮件或 webhook；可选配置，未配则 console + UI 红条。
- **`platforms/douyin/auto-reply.ts`** — 单账号编排器：拉评论 → 过滤 → 生成 → 回写 → 更新状态。**只管单账号**，失败自然停。
- **`platforms/douyin/api.ts` 新增 `postCommentReply()`** — 真正调用抖音 commentReply 端点（multi_publish）。
- **`cron/index.ts`** — 新增独立 cron，调编排器遍历所有账号。

---

## 4. 数据模型变更

### 4.1 Prisma schema

```prisma
enum AutoReplyStatus {
  REPLIED      // 已成功回写抖音
  SKIPPED      // 被过滤规则跳过
  FAILED       // 回写失败（本轮已停账号）
}

model WorkComment {
  // 现有字段保持不变
  autoReplyStatus    AutoReplyStatus?       // NULL = 还没轮到处理
  autoReplyContent   String?  @db.Text      // 实际发出/将要发出的回复文本
  autoReplyAt        DateTime?              // 回写抖音成功的时间
  autoReplyError     String?                // FAILED 时的错误摘要

  @@index([workId, autoReplyStatus])
}
```

迁移文件：`20260604_xxx_add_comment_auto_reply_fields`。

### 4.2 Setting 表新增键

```ts
// key = 'auto_reply_config' （全局配置，单条）
type AutoReplyConfig = {
  enabled: boolean;             // 总开关
  cronExpr: string;             // 默认 '*/30 * * * *'
  fixedReply: string;           // 全局固定回复模板，空字符串则走 AI
  blacklistKeywords: string[];  // 黑名单关键词，命中即 SKIPPED
  perWorkLimit: number;         // 每作品每轮最多回，默认 10
  perAccountDailyLimit: number; // 每账号每天最多回，默认 10
  intervalMinSec: number;       // 每条间隔下限，默认 30
  intervalMaxSec: number;       // 每条间隔上限，默认 90
  notifyEmail: string;          // 失败通知邮箱（可空）
  notifyWebhook: string;        // 失败通知 webhook URL（可空）
};

// key = `auto_reply_state_${accountId}` （按账号独立）
type AutoReplyAccountState = {
  tokenExpired: boolean;        // msToken 失效标记，红条来源
  tokenExpiredAt: string | null;
  lastFailedAt: string | null;
  lastFailedReason: string | null;
  todayDate: string;            // 'YYYY-MM-DD'
  todayCount: number;           // 今日已成功回复数
};
```

---

## 5. 数据流与执行流程

### 5.1 主流程

```
[cron tick]
   │
   ▼
loadAutoReplyConfig() ── enabled? ── no ──► return
   │ yes
   ▼
db.platformAccount.findMany({ ACTIVE })
   │
   ▼ 串行 for-loop（不并发，避免风控）
   │
   ├──► autoReplyForAccount(accountId)
   │
   ▼
log summary
```

### 5.2 单账号编排（`autoReplyForAccount`）

```
1. loadAccountState(accountId)
   ├─ todayDate !== today ── 重置 todayCount = 0
   ├─ tokenExpired === true ── 跳过该账号
   └─ todayCount >= perAccountDailyLimit ── 跳过

2. 查待回评论：
   db.workComment.findMany({
     work: { platformAccountId },
     parentCommentId: null,
     isAuthorReply: false,
     autoReplyStatus: null,
   })
   按 workId 分组，每组取前 perWorkLimit 条

3. 已被作者回过的预筛：
   对每条评论，若 replyCount > 0 且存在 isAuthorReply=true 的子评论
   → 标记为 SKIPPED + autoReplyError='author_already_replied'，跳过

4. filterComments(comments, blacklistKeywords):
   ├─ 命中黑名单 ── 标记 SKIPPED + autoReplyError=`blacklist:<匹配关键词>`
   └─ 通过 ── 进入处理队列

5. for comment in queue:
   ├─ remaining = perAccountDailyLimit - todayCount
   │  if remaining <= 0 → break

   ├─ replyText = config.fixedReply
   │            || (await executeCommentReply(comment.id)).result

   ├─ try postCommentReply({
   │     accountId,
   │     awemeId: comment.work.platformWorkId,
   │     commentId: comment.platformCommentId,
   │     text: replyText,
   │     msToken, aBogus,           // 从 reply_sign_<accountId> 读取
   │   })
   │   │
   │   ├─ ok ── update WorkComment(REPLIED, content=replyText, at=now)
   │   │      todayCount++ → save state
   │   │      sleep random(intervalMinSec, intervalMaxSec) * 1000ms
   │   │
   │   └─ fail ── update WorkComment(FAILED, error=reason)
   │             setAccountState(tokenExpired=true,
   │                             lastFailedReason=reason,
   │                             lastFailedAt=now)
   │             notify(email/webhook, account, reason)
   │             BREAK 整账号本轮

   └─ AI 生成失败（与回写失败区分）：
      标记该评论 FAILED，error=AI 错误摘要，**继续下一条**
      （原因：AI 失败与抖音风控无关，无需停账号）
```

### 5.3 关键决策点

- **固定模板路径不调 LLM**：节省 token；不写 `AIAnalysis` 记录，因为没有 AI 调用。
- **AI 路径直接复用 `executeCommentReply()`**：已写入 `AIAnalysis` 表（含 prompt/response/tokensUsed），自动获得审计。
- **跨天清零**：进入编排第一件事即比对 `todayDate`，不依赖外部定时任务。
- **失败原因不细分**：所有抖音端失败（429/风控/签名/网络）都映射成同一动作（停账号 + token 失效标记 + 通知），简化决策。
- **提前停手优先于打满配额**：哪怕日上限 10、刚回了 3 条就失败了，剩下 7 条今天就不再尝试。

---

## 6. 错误处理与边界情况

| 场景 | 处理 |
|---|---|
| 配置 `enabled=false` | 进入 `runAutoReplyForAllAccounts` 直接 return；cron 注册保留但每次跑都早退 |
| `cronExpr` 无效 | `startAutoReplyCron` 用 `cron.validate()` 兜底，无效则警告并跳过注册 |
| 账号 cookie EXPIRED/INVALID | `findMany` where 子句过滤 |
| 该账号 `reply_sign_<id>` 未配置（msToken/aBogus 没贴） | `postCommentReply` 拿不到 token → 视同回写失败 → 设 `tokenExpired=true` |
| AI 生成超时/失败 | 该评论标记 FAILED + reason，继续下一条（不停账号） |
| 抖音回写失败 | 该评论 FAILED + 停账号本轮 + token 标失效 + 通知 |
| 黑名单大小写/空白 | 匹配时双方 `.toLowerCase().trim()`，子串命中（不用正则） |
| 全空 / 全 emoji 评论 | 不特殊处理；用户自行加黑名单（YAGNI） |
| 同评论被处理两次 | DB 只更新 `autoReplyStatus IS NULL` 的行；单 cron 串行无并发 |
| cron 跑到一半重启 | 已 REPLIED 的留 REPLIED；处理中未 update 的留 NULL，下次拉回。重发风险通过"作者已回过"检测兜底 |
| 通知配置为空 | `notify()` 内部直接 return，仅 console 记录 |

---

## 7. UI 设计

### 7.1 新增配置页 `/settings/auto-reply`

| 字段 | 控件 | 默认值 |
|---|---|---|
| 启用自动回复 | Switch | false |
| Cron 表达式 | Input + 实时校验提示 | `*/30 * * * *` |
| 固定回复模板（空则用 AI） | Textarea | `''` |
| 黑名单关键词（一行一个） | Textarea | `''` |
| 每作品每轮上限 | Number | 10 |
| 每账号每天上限 | Number | 10 |
| 间隔最短秒数 | Number | 30 |
| 间隔最长秒数 | Number | 90 |
| 失败通知邮箱 | Input | `''` |
| 失败通知 webhook | Input | `''` |
| **手动触发一次** | Button | — |

页面顶部展示每个账号的当前 state：今日已回 X / Y，token 状态（OK / 失效），失效原因（若有）。

### 7.2 评论详情页徽章

`works/[id]/comments` 现有评论列表，每条评论右侧加徽章：

- 无徽章 = `autoReplyStatus = null`（待处理）
- 🟢 已回复 = `REPLIED`，hover 显示 content + at
- ⚪ 已跳过 = `SKIPPED`，hover 显示原因（黑名单关键词）
- 🔴 失败 = `FAILED`，hover 显示 error

每条评论加"重置"小按钮：清空 `autoReplyStatus`，下轮 cron 重试。

### 7.3 全局红条

已有的 cookie 失效红条扩展：检测任一账号 `auto_reply_state_<id>.tokenExpired === true` → 顶部红条提示"账号 XXX 自动回复 token 已失效，请到 reply-sign 重新粘贴"。

---

## 8. 测试策略

### 8.1 单元测试（`tests/lib/auto-reply/`）

- `filter.test.ts` — `filterComments()` 纯函数
  - 黑名单大小写/空白/子串命中
  - 顶层评论保留、二级评论排除
  - 作者自己评论排除
  - 空黑名单全通过
- `config.test.ts` — 配置读写 + 默认值兜底（mock prisma）
- `notify.test.ts` — 邮件/webhook 调用（mock fetch）

### 8.2 集成测试（`tests/lib/platforms/douyin/auto-reply.test.ts`）

mock 抖音 HTTP + `executeCommentReply`：

- **正常路径**：3 条评论全部 REPLIED，state.todayCount=3
- **命中日上限**：3 条评论 + dailyLimit=2 → 2 REPLIED + 1 留 NULL
- **回写失败**：第 1 条成功、第 2 条失败 → 第 2 条 FAILED + tokenExpired=true + 第 3 条不处理
- **固定模板路径**：不调 LLM
- **作者已回过**：跳过不调 AI
- **AI 失败**：该条 FAILED，下一条继续

间隔随机延迟测试时把 `intervalMinSec/Max` 设为 `1/2`，避免卡死测试。

### 8.3 手工验证

- 配置 `fixedReply='感谢支持'` + `dailyLimit=1` + 触发 `/api/auto-reply/run` → 验证抖音端真发出
- 故意填错 msToken → 验证红条 + 邮件/webhook
- 重启 dev server → 验证 cron 自动按配置重启
- 黑名单含中文关键词 → 验证 SKIPPED 标记

---

## 9. 实施顺序建议

1. **数据层**：Prisma schema 加字段 + 迁移 + 通过 `pnpm prisma migrate dev` 验证
2. **平台层**：`postCommentReply()` + 在 `tests/lib/platforms/douyin/` 加 mock 测试
3. **过滤与配置**：`auto-reply/filter.ts` + `config.ts` + 单测
4. **编排器**：`platforms/douyin/auto-reply.ts` + 集成测试
5. **Cron 接入**：`cron/index.ts` 加 `startAutoReplyCron`，main loop 注册
6. **API**：`/api/auto-reply/config` + `/api/auto-reply/run`
7. **UI**：配置页 + 评论页徽章 + 全局红条
8. **通知**：`notify.ts` + 配置页接入
9. **手工 e2e**：用真实 ACTIVE 账号 + 一条测试评论跑通整条链路

---

## 10. 后续可能扩展（非本次范围）

- 关键词路由：不同关键词命中时返回不同模板
- 草稿/审核模式：先生成后人工逐条 approve
- 多档风控：白天/晚上不同节流参数
- 自动刷新 msToken（需研究签名算法）
- 多平台扩展：把 `postCommentReply` 抽到 `PlatformAdapter` 接口
