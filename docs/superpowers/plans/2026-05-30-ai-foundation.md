# Plan 4a: AI 基础设施 (LLM Provider Management)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan 1-3 基础上加入 AI 能力的"地基"——LLM Provider 多家配置、API Key 加密入库、连通性测试、Prompt 模板存储、AI 历史/Chat 表 Schema 一次性建好（4b/4c 直接用）。本 Plan 不实现 Chat UI 也不实现具体分析任务，只做"按下测试连接按钮能调通模型"。

**Architecture:** `lib/llm/registry.ts` 通过 `LLMProvider` 行 ID 派发；`lib/llm/client.ts` 用 `@ai-sdk/openai-compatible` 创建实例，封装 `streamText`/`generateText`。API Key 用 Plan 1 的 `crypto.encrypt/decrypt` 存 `LLMProvider.apiKeyEncrypted`。`Setting` 表存默认 provider/model。Schema 一次性加 `LLMProvider` / `PromptTemplate` / `AIAnalysis` / `AIChat` / `AIChatMessage` 五张表，避免 4b/4c 还要改 schema。

**Tech Stack:** Next.js 15 App Router · Prisma 6 · `ai`(v5) · `@ai-sdk/openai-compatible` · `@ai-sdk/react` (4b 用) · Vitest · Zod · 复用 Plan 1 `crypto.ts` / `db.ts` / `auth.ts` / shadcn/ui

---

## File Structure

新建/修改文件：

- 修改：`prisma/schema.prisma`（5 个新模型 + 2 个 enum）
- 新建：`prisma/migrations/<timestamp>_add_ai_models/migration.sql`（自动生成）
- 新建：`src/lib/llm/types.ts`（标准化类型 + LLMProvider 接口）
- 新建：`src/lib/llm/client.ts`（createOpenAICompatible 封装 + streamText/generateText）
- 新建：`src/lib/llm/registry.ts`（按 providerId 取 client）
- 新建 API routes：
  - `src/app/api/llm/providers/route.ts`（GET 列表 / POST 新建）
  - `src/app/api/llm/providers/[id]/route.ts`（GET 详情 / PATCH 更新 / DELETE 删除）
  - `src/app/api/llm/providers/[id]/test/route.ts`（POST 连通性测试）
  - `src/app/api/llm/settings/route.ts`（GET/PUT 默认 provider+model）
  - `src/app/api/llm/prompt-templates/route.ts`（GET/POST）
  - `src/app/api/llm/prompt-templates/[id]/route.ts`（GET/PATCH/DELETE/POST reset）
- 新建 UI：
  - `src/app/(app)/settings/llm/page.tsx`（Provider 管理页）
  - `src/app/(app)/settings/prompts/page.tsx`（Prompt 模板编辑页）
  - `src/components/llm/provider-form.tsx`（新增/编辑表单）
  - `src/components/llm/test-connection-button.tsx`（测试按钮 + 结果显示）
- 修改：`src/lib/env.ts`（无新变量，但确认 MASTER_KEY 存在）
- 新建测试：
  - `tests/lib/llm/client.test.ts`（mock @ai-sdk 验证封装）
  - `tests/api/llm/providers.test.ts`（CRUD + 加密入库不暴露明文 key）
  - `tests/api/llm/test-connection.test.ts`（mock generateText 验证测试逻辑）
  - `tests/api/llm/prompt-templates.test.ts`（CRUD + reset to default）

---

## Phase A · 数据模型扩展

### Task 1: 新增 LLMProvider 模型

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 追加模型**

在 schema 末尾追加：

```prisma
model LLMProvider {
  id                String   @id @default(cuid())
  name              String
  baseUrl           String
  apiKeyEncrypted   String
  defaultModel      String
  enabled           Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  analyses          AIAnalysis[]

  @@index([enabled, createdAt])
}
```

- [ ] **Step 2: 生成迁移**

Run: `pnpm prisma migrate dev --name add_llm_provider`
Expected: 生成 migration.sql；prisma client 自动 regenerate。

注意：`AIAnalysis` 反向关系此刻还没定义，先把 `analyses AIAnalysis[]` 那行临时注释掉，Task 3 添加 AIAnalysis 后再启用。

- [ ] **Step 3: tsc 校验**

Run: `pnpm exec tsc --noEmit`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add LLMProvider model"
```

### Task 2: 新增 PromptTemplate 模型

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 追加 enum + model**

```prisma
enum AIAnalysisType {
  WORK_REVIEW
  TOPIC_SUGGEST
  COPY_OPTIMIZE
  WORKS_COMPARE
  TREND
  COMMENT_INSIGHT
  BENCHMARK
}

model PromptTemplate {
  id            String         @id @default(cuid())
  type          AIAnalysisType @unique
  systemPrompt  String         @db.Text
  userTemplate  String         @db.Text
  isCustomized  Boolean        @default(false)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([type])
}
```

- [ ] **Step 2: 迁移**

Run: `pnpm prisma migrate dev --name add_prompt_template`
Expected: 生成 migration.sql。

- [ ] **Step 3: tsc 校验**

Run: `pnpm exec tsc --noEmit`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add prisma
git commit -m "feat(db): add PromptTemplate model with AIAnalysisType enum"
```

### Task 3: 新增 AIAnalysis / AIChat / AIChatMessage 模型

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 追加 3 个 model**

