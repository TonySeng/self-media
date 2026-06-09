# Tauri 迁移与代码清理设计

- **日期**：2026-06-09
- **作者**：qianshengTao + Claude
- **状态**：草案，待用户评审

## 1. 背景

当前 Self-Media 是一个 **Next.js 15 (App Router) + Electron** 单体应用：

- 业务代码 100% 在 Next 项目里（68 条 API 路由 + 25 个页面 + 3500+ 行后端）
- Electron 生产模式 spawn 一个 Next standalone server 子进程，主窗口 loadURL 到本地端口
- 数据库 Prisma + SQLite（README 说的 PostgreSQL 已与现实不符）
- 关键 Electron 能力：Chrome Cookie 解密、抖音登录窗口、`webRequest.onBeforeRequest` 抓 msToken/a_bogus

用户希望"换更轻量的框架，并修代码冗余/错误"。

## 2. 目标与非目标

### 目标

- 用 **Tauri** 替换 Electron 当窗口壳
- 用 **Vite SPA** 替换 Next App Router 当前端
- 用 **Hono Node sidecar** 替换 Next API 路由
- 保留所有现有功能（抖音同步、AI 对话/批量生成、自动回复、素材管理、定时发布）
- 完成 **M 级代码清理**：修明显类型逃逸、TODO、git 误追踪、文档不一致

### 非目标

- 不改业务逻辑（Prisma schema、AI prompts、抖音抓取流程不动）
- 不引入新功能
- 不做大范围代码审查/抽象重构（属 L 级，独立立项）
- 不切换数据库（继续 Prisma + SQLite）
- 不实现完整的抖音 a_bogus 签名算法（继续走 Playwright webmssdk 方案）

## 3. 总体架构

```
┌─────────────────────────────────────────────────────┐
│ Tauri 壳（Rust 二进制 ~5MB）                          │
│ - 单实例锁、托盘菜单、自动更新                          │
│ - 启动 Node sidecar 子进程、生成 API token            │
│ - WebView2(Win) / WKWebView(Mac) 加载前端 dist        │
│ - 暴露 invoke('get_api_config') 给前端拿 port + token │
└──────────────────────┬──────────────────────────────┘
                       │ Tauri IPC
┌──────────────────────▼──────────────────────────────┐
│ Vite SPA 前端（dist/，~3MB gzip）                     │
│ - React 19 + TanStack Router（文件路由）              │
│ - TanStack Query 统一接口缓存与状态                   │
│ - shadcn/Tiptap/recharts/dnd-kit/sonner 保留          │
│ - lib/api.ts：fetch 包装，附 X-API-Token header        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / SSE 到 127.0.0.1:<random>
┌──────────────────────▼──────────────────────────────┐
│ Hono Node sidecar（Bun compile，~50MB 单文件 exe）    │
│ - 监听本地随机端口、token 鉴权中间件                    │
│ - 68 条路由从 src/app/api 平移                        │
│ - Prisma + SQLite（DB 路径 = Tauri appDataDir）       │
│ - node-cron / jose / bcrypt / AI SDK / COS 全保留     │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Playwright 子模块（按需启动）                     │ │
│ │ - 抖音公开接口签名（headless，复用 signer.ts）    │ │
│ │ - 抖音登录窗口（headed）                          │ │
│ │ - msToken/aBogus 抓取（CDP Network 事件）         │ │
│ │ - Chrome Cookie 解密（沿用现有 cookie-reader）    │ │
│ └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 启动流程

1. Tauri 主进程启动 → 创建 token（32-byte 随机），找空闲端口
2. Tauri spawn `server.exe`（Bun compile 产物），传入 `PORT` / `API_TOKEN` / `APP_DATA_DIR` 环境变量
3. Tauri 等 sidecar 健康检查 `/health` 返回 200
4. Tauri 创建主窗口，加载本地前端 `index.html`
5. 前端启动时调 `invoke('get_api_config')` 拿到 `{ port, token }`，存入 `axios`/`fetch` 默认 header
6. 后续所有请求都走 `http://127.0.0.1:<port>/api/...`，header 带 `X-API-Token: <token>`
7. sidecar 中间件校验 token，不通过 401

### 关闭流程

- Tauri 窗口关闭事件 → IPC 通知 sidecar 优雅关闭（节流 30s 等 cron 任务）→ 强杀
- 单实例锁保证不会并发启动多个 sidecar

## 4. 目录结构

重构后的仓库结构（pnpm workspace）：

