# 抖音集成 Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan 1 基础上接入抖音创作者中心数据：Cookie 导入与失效检测、作品列表/详情/粉丝画像三接口、定时 + 手动同步、作品页 UI 与趋势图。

**Architecture:** `lib/platforms/types.ts` 定义 `PlatformAdapter` 抽象接口；`lib/platforms/douyin/` 实现抖音 Adapter（cookie 解析、HTTP 客户端、typed API、sync 引擎）；`lib/platforms/registry.ts` 通过 `platform` 枚举派发。所有数据通过 Prisma 写入 PostgreSQL，`WorkMetric`/`AccountMetric` 作时序快照表。Cookie 经 AES-256-GCM 加密存 `PlatformAccount.cookieEncrypted`。同步入口三处：UI 手动按钮 → `POST /api/sync/run/:id`；node-cron 每日 02:00；新建 PlatformAccount 时一次性同步。Edge middleware (Plan 1) 已守卫所有非公开路径，本 Plan 不需要变更。

**Tech Stack:** Next.js 15 App Router · Prisma 6 · undici(http) · node-cron(调度) · Recharts(图表) · Vitest(测试) · Zod(校验) · 复用 Plan 1 的 `crypto.ts` / `db.ts` / `auth.ts` / shadcn/ui

**抓包前提：** 抖音创作者中心接口路径、参数签名（`_signature` / `X-Bogus` / `msToken` / `a_bogus`）未公开，且会随版本变化。本 Plan **不**实现签名算法（成本远超 MVP 价值），而是把签名所需参数**作为请求 query 透传**——用户在浏览器登录 `creator.douyin.com` 后，从 DevTools Network 面板抓取一次完整 URL（含已生成的 query），粘贴到 `lib/platforms/douyin/endpoints.ts`。Cookie 失效需重抓。这是个人 MVP 的务实路径。每条 endpoint 配套一个真实响应 JSON fixture（脱敏后存 `tests/fixtures/douyin/`）用于驱动单元测试。

---

## File Structure

新建/修改文件总览（具体每个任务还会再列）：

- 新建：`prisma/schema.prisma` 增量（PlatformAccount / Work / WorkMetric / AccountMetric / SyncJob + 枚举）
- 新建：`src/lib/platforms/types.ts`（PlatformAdapter / 标准化数据类型）
- 新建：`src/lib/platforms/registry.ts`（Adapter 派发）
- 新建：`src/lib/platforms/douyin/cookie.ts`（解析 + status 工具）
- 新建：`src/lib/platforms/douyin/endpoints.ts`（路径 + DevTools 抓包指南注释）
- 新建：`src/lib/platforms/douyin/http.ts`（undici 客户端，重试 / UA / Referer / 随机延时）
- 新建：`src/lib/platforms/douyin/api.ts`（getUserInfo / listWorks / getWorkDetail / getFansAnalysis）
- 新建：`src/lib/platforms/douyin/normalize.ts`（响应 JSON → 标准化字段映射）
- 新建：`src/lib/platforms/douyin/sync.ts`（同步引擎）
- 新建：`src/lib/platforms/douyin/index.ts`（DouyinAdapter export）
- 新建：`src/instrumentation.ts`（Next.js 启动钩子，注册 node-cron）
- 新建 API routes：
  - `src/app/api/platforms/douyin/accounts/route.ts`（GET 列表 / POST 新增）
  - `src/app/api/platforms/douyin/accounts/[id]/route.ts`（DELETE）
  - `src/app/api/sync/run/[accountId]/route.ts`（POST 手动触发）
  - `src/app/api/works/route.ts`（GET 列表）
  - `src/app/api/works/[id]/route.ts`（GET 详情含趋势）
- 新建 UI：
  - `src/app/(app)/settings/platforms/page.tsx`（账号管理）
  - `src/components/platforms/cookie-expired-banner.tsx`（顶部红条）
  - `src/components/platforms/sync-status-chip.tsx`（侧栏同步状态）
  - `src/app/(app)/works/page.tsx`（列表，覆盖 Plan 1 placeholder）
  - `src/app/(app)/works/[id]/page.tsx`（详情）
  - `src/components/works/metric-trend-chart.tsx`（Recharts 客户端组件）
- 新建测试：`tests/lib/platforms/douyin/*.test.ts` 多个
- 新建 fixtures：`tests/fixtures/douyin/{user-info,work-list,work-detail,fans-analysis}.json`
- 修改：`src/components/layout/sidebar.tsx` 加同步状态
- 修改：`AGENTS.md` 加抖音抓包说明（如需要）

---

## Phase A · 数据模型扩展

### Task 1: 新增 PlatformAccount 模型（含枚举）

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_platform_account/migration.sql`（由 `prisma migrate dev` 自动生成）

- [ ] **Step 1: 编辑 schema.prisma 追加枚举与模型**

在文件末尾（`Setting` 之后）追加：

```prisma
enum Platform {
  DOUYIN
}

enum CookieStatus {
  ACTIVE
  EXPIRED
  INVALID
}

model PlatformAccount {
  id              String       @id @default(cuid())
  platform        Platform
  nickname        String
  avatar          String?
  secUid          String       @unique
  cookieEncrypted String
  cookieStatus    CookieStatus @default(ACTIVE)
  lastSyncAt      DateTime?
  lastErrorAt     DateTime?
  lastError       String?
  createdAt       DateTime     @default(now())

  @@index([platform, cookieStatus])
}
```

- [ ] **Step 2: 生成迁移**

Run: `pnpm prisma migrate dev --name add_platform_account`
Expected: 生成 migration.sql；`pnpm prisma generate` 自动跑，client 类型刷新。

- [ ] **Step 3: 验证类型**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add PlatformAccount model with Platform/CookieStatus enums"
```

### Task 2: 新增 Work + WorkMetric 模型

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 追加模型**

```prisma
model Work {
  id                String   @id @default(cuid())
  platformAccountId String
  platformWorkId    String
  title             String
  description       String?
  coverUrl          String?
  videoUrl          String?
  duration          Int?
  publishedAt       DateTime
  rawData           Json
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  account PlatformAccount @relation(fields: [platformAccountId], references: [id], onDelete: Cascade)
  metrics WorkMetric[]

  @@unique([platformAccountId, platformWorkId])
  @@index([platformAccountId, publishedAt])
}

model WorkMetric {
  id         String   @id @default(cuid())
  workId     String
  snapshotAt DateTime @default(now())
  play       Int
  like       Int
  comment    Int
  share      Int
  collect    Int
  finishRate Float?
  rawData    Json

  work Work @relation(fields: [workId], references: [id], onDelete: Cascade)

  @@index([workId, snapshotAt])
}
```

并在 `PlatformAccount` 中加反向关系：

```prisma
model PlatformAccount {
  // …已有字段…
  works Work[]
  accountMetrics AccountMetric[]
  syncJobs SyncJob[]
}
```

注意：`AccountMetric` 和 `SyncJob` 在 Task 3 才创建，但反向关系一次性写好可以避免下次再改 schema；如果 Prisma 此刻报缺失，**这一步把 accountMetrics 和 syncJobs 两行先注释掉**，Task 3 再启用。

- [ ] **Step 2: 迁移**

Run: `pnpm prisma migrate dev --name add_work_and_work_metric`
Expected: SQL 包含 CREATE TABLE Work / WorkMetric 与索引。

- [ ] **Step 3: 验证类型**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add prisma
git commit -m "feat(db): add Work and WorkMetric models with snapshot index"
```

### Task 3: 新增 AccountMetric + SyncJob 模型

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 追加模型**

```prisma
enum SyncJobType {
  FULL
  INCREMENTAL
  MANUAL
}

enum SyncJobStatus {
  RUNNING
  DONE
  FAILED
}

model AccountMetric {
  id                String   @id @default(cuid())
  platformAccountId String
  snapshotAt        DateTime @default(now())
  totalFans         Int
  genderDist        Json?
  ageDist           Json?
  regionDist        Json?
  rawData           Json

  account PlatformAccount @relation(fields: [platformAccountId], references: [id], onDelete: Cascade)

  @@index([platformAccountId, snapshotAt])
}

model SyncJob {
  id                String        @id @default(cuid())
  platformAccountId String
  type              SyncJobType
  status            SyncJobStatus @default(RUNNING)
  startedAt         DateTime      @default(now())
  finishedAt        DateTime?
  error             String?
  stats             Json?

  account PlatformAccount @relation(fields: [platformAccountId], references: [id], onDelete: Cascade)

  @@index([platformAccountId, startedAt])
}
```

如果 Task 2 把反向关系注释掉了，现在去掉注释。

- [ ] **Step 2: 迁移**

Run: `pnpm prisma migrate dev --name add_account_metric_and_sync_job`
Expected: 生成新 migration。

- [ ] **Step 3: 验证类型**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add prisma
git commit -m "feat(db): add AccountMetric and SyncJob models"
```

---

## Phase B · 平台抽象与 Cookie 处理

### Task 4: 定义 PlatformAdapter 抽象接口

**Files:**
- Create: `src/lib/platforms/types.ts`
- Create: `src/lib/platforms/registry.ts`

- [ ] **Step 1: 写 `types.ts`**

