# 自媒体运营管理平台 · 设计文档

- **创建日期**：2026-05-29
- **作者**：Qiansheng / Claude Code 协作
- **状态**：Draft（待用户确认）
- **适用范围**：v0.1（MVP）整体设计 + 后续迭代规划

---

## 1. 概述

### 1.1 目标

构建一个个人自媒体运营管理平台，帮助单一创作者：

1. **集中查看**自己在各自媒体平台上的作品数据
2. **借助大模型**对作品和账号进行分析、提供运营建议
3. **统一管理**创作过程中的各类素材（文案、话题、视频、图片、音频、选题、爆款参考）

### 1.2 范围

- **第一版仅支持抖音平台**，平台抽象层预留多平台扩展能力
- **单用户使用**（自用工具，部署到个人腾讯云服务器）
- **不做内容发布**，只做"运营管理"层面的事情

### 1.3 非目标

- 多用户/团队协作、付费体系
- 视频剪辑/封面制作等创作工具
- 自动发布、自动化营销
- 移动端原生 App

---

## 2. 关键设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 应用形态 | Web 应用 | 跨设备、可云端部署 |
| 用户范围 | 单用户 | 简化架构，不引入租户隔离 |
| 抖音数据获取 | 创作者中心 Cookie 模式 | 个人能拿到最完整数据，免开发者审核 |
| LLM 接入 | OpenAI 兼容协议，多 Provider 可配置 | 事实标准，国内外模型通吃 |
| 部署 | 腾讯云服务器 + 大文件走 COS | 跨设备访问，长期成本可控 |
| 技术栈 | Next.js 15 全栈 + TypeScript + Prisma + PostgreSQL | 全栈一体，单人维护友好 |
| 任务调度 | node-cron（暂不引入 Worker/Redis） | MVP 简化，后续按需拆分 |
| Cookie 获取 | 第一版仅手动导入 | 比扫码登录简单可靠 |
| 评论同步 | 按需触发（不自动） | 评论量大，并非每条作品都需要分析 |
| AI 分析 MVP | P0：单作品复盘 / 选题建议 / 文案优化 + AI Chat | 价值最高、最易落地 |
| 提示词模板 | 用户可编辑 | 用户对 AI 输出诉求差异大 |
| 公网部署保护 | 单密码登录 | 简单足够，不做完整账号系统 |

---

## 3. 整体架构

### 3.1 模块划分

```
self-media (Next.js 15 + App Router 单进程)
├── app/                                # 页面 + API Routes
│   ├── (dashboard)/                    # 主布局
│   │   ├── dashboard/                  # 数据总览
│   │   ├── works/                      # 作品列表 / 详情
│   │   ├── materials/                  # 素材库
│   │   ├── ai-chat/                    # AI 自由对话
│   │   ├── ai-history/                 # AI 分析历史
│   │   └── settings/                   # 平台账号 / 模型 / 系统配置
│   └── api/                            # REST 风格 API Routes
├── lib/
│   ├── platforms/                      # 平台抽象层
│   │   ├── types.ts                    # PlatformAdapter 接口
│   │   └── douyin/                     # 抖音实现
│   ├── llm/                            # LLM 抽象层（OpenAI 兼容）
│   ├── ai-tasks/                       # AI 任务执行器（含 Prompt 模板）
│   ├── storage/                        # 存储抽象（local / cos）
│   ├── crypto.ts                       # AES-256-GCM 加密
│   ├── auth.ts                         # 单密码登录
│   ├── db.ts                           # Prisma client
│   └── cron/                           # 定时任务定义
├── components/                         # UI 组件
└── data/                               # 本地素材 / 数据卷（gitignore）
```

### 3.2 关键设计原则