```
self-media/
├── apps/
│   ├── tauri/                 # Tauri 壳
│   │   ├── src/
│   │   │   ├── main.rs        # 入口、sidecar 进程管理
│   │   │   ├── sidecar.rs     # spawn / 健康检查 / 关闭
│   │   │   └── commands.rs    # invoke 处理器
│   │   ├── tauri.conf.json
│   │   ├── Cargo.toml
│   │   └── icons/
│   ├── web/                   # Vite SPA
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── routes/        # TanStack Router 文件路由
│   │   │   │   ├── __root.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   └── _app/
│   │   │   │       ├── route.tsx       # 登录态守卫 layout
│   │   │   │       ├── dashboard.tsx
│   │   │   │       ├── works/
│   │   │   │       └── ...
│   │   │   ├── components/    # 从原 src/components 平移
│   │   │   ├── lib/
│   │   │   │   ├── api.ts     # fetch 包装
│   │   │   │   ├── tauri.ts   # invoke 桥接
│   │   │   │   └── query.ts   # TanStack Query client
│   │   │   └── styles/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── server/                # Hono Node sidecar
│       ├── src/
│       │   ├── index.ts       # Hono app + 中间件
│       │   ├── routes/        # 68 条路由按原结构平移
│       │   │   ├── auth.ts
│       │   │   ├── works.ts
│       │   │   └── ai/
│       │   ├── platforms/     # 从 src/lib/platforms 平移
│       │   ├── llm/           # 从 src/lib/llm 平移
│       │   ├── storage/       # 从 src/lib/storage 平移
│       │   ├── cron/          # 从 src/lib/cron 平移
│       │   ├── auto-reply/    # 从 src/lib/auto-reply 平移
│       │   ├── publish/       # 从 src/lib/publish 平移
│       │   ├── electron-replace/   # 替代 electron/src/* 的 Playwright 模块
│       │   │   ├── cookie-reader/  # 直接复用，DPAPI 解密不动
│       │   │   ├── login-window.ts # Playwright headed 实现
│       │   │   └── reply-sign.ts   # Playwright CDP 抓签名
│       │   ├── middleware/
│       │   │   └── auth.ts    # X-API-Token 校验
│       │   └── lib/           # crypto/auth/db/env/utils 等共用
│       ├── build.ts           # bun build --compile 脚本
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/                # 前后端共享 types
│       ├── src/
│       │   ├── api-types.ts   # Hono 路由的 typed RPC 导出
│       │   └── domain.ts      # 业务实体类型
│       └── package.json
├── prisma/                    # schema 不变，dev.db 不再追踪
├── pnpm-workspace.yaml
├── package.json               # 顶层只放 dev 编排脚本
└── docs/
```

**说明**：原有 `electron/`、`Dockerfile`、`docker-compose*.yml`、`Caddyfile` 在迁移完成后删除（Tauri 项目不需要 Docker，单机部署）。

## 5. 关键决策与依据

### 5.1 为什么是 Tauri 而不继续用 Electron

- 体积：Tauri ~5MB + sidecar ~50MB ≈ 55MB；Electron ~150MB
- 内存：Tauri 用系统 WebView，主进程内存约 30MB；Electron 主进程 + Chromium ~150MB
- 安全：Tauri 的能力配置粒度更细
- 代价：丢失 Electron `webRequest` API，由 Playwright 网络监听（`page.on('request')`，底层 CDP）补上

### 5.2 为什么前端选 Vite + TanStack Router

- 文件路由模式跟 Next App Router 心智一致，迁移摩擦最低
- 类型安全的路径参数和 search params
- 嵌套 layout 是头等公民（替代 `(app)/layout.tsx`）
- 与 TanStack Query 一体化，顺便解决组件里散乱的 `useState + fetch`

### 5.3 为什么后端选 Hono

- API 风格最接近 Next Route Handler，68 条路由迁移机械化
- 内置 SSE 流式响应（`c.streamSSE`），12 条 AI stream 路由零障碍
- 支持 Hono RPC，前后端类型贯通
- 体积小（~50KB）、Bun 兼容性好

### 5.4 为什么 Bun compile 打包 sidecar

| 选项 | 体积 | 启动 | 兼容性 | 推荐 |
|---|---|---|---|---|
| **Bun compile** | ~50MB | 100-200ms | 兼容 Node API + 原生模块 | ✅ |
| Node SEA | ~80MB | 200-400ms | 实验性，原生模块差 | ❌ |
| pkg | ~80MB | 300ms | 已停止维护 | ❌ |
| node.exe + 资源 | ~100MB | 300ms | 最稳但体积最大 | 备选 |

风险：Bun 对 `better-sqlite3` 等 N-API 原生模块兼容性需 PoC 验证（见 §10）。

### 5.5 为什么 HTTP localhost + token 通信

- SSE 流式直接复用，无需 Rust 桥接
- TanStack Query / Hono RPC 开箱即用
- 调试方便，浏览器直连本地端口即可
- token 解决"其他进程裸连"的安全问题
- 唯一缺点：偶发 Windows Defender 防火墙提示（仅 listen 本地，一般不弹）

### 5.6 为什么 Playwright 接管 Electron 三件原生事