```ts
import type { Platform } from '@prisma/client';

export type StandardizedWork = {
  platformWorkId: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  duration: number | null;
  publishedAt: Date;
  rawData: unknown;
};

export type StandardizedWorkMetric = {
  platformWorkId: string;
  play: number;
  like: number;
  comment: number;
  share: number;
  collect: number;
  finishRate: number | null;
  rawData: unknown;
};

export type StandardizedAccountInfo = {
  nickname: string;
  avatar: string | null;
  secUid: string;
};

export type StandardizedAccountMetric = {
  totalFans: number;
  genderDist: unknown | null;
  ageDist: unknown | null;
  regionDist: unknown | null;
  rawData: unknown;
};

export type CookieValidationResult =
  | { ok: true; account: StandardizedAccountInfo }
  | { ok: false; reason: 'expired' | 'invalid'; message: string };

export interface PlatformAdapter {
  readonly platform: Platform;
  validateCookie(cookie: string): Promise<CookieValidationResult>;
  fetchWorks(cookie: string, secUid: string): Promise<{
    works: StandardizedWork[];
    metrics: StandardizedWorkMetric[];
  }>;
  fetchWorkDetail(cookie: string, platformWorkId: string): Promise<{
    work: StandardizedWork;
    metric: StandardizedWorkMetric;
  }>;
  fetchAccountMetric(cookie: string, secUid: string): Promise<StandardizedAccountMetric>;
}
```

- [ ] **Step 2: 写 `registry.ts`**

```ts
import type { Platform } from '@prisma/client';
import type { PlatformAdapter } from './types';
import { douyinAdapter } from './douyin';

const adapters: Record<Platform, PlatformAdapter> = {
  DOUYIN: douyinAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  return adapters[platform];
}
```

注意：`./douyin` 此刻还不存在，会被后续任务创建。这个文件先写，等 Task 9 完成后能编译。**不要现在跑 tsc**。

- [ ] **Step 3: 提交**

```bash
git add src/lib/platforms/types.ts src/lib/platforms/registry.ts
git commit -m "feat(platforms): add PlatformAdapter interface and registry"
```

### Task 5: Douyin Cookie 解析 (TDD)

**Files:**
- Create: `src/lib/platforms/douyin/cookie.ts`
- Test: `tests/lib/platforms/douyin/cookie.test.ts`

抖音 Cookie 关键字段：`sessionid_ss` / `passport_csrf_token` / `ttwid` / `odin_tt`。`sessionid_ss` 缺失或为空即视为无效。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { parseCookieString, parseCookieJson, hasRequiredKeys } from '@/lib/platforms/douyin/cookie';

describe('parseCookieString', () => {
  it('parses semicolon-delimited cookie header', () => {
    const out = parseCookieString('sessionid_ss=abc; ttwid=xyz; foo=bar');
    expect(out).toEqual({ sessionid_ss: 'abc', ttwid: 'xyz', foo: 'bar' });
  });

  it('trims whitespace', () => {
    expect(parseCookieString('  a=1 ;b=2  ')).toEqual({ a: '1', b: '2' });
  });

  it('returns empty object for empty input', () => {
    expect(parseCookieString('')).toEqual({});
  });
});

describe('parseCookieJson', () => {
  it('accepts EditThisCookie-style array', () => {
    const json = JSON.stringify([
      { name: 'sessionid_ss', value: 'abc' },
      { name: 'ttwid', value: 'xyz' },
    ]);
    expect(parseCookieJson(json)).toEqual({ sessionid_ss: 'abc', ttwid: 'xyz' });
  });

  it('accepts plain {key:value} object', () => {
    expect(parseCookieJson('{"a":"1","b":"2"}')).toEqual({ a: '1', b: '2' });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCookieJson('not-json')).toThrow();
  });
});