- **平台抽象层**：所有平台相关代码封装在 `lib/platforms/<platform>/` 下，对外通过统一 `PlatformAdapter` 接口暴露能力。新增平台无需改业务层。
- **存储抽象层**：业务代码只调 `storage.upload(buffer, key)` / `storage.getUrl(key)`，第一版用 `LocalStorageProvider`，后续切 `COSStorageProvider` 零代码改动。
- **LLM 抽象层**：基于 Vercel AI SDK + `@ai-sdk/openai-compatible`，所有模型走统一 `LLMClient` 接口，每次任务可指定 Provider/Model。
- **AI 任务模板化**：每个结构化分析任务一个文件，包含 Prompt 模板 + 输入数据组装 + 输出格式约束；Prompt 可在设置页编辑。

### 3.3 进程模型

第一版采用**单进程**：所有逻辑跑在同一个 Next.js 实例内。

- 同步任务：node-cron 注册到 Next.js 启动时
- AI 任务：API Route 内同步执行（流式响应）
- 长任务（>30s）：用 SSE 流式返回避免超时

后续如果数据量上来，再拆出 `apps/worker` 独立进程。

---

## 4. 数据模型（Prisma Schema 概要）

### 4.1 配置类

```
PlatformAccount {
  id, platform (enum), nickname, avatar, secUid,
  cookieEncrypted, cookieStatus (active|expired|invalid),
  lastSyncAt, createdAt
}

LLMProvider {
  id, name, baseUrl, apiKeyEncrypted, defaultModel,
  enabled, createdAt
}

Setting {
  key (unique), value (Json)
  // 默认模型、同步频率、存储类型、Prompt 模板等
}

PromptTemplate {
  id, taskType (enum), name, systemPrompt, userPromptTemplate,
  isDefault, createdAt, updatedAt
}
```

### 4.2 作品数据类（时序快照设计）

```
Work {
  id, platformAccountId, platformWorkId (unique),
  title, description, coverUrl, videoUrl, duration,
  publishedAt, rawData (Json), createdAt, updatedAt
}

WorkMetric {
  id, workId, snapshotAt,
  play, like, comment, share, collect, finishRate,
  rawData (Json)
  // 同一 Work 多次快照，用于趋势图
}

WorkComment {
  id, workId, platformCommentId, content, author,
  likeCount, publishedAt, rawData (Json)
}

AccountMetric {
  id, platformAccountId, snapshotAt,
  totalFans, genderDist (Json), ageDist (Json), regionDist (Json),
  rawData (Json)
}
```

### 4.3 素材类（统一表 + type 字段）

```
Material {
  id, type (enum: COPY|TOPIC|VIDEO|IMAGE|AUDIO|IDEA|REFERENCE),
  title, content (text, nullable), fileKey (nullable),
  tags (string[]), metadata (Json), notes (text, nullable),
  relatedWorkId (nullable, FK Work), createdAt, updatedAt
}
```

各 type 的字段使用约定：

- `COPY` / `TOPIC`：使用 `content`
- `VIDEO` / `IMAGE` / `AUDIO`：使用 `fileKey`，`metadata` 存 duration / dimensions
- `IDEA`：`content` 为构思内容，`metadata.status` 为 `BRAINSTORM` / `ADOPTED` / `DROPPED`，`relatedWorkId` 在采用后关联
- `REFERENCE`：`metadata` 存 `sourceUrl` / `metrics`（手动录入）

### 4.4 AI 类

```
AIAnalysis {
  id, type (enum), targetRefs (Json),
  prompt (text), response (text),
  modelUsed, llmProviderId, tokensUsed (Json: {input, output}),
  status (running|done|failed), error (nullable),
  createdAt
}

AIChat {
  id, title, createdAt, updatedAt
}

AIChatMessage {
  id, chatId, role (system|user|assistant),
  content (text), attachments (Json: Work/Material 引用),
  tokensUsed (Json), createdAt
}
```

### 4.5 任务类

```
SyncJob {
  id, platformAccountId, type (full|incremental|manual),
  status (running|done|failed),
  startedAt, finishedAt, error, stats (Json: 拉了几条等)
}
```