```prisma
enum AIAnalysisStatus {
  RUNNING
  DONE
  FAILED
}

enum AIChatRole {
  SYSTEM
  USER
  ASSISTANT
}

model AIAnalysis {
  id             String           @id @default(cuid())
  type           AIAnalysisType
  targetRefs     Json             // {workIds?: string[], materialIds?: string[]}
  prompt         String           @db.Text
  response       String?          @db.Text
  modelUsed      String
  llmProviderId  String
  tokensUsed     Json?            // {input: number, output: number}
  status         AIAnalysisStatus @default(RUNNING)
  error          String?
  createdAt      DateTime         @default(now())
  finishedAt     DateTime?

  provider       LLMProvider      @relation(fields: [llmProviderId], references: [id], onDelete: Cascade)

  @@index([type, createdAt])
  @@index([status, createdAt])
}

model AIChat {
  id        String           @id @default(cuid())
  title     String
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  messages  AIChatMessage[]

  @@index([updatedAt])
}

model AIChatMessage {
  id          String     @id @default(cuid())
  chatId      String
  role        AIChatRole
  content     String     @db.Text
  attachments Json?      // {workIds?: string[], materialIds?: string[]}
  tokensUsed  Json?      // {input: number, output: number}
  createdAt   DateTime   @default(now())

  chat        AIChat     @relation(fields: [chatId], references: [id], onDelete: Cascade)

  @@index([chatId, createdAt])
}
```

并把 Task 1 中临时注释掉的 `analyses AIAnalysis[]` 反向关系恢复。

- [ ] **Step 2: 迁移**

Run: `pnpm prisma migrate dev --name add_ai_analysis_chat`
Expected: 生成 migration.sql 含 3 张表 + 索引 + 反向关系。

- [ ] **Step 3: tsc 校验**

Run: `pnpm exec tsc --noEmit`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add prisma
git commit -m "feat(db): add AIAnalysis, AIChat, AIChatMessage models"
```

---

## Phase B · LLM 客户端抽象

### Task 4: 安装依赖

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: 装 ai sdk + provider + react hook**

Run: `pnpm add ai @ai-sdk/openai-compatible @ai-sdk/react zod`
Expected: 4 个依赖加入 package.json（zod 已存在则跳过）。

注意：版本采用 `ai@^5` 系列（最新稳定）。如果安装时被 peer dep 阻塞，单独装 `@ai-sdk/openai-compatible` 时报 React 19 兼容性问题，按 npm 提示加 `--strict-peer-dependencies=false`。

- [ ] **Step 2: 验证类型**

Run: `pnpm exec tsc --noEmit`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add Vercel AI SDK + openai-compatible + react"
```

### Task 5: 类型定义 (lib/llm/types.ts)

**Files:**
- Create: `src/lib/llm/types.ts`

- [ ] **Step 1: 写类型**

```ts
import type { LanguageModel } from 'ai';

export type LLMProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;          // 调用时已解密的明文，仅在 server 内存中
  defaultModel: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GenerateOptions = {
  model?: string;          // 不传则用 provider.defaultModel
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type GenerateResult = {
  text: string;
  usage: TokenUsage;
  finishReason: string;
};

export type LLMClient = {
  config: LLMProviderConfig;
  /** 取一个 LanguageModel 实例（透传给 streamText/generateText） */
  model(modelId?: string): LanguageModel;
  /** 一次性生成（封装 generateText） */
  generate(opts: GenerateOptions): Promise<GenerateResult>;
};
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/llm/types.ts
git commit -m "feat(llm): standardized types and LLMClient interface"
```

### Task 6: LLM 客户端实现 (TDD)

**Files:**
- Create: `src/lib/llm/client.ts`
- Test: `tests/lib/llm/client.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => {
    const fn = vi.fn((modelId: string) => ({ modelId, _kind: 'mock-model' }));
    return Object.assign(fn, {
      chatModel: vi.fn((id: string) => ({ modelId: id, _kind: 'chat' })),
    });
  }),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({
    text: 'hello world',
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: 'stop',
  })),
}));

import { createLLMClient } from '@/lib/llm/client';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createLLMClient', () => {
  it('initializes provider with name/baseURL/apiKey', () => {
    createLLMClient({
      id: 'p1', name: 'Test', baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-xxx', defaultModel: 'gpt-4',
    });
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'Test',
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-xxx',
    });
  });

  it('uses defaultModel when modelId omitted', () => {
    const client = createLLMClient({
      id: 'p1', name: 'T', baseUrl: 'u', apiKey: 'k', defaultModel: 'gpt-4',
    });
    const m = client.model();
    expect(m).toMatchObject({ modelId: 'gpt-4' });
  });

  it('uses explicit modelId when provided', () => {
    const client = createLLMClient({
      id: 'p1', name: 'T', baseUrl: 'u', apiKey: 'k', defaultModel: 'gpt-4',
    });
    const m = client.model('gpt-3.5');
    expect(m).toMatchObject({ modelId: 'gpt-3.5' });
  });

  it('generate() calls ai.generateText and returns text+usage', async () => {
    const client = createLLMClient({
      id: 'p1', name: 'T', baseUrl: 'u', apiKey: 'k', defaultModel: 'gpt-4',
    });
    const res = await client.generate({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(generateText).toHaveBeenCalled();
    expect(res.text).toBe('hello world');
    expect(res.usage.inputTokens).toBe(10);
    expect(res.usage.outputTokens).toBe(5);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/llm/client.test.ts`
Expected: 失败（模块不存在）。

- [ ] **Step 3: 实现 client.ts**

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type {
  GenerateOptions,
  GenerateResult,
  LLMClient,
  LLMProviderConfig,
} from './types';

export function createLLMClient(config: LLMProviderConfig): LLMClient {
  const provider = createOpenAICompatible({
    name: config.name,
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  function model(modelId?: string): LanguageModel {
    return provider(modelId ?? config.defaultModel);
  }

  async function generate(opts: GenerateOptions): Promise<GenerateResult> {
    const result = await generateText({
      model: model(opts.model),
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
    });
    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
      finishReason: result.finishReason,
    };
  }

  return { config, model, generate };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/llm/client.test.ts`
Expected: 4/4 passed。

- [ ] **Step 5: 提交**

```bash
git add src/lib/llm tests/lib/llm
git commit -m "feat(llm): client wrapper around @ai-sdk/openai-compatible with TDD"
```

### Task 7: Registry (按 DB 行查找 + 解密)

**Files:**
- Create: `src/lib/llm/registry.ts`
- Test: `tests/lib/llm/registry.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  createLLMClient: vi.fn((c) => ({ config: c, _stub: true })),
}));