- 抖音 signer 已在用 Playwright，复用同一依赖
- DPAPI Cookie 解密代码（300+ 行）保持 TypeScript，避免 Rust 重写
- CDP `Network.requestWillBeSent` 替代 `webRequest.onBeforeRequest`，行为更稳定
- 用户登录看到的是 Chromium 窗口而非原生窗口，可接受

## 6. 迁移路径

### 阶段 0：基础设施（1-2 天）

- 初始化 pnpm workspace，建 `apps/tauri`、`apps/web`、`apps/server`、`packages/shared`
- Tauri Rust 端：写 sidecar 启动 + token 生成 + invoke 处理器
- Hono：跑通 health 端点 + token 中间件
- Vite：跑通 hello world，能从 Tauri 拿 token 调 sidecar
- Bun compile PoC：编译一个最小 Hono + Prisma 程序，验证 better-sqlite3 能跑

### 阶段 1：数据层迁移（0.5 天）

- Prisma schema 不动
- 把 `src/lib/db.ts` 平移到 `apps/server/src/lib/db.ts`
- DB 路径改为读环境变量 `APP_DATA_DIR`，由 Tauri 注入

### 阶段 2：API 路由迁移（3-4 天）

按子目录批量迁，机械化转换：

```ts
// 原 Next：src/app/api/works/route.ts
export async function GET(req: Request) {
  const url = new URL(req.url);
  const platformAccountId = url.searchParams.get('platformAccountId');
  // ...
  return Response.json(data);
}

// 迁后 Hono：apps/server/src/routes/works.ts
app.get('/works', async (c) => {
  const platformAccountId = c.req.query('platformAccountId');
  // ...
  return c.json(data);
});
```

迁移顺序（先无依赖再有依赖）：

1. `auth/login` `auth/logout` `dashboard` `settings/*`
2. `materials/*` `works/*` `benchmark-*` `platforms/*`
3. `llm/*` `ai/*`（含 12 条 stream，重点验证 SSE）
4. `auto-reply/*` `publishes/*` `sync/*` `export/*`

### 阶段 3：Electron 原生功能用 Playwright 重写（2-3 天）

| 原 Electron 功能 | 替代实现 | 文件 |
|---|---|---|
| 读 Chrome Cookie | 沿用 `cookie-reader/`（不依赖 Electron API） | `apps/server/src/electron-replace/cookie-reader/` |
| 弹抖音登录窗口 | Playwright headed `chromium.launch({ headless: false })` + `BrowserContext.cookies()` | `apps/server/src/electron-replace/login-window.ts` |
| 抓 msToken/aBogus | Playwright headed + `page.on('request')` 监听 multi_publish | `apps/server/src/electron-replace/reply-sign.ts` |
| 单实例锁 | Tauri `tauri-plugin-single-instance` | `apps/tauri/src/main.rs` |

需小规模 PoC 验证：用户在 Playwright 弹出的 Chromium 里登录，回主程序后状态正确同步。

### 阶段 4：前端迁移（4-5 天）

- 路由：原 `src/app/(app)/works/page.tsx` → `apps/web/src/routes/_app/works/index.tsx`
- 组件：`src/components` 整体平移到 `apps/web/src/components`，去掉 `'use client'`
- API 调用：散乱的 `fetch('/api/...')` 包成 TanStack Query hooks
- 鉴权：`middleware.ts` 的逻辑挪到 `_app/route.tsx` 的 `beforeLoad` 守卫
- 流式：`useChat`（@ai-sdk/react）保留，把 `api: '/api/ai/chat'` 改成 sidecar URL

迁移顺序：登录 → 仪表盘 → 列表页 → 详情页 → AI 页面（最复杂）

### 阶段 5：Tauri 打包（1-2 天）

- `apps/server` 跑 `bun build --compile --target=bun-windows-x64 ./src/index.ts --outfile dist/server.exe`
- `apps/web` 跑 `vite build` 输出 `dist/`
- Tauri `tauri.conf.json` 配置：
  - `build.frontendDist = "../web/dist"`
  - `bundle.externalBin = ["binaries/server"]`
  - `bundle.resources` 包含 Playwright Chromium（按需）
- `pnpm tauri build --bundles nsis,msi` 出 Windows 安装包

### 阶段 6：M 级代码清理（1-2 天）

- 修 10 个文件里的 `as any`：列表见 §7
- `notify.ts:29` TODO：要么集成 nodemailer 要么明确标注未实现
- `endpoints.ts` 占位符：迁移到 Playwright CDP 后能真实抓取，补全
- 跑 `pnpm lint` 零警告
- 修 `.gitignore`，`git rm --cached` 误追踪的：
  - `electron/dist/`（即将整目录删除）
  - `dist-electron/`
  - `prisma/dev.db`
  - `prisma/dev.db.current-backup`
  - `self-media-0.1.0.tgz`
  - `fetch-sample.js`