---

## 5. 抖音数据获取

### 5.1 Cookie 导入与管理

**导入方式**（第一版仅手动）：

1. 用户登录 `creator.douyin.com`
2. 在"账号配置 → 添加抖音账号"页：
   - 方式 A：粘贴 Cookie 字符串
   - 方式 B：上传 Cookie JSON（推荐用浏览器扩展导出）
3. 后端调用一次"用户信息"接口验证 → 成功则 AES-256-GCM 加密存库

**健康检查**：

- 每次同步前发轻量探活请求
- 失效时 `cookieStatus = expired`，前端 Dashboard 顶部红色提示
- 失败重试策略：5 分钟、15 分钟、1 小时三次指数退避

### 5.2 数据接口

第一版接入的创作者中心接口（具体路径在 `lib/platforms/douyin/api/` 中版本化管理）：

| 用途 | 调用频率 |
|---|---|
| 作品列表 | 每天 1 次 + 手动 |
| 单作品详细数据 | 进入详情页时（带缓存） |
| 评论列表 | 按需（"分析评论"按钮触发） |
| 粉丝画像 | 每天 1 次 |
| 数据总览 | 每天 1 次 |

### 5.3 同步策略

- **定时**：node-cron 默认每天凌晨 2 点全量同步（频率可在设置页改）
- **手动**：作品列表页"立即同步"按钮触发
- **增量**：作品列表按 `published_at > last_sync_at` 增量；指标每次新建 `WorkMetric` 快照不覆盖
- **限频**：单次同步最多 N 个请求，请求间随机 sleep 1–3 秒

### 5.4 风险与应对

| 风险 | 应对 |
|---|---|
| 抖音改接口 | 抽象层隔离 + 详细错误日志 |
| Cookie 频繁失效 | 健康检查 + 用户提示重新导入 |
| 风控 | 限频 + 随机延时 + 真实 UA / Referer |
| 法律合规 | 仅用用户自己的 Cookie 同步自己账号数据 |

---

## 6. 大模型集成与 AI 分析

### 6.1 LLM 抽象

基于 OpenAI 兼容协议。配置示例：

```jsonc
[
  { "name": "Claude (via Anyrouter)",
    "baseUrl": "https://anyrouter.top/v1",
    "apiKey": "sk-...",
    "defaultModel": "claude-opus-4-7" },
  { "name": "DeepSeek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-...",
    "defaultModel": "deepseek-chat" }
]
```

技术：Vercel AI SDK + `@ai-sdk/openai-compatible`，所有模型统一接口；任务调用时可指定 Provider/Model。

### 6.2 七种结构化分析任务

| 任务类型 | 输入 | 输出 | 优先级 |
|---|---|---|---|
| `WORK_REVIEW` 单作品复盘 | Work + 最新 WorkMetric + 历史均值 | 亮点 / 问题 / 建议 | P0 |
| `TOPIC_SUGGEST` 选题建议 | 历史 Top10 爆款 + 30 天趋势 + 用户输入方向 | 5–10 条选题 + 理由 | P0 |
| `COPY_OPTIMIZE` 文案优化 | 用户草稿 + 历史高互动文案样本 | 优化版 + 改进点 | P0 |
| `WORKS_COMPARE` 横向对比 | 多条 Work 数据 | 对比表 + 共性 / 差异 | P1 |
| `TREND` 趋势分析 | 一段时间 AccountMetric + WorkMetric | 趋势 + 健康度评分 | P1 |
| `COMMENT_INSIGHT` 评论洞察 | WorkComment 列表 | 反馈分类 + 选题灵感 | P1 |
| `BENCHMARK` 对标分析 | REFERENCE 素材 | 对比维度 + 借鉴点 | P2 |

### 6.3 实现细节