vi.mock('@/lib/db', () => ({
  db: { lLMProvider: { findUniqueOrThrow: vi.fn() } },
}));

import { getLLMClient } from '@/lib/llm/registry';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getLLMClient', () => {
  it('decrypts apiKey from DB row before constructing client', async () => {
    vi.mocked(db.lLMProvider.findUniqueOrThrow).mockResolvedValue({
      id: 'p1', name: 'X', baseUrl: 'u',
      apiKeyEncrypted: encrypt('sk-secret'),
      defaultModel: 'm', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const client = await getLLMClient('p1');
    expect(client.config.apiKey).toBe('sk-secret');
  });

  it('throws when provider disabled', async () => {
    vi.mocked(db.lLMProvider.findUniqueOrThrow).mockResolvedValue({
      id: 'p1', name: 'X', baseUrl: 'u',
      apiKeyEncrypted: encrypt('sk'),
      defaultModel: 'm', enabled: false,
      createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(getLLMClient('p1')).rejects.toThrow(/disabled/);
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/lib/llm/registry.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现 registry.ts**

```ts
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createLLMClient } from './client';
import type { LLMClient } from './types';

export async function getLLMClient(providerId: string): Promise<LLMClient> {
  const row = await db.lLMProvider.findUniqueOrThrow({ where: { id: providerId } });
  if (!row.enabled) {
    throw new Error(`LLM provider ${row.name} is disabled`);
  }
  return createLLMClient({
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: decrypt(row.apiKeyEncrypted),
    defaultModel: row.defaultModel,
  });
}

export async function getDefaultLLMClient(): Promise<LLMClient> {
  const setting = await db.setting.findUnique({ where: { key: 'default_llm_provider' } });
  if (!setting?.value || typeof setting.value !== 'object') {
    throw new Error('Default LLM provider not configured. Set one in Settings → LLM.');
  }
  const { providerId } = setting.value as { providerId: string };
  if (typeof providerId !== 'string' || !providerId) {
    throw new Error('Default LLM provider misconfigured');
  }
  return getLLMClient(providerId);
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/lib/llm/registry.test.ts`
Expected: 2/2 passed。

- [ ] **Step 5: 提交**

```bash
git add src/lib/llm/registry.ts tests/lib/llm/registry.test.ts
git commit -m "feat(llm): registry with DB-backed lookup and apiKey decryption"
```

---

## Phase C · Provider CRUD API

### Task 8: GET / POST /api/llm/providers

**Files:**
- Create: `src/app/api/llm/providers/route.ts`
- Test: `tests/api/llm/providers.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from '@/app/api/llm/providers/route';
import { db } from '@/lib/db';

beforeEach(async () => {
  await db.aIAnalysis.deleteMany();
  await db.lLMProvider.deleteMany();
});

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/llm/providers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/llm/providers', () => {
  it('rejects empty name/baseUrl/apiKey', async () => {
    const res = await POST(postReq({ name: '', baseUrl: '', apiKey: '', defaultModel: '' }));
    expect(res.status).toBe(400);
  });

  it('creates provider with encrypted apiKey (not stored as plaintext)', async () => {
    const res = await POST(postReq({
      name: 'Test',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-123',
      defaultModel: 'gpt-4',
    }));
    expect(res.status).toBe(201);
    const row = await db.lLMProvider.findFirst({ where: { name: 'Test' } });
    expect(row).not.toBeNull();
    expect(row!.apiKeyEncrypted).not.toBe('sk-secret-123');
    expect(row!.apiKeyEncrypted).not.toContain('sk-secret-123');
  });
});

describe('GET /api/llm/providers', () => {
  it('returns providers without apiKeyEncrypted', async () => {
    await db.lLMProvider.create({
      data: {
        name: 'A', baseUrl: 'u',
        apiKeyEncrypted: 'enc',
        defaultModel: 'm',
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list[0]?.name).toBe('A');
    expect('apiKeyEncrypted' in (list[0] ?? {})).toBe(false);
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/api/llm/providers.test.ts`
Expected: 失败（模块不存在）。

- [ ] **Step 3: 实现 route.ts**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

const Body = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, baseUrl, apiKey, defaultModel, enabled } = parsed.data;
  const row = await db.lLMProvider.create({
    data: {
      name,
      baseUrl,
      apiKeyEncrypted: encrypt(apiKey),
      defaultModel,
      enabled: enabled ?? true,
    },
    select: {
      id: true, name: true, baseUrl: true, defaultModel: true,
      enabled: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(row, { status: 201 });
}

export async function GET(): Promise<NextResponse> {
  const rows = await db.lLMProvider.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, baseUrl: true, defaultModel: true,
      enabled: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(rows);
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/api/llm/providers.test.ts`
Expected: 3/3 passed。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/llm/providers/route.ts tests/api/llm/providers.test.ts
git commit -m "feat(api): POST/GET /api/llm/providers with apiKey encryption"
```

### Task 9: GET / PATCH / DELETE /api/llm/providers/[id]

**Files:**
- Create: `src/app/api/llm/providers/[id]/route.ts`
- Test: `tests/api/llm/provider-detail.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/llm/providers/[id]/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(async () => {
  await db.aIAnalysis.deleteMany();
  await db.lLMProvider.deleteMany();
});

async function makeProvider() {
  return db.lLMProvider.create({
    data: {
      name: 'P', baseUrl: 'u',
      apiKeyEncrypted: encrypt('sk-x'),
      defaultModel: 'm',
    },
  });
}

describe('GET /api/llm/providers/[id]', () => {
  it('returns row without apiKeyEncrypted', async () => {
    const p = await makeProvider();
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    const row = (await res.json()) as Record<string, unknown>;
    expect('apiKeyEncrypted' in row).toBe(false);
  });

  it('returns 404 on unknown', async () => {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/llm/providers/[id]', () => {
  it('updates name only without touching apiKey', async () => {
    const p = await makeProvider();
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect(res.status).toBe(200);
    const after = await db.lLMProvider.findUnique({ where: { id: p.id } });
    expect(after!.name).toBe('New');
    expect(after!.apiKeyEncrypted).toBe(p.apiKeyEncrypted);
  });

  it('re-encrypts apiKey when provided', async () => {
    const p = await makeProvider();
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-new-secret' }),
      }),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect(res.status).toBe(200);
    const after = await db.lLMProvider.findUnique({ where: { id: p.id } });
    expect(after!.apiKeyEncrypted).not.toBe(p.apiKeyEncrypted);
  });
});

describe('DELETE /api/llm/providers/[id]', () => {
  it('deletes provider', async () => {
    const p = await makeProvider();
    const res = await DELETE(new Request('http://x'), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect(await db.lLMProvider.findUnique({ where: { id: p.id } })).toBeNull();
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/api/llm/provider-detail.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

const SAFE_SELECT = {
  id: true, name: true, baseUrl: true, defaultModel: true,
  enabled: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const row = await db.lLMProvider.findUnique({ where: { id }, select: SAFE_SELECT });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(row);
}

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { apiKey, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (apiKey) data.apiKeyEncrypted = encrypt(apiKey);
  try {
    const row = await db.lLMProvider.update({ where: { id }, data, select: SAFE_SELECT });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    await db.lLMProvider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/api/llm/provider-detail.test.ts`
Expected: 5/5 passed。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/llm/providers/'[id]' tests/api/llm/provider-detail.test.ts
git commit -m "feat(api): GET/PATCH/DELETE /api/llm/providers/[id]"
```

### Task 10: 连通性测试 POST /api/llm/providers/[id]/test

**Files:**
- Create: `src/app/api/llm/providers/[id]/test/route.ts`
- Test: `tests/api/llm/test-connection.test.ts`

策略：调一次小成本请求（"ping" 提示词，maxOutputTokens=8）；成功返回 `{ ok: true, sample, usage, latencyMs }`，失败返回 `{ ok: false, message }`。

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/llm/providers/[id]/test/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

vi.mock('@/lib/llm/registry', () => ({
  getLLMClient: vi.fn(),
}));

import { getLLMClient } from '@/lib/llm/registry';

beforeEach(async () => {
  await db.aIAnalysis.deleteMany();
  await db.lLMProvider.deleteMany();
  vi.clearAllMocks();
});

async function makeProvider() {
  return db.lLMProvider.create({
    data: { name: 'P', baseUrl: 'u', apiKeyEncrypted: encrypt('k'), defaultModel: 'm' },
  });
}

describe('POST /api/llm/providers/[id]/test', () => {
  it('returns ok=true with sample on success', async () => {
    vi.mocked(getLLMClient).mockResolvedValue({
      config: { id: 'x', name: 'P', baseUrl: 'u', apiKey: 'k', defaultModel: 'm' },
      model: vi.fn(),
      generate: vi.fn(async () => ({
        text: 'pong',
        usage: { inputTokens: 3, outputTokens: 1 },
        finishReason: 'stop',
      })),
    } as never);

    const p = await makeProvider();
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: p.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; sample: string };
    expect(json.ok).toBe(true);
    expect(json.sample).toBe('pong');
  });

  it('returns ok=false with message on failure', async () => {
    vi.mocked(getLLMClient).mockResolvedValue({
      config: { id: 'x', name: 'P', baseUrl: 'u', apiKey: 'k', defaultModel: 'm' },
      model: vi.fn(),
      generate: vi.fn(async () => { throw new Error('401 Invalid API key'); }),
    } as never);

    const p = await makeProvider();
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: p.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    expect(json.message).toContain('401');
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/api/llm/test-connection.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现**

```ts
import { NextResponse } from 'next/server';
import { getLLMClient } from '@/lib/llm/registry';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const start = Date.now();
  try {
    const client = await getLLMClient(id);
    const result = await client.generate({
      messages: [{ role: 'user', content: 'ping' }],
      maxOutputTokens: 8,
    });
    return NextResponse.json({
      ok: true,
      sample: result.text,
      usage: result.usage,
      latencyMs: Date.now() - start,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      message: message.slice(0, 500),
      latencyMs: Date.now() - start,
    });
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/api/llm/test-connection.test.ts`
Expected: 2/2 passed。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/llm/providers/'[id]'/test tests/api/llm/test-connection.test.ts
git commit -m "feat(api): POST /api/llm/providers/[id]/test for connectivity check"
```

### Task 11: 默认模型设置 GET / PUT /api/llm/settings

**Files:**
- Create: `src/app/api/llm/settings/route.ts`
- Test: `tests/api/llm/settings.test.ts`

存储约定：`Setting.key = 'default_llm_provider'`，`value = { providerId: string, model?: string }`。

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, PUT } from '@/app/api/llm/settings/route';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

beforeEach(async () => {
  await db.aIAnalysis.deleteMany();
  await db.lLMProvider.deleteMany();
  await db.setting.deleteMany({ where: { key: 'default_llm_provider' } });
});

async function makeProvider() {
  return db.lLMProvider.create({
    data: { name: 'P', baseUrl: 'u', apiKeyEncrypted: encrypt('k'), defaultModel: 'm' },
  });
}

describe('GET /api/llm/settings', () => {
  it('returns null when not set', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { providerId: string | null };
    expect(json.providerId).toBeNull();
  });
});

describe('PUT /api/llm/settings', () => {
  it('upserts default provider', async () => {
    const p = await makeProvider();
    const res = await PUT(new Request('http://x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: p.id, model: 'gpt-4' }),
    }));
    expect(res.status).toBe(200);
    const row = await db.setting.findUnique({ where: { key: 'default_llm_provider' } });
    expect(row?.value).toMatchObject({ providerId: p.id, model: 'gpt-4' });
  });

  it('rejects unknown providerId', async () => {
    const res = await PUT(new Request('http://x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'nope' }),
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/api/llm/settings.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const KEY = 'default_llm_provider';

export async function GET(): Promise<NextResponse> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row?.value || typeof row.value !== 'object') {
    return NextResponse.json({ providerId: null, model: null });
  }
  return NextResponse.json(row.value);
}

const Body = z.object({
  providerId: z.string().min(1),
  model: z.string().optional(),
});

export async function PUT(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const provider = await db.lLMProvider.findUnique({
    where: { id: parsed.data.providerId },
  });
  if (!provider) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 });
  }
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: parsed.data },
    update: { value: parsed.data },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/api/llm/settings.test.ts`
Expected: 3/3 passed。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/llm/settings tests/api/llm/settings.test.ts
git commit -m "feat(api): GET/PUT /api/llm/settings for default provider"
```

---

## Phase D · Prompt 模板

### Task 12: 默认模板常量

**Files:**
- Create: `src/lib/llm/default-prompts.ts`

只为 P0 三任务（WORK_REVIEW / TOPIC_SUGGEST / COPY_OPTIMIZE）准备默认模板，其它四种 4c 后续补。

- [ ] **Step 1: 写文件**

```ts
import type { AIAnalysisType } from '@prisma/client';

export type DefaultPrompt = {
  systemPrompt: string;
  userTemplate: string;   // 用 {{var}} 占位
};

export const DEFAULT_PROMPTS: Record<AIAnalysisType, DefaultPrompt> = {
  WORK_REVIEW: {
    systemPrompt:
      '你是资深短视频运营顾问。基于作品数据，从亮点 / 问题 / 改进建议三个维度做精炼复盘，每点 1-2 句，给出可执行建议。',
    userTemplate:
      '作品标题：{{title}}\n描述：{{description}}\n发布时间：{{publishedAt}}\n时长：{{duration}}秒\n\n最新数据快照：\n{{metrics}}\n\n历史均值（同账号近 30 天）：\n{{historicalAvg}}\n\n请输出复盘。',
  },
  TOPIC_SUGGEST: {
    systemPrompt:
      '你是短视频选题策划。基于历史爆款和用户给定方向，输出 5-10 条新选题，每条带一句话理由（说明为什么会火）。',
    userTemplate:
      '账号定位：{{niche}}\n用户希望的方向：{{direction}}\n\n历史 Top10 爆款（标题 + 关键指标）：\n{{topWorks}}\n\n近 30 天趋势观察：\n{{trends}}\n\n请输出选题列表。',
  },
  COPY_OPTIMIZE: {
    systemPrompt:
      '你是短视频文案优化师。基于用户草稿和历史高互动文案样本，输出优化版 + 改进点列表，保持作者个人风格。',
    userTemplate:
      '用户草稿：\n{{draft}}\n\n历史高互动文案样本（脱敏）：\n{{samples}}\n\n请输出"优化版"和"主要改动点（3-5 条）"。',
  },
  WORKS_COMPARE: { systemPrompt: 'TODO (Plan 4c)', userTemplate: 'TODO' },
  TREND: { systemPrompt: 'TODO (Plan 4c)', userTemplate: 'TODO' },
  COMMENT_INSIGHT: { systemPrompt: 'TODO (Plan 4c)', userTemplate: 'TODO' },
  BENCHMARK: { systemPrompt: 'TODO (Plan 4c)', userTemplate: 'TODO' },
};

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}
```

- [ ] **Step 2: 写测试**

`tests/lib/llm/default-prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';

describe('DEFAULT_PROMPTS', () => {
  it('has non-TODO content for P0 tasks', () => {
    expect(DEFAULT_PROMPTS.WORK_REVIEW.systemPrompt).not.toContain('TODO');
    expect(DEFAULT_PROMPTS.TOPIC_SUGGEST.systemPrompt).not.toContain('TODO');
    expect(DEFAULT_PROMPTS.COPY_OPTIMIZE.systemPrompt).not.toContain('TODO');
  });
});

describe('fillTemplate', () => {
  it('replaces {{var}} with provided values', () => {
    expect(fillTemplate('hi {{name}}', { name: 'Bob' })).toBe('hi Bob');
  });
  it('replaces missing vars with empty string', () => {
    expect(fillTemplate('a={{a}} b={{b}}', { a: '1' })).toBe('a=1 b=');
  });
  it('handles multiple occurrences', () => {
    expect(fillTemplate('{{x}} and {{x}}', { x: 'yes' })).toBe('yes and yes');
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm test tests/lib/llm/default-prompts.test.ts`
Expected: 4/4 passed。

- [ ] **Step 4: 提交**

```bash
git add src/lib/llm/default-prompts.ts tests/lib/llm/default-prompts.test.ts
git commit -m "feat(llm): default prompt templates for P0 analysis tasks"
```

### Task 13: PromptTemplate CRUD API + reset

**Files:**
- Create: `src/app/api/llm/prompt-templates/route.ts`
- Create: `src/app/api/llm/prompt-templates/[id]/route.ts`
- Create: `src/app/api/llm/prompt-templates/[id]/reset/route.ts`
- Test: `tests/api/llm/prompt-templates.test.ts`

行为约定：列表 GET 返回 7 种 type 的当前模板（DB 没有就用 default-prompts.ts 的默认值，不入库）；用户保存自定义时 upsert 到 DB 并 `isCustomized=true`；reset 删除该 type 的 DB 行（下次 GET 又落回 default）。

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/llm/prompt-templates/route';
import { POST as RESET } from '@/app/api/llm/prompt-templates/[id]/reset/route';
import { db } from '@/lib/db';
import { DEFAULT_PROMPTS } from '@/lib/llm/default-prompts';

beforeEach(async () => {
  await db.promptTemplate.deleteMany();
});

describe('GET /api/llm/prompt-templates', () => {
  it('returns all 7 types using defaults when none customized', async () => {
    const res = await GET();
    const list = (await res.json()) as Array<{ type: string; systemPrompt: string; isCustomized: boolean }>;
    expect(list).toHaveLength(7);
    const wr = list.find((x) => x.type === 'WORK_REVIEW')!;
    expect(wr.systemPrompt).toBe(DEFAULT_PROMPTS.WORK_REVIEW.systemPrompt);
    expect(wr.isCustomized).toBe(false);
  });

  it('returns customized values when DB has them', async () => {
    await db.promptTemplate.create({
      data: {
        type: 'WORK_REVIEW',
        systemPrompt: 'CUSTOM',
        userTemplate: 'CUSTOM_USER',
        isCustomized: true,
      },
    });
    const res = await GET();
    const list = (await res.json()) as Array<{ type: string; systemPrompt: string; isCustomized: boolean }>;
    const wr = list.find((x) => x.type === 'WORK_REVIEW')!;
    expect(wr.systemPrompt).toBe('CUSTOM');
    expect(wr.isCustomized).toBe(true);
  });
});

describe('POST /api/llm/prompt-templates', () => {
  it('upserts a customized template', async () => {
    const res = await POST(new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'TOPIC_SUGGEST',
        systemPrompt: 'NEW',
        userTemplate: 'TPL',
      }),
    }));
    expect(res.status).toBe(200);
    const row = await db.promptTemplate.findUnique({ where: { type: 'TOPIC_SUGGEST' } });
    expect(row!.systemPrompt).toBe('NEW');
    expect(row!.isCustomized).toBe(true);
  });
});

describe('POST /api/llm/prompt-templates/[id]/reset', () => {
  it('removes DB row so default takes over', async () => {
    const row = await db.promptTemplate.create({
      data: { type: 'COPY_OPTIMIZE', systemPrompt: 'X', userTemplate: 'Y', isCustomized: true },
    });
    const res = await RESET(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: row.id }),
    });
    expect(res.status).toBe(200);
    expect(await db.promptTemplate.findUnique({ where: { id: row.id } })).toBeNull();
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm test tests/api/llm/prompt-templates.test.ts`
Expected: 失败。

- [ ] **Step 3: 实现 list + upsert**

`src/app/api/llm/prompt-templates/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AIAnalysisType } from '@prisma/client';
import { db } from '@/lib/db';
import { DEFAULT_PROMPTS } from '@/lib/llm/default-prompts';

export async function GET(): Promise<NextResponse> {
  const customs = await db.promptTemplate.findMany();
  const customMap = new Map(customs.map((c) => [c.type, c]));
  const all = (Object.values(AIAnalysisType) as AIAnalysisType[]).map((type) => {
    const row = customMap.get(type);
    if (row) {
      return {
        id: row.id,
        type,
        systemPrompt: row.systemPrompt,
        userTemplate: row.userTemplate,
        isCustomized: true,
      };
    }
    const dflt = DEFAULT_PROMPTS[type];
    return {
      id: null,
      type,
      systemPrompt: dflt.systemPrompt,
      userTemplate: dflt.userTemplate,
      isCustomized: false,
    };
  });
  return NextResponse.json(all);
}

const PostBody = z.object({
  type: z.nativeEnum(AIAnalysisType),
  systemPrompt: z.string().min(1),
  userTemplate: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { type, systemPrompt, userTemplate } = parsed.data;
  const row = await db.promptTemplate.upsert({
    where: { type },
    create: { type, systemPrompt, userTemplate, isCustomized: true },
    update: { systemPrompt, userTemplate, isCustomized: true },
  });
  return NextResponse.json(row);
}
```

`src/app/api/llm/prompt-templates/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const row = await db.promptTemplate.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    await db.promptTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
```

`src/app/api/llm/prompt-templates/[id]/reset/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    await db.promptTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test tests/api/llm/prompt-templates.test.ts`
Expected: 4/4 passed。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/llm/prompt-templates tests/api/llm/prompt-templates.test.ts
git commit -m "feat(api): prompt template CRUD with reset-to-default"
```

---

## Phase E · UI

### Task 14: Provider 管理页 /settings/llm

**Files:**
- Create: `src/app/(app)/settings/llm/page.tsx`
- Create: `src/components/llm/provider-form.tsx`
- Create: `src/components/llm/test-connection-button.tsx`

UI 要素：
- 顶部"添加 Provider"按钮 → 打开抽屉，显示 ProviderForm（name / baseUrl / apiKey / defaultModel）
- 列表：每个 Provider 一行，显示 name / baseUrl / defaultModel / 启用开关 / 编辑 / 删除 / "测试连接"按钮
- 顶部还有"默认 Provider"选择器（dropdown），保存到 `/api/llm/settings`

- [ ] **Step 1: 实现 ProviderForm**

`src/components/llm/provider-form.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type ProviderFormValues = {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

export function ProviderForm({
  initial,
  apiKeyOptional = false,
  onSubmit,
  submitLabel = '保存',
}: {
  initial?: Partial<ProviderFormValues>;
  apiKeyOptional?: boolean;
  onSubmit: (values: ProviderFormValues) => Promise<void>;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? '');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ name, baseUrl, apiKey, defaultModel });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label>名称</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label>Base URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          required
        />
      </div>
      <div>
        <Label>
          API Key{apiKeyOptional && <span className="ml-1 text-xs text-muted-foreground">（留空保持不变）</span>}
        </Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={apiKeyOptional ? '••••••••（不修改请留空）' : 'sk-...'}
          required={!apiKeyOptional}
        />
      </div>
      <div>
        <Label>默认 Model</Label>
        <Input
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder="gpt-4 / claude-opus-4-7 / deepseek-chat"
          required
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? '保存中…' : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: 实现 TestConnectionButton**

`src/components/llm/test-connection-button.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TestConnectionButton({ providerId }: { providerId: string }) {
  const [busy, setBusy] = useState(false);
  async function handleTest() {
    setBusy(true);
    try {
      const res = await fetch(`/api/llm/providers/${providerId}/test`, { method: 'POST' });
      const json = (await res.json()) as { ok: boolean; sample?: string; message?: string; latencyMs: number };
      if (json.ok) {
        toast.success(`连接正常 (${json.latencyMs}ms): ${(json.sample ?? '').slice(0, 40)}`);
      } else {
        toast.error(`连接失败: ${(json.message ?? '').slice(0, 200)}`);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={handleTest} disabled={busy}>
      {busy ? '测试中…' : '测试连接'}
    </Button>
  );
}
```

- [ ] **Step 3: 实现 /settings/llm 页面**

`src/app/(app)/settings/llm/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProviderForm } from '@/components/llm/provider-form';
import { TestConnectionButton } from '@/components/llm/test-connection-button';
import { toast } from 'sonner';

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
};

type DefaultSetting = { providerId: string | null; model: string | null };

export default function LLMSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [adding, setAdding] = useState(false);

  async function loadAll() {
    const [pr, st] = await Promise.all([
      fetch('/api/llm/providers').then((r) => r.json() as Promise<Provider[]>),
      fetch('/api/llm/settings').then((r) => r.json() as Promise<DefaultSetting>),
    ]);
    setProviders(pr);
    setDefaultProviderId(st.providerId);
  }

  useEffect(() => { void loadAll(); }, []);

  async function createProvider(values: { name: string; baseUrl: string; apiKey: string; defaultModel: string }) {
    const res = await fetch('/api/llm/providers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      toast.error('保存失败');
      return;
    }
    toast.success('已添加');
    setAdding(false);
    await loadAll();
  }

  async function updateProvider(id: string, values: { name: string; baseUrl: string; apiKey: string; defaultModel: string }) {
    const body: Record<string, unknown> = {
      name: values.name, baseUrl: values.baseUrl, defaultModel: values.defaultModel,
    };
    if (values.apiKey) body.apiKey = values.apiKey;
    const res = await fetch(`/api/llm/providers/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error('保存失败');
      return;
    }
    toast.success('已保存');
    setEditing(null);
    await loadAll();
  }

  async function removeProvider(id: string) {
    if (!confirm('确认删除此 Provider？相关 AI 历史会一并删除。')) return;
    const res = await fetch(`/api/llm/providers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已删除');
      await loadAll();
    }
  }

  async function setDefault(providerId: string) {
    const res = await fetch('/api/llm/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId }),
    });
    if (res.ok) {
      toast.success('默认 Provider 已设置');
      setDefaultProviderId(providerId);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">LLM Provider</h1>
        <Button onClick={() => setAdding(true)}>添加 Provider</Button>
      </div>

      {adding && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">新增 Provider</h2>
          <ProviderForm onSubmit={createProvider} submitLabel="添加" />
          <Button variant="ghost" onClick={() => setAdding(false)}>取消</Button>
        </Card>
      )}

      <div className="space-y-3">
        {providers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">还没有配置任何 LLM Provider。点击右上角添加。</p>
        )}
        {providers.map((p) => (
          <Card key={p.id} className="space-y-3 p-4">
            {editing?.id === p.id ? (
              <ProviderForm
                initial={p}
                apiKeyOptional
                onSubmit={(v) => updateProvider(p.id, v)}
                submitLabel="保存"
              />
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {defaultProviderId === p.id && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">默认</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.baseUrl} · model: {p.defaultModel}</div>
                </div>
                <TestConnectionButton providerId={p.id} />
                {defaultProviderId !== p.id && (
                  <Button size="sm" variant="ghost" onClick={() => void setDefault(p.id)}>设为默认</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>编辑</Button>
                <Button size="sm" variant="ghost" onClick={() => void removeProvider(p.id)}>删除</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 手动验证**

Run: `pnpm dev`，登录后访问 `/settings/llm`：空状态正常；添加表单可填可关。

- [ ] **Step 5: 提交**

```bash
git add src/app/'(app)'/settings/llm src/components/llm
git commit -m "feat(ui): /settings/llm provider management page"
```

### Task 15: Prompt 模板编辑页 /settings/prompts

**Files:**
- Create: `src/app/(app)/settings/prompts/page.tsx`

UI：左侧 7 种 type 列表，右侧 systemPrompt + userTemplate 双 textarea + "保存" + "恢复默认"。

- [ ] **Step 1: 实现**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Tpl = {
  id: string | null;
  type: string;
  systemPrompt: string;
  userTemplate: string;
  isCustomized: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  WORK_REVIEW: '单作品复盘',
  TOPIC_SUGGEST: '选题建议',
  COPY_OPTIMIZE: '文案优化',
  WORKS_COMPARE: '横向对比',
  TREND: '趋势分析',
  COMMENT_INSIGHT: '评论洞察',
  BENCHMARK: '对标分析',
};

export default function PromptsPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [activeType, setActiveType] = useState('WORK_REVIEW');
  const [system, setSystem] = useState('');
  const [user, setUser] = useState('');

  async function load() {
    const list = await fetch('/api/llm/prompt-templates').then((r) => r.json() as Promise<Tpl[]>);
    setTemplates(list);
    const cur = list.find((t) => t.type === activeType);
    if (cur) {
      setSystem(cur.systemPrompt);
      setUser(cur.userTemplate);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const cur = templates.find((t) => t.type === activeType);
    if (cur) {
      setSystem(cur.systemPrompt);
      setUser(cur.userTemplate);
    }
  }, [activeType, templates]);

  async function save() {
    const res = await fetch('/api/llm/prompt-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: activeType, systemPrompt: system, userTemplate: user }),
    });
    if (res.ok) {
      toast.success('已保存');
      await load();
    } else {
      toast.error('保存失败');
    }
  }

  async function reset() {
    const cur = templates.find((t) => t.type === activeType);
    if (!cur?.id) {
      toast.message('当前已是默认模板');
      return;
    }
    if (!confirm('恢复默认模板？此操作不可撤销。')) return;
    const res = await fetch(`/api/llm/prompt-templates/${cur.id}/reset`, { method: 'POST' });
    if (res.ok) {
      toast.success('已恢复默认');
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Prompt 模板</h1>
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-3 p-2">
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.type}>
                <button
                  onClick={() => setActiveType(t.type)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                    activeType === t.type ? 'bg-muted' : ''
                  }`}
                >
                  <div>{TYPE_LABEL[t.type] ?? t.type}</div>
                  {t.isCustomized && (
                    <div className="text-xs text-primary">已自定义</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="col-span-9 space-y-3 p-4">
          <div>
            <Label>System Prompt</Label>
            <textarea
              className="h-32 w-full rounded-md border px-3 py-2 font-mono text-sm"
              value={system}
              onChange={(e) => setSystem(e.target.value)}
            />
          </div>
          <div>
            <Label>User Template (用 {`{{var}}`} 占位)</Label>
            <textarea
              className="h-48 w-full rounded-md border px-3 py-2 font-mono text-sm"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()}>保存</Button>
            <Button variant="ghost" onClick={() => void reset()}>恢复默认</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `pnpm dev`，访问 `/settings/prompts`：7 种类型列表显示；切换、编辑、保存、恢复默认。

- [ ] **Step 3: 提交**

```bash
git add src/app/'(app)'/settings/prompts
git commit -m "feat(ui): /settings/prompts prompt template editor"
```

---

## Phase F · 收尾

### Task 16: 把入口加到 Settings 主页 + Sidebar

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`（如已存在则加链接，没有就跳过）
- Modify: `src/components/layout/sidebar.tsx`（如有 settings 子菜单则加链接，没有则跳过）

- [ ] **Step 1: 找到 Settings 主页或 Sidebar，加两条链接**

加入：
- "LLM Provider" → `/settings/llm`
- "Prompt 模板" → `/settings/prompts`

如果都没有现成入口结构，跳过本任务，用户可以直接访问 URL。

- [ ] **Step 2: 提交**

```bash
git add src/app src/components/layout
git commit -m "feat(ui): link LLM and prompts pages from settings"
```

### Task 17: 最终验证 Gate

**Goal:** Plan 4a 编译/测试/lint/build 全通。

- [ ] **Step 1: 类型 + lint + 测试**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: 全部通过。

预期测试数：105 (Plan 3) + 新增（client 4 + registry 2 + providers 3 + provider-detail 5 + test-connection 2 + settings 3 + default-prompts 4 + prompt-templates 4 = 27） = **132 tests**。

- [ ] **Step 2: 本地构建**

Run: `pnpm build`
Expected: 构建成功。

- [ ] **Step 3: 启动 + 手动 smoke**

Run: `pnpm dev`，浏览器中：
1. `/settings/llm` 渲染、空状态正常
2. 添加 Provider（用任意 baseUrl 即可，name="Test"）→ 列表出现
3. "测试连接" 按钮点击：因为是假地址会失败，但应能看到"连接失败: ..." toast（不会 500）
4. 设为默认 → 标签出现
5. `/settings/prompts` 渲染，7 种类型列表，可切换、编辑、保存、恢复默认

> 真正的"测试连接通过"需要用户填入真实可用的 OpenAI 兼容端点 + key。本步骤只验证 UI 流程不崩。

- [ ] **Step 4: 工作树清洁度**

Run: `git status`
Expected: 无未提交变更。

- [ ] **Step 5: 总结**

终端输出：

```
Plan 4a (AI 基础设施) 完成。
- DB 模型：LLMProvider / PromptTemplate / AIAnalysis / AIChat / AIChatMessage（5 张新表）
- LLM 抽象：lib/llm/{types,client,registry,default-prompts}
- API：providers CRUD + 连通性测试 + 默认设置 + prompt 模板 CRUD + reset
- UI：/settings/llm /settings/prompts
- 测试：~132 总数（27 新增）
下一步：Plan 4b (AI Chat)。
```

---

## 自检清单

**Spec 覆盖：**
- 6.1 LLM 抽象 / 多 Provider / OpenAI 兼容协议 → Task 4-7 ✅
- 6.1 配置 baseUrl/apiKey/defaultModel → Task 8-9 ✅（API Key 加密入库）
- 6.3 Prompt 模板存表，用户可编辑+恢复默认 → Task 12-13, 15 ✅（默认模板存代码常量，用户保存才入库；reset 删行）
- 6.3 完整记录到 AIAnalysis → Schema 已加 (Task 3)，使用在 Plan 4c
- 6.4 AI Chat → Schema 已加 (Task 3)，UI/API 在 Plan 4b
- 4.4 AIAnalysis / AIChat / AIChatMessage 表结构 → Task 3 ✅

**Placeholder 扫描：** `default-prompts.ts` 中 4 个非 P0 类型用 `'TODO (Plan 4c)'` 字面字符串作占位——这是有意为之，Plan 4c 替换。其他无 TBD/TODO 占位。

**类型一致性：**
- `LLMProviderConfig.apiKey` 是明文（运行内存）；`LLMProvider.apiKeyEncrypted` 是 DB 字段；从未交叉混用 ✅
- `AIAnalysisType` enum 在 Prisma 与 TS Record 类型中定义一致 ✅
- API 返回的 provider DTO 永不包含 `apiKeyEncrypted`（用 `SAFE_SELECT` 强制） ✅

**已知限制（写入 Plan 但不实施）：**
- 没有 admin token 隔离：当前只要登录就能查/改 Provider 配置——MVP 个人单密码足够
- 测试连接的"ping"是真实计费请求，但 maxOutputTokens=8 控制成本
- `default_llm_provider` 设置全局只一份，没有按任务类型选 Provider 的能力（4c 可扩展）