- 删除重构后用不上的：
  - `electron/` 整个目录
  - `Dockerfile`、`docker-compose.yml`、`docker-compose.local.yml`、`docker-compose.prod.yml`
  - `Caddyfile`
  - `next.config.ts`、`next-env.d.ts`、`postcss.config.mjs`（postcss 进 web 子项目）
- 改 README：PostgreSQL → SQLite，Docker 部署 → Tauri 桌面端

### 阶段 7：回归测试（1-2 天）

- 现有 27 个 Vitest 测试迁到 `apps/server/tests`，跑通
- 手动跑一遍核心流程：登录 → 同步抖音作品 → AI 分析 → 自动回复 → 发布
- 对比新旧版打包大小、冷启动、内存占用，记录在 PR 描述

### 总工期估算

12-19 个工作日（不含意外阻塞）。关键路径：阶段 2（API 迁移）和阶段 4（前端迁移）。

## 7. M 级代码清理清单

### 7.1 已知 `as any` 文件（10 个，需逐一修正确类型）

- `src/app/(app)/materials/page.tsx`
- `src/app/(app)/settings/platforms/page.tsx`
- `src/app/(app)/works/[id]/page.tsx`
- `src/app/(app)/works/page.tsx`
- `src/app/(app)/ai/works-compare/page.tsx`
- `src/app/(app)/ai/chat/page.tsx`
- `src/components/layout/account-selector.tsx`
- `src/components/ai/reference-picker.tsx`
- `src/components/dashboard/top-works-list.tsx`
- `src/lib/platforms/douyin/endpoints.ts`

`src/app/api/benchmark-works/route.ts` 也有 `as any`，迁移到 Hono 时一并修。

### 7.2 已知 TODO/占位符

- `src/lib/auto-reply/notify.ts:29` —— 邮件未接 nodemailer，决策：保留 console.log 但加显眼日志和 UI 提示
- `src/lib/platforms/douyin/endpoints.ts:42, 53` —— `TODO_REPLACE_WITH_DEVTOOLS_CAPTURE`，迁到 Playwright 后用 CDP 抓真实 URL 替换

### 7.3 已知 git 误追踪文件

见阶段 6。

### 7.4 文档不一致

`README.md` 写 PostgreSQL，实际 SQLite。重写 README，覆盖：

- 新架构（Tauri + Vite + Hono + Playwright）
- 开发：`pnpm dev`（编排三端）
- 打包：`pnpm tauri build`
- 删掉腾讯云部署章节（不再适用）

## 8. 测试策略

- **单元测试**：保留并迁移现有 27 个 Vitest 测试到 `apps/server/tests`
- **API 集成测试**：每条迁移完的路由用 Hono 的 `app.fetch()` 起内存 server 跑断言
- **前端**：本次不引入新前端测试框架，依赖 lint + 手动回归
- **Tauri 打包烟雾测试**：编一个最小 PR 跑通 win-portable 构建产物，再启动验证窗口能开
- **手动回归**：阶段 7 列出的核心流程，由用户验收

## 9. 数据迁移

- 现有 `prisma/dev.db` 的数据需要从开发机搬到新版 Tauri 应用的 `appDataDir`
- 提供一次性迁移脚本：`scripts/migrate-db.mjs`，把指定路径的 db 复制到 Tauri appDataDir
- 第一次启动检测到 appDataDir 没 db 时，提示用户选择"从旧版导入"或"全新开始"

## 10. 风险与未决项

| 风险 | 等级 | 缓解 |
|---|---|---|
| Bun + better-sqlite3 兼容性 | 高 | 阶段 0 PoC，失败退回 node.exe + 资源目录 |
| Bun + Prisma 兼容性 | 中 | Prisma 6 已支持 Bun，PoC 中验证 |
| Playwright CDP 抓 multi_publish 替代 webRequest | 中 | 阶段 3 PoC，失败退回 Electron 子进程方案 |
| Tauri 打包 Playwright Chromium 体积膨胀 | 中 | 不打包，运行时 `playwright install chromium` 按需下载（首次启动 200MB 下载，后续无） |
| WebView2 Runtime 在 Win10 老机器缺失 | 低 | 安装包带 bootstrap 脚本 |
| 登录从原生 Electron 窗口换成 Playwright 窗口，UX 差异 | 低 | 弹窗前提示用户"将在新浏览器窗口打开" |

## 11. 开放问题（请用户确认）

无（所有关键决策已在 brainstorming 阶段敲定）。

如评审中发现遗漏，会回到本节追加。

## 12. 评审

- [ ] 用户审阅本设计
- [ ] 风险等级与缓解方案确认
- [ ] 工期估算可接受
- [ ] 通过后进入 writing-plans 阶段，输出可执行实施计划