- 每种任务一个文件 `lib/ai-tasks/<task>.ts`，含 `assembleInput / buildPrompt / parseOutput`
- Prompt 模板存 `PromptTemplate` 表，用户可在设置页编辑（系统提供默认模板，用户可"恢复默认"）
- **流式输出**：所有任务用 SSE 流式返回
- **完整记录**：每次写入 `AIAnalysis`，可在 AI 历史页查看
- **Token 用量**：调用后记录 `tokensUsed`

### 6.4 AI Chat（自由对话）

- 独立页面 `/ai-chat`，支持多会话
- **`@` 引用上下文**：可选 Work / Material 作为附加上下文，发送时序列化为消息内容前置
- 历史消息持久化到 `AIChat` / `AIChatMessage`

---

## 7. 素材管理

### 7.1 统一视图

`/materials` 页面，顶部 Tab 切换 type：`全部 | 文案 | 话题 | 视频 | 图片 | 音频 | 选题 | 爆款参考`。

每 Tab 下提供：列表/网格切换、标签筛选、搜索（title + content）、批量删除/打标签。

### 7.2 各类型字段与交互

| 类型 | 关键字段 | 创建方式 | 列表展示 |
|---|---|---|---|
| `COPY` | title, content, tags | 富文本编辑器（Tiptap） | 卡片：标题 + 前 80 字 |
| `TOPIC` | title, content, tags | 表单（支持批量录入） | 标签云 |
| `VIDEO` | title, fileKey, duration, dimensions, tags | 拖拽上传 | 缩略图 + 时长 |
| `IMAGE` | title, fileKey, dimensions, tags | 拖拽上传 | 缩略图网格 |
| `AUDIO` | title, fileKey, duration, tags | 拖拽上传 | 播放器 + 时长 |
| `IDEA` | title, content, status, tags | 表单 | 看板视图（构思中 / 已采用 / 已废弃 三栏） |
| `REFERENCE` | title, sourceUrl, metrics, notes, tags | 手动表单 | 卡片 + 核心指标 |

### 7.3 文件存储

- **第一版**：本地 `data/uploads/{type}/{yyyy-mm}/{uuid}-{filename}`
- **抽象**：`storage.upload(buffer, key) → fileKey`、`storage.getUrl(fileKey) → presignedUrl`
- **第二版**：实现 `COSStorageProvider`，配置页填 `secretId / secretKey / bucket / region`
- **大小限制**（可配置）：视频 500MB / 图片 20MB / 音频 50MB

### 7.4 标签系统

- `tags: string[]` 存 Material 表
- 全局聚合 `TagSuggestion` 缓存做 autocomplete
- 支持按标签筛选与批量打标签

### 7.5 联动

- **选题 → 作品**：选题 IDEA 可"标记为已采用"，关联 `relatedWorkId`，状态自动 `ADOPTED`
- **AI Chat 引用**：`@素材` 把素材作为上下文
- **文案优化结果**：可"保存为素材"一键存入 COPY 库

---

## 8. 技术栈

| 层级 | 选型 |
|---|---|
| 框架 | Next.js 15 (App Router) + React 19 |
| 语言 | TypeScript（严格模式） |
| ORM | Prisma |
| 数据库 | PostgreSQL 16 |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 图表 | Recharts |
| 表单 | React Hook Form + Zod |
| LLM SDK | Vercel AI SDK + `@ai-sdk/openai-compatible` |
| HTTP 客户端 | undici |
| 加密 | Node `crypto`（AES-256-GCM） |
| 任务调度 | node-cron |
| 富文本 | Tiptap |
| 文件上传 | Next.js Route Handler + Busboy（流式） |
| 状态管理 | Zustand + TanStack Query |
| 包管理 | pnpm |
| 代码质量 | ESLint + Prettier + tsc 严格模式 |

---

## 9. 部署

### 9.1 开发环境

- 本地 `pnpm dev`
- PostgreSQL 用 `docker-compose up -d` 起单容器