describe('hasRequiredKeys', () => {
  it('returns true when sessionid_ss present', () => {
    expect(hasRequiredKeys({ sessionid_ss: 'x', ttwid: 'y' })).toBe(true);
  });

  it('returns false when sessionid_ss missing', () => {
    expect(hasRequiredKeys({ ttwid: 'y' })).toBe(false);
  });

  it('returns false when sessionid_ss empty', () => {
    expect(hasRequiredKeys({ sessionid_ss: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/platforms/douyin/cookie.test.ts`
Expected: 全部失败（找不到模块）。

- [ ] **Step 3: 实现 `cookie.ts`**

```ts
export type CookieMap = Record<string, string>;

export function parseCookieString(raw: string): CookieMap {
  const out: CookieMap = {};
  if (!raw.trim()) return out;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function parseCookieJson(raw: string): CookieMap {
  const data: unknown = JSON.parse(raw);
  if (Array.isArray(data)) {
    const out: CookieMap = {};
    for (const item of data) {
      if (
        item && typeof item === 'object' &&
        'name' in item && 'value' in item &&
        typeof item.name === 'string' && typeof item.value === 'string'
      ) {
        out[item.name] = item.value;
      }
    }
    return out;
  }
  if (data && typeof data === 'object') {
    const out: CookieMap = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }
  throw new Error('Cookie JSON must be an array or object');
}

export function serializeCookie(map: CookieMap): string {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

const REQUIRED = ['sessionid_ss'] as const;

export function hasRequiredKeys(map: CookieMap): boolean {
  return REQUIRED.every((k) => typeof map[k] === 'string' && map[k].length > 0);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/platforms/douyin/cookie.test.ts`
Expected: 9/9 passed.

- [ ] **Step 5: 提交**

```bash
git add src/lib/platforms/douyin/cookie.ts tests/lib/platforms/douyin/cookie.test.ts
git commit -m "feat(douyin): cookie parsing for string and JSON formats"
```

---

## Phase C · 抖音 HTTP 客户端与 API

### Task 6: HTTP 客户端 — UA / Referer / 重试 / 限频

**Files:**
- Create: `src/lib/platforms/douyin/http.ts`
- Test: `tests/lib/platforms/douyin/http.test.ts`

依赖：`undici`（Next 15 已传递依赖，但显式装一下保险）。先 `pnpm add undici`。

- [ ] **Step 1: 装依赖并提交锁文件**

Run: `pnpm add undici`
Expected: package.json + pnpm-lock.yaml 改动。

- [ ] **Step 2: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { douyinFetch, sleep } from '@/lib/platforms/douyin/http';

let agent: MockAgent;
let original: Dispatcher;

beforeEach(() => {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  setGlobalDispatcher(original);
  await agent.close();
});

describe('douyinFetch', () => {
  it('sends real UA and Referer headers', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/x', method: 'GET' })
      .reply(200, { ok: 1 }, { headers: { 'content-type': 'application/json' } });

    const res = await douyinFetch('https://creator.douyin.com/x', { cookie: 'sessionid_ss=a' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('retries 3 times on 5xx then succeeds', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/y', method: 'GET' }).reply(500, '').times(2);
    pool.intercept({ path: '/y', method: 'GET' }).reply(200, { ok: 1 });

    const res = await douyinFetch('https://creator.douyin.com/y', { cookie: 'sessionid_ss=a', retryDelayMs: 1 });
    expect(res.status).toBe(200);
  });

  it('throws after exhausting retries', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/z', method: 'GET' }).reply(500, '').times(4);

    await expect(
      douyinFetch('https://creator.douyin.com/z', { cookie: 'sessionid_ss=a', retryDelayMs: 1 }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe('sleep', () => {
  it('resolves after at least the given ms', async () => {
    const t0 = Date.now();
    await sleep(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm test tests/lib/platforms/douyin/http.test.ts`
Expected: 失败（模块不存在）。

- [ ] **Step 4: 实现 `http.ts`**

```ts
import { request } from 'undici';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36';

export type DouyinFetchOptions = {
  cookie: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  maxRetries?: number;
  retryDelayMs?: number;
};

export type DouyinResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function douyinFetch(url: string, opts: DouyinFetchOptions): Promise<DouyinResponse> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.retryDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await request(url, {
        method: opts.method ?? 'GET',
        headers: {
          'User-Agent': UA,
          Referer: 'https://creator.douyin.com/',
          Cookie: opts.cookie,
          Accept: 'application/json, text/plain, */*',
          ...(opts.headers ?? {}),
        },
        body: opts.body,
      });
      if (res.statusCode >= 500 && attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }
      if (res.statusCode >= 400) {
        const text = await res.body.text();
        throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
      }
      const buf = await res.body.arrayBuffer();
      return {
        status: res.statusCode,
        headers: res.headers,
        json: async () => JSON.parse(Buffer.from(buf).toString('utf8')) as unknown,
        text: async () => Buffer.from(buf).toString('utf8'),
      };
    } catch (e) {
      lastErr = e;
      if (attempt >= maxRetries) throw e;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }
  throw lastErr ?? new Error('douyinFetch: unreachable');
}

export function randomDelayMs(min = 1000, max = 3000): number {
  return Math.floor(Math.random() * (max - min)) + min;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test tests/lib/platforms/douyin/http.test.ts`
Expected: 4/4 passed.

- [ ] **Step 6: 提交**

```bash
git add src/lib/platforms/douyin/http.ts tests/lib/platforms/douyin/http.test.ts package.json pnpm-lock.yaml
git commit -m "feat(douyin): http client with UA, Referer, exponential retry"
```

### Task 7: Endpoints 配置文件 + DevTools 抓包指南

**Files:**
- Create: `src/lib/platforms/douyin/endpoints.ts`
- Create: `tests/fixtures/douyin/user-info.json`
- Create: `tests/fixtures/douyin/work-list.json`
- Create: `tests/fixtures/douyin/work-detail.json`
- Create: `tests/fixtures/douyin/fans-analysis.json`

接口路径与签名 query（`_signature` / `X-Bogus` / `msToken` / `a_bogus`）会随抖音版本变。本文件把 URL **作为模板**配置；用户在 DevTools Network 抓包后，把完整 URL（含 query）粘贴回来。

- [ ] **Step 1: 写 `endpoints.ts`**

```ts
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
```

- [ ] **Step 2: 创建 fixture 占位**

每个 JSON 文件写一个**最小可解析**结构，让 normalize 测试能跑。**这些只是结构示意**——用户实际抓包后应替换为真响应（脱敏）。

`tests/fixtures/douyin/user-info.json`:
```json
{
  "status_code": 0,
  "user": {
    "sec_uid": "MS4wLjABAAAA_test_sec_uid",
    "nickname": "测试昵称",
    "avatar_thumb": { "url_list": ["https://example.com/avatar.jpg"] }
  }
}
```

`tests/fixtures/douyin/work-list.json`:
```json
{
  "status_code": 0,
  "max_cursor": 0,
  "has_more": false,
  "aweme_list": [
    {
      "aweme_id": "7300000000000000001",
      "desc": "示例作品标题",
      "create_time": 1748467200,
      "video": {
        "duration": 30000,
        "cover": { "url_list": ["https://example.com/cover.jpg"] },
        "play_addr": { "url_list": ["https://example.com/play.mp4"] }
      },
      "statistics": {
        "play_count": 1000,
        "digg_count": 100,
        "comment_count": 10,
        "share_count": 5,
        "collect_count": 8
      }
    }
  ]
}
```

`tests/fixtures/douyin/work-detail.json`:
```json
{
  "status_code": 0,
  "aweme_detail": {
    "aweme_id": "7300000000000000001",
    "desc": "示例作品标题",
    "create_time": 1748467200,
    "video": {
      "duration": 30000,
      "cover": { "url_list": ["https://example.com/cover.jpg"] },
      "play_addr": { "url_list": ["https://example.com/play.mp4"] }
    },
    "statistics": {
      "play_count": 1500,
      "digg_count": 150,
      "comment_count": 20,
      "share_count": 8,
      "collect_count": 12,
      "finish_rate": 0.42
    }
  }
}
```

`tests/fixtures/douyin/fans-analysis.json`:
```json
{
  "status_code": 0,
  "data": {
    "total_fans": 12345,
    "gender_distribution": [
      { "key": "male", "value": 0.6 },
      { "key": "female", "value": 0.4 }
    ],
    "age_distribution": [
      { "key": "18-24", "value": 0.3 },
      { "key": "25-30", "value": 0.5 },
      { "key": "31-40", "value": 0.2 }
    ],
    "region_distribution": [
      { "key": "广东", "value": 0.2 },
      { "key": "北京", "value": 0.15 }
    ]
  }
}
```

- [ ] **Step 3: 验证类型**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误（registry.ts 仍然会报 douyin module 缺失，这步**只对 endpoints.ts 单独验证**：`pnpm exec tsc --noEmit src/lib/platforms/douyin/endpoints.ts` 或忽略此步等到 Task 9 完成）。

如果 tsc 报 registry 缺 douyin，跳过这步，到 Task 9 一起验证。

- [ ] **Step 4: 提交**

```bash
git add src/lib/platforms/douyin/endpoints.ts tests/fixtures/douyin/
git commit -m "feat(douyin): endpoints config and response fixtures"
```

### Task 8: Normalize（响应 → 标准化字段）TDD

**Files:**
- Create: `src/lib/platforms/douyin/normalize.ts`
- Test: `tests/lib/platforms/douyin/normalize.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeUserInfo,
  normalizeWorkList,
  normalizeWorkDetail,
  normalizeFansAnalysis,
} from '@/lib/platforms/douyin/normalize';

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/douyin', name), 'utf8')) as unknown;

describe('normalizeUserInfo', () => {
  it('extracts secUid / nickname / avatar', () => {
    expect(normalizeUserInfo(fixture('user-info.json'))).toEqual({
      secUid: 'MS4wLjABAAAA_test_sec_uid',
      nickname: '测试昵称',
      avatar: 'https://example.com/avatar.jpg',
    });
  });

  it('throws on non-zero status_code', () => {
    expect(() => normalizeUserInfo({ status_code: 8, user: null })).toThrow();
  });
});

describe('normalizeWorkList', () => {
  it('returns parallel works/metrics arrays', () => {
    const out = normalizeWorkList(fixture('work-list.json'));
    expect(out.works).toHaveLength(1);
    expect(out.metrics).toHaveLength(1);
    expect(out.works[0]).toMatchObject({
      platformWorkId: '7300000000000000001',
      title: '示例作品标题',
      duration: 30000,
      coverUrl: 'https://example.com/cover.jpg',
    });
    expect(out.works[0].publishedAt).toBeInstanceOf(Date);
    expect(out.metrics[0]).toMatchObject({
      platformWorkId: '7300000000000000001',
      play: 1000,
      like: 100,
      comment: 10,
      share: 5,
      collect: 8,
    });
  });
});

describe('normalizeWorkDetail', () => {
  it('returns one work + one metric (with finishRate)', () => {
    const out = normalizeWorkDetail(fixture('work-detail.json'));
    expect(out.work.platformWorkId).toBe('7300000000000000001');
    expect(out.metric.finishRate).toBe(0.42);
  });
});

describe('normalizeFansAnalysis', () => {
  it('extracts total fans and distributions', () => {
    const out = normalizeFansAnalysis(fixture('fans-analysis.json'));
    expect(out.totalFans).toBe(12345);
    expect(out.genderDist).toBeTruthy();
    expect(out.ageDist).toBeTruthy();
    expect(out.regionDist).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/platforms/douyin/normalize.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现 `normalize.ts`**

```ts
import type {
  StandardizedAccountInfo,
  StandardizedAccountMetric,
  StandardizedWork,
  StandardizedWorkMetric,
} from '../types';

function pickUrl(obj: unknown): string | null {
  if (obj && typeof obj === 'object' && 'url_list' in obj) {
    const list = (obj as { url_list?: unknown }).url_list;
    if (Array.isArray(list) && typeof list[0] === 'string') return list[0];
  }
  return null;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function expectOk(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') throw new Error('Empty response');
  const obj = payload as Record<string, unknown>;
  if (typeof obj.status_code === 'number' && obj.status_code !== 0) {
    throw new Error(`Douyin status_code=${obj.status_code}`);
  }
  return obj;
}

export function normalizeUserInfo(raw: unknown): StandardizedAccountInfo {
  const obj = expectOk(raw);
  const user = obj.user as Record<string, unknown> | null;
  if (!user) throw new Error('user field missing');
  return {
    secUid: asString(user.sec_uid),
    nickname: asString(user.nickname),
    avatar: pickUrl(user.avatar_thumb),
  };
}

function normalizeAweme(aweme: Record<string, unknown>): {
  work: StandardizedWork;
  metric: StandardizedWorkMetric;
} {
  const id = asString(aweme.aweme_id);
  const video = (aweme.video ?? {}) as Record<string, unknown>;
  const stats = (aweme.statistics ?? {}) as Record<string, unknown>;
  const createTime = asNumber(aweme.create_time);
  const work: StandardizedWork = {
    platformWorkId: id,
    title: asString(aweme.desc),
    description: asString(aweme.desc) || null,
    coverUrl: pickUrl(video.cover),
    videoUrl: pickUrl(video.play_addr),
    duration: video.duration === undefined ? null : asNumber(video.duration),
    publishedAt: new Date(createTime * 1000),
    rawData: aweme,
  };
  const metric: StandardizedWorkMetric = {
    platformWorkId: id,
    play: asNumber(stats.play_count),
    like: asNumber(stats.digg_count),
    comment: asNumber(stats.comment_count),
    share: asNumber(stats.share_count),
    collect: asNumber(stats.collect_count),
    finishRate:
      typeof stats.finish_rate === 'number' && Number.isFinite(stats.finish_rate)
        ? stats.finish_rate
        : null,
    rawData: stats,
  };
  return { work, metric };
}

export function normalizeWorkList(raw: unknown): {
  works: StandardizedWork[];
  metrics: StandardizedWorkMetric[];
} {
  const obj = expectOk(raw);
  const list = Array.isArray(obj.aweme_list) ? obj.aweme_list : [];
  const works: StandardizedWork[] = [];
  const metrics: StandardizedWorkMetric[] = [];
  for (const item of list) {
    if (item && typeof item === 'object') {
      const { work, metric } = normalizeAweme(item as Record<string, unknown>);
      works.push(work);
      metrics.push(metric);
    }
  }
  return { works, metrics };
}

export function normalizeWorkDetail(raw: unknown): {
  work: StandardizedWork;
  metric: StandardizedWorkMetric;
} {
  const obj = expectOk(raw);
  const detail = obj.aweme_detail as Record<string, unknown> | undefined;
  if (!detail) throw new Error('aweme_detail missing');
  return normalizeAweme(detail);
}

export function normalizeFansAnalysis(raw: unknown): StandardizedAccountMetric {
  const obj = expectOk(raw);
  const data = (obj.data ?? {}) as Record<string, unknown>;
  return {
    totalFans: asNumber(data.total_fans),
    genderDist: data.gender_distribution ?? null,
    ageDist: data.age_distribution ?? null,
    regionDist: data.region_distribution ?? null,
    rawData: data,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/platforms/douyin/normalize.test.ts`
Expected: 6/6 passed.

- [ ] **Step 5: 提交**

```bash
git add src/lib/platforms/douyin/normalize.ts tests/lib/platforms/douyin/normalize.test.ts
git commit -m "feat(douyin): normalize raw responses to standardized types"
```

### Task 9: API 方法 + DouyinAdapter 实例

**Files:**
- Create: `src/lib/platforms/douyin/api.ts`
- Create: `src/lib/platforms/douyin/index.ts`
- Test: `tests/lib/platforms/douyin/api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { douyinAdapter } from '@/lib/platforms/douyin';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/douyin', name), 'utf8');

let agent: MockAgent;
let original: Dispatcher;

beforeEach(() => {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  setGlobalDispatcher(original);
  await agent.close();
});

describe('douyinAdapter.validateCookie', () => {
  it('returns ok=true with account info on 200', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: /\/web\/api\/media\/user\/info/, method: 'GET' })
      .reply(200, JSON.parse(fixture('user-info.json')), {
        headers: { 'content-type': 'application/json' },
      });
    const r = await douyinAdapter.validateCookie('sessionid_ss=valid');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.nickname).toBe('测试昵称');
  });

  it('returns ok=false with reason=invalid when sessionid_ss missing', async () => {
    const r = await douyinAdapter.validateCookie('foo=bar');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('returns ok=false with reason=expired on 401/403', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: /\/web\/api\/media\/user\/info/, method: 'GET' })
      .reply(401, '');
    const r = await douyinAdapter.validateCookie('sessionid_ss=stale');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/lib/platforms/douyin/api.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现 `api.ts`**

```ts
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
```

- [ ] **Step 4: 实现 `index.ts`（DouyinAdapter）**

```ts
import type { PlatformAdapter, CookieValidationResult } from '../types';
import { hasRequiredKeys, parseCookieString } from './cookie';
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
      const msg = e instanceof Error ? e.message : String(e);
      if (/HTTP 40[13]/.test(msg)) {
        return { ok: false, reason: 'expired', message: 'Cookie 已失效，请重新导入' };
      }
      return { ok: false, reason: 'invalid', message: msg };
    }
  },

  fetchWorks: (cookie, secUid) => listWorks(cookie, secUid),
  fetchWorkDetail: (cookie, awemeId) => getWorkDetail(cookie, awemeId),
  fetchAccountMetric: (cookie) => getFansAnalysis(cookie),
};
```

- [ ] **Step 5: 跑测试 + tsc**

Run: `pnpm test tests/lib/platforms/douyin/api.test.ts && pnpm exec tsc --noEmit`
Expected: 3/3 passed；tsc 无错（registry.ts 现在能解析）。

- [ ] **Step 6: 提交**

```bash
git add src/lib/platforms/douyin/api.ts src/lib/platforms/douyin/index.ts tests/lib/platforms/douyin/api.test.ts
git commit -m "feat(douyin): typed API methods and DouyinAdapter implementation"
```

---

## Phase D · 账号管理 API

### Task 10: POST/GET /api/platforms/douyin/accounts

**Files:**
- Create: `src/app/api/platforms/douyin/accounts/route.ts`
- Test: `tests/api/platforms/accounts.test.ts`

**前置说明：** Plan 1 的 middleware 已经守卫了 `/api/*`（除 login/logout）。后续 API route 假设请求已通过认证；不需要在 handler 里再 check session。

- [ ] **Step 1: 写失败测试（POST 流程）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from '@/app/api/platforms/douyin/accounts/route';
import { db } from '@/lib/db';

vi.mock('@/lib/platforms/douyin', () => ({
  douyinAdapter: {
    platform: 'DOUYIN',
    validateCookie: vi.fn(async () => ({
      ok: true,
      account: { secUid: 'sec_1', nickname: '某人', avatar: null },
    })),
  },
}));

beforeEach(async () => {
  await db.platformAccount.deleteMany();
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/platforms/douyin/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/platforms/douyin/accounts', () => {
  it('rejects empty cookie', async () => {
    const res = await POST(req({ cookie: '' }));
    expect(res.status).toBe(400);
  });

  it('creates account on valid cookie', async () => {
    const res = await POST(req({ cookie: 'sessionid_ss=v' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; nickname: string };
    expect(json.nickname).toBe('某人');
    const row = await db.platformAccount.findUnique({ where: { secUid: 'sec_1' } });
    expect(row).not.toBeNull();
    expect(row?.cookieEncrypted).not.toContain('sessionid_ss=v');
  });
});

describe('GET /api/platforms/douyin/accounts', () => {
  it('returns accounts without cookieEncrypted', async () => {
    await db.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: 'A',
        secUid: 'x',
        cookieEncrypted: 'encrypted-blob',
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<Record<string, unknown>>;
    expect(json[0]?.nickname).toBe('A');
    expect('cookieEncrypted' in (json[0] ?? {})).toBe(false);
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/api/platforms/accounts.test.ts`
Expected: 失败（route 不存在）。

- [ ] **Step 3: 实现 route**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { douyinAdapter } from '@/lib/platforms/douyin';

const Body = z.object({ cookie: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const validation = await douyinAdapter.validateCookie(parsed.data.cookie);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason, message: validation.message },
      { status: 400 },
    );
  }
  const { secUid, nickname, avatar } = validation.account;
  const account = await db.platformAccount.upsert({
    where: { secUid },
    create: {
      platform: 'DOUYIN',
      secUid,
      nickname,
      avatar,
      cookieEncrypted: encrypt(parsed.data.cookie),
      cookieStatus: 'ACTIVE',
    },
    update: {
      nickname,
      avatar,
      cookieEncrypted: encrypt(parsed.data.cookie),
      cookieStatus: 'ACTIVE',
      lastError: null,
      lastErrorAt: null,
    },
  });
  return NextResponse.json(
    {
      id: account.id,
      platform: account.platform,
      nickname: account.nickname,
      avatar: account.avatar,
      cookieStatus: account.cookieStatus,
      lastSyncAt: account.lastSyncAt,
      createdAt: account.createdAt,
    },
    { status: 201 },
  );
}

export async function GET(): Promise<NextResponse> {
  const accounts = await db.platformAccount.findMany({
    where: { platform: 'DOUYIN' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      platform: true,
      nickname: true,
      avatar: true,
      secUid: true,
      cookieStatus: true,
      lastSyncAt: true,
      lastError: true,
      lastErrorAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(accounts);
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/api/platforms/accounts.test.ts`
Expected: 3/3 passed.

注意：测试需要真实数据库。**前置条件**：本地 PostgreSQL 已起、`DATABASE_URL` 在 `.env.test` 或 `.env` 指向干净库。如果没有，先 `docker-compose up -d` 起数据库再跑。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/platforms/douyin/accounts tests/api/platforms
git commit -m "feat(api): POST/GET /api/platforms/douyin/accounts with cookie encryption"
```

### Task 11: DELETE /api/platforms/douyin/accounts/[id]

**Files:**
- Create: `src/app/api/platforms/douyin/accounts/[id]/route.ts`

- [ ] **Step 1: 实现 DELETE**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    await db.platformAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
```

> Next 15 的 dynamic route 参数现在是 Promise，需要 await。详见 `node_modules/next/dist/docs/`。

- [ ] **Step 2: 写测试**

`tests/api/platforms/account-delete.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/platforms/douyin/accounts/[id]/route';
import { db } from '@/lib/db';

beforeEach(async () => { await db.platformAccount.deleteMany(); });

describe('DELETE /api/platforms/douyin/accounts/[id]', () => {
  it('deletes existing account (cascades works/metrics)', async () => {
    const a = await db.platformAccount.create({
      data: { platform: 'DOUYIN', nickname: 'X', secUid: 'sx', cookieEncrypted: 'e' },
    });
    const res = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: a.id }) });
    expect(res.status).toBe(200);
    expect(await db.platformAccount.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it('returns 404 on unknown id', async () => {
    const res = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm test tests/api/platforms/account-delete.test.ts`
Expected: 2/2 passed.

- [ ] **Step 4: 提交**

```bash
git add src/app/api/platforms/douyin/accounts/'[id]' tests/api/platforms/account-delete.test.ts
git commit -m "feat(api): DELETE /api/platforms/douyin/accounts/[id]"
```

---

## Phase E · 同步引擎 + 调度

### Task 12: 同步引擎核心 (lib/platforms/douyin/sync.ts)

**Files:**
- Create: `src/lib/platforms/douyin/sync.ts`
- Test: `tests/lib/platforms/douyin/sync.test.ts`

同步流程：
1. 读 PlatformAccount，解密 cookie
2. 写一条 `SyncJob`（status=RUNNING）
3. 拉作品列表 + 粉丝画像（限频随机 sleep 1-3s）
4. upsert Work（按 `(platformAccountId, platformWorkId)` 唯一约束）；每条都新建一条 WorkMetric
5. 新建一条 AccountMetric
6. 失败：更新 SyncJob status=FAILED + error；如果是 expired，把 PlatformAccount.cookieStatus 改 EXPIRED
7. 成功：SyncJob status=DONE + stats，PlatformAccount.lastSyncAt + cookieStatus=ACTIVE

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { runSync } from '@/lib/platforms/douyin/sync';

vi.mock('@/lib/platforms/douyin/api', () => ({
  listWorks: vi.fn(),
  getFansAnalysis: vi.fn(),
}));

import { listWorks, getFansAnalysis } from '@/lib/platforms/douyin/api';

beforeEach(async () => {
  await db.workMetric.deleteMany();
  await db.work.deleteMany();
  await db.accountMetric.deleteMany();
  await db.syncJob.deleteMany();
  await db.platformAccount.deleteMany();
  vi.clearAllMocks();
});

async function makeAccount() {
  return db.platformAccount.create({
    data: {
      platform: 'DOUYIN',
      nickname: 'T',
      secUid: 'sec',
      cookieEncrypted: encrypt('sessionid_ss=v'),
    },
  });
}

describe('runSync', () => {
  it('upserts works, snapshots metrics, and account metric', async () => {
    vi.mocked(listWorks).mockResolvedValue({
      works: [{
        platformWorkId: 'a1', title: 't', description: null, coverUrl: null,
        videoUrl: null, duration: 30, publishedAt: new Date('2026-01-01'),
        rawData: {},
      }],
      metrics: [{
        platformWorkId: 'a1', play: 10, like: 1, comment: 0, share: 0,
        collect: 0, finishRate: null, rawData: {},
      }],
    });
    vi.mocked(getFansAnalysis).mockResolvedValue({
      totalFans: 100, genderDist: null, ageDist: null, regionDist: null, rawData: {},
    });

    const a = await makeAccount();
    const job = await runSync(a.id, 'MANUAL');

    expect(job.status).toBe('DONE');
    expect(await db.work.count()).toBe(1);
    expect(await db.workMetric.count()).toBe(1);
    expect(await db.accountMetric.count()).toBe(1);
    const updated = await db.platformAccount.findUnique({ where: { id: a.id } });
    expect(updated?.lastSyncAt).not.toBeNull();
    expect(updated?.cookieStatus).toBe('ACTIVE');
  });

  it('snapshots a new WorkMetric on second run for same work', async () => {
    vi.mocked(listWorks).mockResolvedValue({
      works: [{
        platformWorkId: 'a1', title: 't', description: null, coverUrl: null,
        videoUrl: null, duration: 30, publishedAt: new Date('2026-01-01'),
        rawData: {},
      }],
      metrics: [{
        platformWorkId: 'a1', play: 10, like: 1, comment: 0, share: 0,
        collect: 0, finishRate: null, rawData: {},
      }],
    });
    vi.mocked(getFansAnalysis).mockResolvedValue({
      totalFans: 100, genderDist: null, ageDist: null, regionDist: null, rawData: {},
    });

    const a = await makeAccount();
    await runSync(a.id, 'MANUAL');
    await runSync(a.id, 'MANUAL');
    expect(await db.work.count()).toBe(1);
    expect(await db.workMetric.count()).toBe(2);
  });

  it('marks cookie expired when listWorks throws HTTP 401', async () => {
    vi.mocked(listWorks).mockRejectedValue(new Error('HTTP 401: unauthorized'));
    vi.mocked(getFansAnalysis).mockResolvedValue({
      totalFans: 0, genderDist: null, ageDist: null, regionDist: null, rawData: {},
    });

    const a = await makeAccount();
    const job = await runSync(a.id, 'MANUAL');
    expect(job.status).toBe('FAILED');
    const updated = await db.platformAccount.findUnique({ where: { id: a.id } });
    expect(updated?.cookieStatus).toBe('EXPIRED');
    expect(updated?.lastError).toContain('401');
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/lib/platforms/douyin/sync.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现 `sync.ts`**

```ts
import type { SyncJob, SyncJobType } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { listWorks, getFansAnalysis } from './api';
import { sleep, randomDelayMs } from './http';

function isExpiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 40[13]/.test(msg);
}

export async function runSync(accountId: string, type: SyncJobType): Promise<SyncJob> {
  const account = await db.platformAccount.findUniqueOrThrow({ where: { id: accountId } });
  const cookie = decrypt(account.cookieEncrypted);

  const job = await db.syncJob.create({
    data: { platformAccountId: accountId, type, status: 'RUNNING' },
  });

  try {
    const { works, metrics } = await listWorks(cookie, account.secUid);
    await sleep(randomDelayMs());
    const fans = await getFansAnalysis(cookie);

    await db.$transaction(async (tx) => {
      for (let i = 0; i < works.length; i++) {
        const w = works[i]!;
        const m = metrics[i]!;
        const upserted = await tx.work.upsert({
          where: {
            platformAccountId_platformWorkId: {
              platformAccountId: accountId,
              platformWorkId: w.platformWorkId,
            },
          },
          create: {
            platformAccountId: accountId,
            platformWorkId: w.platformWorkId,
            title: w.title,
            description: w.description,
            coverUrl: w.coverUrl,
            videoUrl: w.videoUrl,
            duration: w.duration,
            publishedAt: w.publishedAt,
            rawData: w.rawData as object,
          },
          update: {
            title: w.title,
            description: w.description,
            coverUrl: w.coverUrl,
            videoUrl: w.videoUrl,
            duration: w.duration,
            rawData: w.rawData as object,
          },
        });
        await tx.workMetric.create({
          data: {
            workId: upserted.id,
            play: m.play,
            like: m.like,
            comment: m.comment,
            share: m.share,
            collect: m.collect,
            finishRate: m.finishRate,
            rawData: m.rawData as object,
          },
        });
      }
      await tx.accountMetric.create({
        data: {
          platformAccountId: accountId,
          totalFans: fans.totalFans,
          genderDist: fans.genderDist as object | null,
          ageDist: fans.ageDist as object | null,
          regionDist: fans.regionDist as object | null,
          rawData: fans.rawData as object,
        },
      });
      await tx.platformAccount.update({
        where: { id: accountId },
        data: {
          lastSyncAt: new Date(),
          cookieStatus: 'ACTIVE',
          lastError: null,
          lastErrorAt: null,
        },
      });
    });

    return db.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        stats: { worksTouched: works.length, totalFans: fans.totalFans },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.platformAccount.update({
      where: { id: accountId },
      data: {
        cookieStatus: isExpiredError(err) ? 'EXPIRED' : account.cookieStatus,
        lastError: msg.slice(0, 500),
        lastErrorAt: new Date(),
      },
    });
    return db.syncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: msg.slice(0, 500) },
    });
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/lib/platforms/douyin/sync.test.ts`
Expected: 3/3 passed.

- [ ] **Step 5: 提交**

```bash
git add src/lib/platforms/douyin/sync.ts tests/lib/platforms/douyin/sync.test.ts
git commit -m "feat(douyin): sync engine with snapshot metrics and expired-cookie detection"
```

### Task 13: POST /api/sync/run/[accountId]

**Files:**
- Create: `src/app/api/sync/run/[accountId]/route.ts`

- [ ] **Step 1: 实现**

```ts
import { NextResponse } from 'next/server';
import { runSync } from '@/lib/platforms/douyin/sync';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ accountId: string }> },
): Promise<NextResponse> {
  const { accountId } = await ctx.params;
  try {
    const job = await runSync(accountId, 'MANUAL');
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      finishedAt: job.finishedAt,
      stats: job.stats,
      error: job.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'sync_failed', message: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: 写一个最小集成测试**

`tests/api/sync/run.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/sync/run/[accountId]/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

vi.mock('@/lib/platforms/douyin/api', () => ({
  listWorks: vi.fn(async () => ({ works: [], metrics: [] })),
  getFansAnalysis: vi.fn(async () => ({
    totalFans: 1, genderDist: null, ageDist: null, regionDist: null, rawData: {},
  })),
}));

beforeEach(async () => {
  await db.syncJob.deleteMany();
  await db.platformAccount.deleteMany();
});

describe('POST /api/sync/run/[accountId]', () => {
  it('returns job status DONE on success', async () => {
    const a = await db.platformAccount.create({
      data: { platform: 'DOUYIN', nickname: 'A', secUid: 'q',
              cookieEncrypted: encrypt('sessionid_ss=v') },
    });
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ accountId: a.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('DONE');
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm test tests/api/sync/run.test.ts`
Expected: 1/1 passed.

- [ ] **Step 4: 提交**

```bash
git add src/app/api/sync/run tests/api/sync
git commit -m "feat(api): POST /api/sync/run/[accountId] for manual sync"
```

### Task 14: node-cron 调度（instrumentation hook）

**Files:**
- Create: `src/instrumentation.ts`
- Create: `src/lib/cron/index.ts`
- Modify: `next.config.ts`（启用 instrumentation 在 Next 15 默认开启，确认）

Next 15 的 `instrumentation.ts` 在 server 启动时 register() 一次。我们在里面注册 cron。

- [ ] **Step 1: 装依赖**

Run: `pnpm add node-cron && pnpm add -D @types/node-cron`
Expected: package.json 多两条。

- [ ] **Step 2: 写 `src/lib/cron/index.ts`**

```ts
import cron from 'node-cron';
import { db } from '@/lib/db';
import { runSync } from '@/lib/platforms/douyin/sync';

let started = false;

export function startCron(): void {
  if (started) return;
  started = true;

  const expr = process.env.SYNC_CRON ?? '0 2 * * *';
  if (!cron.validate(expr)) {
    console.warn(`[cron] invalid SYNC_CRON="${expr}", skipping`);
    return;
  }

  cron.schedule(expr, async () => {
    const accounts = await db.platformAccount.findMany({
      where: { platform: 'DOUYIN', cookieStatus: { not: 'INVALID' } },
      select: { id: true, nickname: true },
    });
    for (const a of accounts) {
      try {
        await runSync(a.id, 'INCREMENTAL');
      } catch (e) {
        console.error(`[cron] sync ${a.nickname} failed:`, e);
      }
    }
  });

  console.log(`[cron] scheduled daily sync at "${expr}"`);
}
```

- [ ] **Step 3: 写 `src/instrumentation.ts`**

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCron } = await import('@/lib/cron');
    startCron();
  }
}
```

> 仅 Node.js runtime 启动 cron；Edge runtime 不导入 node-cron。

- [ ] **Step 4: 验证类型 + 启动**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: 编译通过；启动 `pnpm dev` 看日志含 `[cron] scheduled daily sync at "0 2 * * *"`。

- [ ] **Step 5: 把 SYNC_CRON 加到 env schema**

Edit `src/lib/env.ts`，在 schema 里加：

```ts
SYNC_CRON: z.string().default('0 2 * * *'),
```

并把 `SYNC_CRON=0 2 * * *` 加到 `.env.example` 的合适位置（带中文注释说明默认每日凌晨 2 点）。

- [ ] **Step 6: 提交**

```bash
git add src/instrumentation.ts src/lib/cron src/lib/env.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat(cron): node-cron daily sync registered via instrumentation hook"
```

---

## Phase F · 作品读 API

### Task 15: GET /api/works （列表 + 分页 + 筛选）

**Files:**
- Create: `src/app/api/works/route.ts`
- Test: `tests/api/works/list.test.ts`

支持 query：
- `accountId?` 过滤账号
- `cursor?` (createdAt id 复合游标，简化为 `publishedAt:id`)
- `limit?` 默认 20，最大 100
- `q?` 标题模糊搜索

返回每条带最新一条 `WorkMetric`（用 `findMany + include + take:1` 的 nested query）。

- [ ] **Step 1: 写测试**

`tests/api/works/list.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/works/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(async () => {
  await db.workMetric.deleteMany();
  await db.work.deleteMany();
  await db.platformAccount.deleteMany();
});

async function setup() {
  const a = await db.platformAccount.create({
    data: { platform: 'DOUYIN', nickname: 'A', secUid: 's',
            cookieEncrypted: encrypt('sessionid_ss=v') },
  });
  const w = await db.work.create({
    data: {
      platformAccountId: a.id, platformWorkId: 'p1',
      title: '示例', publishedAt: new Date('2026-05-20'), rawData: {},
    },
  });
  await db.workMetric.create({
    data: { workId: w.id, play: 100, like: 10, comment: 1, share: 0, collect: 0,
            rawData: {} },
  });
  return { account: a, work: w };
}

describe('GET /api/works', () => {
  it('returns list with latestMetric', async () => {
    await setup();
    const res = await GET(new Request('http://localhost/api/works'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ title: string; latestMetric: { play: number } | null }>;
    };
    expect(json.items[0]?.title).toBe('示例');
    expect(json.items[0]?.latestMetric?.play).toBe(100);
  });

  it('filters by q', async () => {
    await setup();
    const res = await GET(new Request('http://localhost/api/works?q=不存在'));
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 实现 route**

```ts
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20') || 20, 100);

  const items = await db.work.findMany({
    where: {
      ...(accountId ? { platformAccountId: accountId } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      account: { select: { id: true, nickname: true, platform: true } },
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
  });

  return NextResponse.json({
    items: items.map((w) => ({
      id: w.id,
      platformWorkId: w.platformWorkId,
      title: w.title,
      coverUrl: w.coverUrl,
      duration: w.duration,
      publishedAt: w.publishedAt,
      account: w.account,
      latestMetric: w.metrics[0]
        ? {
            snapshotAt: w.metrics[0].snapshotAt,
            play: w.metrics[0].play,
            like: w.metrics[0].like,
            comment: w.metrics[0].comment,
            share: w.metrics[0].share,
            collect: w.metrics[0].collect,
            finishRate: w.metrics[0].finishRate,
          }
        : null,
    })),
  });
}
```

- [ ] **Step 3: 跑测试**

Run: `pnpm test tests/api/works/list.test.ts`
Expected: 2/2 passed.

- [ ] **Step 4: 提交**

```bash
git add src/app/api/works/route.ts tests/api/works/list.test.ts
git commit -m "feat(api): GET /api/works with filters and latest metric"
```

### Task 16: GET /api/works/[id] （详情 + 趋势序列）

**Files:**
- Create: `src/app/api/works/[id]/route.ts`
- Test: `tests/api/works/detail.test.ts`

返回该 Work 的全部 WorkMetric 序列（用于趋势图）。

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/works/[id]/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(async () => {
  await db.workMetric.deleteMany();
  await db.work.deleteMany();
  await db.platformAccount.deleteMany();
});

describe('GET /api/works/[id]', () => {
  it('returns work with metrics array sorted asc by snapshotAt', async () => {
    const a = await db.platformAccount.create({
      data: { platform: 'DOUYIN', nickname: 'A', secUid: 's',
              cookieEncrypted: encrypt('sessionid_ss=v') },
    });
    const w = await db.work.create({
      data: { platformAccountId: a.id, platformWorkId: 'p1',
              title: 'T', publishedAt: new Date(), rawData: {} },
    });
    await db.workMetric.create({
      data: { workId: w.id, snapshotAt: new Date('2026-05-21'),
              play: 100, like: 0, comment: 0, share: 0, collect: 0, rawData: {} },
    });
    await db.workMetric.create({
      data: { workId: w.id, snapshotAt: new Date('2026-05-22'),
              play: 200, like: 0, comment: 0, share: 0, collect: 0, rawData: {} },
    });

    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ id: w.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { metrics: Array<{ play: number }> };
    expect(json.metrics.map((m) => m.play)).toEqual([100, 200]);
  });

  it('returns 404 on unknown id', async () => {
    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ id: 'unknown' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 实现**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const work = await db.work.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, nickname: true, platform: true } },
      metrics: { orderBy: { snapshotAt: 'asc' } },
    },
  });
  if (!work) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    id: work.id,
    platformWorkId: work.platformWorkId,
    title: work.title,
    description: work.description,
    coverUrl: work.coverUrl,
    videoUrl: work.videoUrl,
    duration: work.duration,
    publishedAt: work.publishedAt,
    account: work.account,
    metrics: work.metrics.map((m) => ({
      snapshotAt: m.snapshotAt,
      play: m.play,
      like: m.like,
      comment: m.comment,
      share: m.share,
      collect: m.collect,
      finishRate: m.finishRate,
    })),
  });
}
```

- [ ] **Step 3: 跑测试**

Run: `pnpm test tests/api/works/detail.test.ts`
Expected: 2/2 passed.

- [ ] **Step 4: 提交**

```bash
git add src/app/api/works/'[id]' tests/api/works/detail.test.ts
git commit -m "feat(api): GET /api/works/[id] with full metric trend"
```

---

## Phase G · UI

### Task 17: Settings 平台账号管理页

**Files:**
- Create: `src/app/(app)/settings/platforms/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`（如已存在则在里面加一个跳转链接到 `/settings/platforms`，否则跳过）

需求：
- 列出已绑定账号（昵称、头像、状态、最近同步时间、最近错误）
- "添加抖音账号"对话框：粘贴 Cookie 字符串 → 调 `POST /api/platforms/douyin/accounts`
- 每条账号"立即同步" → `POST /api/sync/run/:id`
- 每条账号"删除" → `DELETE /api/platforms/douyin/accounts/:id`

整个页面用 client component 简化，不引 TanStack Query（v0.1 一处直接 fetch + useState 即可）。

- [ ] **Step 1: 实现**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

type Account = {
  id: string;
  nickname: string;
  avatar: string | null;
  cookieStatus: 'ACTIVE' | 'EXPIRED' | 'INVALID';
  lastSyncAt: string | null;
  lastError: string | null;
};

export default function PlatformsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cookie, setCookie] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/platforms/douyin/accounts');
    if (res.ok) setAccounts(((await res.json()) as Account[]));
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!cookie.trim()) return;
    setAdding(true);
    const res = await fetch('/api/platforms/douyin/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookie }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(j.message ?? '添加失败');
      return;
    }
    toast.success('账号已添加');
    setCookie('');
    await load();
  }

  async function sync(id: string) {
    setSyncingId(id);
    const res = await fetch(`/api/sync/run/${id}`, { method: 'POST' });
    setSyncingId(null);
    if (!res.ok) {
      toast.error('同步失败');
      return;
    }
    toast.success('同步完成');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('确认删除该账号？相关作品数据也会一并删除。')) return;
    const res = await fetch(`/api/platforms/douyin/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已删除');
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">平台账号</h1>

      <Card className="space-y-3 p-4">
        <Label>添加抖音账号（粘贴 Cookie 字符串）</Label>
        <textarea
          className="h-24 w-full rounded-md border px-3 py-2 font-mono text-xs"
          placeholder="sessionid_ss=...; ttwid=...; ..."
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
        />
        <Button onClick={add} disabled={adding}>
          {adding ? '校验中…' : '添加'}
        </Button>
      </Card>

      <div className="space-y-3">
        {accounts.map((a) => (
          <Card key={a.id} className="flex items-center gap-4 p-4">
            <img src={a.avatar ?? '/avatar-fallback.svg'} alt="" className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <div className="font-medium">{a.nickname}</div>
              <div className="text-xs text-muted-foreground">
                状态：<StatusBadge s={a.cookieStatus} /> · 最近同步：
                {a.lastSyncAt ? new Date(a.lastSyncAt).toLocaleString() : '从未'}
              </div>
              {a.lastError && (
                <div className="mt-1 text-xs text-red-500">最近错误：{a.lastError}</div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void sync(a.id)}
              disabled={syncingId === a.id}
            >
              {syncingId === a.id ? '同步中…' : '立即同步'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void remove(a.id)}>
              删除
            </Button>
          </Card>
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有账号，先在上方添加一个吧。</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: Account['cookieStatus'] }) {
  const cls =
    s === 'ACTIVE' ? 'text-green-600'
      : s === 'EXPIRED' ? 'text-orange-500'
      : 'text-red-500';
  const text = s === 'ACTIVE' ? '正常' : s === 'EXPIRED' ? '已失效' : '无效';
  return <span className={cls}>{text}</span>;
}
```

注：如果 `/avatar-fallback.svg` 不存在，新建 `public/avatar-fallback.svg`（10 行 SVG 圆形即可），或者把 fallback 改 inline div 占位。

- [ ] **Step 2: 在 sidebar 加 settings/platforms 子链接（可选）**

如果原 settings 页是单页，本任务**不**改 sidebar。账号管理直接通过 `/settings/platforms` 访问。

- [ ] **Step 3: 手动验证**

Run: `pnpm dev`
打开 `http://localhost:3000/settings/platforms`，登录后页面能渲染、空状态正常显示。
（实际添加账号需要真 Cookie 与抓包后的 endpoints；此步只验证 UI 渲染。）

- [ ] **Step 4: 提交**

```bash
git add src/app/'(app)'/settings/platforms public/avatar-fallback.svg
git commit -m "feat(ui): platform account management page"
```

### Task 18: 顶部 Cookie 失效红条 + Sidebar 同步状态

**Files:**
- Create: `src/components/platforms/cookie-expired-banner.tsx`
- Create: `src/app/api/platforms/health/route.ts`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/sidebar.tsx`

策略：
- 加一个轻量 `/api/platforms/health` 端点，返回 `{ expiredCount, lastSyncAt }`
- (app) layout 顶部条件渲染红条
- Sidebar 底部显示"上次同步：xx 分钟前"

- [ ] **Step 1: 实现 health route**

`src/app/api/platforms/health/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  const [expiredCount, lastAccount] = await Promise.all([
    db.platformAccount.count({ where: { cookieStatus: { in: ['EXPIRED', 'INVALID'] } } }),
    db.platformAccount.findFirst({
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true },
    }),
  ]);
  return NextResponse.json({
    expiredCount,
    lastSyncAt: lastAccount?.lastSyncAt ?? null,
  });
}
```

- [ ] **Step 2: 实现 banner**

`src/components/platforms/cookie-expired-banner.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function CookieExpiredBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/platforms/health');
        if (!res.ok) return;
        const j = (await res.json()) as { expiredCount: number };
        if (alive) setCount(j.expiredCount);
      } catch {/* ignore */}
    };
    void tick();
    const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (count <= 0) return null;
  return (
    <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-800">
      有 {count} 个账号 Cookie 已失效。
      <Link href="/settings/platforms" className="ml-2 underline">前往重新导入</Link>
    </div>
  );
}
```

- [ ] **Step 3: 把 banner 接入 (app) layout**

修改 `src/app/(app)/layout.tsx`，在主内容上方加入 `<CookieExpiredBanner />`。具体位置：sidebar 之外、main 之上、整页顶部。

- [ ] **Step 4: 实现 sync-status-chip + 接入 sidebar**

`src/components/platforms/sync-status-chip.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';

function relative(d: string | null): string {
  if (!d) return '从未同步';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return '刚刚同步';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} 分钟前同步`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} 小时前同步`;
  return `${Math.floor(ms / 86400_000)} 天前同步`;
}

export function SyncStatusChip() {
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/platforms/health').then(async (r) => {
      if (!r.ok || !alive) return;
      const j = (await r.json()) as { lastSyncAt: string | null };
      setLast(j.lastSyncAt);
    });
    return () => { alive = false; };
  }, []);
  return <div className="px-2 text-xs text-muted-foreground">{relative(last)}</div>;
}
```

修改 `src/components/layout/sidebar.tsx`，在 nav 之后、退出登录按钮之前插入 `<SyncStatusChip />`。

- [ ] **Step 5: 手动验证**

Run: `pnpm dev`
登录后任意页面查看：banner 在没有失效账号时不渲染；sidebar 底部显示同步状态。

- [ ] **Step 6: 提交**

```bash
git add src/app/api/platforms/health src/components/platforms src/app/'(app)'/layout.tsx src/components/layout/sidebar.tsx
git commit -m "feat(ui): cookie-expired banner and sidebar sync status chip"
```

### Task 19: 作品列表页

**Files:**
- Modify: `src/app/(app)/works/page.tsx`（覆盖 Plan 1 的占位）

需求：
- 顶部搜索框 + 账号筛选下拉
- 网格卡片：封面 / 标题 / 发布时间 / 最近一次 play/like/comment
- 点卡片进 `/works/[id]`

- [ ] **Step 1: 实现**

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Item = {
  id: string;
  title: string;
  coverUrl: string | null;
  publishedAt: string;
  account: { id: string; nickname: string };
  latestMetric: { play: number; like: number; comment: number } | null;
};

export default function WorksPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      const url = new URL('/api/works', window.location.origin);
      if (q) url.searchParams.set('q', q);
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as { items: Item[] };
        setItems(j.items);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">作品</h1>
        <Input
          placeholder="搜索标题"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-60"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((it) => (
          <Link key={it.id} href={`/works/${it.id}`}>
            <Card className="overflow-hidden p-0 transition-colors hover:border-primary">
              <div className="aspect-video bg-muted">
                {it.coverUrl ? (
                  <img src={it.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-1 p-3">
                <div className="line-clamp-2 text-sm font-medium">{it.title}</div>
                <div className="text-xs text-muted-foreground">
                  {it.account.nickname} · {new Date(it.publishedAt).toLocaleDateString()}
                </div>
                {it.latestMetric && (
                  <div className="text-xs text-muted-foreground">
                    播 {it.latestMetric.play.toLocaleString()} · 赞 {it.latestMetric.like} · 评 {it.latestMetric.comment}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
        {items.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">暂无作品。绑定账号并同步后会显示在这里。</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `pnpm dev`
访问 `/works`，空状态文案显示正常。搜索框打字 → 防抖请求 `/api/works?q=...`。

- [ ] **Step 3: 提交**

```bash
git add src/app/'(app)'/works/page.tsx
git commit -m "feat(ui): works list page with search and grid"
```

### Task 20: 作品详情 + Recharts 趋势图

**Files:**
- Create: `src/components/works/metric-trend-chart.tsx`
- Modify: `src/app/(app)/works/[id]/page.tsx`（如不存在则创建）

- [ ] **Step 1: 装 Recharts**

Run: `pnpm add recharts`
Expected: package.json 多 recharts。

- [ ] **Step 2: 实现 chart 组件**

`src/components/works/metric-trend-chart.tsx`:
```tsx
'use client';

import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

type Point = {
  snapshotAt: string;
  play: number;
  like: number;
  comment: number;
  share: number;
  collect: number;
};

export function MetricTrendChart({ data }: { data: Point[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.snapshotAt).toLocaleDateString(),
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="play" name="播放" stroke="#3b82f6" />
        <Line type="monotone" dataKey="like" name="点赞" stroke="#ef4444" />
        <Line type="monotone" dataKey="comment" name="评论" stroke="#10b981" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: 实现详情页**

`src/app/(app)/works/[id]/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { Card } from '@/components/ui/card';
import { MetricTrendChart } from '@/components/works/metric-trend-chart';

type Detail = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  publishedAt: string;
  account: { nickname: string };
  metrics: Array<{
    snapshotAt: string;
    play: number;
    like: number;
    comment: number;
    share: number;
    collect: number;
    finishRate: number | null;
  }>;
};

export default function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/works/${id}`);
      if (!res.ok) {
        setError('作品不存在');
        return;
      }
      setData((await res.json()) as Detail);
    })().catch((e: unknown) => setError(String(e)));
  }, [id]);

  if (error) return <p className="p-6 text-sm text-red-500">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">加载中…</p>;

  const latest = data.metrics[data.metrics.length - 1];

  return (
    <div className="space-y-6 p-6">
      <div className="flex gap-4">
        {data.coverUrl && (
          <img src={data.coverUrl} alt="" className="h-40 w-72 rounded-lg object-cover" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-xs text-muted-foreground">
            {data.account.nickname} · 发布于 {new Date(data.publishedAt).toLocaleString()}
          </p>
          {data.description && (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{data.description}</p>
          )}
        </div>
      </div>

      {latest && (
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
          <Stat label="播放" value={latest.play} />
          <Stat label="点赞" value={latest.like} />
          <Stat label="评论" value={latest.comment} />
          <Stat label="分享" value={latest.share} />
          <Stat label="收藏" value={latest.collect} />
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">数据趋势</h2>
        {data.metrics.length > 0 ? (
          <MetricTrendChart data={data.metrics} />
        ) : (
          <p className="text-sm text-muted-foreground">暂无快照数据。</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
```

> Next 15 client component 接到的 params 也是 Promise，用 React.use() 解包。

- [ ] **Step 4: 手动验证**

Run: `pnpm dev`
点击列表中的作品（或直接访问 `/works/<id>`），详情页能渲染；无快照时占位显示。

- [ ] **Step 5: 提交**

```bash
git add src/app/'(app)'/works/'[id]' src/components/works package.json pnpm-lock.yaml
git commit -m "feat(ui): work detail page with Recharts trend chart"
```

---

## Phase H · 文档与最终验证

### Task 21: 抖音抓包指南文档

**Files:**
- Create: `docs/douyin-endpoint-capture.md`
- Modify: `README.md`（如已存在则在"已知限制"或类似章节加一句指引到该文档）

- [ ] **Step 1: 写抓包指南**

文档主体（用户语言：中文）：

```markdown
# 抖音创作者中心接口抓包指南

第一版的抖音 Adapter **不实现签名算法**（`_signature` / `X-Bogus` / `msToken` / `a_bogus`），
而是把签名 query 作为 URL 模板的一部分，由用户从浏览器抓包后粘贴到
`src/lib/platforms/douyin/endpoints.ts`。

## 抓包步骤

1. 打开 Chrome / Edge，登录 `https://creator.douyin.com`
2. 打开 DevTools（F12）→ Network 面板，勾上 `Preserve log`
3. 触发对应页面操作，找到 XHR 请求：
   - **userInfo**：刷新首页，找请求路径含 `/web/api/media/user/info` 的 XHR
   - **workList**：进入"作品管理"，找路径含 `/web/api/media/aweme/list` 的 XHR
   - **workDetail**：点开任意作品详情，找路径含 `/web/api/media/aweme/detail` 的 XHR
   - **fansAnalysis**：进入"数据中心 → 粉丝"，找路径含 `creator/data/fans/distribution` 的 XHR
4. 右键请求 → Copy → Copy URL，得到完整 URL（含所有 query）
5. 把 URL 粘贴到 `endpoints.ts` 对应字段的 `urlTemplate`
6. 在 URL 中找到表示动态参数的 query，替换为占位：
   - `sec_user_id=...` → `sec_user_id={secUid}`
   - `max_cursor=...` → `max_cursor={maxCursor}`
   - `aweme_id=...` → `aweme_id={awemeId}`
   - 其余 `_signature` / `X-Bogus` / `msToken` / `a_bogus` **保持不变**

## 何时需要重抓

- Cookie 仍正常但 API 返回 `status_code != 0` / 空数据（通常是 msToken 过期）
- 抖音前端版本更新后接口路径变化（少见，几个月一次）

## 真实响应 fixture（脱敏）

抓包后建议把脱敏的真实响应 JSON 替换 `tests/fixtures/douyin/*.json`，并重跑：

`pnpm test tests/lib/platforms/douyin/normalize.test.ts`

如果失败说明字段路径变了，修 `normalize.ts` 即可。
```

- [ ] **Step 2: 在 README 加一句**

如果 `README.md` 已存在，在"使用 / 配置"或"已知限制"段加：

> **抖音接口签名**：v0.1 不实现签名算法，需要从浏览器 DevTools 抓包后粘贴到 `endpoints.ts`。详见 [docs/douyin-endpoint-capture.md](./docs/douyin-endpoint-capture.md)。

如果 README 还没有，本步骤跳过（README 由 Plan 5 统一收尾）。

- [ ] **Step 3: 提交**

```bash
git add docs/douyin-endpoint-capture.md README.md
git commit -m "docs: douyin endpoint capture guide"
```

### Task 22: 最终验证 Gate

**Goal:** 整个 Plan 2 编译/测试/lint 全部通过，UI 主流程可访问。

- [ ] **Step 1: 类型 + lint + 测试**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: 全部通过。失败则定位修复后再次运行。

预期测试数：Plan 1 的 13 + Plan 2 新增（cookie 9 + http 4 + normalize 6 + api 3 + accounts POST/GET 3 + DELETE 2 + sync 3 + sync route 1 + works list 2 + works detail 2 = 35）= **48 tests**。

- [ ] **Step 2: 本地构建**

Run: `pnpm build`
Expected: 构建成功（不带 standalone）。

如果 build 报错，常见原因：
- Recharts SSR 不兼容 → 确保 chart 组件 `'use client'`
- Edge runtime 误引 node-cron → 确认 instrumentation 用 `if (NEXT_RUNTIME === 'nodejs')` 守卫
- Prisma 类型 → 确认 `pnpm prisma generate` 已跑

- [ ] **Step 3: 启动 + 手动 smoke**

Run: `pnpm dev`，逐项确认（浏览器中）：

1. 登录后访问 `/settings/platforms` → 页面渲染、空状态正常
2. （可选）粘贴 dummy cookie `foo=bar` → 提示"Cookie 缺少 sessionid_ss"（验证错误路径）
3. 访问 `/works` → 空状态显示"暂无作品"
4. 访问 `/works/non-existent-id` → 显示"作品不存在"
5. 顶部 banner 在没有失效账号时不渲染（DOM 检查）
6. Sidebar 底部显示"从未同步"

> 真正的"添加账号 → 同步 → 看到数据"端到端流程需要用户抓包后填入 endpoints.ts，
> 不在自动化验证范围内。

- [ ] **Step 4: 工作树清洁度**

Run: `git status`
Expected: 无未提交变更。

- [ ] **Step 5: 收尾提交（如需要）**

如果 Step 1-3 修了任何东西，单独提交：

```bash
git add -A
git commit -m "chore(plan2): final fixes from verification gate"
```

- [ ] **Step 6: 总结**

在终端输出（用户可见的）：

```
Plan 2 (抖音集成) 完成。
- DB 模型：PlatformAccount / Work / WorkMetric / AccountMetric / SyncJob
- 抖音 Adapter：cookie 解析 / HTTP 重试 / 4 个 API 方法 / 同步引擎
- API：账号增删查 / 手动同步 / 作品列表与详情 / 健康检查
- UI：账号管理页 / 失效红条 / 同步状态 / 作品列表与详情（含趋势图）
- Cron：每日 02:00 自动增量同步
- 总测试数：~48
- 已知前置条件：endpoints.ts 需用户抓包填入完整 URL
下一步：Plan 3（素材管理）。
```

---

## 自检清单（写完计划后我跑了一遍）

**Spec 覆盖：**
- 5.1 Cookie 导入 → Task 5/9/10/17 ✅
- 5.1 健康检查 → Task 12（同步时 401/403 标 EXPIRED）+ 18（顶部红条）✅
- 5.1 失效重试策略（5 分钟 / 15 分钟 / 1 小时） → **未实现**：v0.1 简化为"标 EXPIRED 等用户重导"，此处与 spec 略有偏离。理由：自动重试需要任务表与重试调度器，复杂度超 MVP 价值。如果用户坚持，可在 Task 12 末尾加 setTimeout 重试链——但记录在"已知偏离"中。
- 5.2 作品列表 / 详情 / 粉丝画像 / 数据总览 → Task 7/8/9/12 ✅（"数据总览"和"粉丝画像"在创作者中心实际是同一组接口的不同切片，本 Plan 把"粉丝画像 = AccountMetric"合并处理，spec 第 4.2 节也只列了 AccountMetric 一个时序表）
- 5.2 评论列表 → **不在 v0.1 范围**（spec 10.2 评论同步在 v0.2）
- 5.3 定时同步（每日 02:00） → Task 14 ✅（频率可通过 SYNC_CRON env 改）
- 5.3 手动同步 → Task 13/17 ✅
- 5.3 增量（按 published_at） → ⚠️ Task 12 当前实现是"全量重拉作品 + 新建快照"。published_at 增量优化在 v0.1 不必要（每天最多几十条作品，重拉成本可忽略）。明确记 README。
- 5.3 限频随机 sleep → Task 12（每个账号同步内的两次接口之间 sleep）+ Task 6（http 客户端 retry 退避）✅
- 5.4 风险（接口变 / 风控 / 法律） → endpoints.ts 注释 + 抓包指南 ✅

**Placeholder 扫描：** 已检查，无 TBD / TODO 占位（"TODO_REPLACE_WITH_DEVTOOLS_CAPTURE" 是 endpoints.ts 中故意保留的标记字符串，提示用户填入抓包结果，不是计划占位）。

**类型一致性：**
- `PlatformAdapter.platform` 是 `Platform` 枚举（Task 4），所有 adapter 实现保持一致 ✅
- `StandardizedWork.publishedAt` 是 `Date`，DB Work.publishedAt 也是 DateTime ✅
- `runSync` 返回 `SyncJob`（Prisma 类型），API route 返回的 JSON 字段名与之一致 ✅

**已知偏离 spec 的地方（已合理化）：**
1. Cookie 失效后的"5/15/60 分钟指数退避自动重试"未实现 → 第二次同步如果还失败由用户手动处理
2. 作品列表"按 published_at 增量"未实现 → 每次全量 upsert，规模可控
3. 接口签名（_signature / X-Bogus / msToken / a_bogus）走"用户从 DevTools 粘贴 URL"的路径 → 由 `endpoints.ts` + `docs/douyin-endpoint-capture.md` 承担