### 9.2 生产部署（腾讯云 124.222.64.26）

- 服务器装 Docker + Docker Compose
- 三个容器：`web`（Next.js）、`db`（PostgreSQL）、`proxy`（Caddy/Nginx）
- 数据卷：`/var/self-media/{db,uploads}` 持久化
- HTTPS：有域名走 Caddy 自动证书；无域名用 IP + 自签证书
- **访问保护**：公网入口要求单密码登录（密码哈希存环境变量，登录后 session cookie）

### 9.3 环境变量

```env
DATABASE_URL=postgresql://...
MASTER_KEY=                    # 32-byte hex，加密 Cookie / API Key
ADMIN_PASSWORD_HASH=           # bcrypt 哈希
SESSION_SECRET=                # session 签名密钥
NODE_ENV=production
STORAGE_TYPE=local             # local | cos
LOCAL_STORAGE_PATH=./data/uploads
# COS（第二版用）
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=
```

---

## 10. MVP 范围与迭代路线

### 10.1 MVP（v0.1）

**目标：跑通"配 Cookie → 拉数据 → 看仪表盘 → AI 分析 → 管素材"主流程。**

- 基础设施：脚手架、Prisma + PostgreSQL、加密工具、Docker 部署、单密码登录
- 平台抽象 + 抖音：Cookie 导入 / 校验 / 失效检测、作品列表 / 详情 / 粉丝画像三接口、定时同步、手动同步
- 作品管理：列表（筛选 / 排序 / 搜索）、详情页（数据 + 趋势图）
- 仪表盘：粉丝趋势、近 30 天作品汇总、Top5 作品
- 素材管理：7 种类型 CRUD、本地上传、标签筛选；选题看板视图
- LLM 配置：多 Provider 增删改、连通性测试、默认模型
- AI 分析（P0）：单作品复盘 / 选题建议 / 文案优化 + Prompt 模板可编辑
- AI Chat：自由对话 + `@` 引用 Work/Material + 多会话
- AI 分析历史：列表 + 详情
- 基础设置：同步频率、存储路径、默认模型、密码修改

**预估周期**：单人全职 4–6 周；兼职 8–12 周。

### 10.2 v0.2

- 评论同步 + 评论洞察（`COMMENT_INSIGHT`）
- 横向对比（`WORKS_COMPARE`）
- 趋势分析（`TREND`）
- 素材存储切 COS

### 10.3 v0.3

- 对标分析（`BENCHMARK`）+ 爆款参考自动抓取
- 第二个平台接入（B 站 / 小红书任选）
- 数据导出（CSV/Excel）
- AI 任务批量执行

### 10.4 明确不做（YAGNI）

- 多用户 / 团队协作
- 视频剪辑 / 发布功能
- 移动端原生 App（仅做基础响应式）
- 实时通知 / 推送
- 数据回填到抖音

---

## 11. 风险与开放问题

| 风险 | 等级 | 应对 |
|---|---|---|
| 抖音接口变动 | 中 | 抽象层 + 错误日志 + 单独可替换 |
| Cookie 频繁失效 | 中 | 健康检查 + 用户提示；建议专用浏览器 Profile |
| 大文件本地存储吃满磁盘 | 低（v0.1）/ 高（长期） | 抽象层就绪，到达阈值切 COS |
| 单密码登录被暴力破解 | 中 | 限频 + 失败计数锁定 + 强密码 |
| LLM 输出质量不稳定 | 中 | Prompt 模板可编辑 + 多 Provider 切换 |

**开放问题（实施阶段决定）**：

- 是否在 v0.1 就支持双因素或 IP 白名单进一步加固登录？
- Recharts 在大量数据点时的性能是否够用，还是需要 ECharts？
- 是否需要在前端缓存 Work 详情数据（TanStack Query 默认配置即可，可能不需要额外处理）？
