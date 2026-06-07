# AI 批量生成文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在素材库中新增"AI 批量生成文案"功能：用户填写要求 + 数量（可选对标账号、可选风格参考），LLM 流式产出 N 条 markdown 文案，预览页挑选编辑后批量入库为 `Material(type=COPY)` 并打"AI 生成"标签。

**Architecture:** 复用现有 `streamAnalysisTask` + SSE + LLM client 基建。新增一个 `AIAnalysisType` enum 值（`COPY_BATCH_GEN`）、一个 ai-task 模块、两个 API 路由（流式生成、批量入库）、一个客户端页面（表单 + 流式预览 + 入库）。LLM 输出格式约定为 `## 标题\n正文\n---\n## 标题\n正文……`，前端以纯函数 `parseGeneratedCopies` 切片成卡片。

**Tech Stack:** Next.js 15 App Router + React 19 + TypeScript strict + Prisma 6 (SQLite) + Vitest + AI SDK v6 + Tailwind v4 + shadcn/ui + zod。

参考 spec：`docs/superpowers/specs/2026-06-07-ai-bulk-copy-generation-design.md`

---

## Task 1: 数据库 Schema 迁移（新增 COPY_BATCH_GEN enum 值）

**Files:**
- Modify: `prisma/schema.prisma:267-276`

- [ ] **Step 1: 修改 enum**

在 `prisma/schema.prisma` 的 `AIAnalysisType` enum 中追加 `COPY_BATCH_GEN`。

```prisma
enum AIAnalysisType {
  WORK_REVIEW
  TOPIC_SUGGEST
  COPY_OPTIMIZE
  WORKS_COMPARE
  TREND
  COMMENT_INSIGHT
  COMMENT_REPLY
  BENCHMARK
  COPY_BATCH_GEN
}
```

- [ ] **Step 2: 同步到 dev.db**

Run: `pnpm prisma db push`
Expected: `dev.db` 应用新的 enum 值；Prisma client 自动重新生成。

> **不要** 用 `prisma migrate dev`。本项目的历史 migrations 是 postgres SQL（commit 5fb657c 切到 sqlite 后未重建），`migrate dev` 会因为 provider 不匹配 + drift 触发 reset 提示，会清空 dev.db。`db push` 直接同步 schema，不动现有数据。

- [ ] **Step 3: 提交**

```bash
git add prisma/schema.prisma prisma/dev.db
git commit -m "feat(ai): add COPY_BATCH_GEN to AIAnalysisType enum"
```

---

## Task 2: 纯函数 `parseGeneratedCopies` + 单测

按 `\n+---\n+` 切流式 markdown，每段提取 `## 标题` 与正文；流式中最后一段 `done=false`。

**Files:**
- Test: `tests/lib/ai-tasks/parse-generated-copies.test.ts`
- Create: `src/lib/ai-tasks/parse-generated-copies.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/lib/ai-tasks/parse-generated-copies.test.ts
import { describe, it, expect } from 'vitest';
import { parseGeneratedCopies } from '@/lib/ai-tasks/parse-generated-copies';

describe('parseGeneratedCopies', () => {
  it('parses standard 3-card output (not streaming)', () => {
    const text = '## 标题A\n\n正文A 第一行\n正文A 第二行\n\n---\n\n## 标题B\n\n正文B\n\n---\n\n## 标题C\n\n正文C';
    const cards = parseGeneratedCopies(text, false);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({ title: '标题A', content: '正文A 第一行\n正文A 第二行', done: true });
    expect(cards[1]).toEqual({ title: '标题B', content: '正文B', done: true });
    expect(cards[2]).toEqual({ title: '标题C', content: '正文C', done: true });
  });

  it('marks last card as not done when streaming', () => {
    const text = '## 标题A\n\n正文A\n\n---\n\n## 标题B\n\n正文B 还在写';
    const cards = parseGeneratedCopies(text, true);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.done).toBe(true);
    expect(cards[1]!.done).toBe(false);
  });

  it('falls back to single card when no separator', () => {
    const text = '## 标题\n\n正文，模型没分隔';
    const cards = parseGeneratedCopies(text, false);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ title: '标题', content: '正文，模型没分隔', done: true });
  });

  it('falls back to empty title when missing ##', () => {
    const text = '没有标题的正文\n\n---\n\n## 有标题\n\n正文B';
    const cards = parseGeneratedCopies(text, false);
    expect(cards[0]).toEqual({ title: '', content: '没有标题的正文', done: true });
    expect(cards[1]).toEqual({ title: '有标题', content: '正文B', done: true });
  });

  it('preserves emoji and hashtags in content', () => {
    const text = '## 钩子\n\n第一句 🔥\n#话题1 #话题2\n\n---\n\n## 钩子2\n\n正文 😂';
    const cards = parseGeneratedCopies(text, false);
    expect(cards[0]!.content).toBe('第一句 🔥\n#话题1 #话题2');
    expect(cards[1]!.content).toBe('正文 😂');
  });

  it('handles blank input', () => {
    expect(parseGeneratedCopies('', false)).toEqual([{ title: '', content: '', done: true }]);
    expect(parseGeneratedCopies('', true)).toEqual([{ title: '', content: '', done: false }]);
  });

  it('tolerates extra blank lines around separator', () => {
    const text = '## A\n\n正文A\n\n\n---\n\n\n## B\n\n正文B';
    const cards = parseGeneratedCopies(text, false);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.content).toBe('正文A');
    expect(cards[1]!.content).toBe('正文B');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test tests/lib/ai-tasks/parse-generated-copies.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯函数**

```ts
// src/lib/ai-tasks/parse-generated-copies.ts
export type GeneratedCopyCard = {
  title: string;
  content: string;
  done: boolean;
};

export function parseGeneratedCopies(
  text: string,
  streaming: boolean,
): GeneratedCopyCard[] {
  const parts = text.split(/\n+---\n+/);
  return parts.map((part, i) => {
    const trimmed = part.trim();
    const m = trimmed.match(/^##\s+(.+?)\n+([\s\S]*)$/);
    const title = m?.[1]?.trim() ?? '';
    const content = (m ? m[2] : trimmed).trim();
    const isLast = i === parts.length - 1;
    const done = !streaming || !isLast;
    return { title, content, done };
  });
}
```

- [ ] **Step 4: 测试通过**

Run: `pnpm test tests/lib/ai-tasks/parse-generated-copies.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai-tasks/parse-generated-copies.ts tests/lib/ai-tasks/parse-generated-copies.test.ts
git commit -m "feat(ai): add parseGeneratedCopies for slicing batch markdown output"
```

---

## Task 3: 添加 `COPY_BATCH_GEN` 默认 Prompt

**Files:**
- Modify: `src/lib/llm/default-prompts.ts:8-57`

- [ ] **Step 1: 写入默认 prompt**

在 `DEFAULT_PROMPTS` 对象末尾追加：

```ts
COPY_BATCH_GEN: {
  systemPrompt:
    '你是短视频文案创作者，擅长在抖音/小红书等平台写出有钩子、有节奏、自然口语化的短文案。基于用户给定的方向、对标爆款和风格样本，批量产出 N 条**风格各异**的可直接发布的文案。每条都应有差异化角度（开头钩子、叙事方式、情绪基调），避免雷同。',
  userTemplate:
    '账号定位：{{niche}}\n本次方向 / 要求：{{direction}}\n需要生成数量：{{count}} 条\n\n{{benchmarksBlock}}\n\n{{styleSamplesBlock}}\n\n输出格式（严格遵守）：\n- 每条文案：先一行 `## ` 开头的标题（不含编号），空一行后写正文\n- 正文允许换行、emoji、话题标签\n- 每条之间用单独一行 `---` 分隔（首条前面不写、末条后面不写）\n- 不要输出任何编号、解释、前后语、不要包裹引号\n\n请输出 {{count}} 条文案。',
},
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。`AIAnalysisType` enum 包含 `COPY_BATCH_GEN` 后，`Record<AIAnalysisType, DefaultPrompt>` 要求覆盖该项；如果没有 enum 值会报缺失键错误（说明 Task 1 没做对）。

- [ ] **Step 3: 提交**

```bash
git add src/lib/llm/default-prompts.ts
git commit -m "feat(ai): add COPY_BATCH_GEN default prompt"
```

---

## Task 4: `copy-batch-gen.ts` 任务模块

**Files:**
- Create: `src/lib/ai-tasks/copy-batch-gen.ts`

**接口：** 导出 `streamCopyBatchGen(input)` 返回 `AsyncIterable<StreamAnalysisChunk>`，复用 `streamAnalysisTask`。`input` 形状：

```ts
type CopyBatchGenInput = {
  niche: string;
  direction: string;
  count: number;
  referenceAccountId?: string | null;
  benchmarkAccountId?: string | null;
  benchmarkWorkIds?: string[];
  ownerAccountId?: string | null;
};
```

- [ ] **Step 1: 实现**

```ts
// src/lib/ai-tasks/copy-batch-gen.ts
import { db } from '@/lib/db';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { sanitizeCopy } from './utils';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

export type CopyBatchGenInput = {
  niche: string;
  direction: string;
  count: number;
  referenceAccountId?: string | null;
  benchmarkAccountId?: string | null;
  benchmarkWorkIds?: string[];
  ownerAccountId?: string | null;
};

async function buildBenchmarksBlock(
  benchmarkAccountId: string | null | undefined,
  benchmarkWorkIds: string[] | undefined,
): Promise<string> {
  if (!benchmarkAccountId || !benchmarkWorkIds || benchmarkWorkIds.length === 0) {
    return '（无对标参考）';
  }
  const works = await db.benchmarkWork.findMany({
    where: { id: { in: benchmarkWorkIds }, benchmarkAccountId },
  });
  if (works.length === 0) return '（无对标参考）';

  const lines = works.map((w, i) => {
    const stats = [
      w.play != null && `播放 ${w.play.toLocaleString()}`,
      w.like != null && `点赞 ${w.like.toLocaleString()}`,
      w.comment != null && `评论 ${w.comment.toLocaleString()}`,
    ]
      .filter(Boolean)
      .join('、');
    const desc = w.description ? `\n   描述：${w.description.slice(0, 100)}` : '';
    return `${i + 1}. ${w.title}${desc}\n   数据：${stats || '（无）'}`;
  });
  return `对标爆款（${works.length} 条）：\n${lines.join('\n\n')}`;
}

async function buildStyleSamplesBlock(
  referenceAccountId: string | null | undefined,
): Promise<string> {
  if (!referenceAccountId) return '（无风格参考）';

  const works = await db.work.findMany({
    where: { platformAccountId: referenceAccountId },
    include: { metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 } },
    take: 100,
  });

  const withMetric = works
    .map((w) => ({ ...w, latestMetric: w.metrics[0] || null }))
    .filter((w) => w.latestMetric !== null);

  if (withMetric.length === 0) return '（无风格参考）';

  const avg =
    withMetric.reduce(
      (sum, w) => sum + (w.latestMetric!.like + w.latestMetric!.comment),
      0,
    ) / withMetric.length;

  const top = withMetric
    .filter(
      (w) => w.latestMetric!.like + w.latestMetric!.comment > avg * 1.5,
    )
    .slice(0, 5);

  if (top.length === 0) return '（无风格参考）';

  const lines = top.map((w, i) => {
    const text = w.description || w.title;
    return `${i + 1}. ${sanitizeCopy(text)}`;
  });
  return `本账号高互动文案样本（脱敏）：\n${lines.join('\n\n')}`;
}

async function preparePrompt(input: CopyBatchGenInput): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'COPY_BATCH_GEN' },
  });
  const template = customTemplate || DEFAULT_PROMPTS.COPY_BATCH_GEN;

  const benchmarksBlock = await buildBenchmarksBlock(
    input.benchmarkAccountId,
    input.benchmarkWorkIds,
  );
  const styleSamplesBlock = await buildStyleSamplesBlock(input.referenceAccountId);

  const userPrompt = fillTemplate(template.userTemplate, {
    niche: input.niche,
    direction: input.direction,
    count: String(input.count),
    benchmarksBlock,
    styleSamplesBlock,
  });

  return { systemPrompt: template.systemPrompt, userPrompt };
}

export function calcMaxOutputTokens(count: number): number {
  return Math.min(8000, 400 * count + 500);
}

export async function* streamCopyBatchGen(
  input: CopyBatchGenInput,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt } = await preparePrompt(input);

  yield* streamAnalysisTask({
    type: 'COPY_BATCH_GEN',
    systemPrompt,
    userPrompt,
    targetRefs: {
      niche: input.niche,
      direction: input.direction,
      count: input.count,
      referenceAccountId: input.referenceAccountId ?? null,
      benchmarkAccountId: input.benchmarkAccountId ?? null,
      benchmarkWorkIds: input.benchmarkWorkIds ?? [],
      ownerAccountId: input.ownerAccountId ?? null,
    },
    maxOutputTokens: calcMaxOutputTokens(input.count),
  });
}

// 暴露给单测
export const __test__ = { preparePrompt };
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/lib/ai-tasks/copy-batch-gen.ts
git commit -m "feat(ai): add copy-batch-gen task module"
```

---

## Task 5: `copy-batch-gen` Prompt 拼装集成测试

按现有 `tests/api/materials/copy.test.ts` 风格，使用真实 dev DB（与现有所有测试一致）。每个 case 自己 setup/cleanup 测试数据。

**Files:**
- Test: `tests/lib/ai-tasks/copy-batch-gen.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/lib/ai-tasks/copy-batch-gen.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  __test__,
  calcMaxOutputTokens,
} from '@/lib/ai-tasks/copy-batch-gen';

const prisma = new PrismaClient();

describe('copy-batch-gen prompt assembly', () => {
  let benchmarkAccountId: string;
  let benchmarkWorkIds: string[] = [];
  let referenceAccountId: string;

  beforeAll(async () => {
    const ba = await prisma.benchmarkAccount.create({
      data: { platform: 'DOUYIN', nickname: '@测试对标', secUid: 'test-benchmark-secuid-' + Date.now() },
    });
    benchmarkAccountId = ba.id;
    const w1 = await prisma.benchmarkWork.create({
      data: {
        benchmarkAccountId: ba.id,
        title: '爆款标题1',
        description: '爆款描述1',
        play: 1_000_000,
        like: 50_000,
        comment: 2_000,
      },
    });
    const w2 = await prisma.benchmarkWork.create({
      data: {
        benchmarkAccountId: ba.id,
        title: '爆款标题2',
        play: 800_000,
        like: 30_000,
      },
    });
    benchmarkWorkIds = [w1.id, w2.id];

    const own = await prisma.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: '我的账号',
        secUid: 'own-secuid-' + Date.now(),
        cookieEncrypted: 'encrypted-placeholder',
      },
    });
    referenceAccountId = own.id;
  });

  afterAll(async () => {
    await prisma.benchmarkWork.deleteMany({ where: { id: { in: benchmarkWorkIds } } });
    await prisma.benchmarkAccount.deleteMany({ where: { id: benchmarkAccountId } });
    await prisma.platformAccount.deleteMany({ where: { id: referenceAccountId } });
    await prisma.$disconnect();
  });

  it('builds prompt with only direction (no benchmarks, no style samples)', async () => {
    const { systemPrompt, userPrompt } = await __test__.preparePrompt({
      niche: '家居 vlog',
      direction: '推荐 3 件平价好物',
      count: 5,
    });
    expect(systemPrompt).toContain('短视频文案创作者');
    expect(userPrompt).toContain('账号定位：家居 vlog');
    expect(userPrompt).toContain('推荐 3 件平价好物');
    expect(userPrompt).toContain('需要生成数量：5 条');
    expect(userPrompt).toContain('（无对标参考）');
    expect(userPrompt).toContain('（无风格参考）');
    expect(userPrompt).toContain('请输出 5 条文案');
  });

  it('includes benchmark works when ids provided', async () => {
    const { userPrompt } = await __test__.preparePrompt({
      niche: '测试',
      direction: '测试方向',
      count: 3,
      benchmarkAccountId,
      benchmarkWorkIds,
    });
    expect(userPrompt).toContain('对标爆款（2 条）');
    expect(userPrompt).toContain('爆款标题1');
    expect(userPrompt).toContain('爆款标题2');
    expect(userPrompt).toContain('播放 1,000,000');
    expect(userPrompt).not.toContain('（无对标参考）');
  });

  it('skips benchmark works belonging to a different account (security)', async () => {
    const { userPrompt } = await __test__.preparePrompt({
      niche: '测试',
      direction: '测试方向',
      count: 3,
      benchmarkAccountId: 'non-existent-id',
      benchmarkWorkIds,
    });
    expect(userPrompt).toContain('（无对标参考）');
  });

  it('falls back when reference account has no high-engagement works', async () => {
    const { userPrompt } = await __test__.preparePrompt({
      niche: '测试',
      direction: '测试方向',
      count: 3,
      referenceAccountId,
    });
    expect(userPrompt).toContain('（无风格参考）');
  });

  it('calcMaxOutputTokens scales with count and caps at 8000', () => {
    expect(calcMaxOutputTokens(1)).toBe(900);
    expect(calcMaxOutputTokens(5)).toBe(2500);
    expect(calcMaxOutputTokens(10)).toBe(4500);
    expect(calcMaxOutputTokens(20)).toBe(8000);
    expect(calcMaxOutputTokens(100)).toBe(8000);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败到通过**

Run: `pnpm test tests/lib/ai-tasks/copy-batch-gen.test.ts`
Expected: 5 tests pass。如失败，根据测试输出微调 `copy-batch-gen.ts`（不该改测试）。

- [ ] **Step 3: 提交**

```bash
git add tests/lib/ai-tasks/copy-batch-gen.test.ts
git commit -m "test(ai): cover copy-batch-gen prompt assembly"
```

---

## Task 6: 流式生成 API 路由

**Files:**
- Create: `src/app/api/ai/copy-batch-gen/stream/route.ts`

- [ ] **Step 1: 实现**

```ts
// src/app/api/ai/copy-batch-gen/stream/route.ts
import { z } from 'zod';
import { streamCopyBatchGen } from '@/lib/ai-tasks/copy-batch-gen';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z.object({
  niche: z.string().min(1).max(50),
  direction: z.string().min(1).max(500),
  count: z.number().int().min(1).max(20),
  referenceAccountId: z.string().nullable().optional(),
  benchmarkAccountId: z.string().nullable().optional(),
  benchmarkWorkIds: z.array(z.string()).max(10).optional(),
  ownerAccountId: z.string().nullable().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  return createSSEResponse(streamCopyBatchGen(parsed.data));
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/ai/copy-batch-gen/stream/route.ts
git commit -m "feat(ai): add /api/ai/copy-batch-gen/stream SSE endpoint"
```

---

## Task 7: 批量入库 API 路由 + 集成测试

**Files:**
- Test: `tests/api/ai/copy-batch-gen-save.test.ts`
- Create: `src/app/api/ai/copy-batch-gen/save/route.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/api/ai/copy-batch-gen-save.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/ai/copy-batch-gen/save/route';

const prisma = new PrismaClient();

describe('POST /api/ai/copy-batch-gen/save', () => {
  const createdIds: string[] = [];
  let ownerAccountId: string;

  beforeAll(async () => {
    const acc = await prisma.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: 'save-test',
        secUid: 'save-test-secuid-' + Date.now(),
        cookieEncrypted: 'encrypted-placeholder',
      },
    });
    ownerAccountId = acc.id;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.material.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.platformAccount.deleteMany({ where: { id: ownerAccountId } });
    // 清理 "AI 生成" 标签若无引用（其他测试可能也用，所以仅在无关联时删）
    const tag = await prisma.materialTag.findUnique({ where: { name: 'AI 生成' } });
    if (tag) {
      const cnt = await prisma.material.count({
        where: { tags: { some: { id: tag.id } } },
      });
      if (cnt === 0) {
        await prisma.materialTag.delete({ where: { id: tag.id } });
      }
    }
    await prisma.$disconnect();
  });

  it('creates N COPY materials with AI-generated tag', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { title: '标题A', content: '正文A' },
            { title: '标题B', content: '正文B' },
          ],
          ownerAccountId,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.ids).toHaveLength(2);
    createdIds.push(...data.ids);

    const materials = await prisma.material.findMany({
      where: { id: { in: data.ids } },
      include: { tags: true },
    });
    expect(materials).toHaveLength(2);
    for (const m of materials) {
      expect(m.type).toBe('COPY');
      expect(m.platformAccountId).toBe(ownerAccountId);
      expect(m.tags.some((t) => t.name === 'AI 生成')).toBe(true);
    }
  });

  it('reuses existing AI 生成 tag (idempotent)', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ title: '标题C', content: '正文C' }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    createdIds.push(...data.ids);

    const tags = await prisma.materialTag.findMany({ where: { name: 'AI 生成' } });
    expect(tags).toHaveLength(1);
  });

  it('rejects empty items', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects more than 20 items', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      title: `t${i}`,
      content: `c${i}`,
    }));
    const res = await POST(
      new Request('http://localhost/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test tests/api/ai/copy-batch-gen-save.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现路由**

```ts
// src/app/api/ai/copy-batch-gen/save/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const SaveSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        content: z.string().min(1).max(5000),
      }),
    )
    .min(1)
    .max(20),
  ownerAccountId: z.string().nullable().optional(),
  sourceAnalysisId: z.string().optional(),
});

const AI_TAG_NAME = 'AI 生成';
const AI_TAG_COLOR = '#8b5cf6';

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { items, ownerAccountId } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const tag = await tx.materialTag.upsert({
        where: { name: AI_TAG_NAME },
        update: {},
        create: { name: AI_TAG_NAME, color: AI_TAG_COLOR },
      });

      const ids: string[] = [];
      for (const item of items) {
        const m = await tx.material.create({
          data: {
            type: 'COPY',
            title: item.title,
            content: item.content,
            platformAccountId: ownerAccountId ?? null,
            tags: { connect: [{ id: tag.id }] },
          },
        });
        ids.push(m.id);
      }
      return ids;
    });

    return NextResponse.json(
      { created: result.length, ids: result },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'save_failed', message: String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: 测试通过**

Run: `pnpm test tests/api/ai/copy-batch-gen-save.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: 提交**

```bash
git add src/app/api/ai/copy-batch-gen/save/route.ts tests/api/ai/copy-batch-gen-save.test.ts
git commit -m "feat(ai): add /api/ai/copy-batch-gen/save batch insert endpoint"
```

---

## Task 8: `BenchmarkWorksPicker` 客户端组件

选中对标账号后，从 `/api/benchmark-works?accountId=...` 拉作品，前端按 `play` 降序、截前 20 条，渲染带 checkbox 的紧凑列表。最多勾 10 条。

**Files:**
- Create: `src/components/materials/benchmark-works-picker.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/components/materials/benchmark-works-picker.tsx
'use client';

import { useEffect, useState } from 'react';

type BenchmarkWork = {
  id: string;
  title: string;
  play: number | null;
  like: number | null;
};

type Props = {
  benchmarkAccountId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
};

export function BenchmarkWorksPicker({
  benchmarkAccountId,
  value,
  onChange,
  max = 10,
}: Props) {
  const [works, setWorks] = useState<BenchmarkWork[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!benchmarkAccountId) {
      setWorks([]);
      return;
    }
    setLoading(true);
    fetch(`/api/benchmark-works?accountId=${benchmarkAccountId}`)
      .then((r) => r.json())
      .then((data: { items: BenchmarkWork[] }) => {
        const sorted = [...data.items]
          .sort((a, b) => (b.play ?? 0) - (a.play ?? 0))
          .slice(0, 20);
        setWorks(sorted);
      })
      .catch(() => setWorks([]))
      .finally(() => setLoading(false));
  }, [benchmarkAccountId]);

  if (!benchmarkAccountId) return null;
  if (loading) {
    return <p className="text-xs text-muted-foreground">加载作品中…</p>;
  }
  if (works.length === 0) {
    return <p className="text-xs text-muted-foreground">该账号暂无录入作品</p>;
  }

  const reachedMax = value.length >= max;

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
    } else if (!reachedMax) {
      onChange([...value, id]);
    }
  }

  return (
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
      <div className="mb-1 text-xs text-muted-foreground">
        勾选作品作为对标参考（已选 {value.length} / {max}）
      </div>
      {works.map((w) => {
        const checked = value.includes(w.id);
        const disabled = !checked && reachedMax;
        return (
          <label
            key={w.id}
            className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-xs hover:bg-muted ${
              disabled ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(w.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="truncate">{w.title}</div>
              <div className="text-muted-foreground">
                播放 {(w.play ?? 0).toLocaleString()} · 点赞{' '}
                {(w.like ?? 0).toLocaleString()}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/materials/benchmark-works-picker.tsx
git commit -m "feat(materials): add BenchmarkWorksPicker component"
```

---

## Task 9: `AICopyGenerator` 主组件

包含表单、流式预览、操作条。同时调用流式生成与批量入库 API。

**Files:**
- Create: `src/components/materials/ai-copy-generator.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/components/materials/ai-copy-generator.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import {
  parseGeneratedCopies,
  type GeneratedCopyCard,
} from '@/lib/ai-tasks/parse-generated-copies';
import { toast } from 'sonner';

type Account = { id: string; nickname: string };
type BenchmarkAccount = { id: string; nickname: string };

type EditableCard = GeneratedCopyCard & { id: string; selected: boolean };

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'finish'; analysisId: string; result: string }
  | { type: 'error'; message: string };

export function AICopyGenerator() {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  // form
  const [niche, setNiche] = useState('');
  const [direction, setDirection] = useState('');
  const [count, setCount] = useState(5);
  const [referenceAccountId, setReferenceAccountId] = useState('');
  const [benchmarkAccountId, setBenchmarkAccountId] = useState('');
  const [benchmarkWorkIds, setBenchmarkWorkIds] = useState<string[]>([]);
  const [ownerAccountId, setOwnerAccountId] = useState('');

  // option lists
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [benchmarkAccounts, setBenchmarkAccounts] = useState<BenchmarkAccount[]>([]);

  // generation state
  const [generating, setGenerating] = useState(false);
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: Account[]) => setAccounts(data))
      .catch(() => {});
    fetch('/api/benchmark-accounts')
      .then((r) => r.json())
      .then((j: { items: BenchmarkAccount[] }) => setBenchmarkAccounts(j.items ?? []))
      .catch(() => {});
  }, []);

  // 风格参考账号变化时联动 owner
  useEffect(() => {
    if (referenceAccountId && !ownerAccountId) {
      setOwnerAccountId(referenceAccountId);
    }
  }, [referenceAccountId, ownerAccountId]);

  // 切换对标账号清空作品勾选
  useEffect(() => {
    setBenchmarkWorkIds([]);
  }, [benchmarkAccountId]);

  function applyParse(text: string, streaming: boolean) {
    const parsed = parseGeneratedCopies(text, streaming);
    if (!streaming && parsed.length === 1 && !text.includes('---')) {
      setWarning('模型未严格分隔，已合并为单条。可手动编辑或重新生成。');
    } else {
      setWarning(null);
    }
    setCards(
      parsed.map((c, i) => ({
        ...c,
        id: `card-${i}`,
        selected: true,
      })),
    );
  }

  async function handleGenerate() {
    if (!niche.trim() || !direction.trim()) {
      toast.error('请填写账号定位和本次方向');
      return;
    }
    if (count < 1 || count > 20) {
      toast.error('数量必须在 1–20 之间');
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setGenerating(true);
    setCards([]);
    setWarning(null);
    setAnalysisId(null);

    try {
      const res = await fetch('/api/ai/copy-batch-gen/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche.trim(),
          direction: direction.trim(),
          count,
          referenceAccountId: referenceAccountId || null,
          benchmarkAccountId: benchmarkAccountId || null,
          benchmarkWorkIds: benchmarkAccountId ? benchmarkWorkIds : [],
          ownerAccountId: ownerAccountId || null,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '生成失败');
      }

      let fullText = '';
      for await (const ev of parseSSEStream<StreamEvent>(res.body)) {
        if (ev.type === 'text') {
          fullText += ev.delta;
          applyParse(fullText, true);
        } else if (ev.type === 'finish') {
          fullText = ev.result;
          applyParse(fullText, false);
          setAnalysisId(ev.analysisId);
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }
      toast.success('生成完成');
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        toast.message('已取消生成');
      } else {
        toast.error(e instanceof Error ? e.message : '生成失败');
      }
    } finally {
      setGenerating(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function updateCard(id: string, patch: Partial<EditableCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleSave() {
    const items = cards
      .filter((c) => c.selected && c.content.trim())
      .map((c) => ({
        title: (c.title.trim() || c.content.trim().slice(0, 30)).slice(0, 100),
        content: c.content.trim().slice(0, 5000),
      }));
    if (items.length === 0) {
      toast.error('请至少勾选一条文案');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          ownerAccountId: ownerAccountId || null,
          sourceAnalysisId: analysisId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '保存失败');
      }
      const data = await res.json();
      toast.success(`已保存 ${data.created} 条到素材库`);
      router.push('/materials?type=COPY');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = cards.filter((c) => c.selected).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Left: form */}
      <Card className="space-y-4 p-4 lg:col-span-2">
        <h2 className="text-lg font-medium">生成参数</h2>

        <div className="space-y-2">
          <Label>账号定位 / 品类 *</Label>
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value.slice(0, 50))}
            placeholder="例：家居 vlog"
          />
        </div>

        <div className="space-y-2">
          <Label>本次方向 / 要求 *</Label>
          <textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value.slice(0, 500))}
            placeholder="例：推荐 3 件平价好物，强调实用与性价比"
            className="h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{direction.length} / 500</p>
        </div>

        <div className="space-y-2">
          <Label>生成数量（1–20）*</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => {
              const n = Number(e.target.value);
              setCount(Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 5);
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>参考本账号风格（可选）</Label>
          <select
            value={referenceAccountId}
            onChange={(e) => setReferenceAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">不参考本账号风格</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>对标账号（可选）</Label>
          <select
            value={benchmarkAccountId}
            onChange={(e) => setBenchmarkAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">不使用对标账号</option>
            {benchmarkAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>

        {benchmarkAccountId && (
          <BenchmarkWorksPickerLazy
            benchmarkAccountId={benchmarkAccountId}
            value={benchmarkWorkIds}
            onChange={setBenchmarkWorkIds}
          />
        )}

        <div className="space-y-2">
          <Label>入库归属账号（可选）</Label>
          <select
            value={ownerAccountId}
            onChange={(e) => setOwnerAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">通用素材（不归属任何账号）</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="flex-1"
          >
            {generating ? '生成中…' : `生成 ${count} 条文案`}
          </Button>
          {generating && (
            <Button variant="outline" onClick={handleCancel}>
              取消
            </Button>
          )}
        </div>
      </Card>

      {/* Right: preview */}
      <Card className="p-4 lg:col-span-3">
        <h2 className="mb-3 text-lg font-medium">预览</h2>

        {warning && (
          <div className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
            {warning}
          </div>
        )}

        {cards.length === 0 && !generating && (
          <p className="text-sm text-muted-foreground">
            填写左侧表单后点&ldquo;生成&rdquo;，结果会在这里逐条出现。
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {cards.map((c) => (
            <div
              key={c.id}
              className={`rounded-md border p-3 ${
                c.selected ? 'border-primary/40 bg-primary/5' : 'opacity-60'
              }`}
            >
              <div className="mb-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={(e) =>
                    updateCard(c.id, { selected: e.target.checked })
                  }
                  className="mt-1"
                />
                <Input
                  value={c.title}
                  onChange={(e) => updateCard(c.id, { title: e.target.value })}
                  placeholder="标题"
                  className="text-sm font-medium"
                />
              </div>
              <textarea
                value={c.content}
                onChange={(e) => updateCard(c.id, { content: e.target.value })}
                className="h-32 w-full rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{c.content.length} 字符</span>
                {!c.done && <span className="animate-pulse">▍ 生成中…</span>}
              </div>
              <div className="mt-2 hidden text-xs">
                <Markdown>{c.content}</Markdown>
              </div>
            </div>
          ))}
        </div>

        {cards.length > 0 && (
          <div className="sticky bottom-0 mt-4 flex items-center justify-between border-t bg-card pt-3">
            <Button variant="outline" onClick={() => void handleGenerate()} disabled={generating}>
              一键再来一批
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                已选 {selectedCount} / {cards.length}
              </span>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || generating || selectedCount === 0}
              >
                {saving ? '保存中…' : `保存所选（${selectedCount}）`}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// 内联导入 picker 避免 SSR 问题
import { BenchmarkWorksPicker } from './benchmark-works-picker';
function BenchmarkWorksPickerLazy(props: {
  benchmarkAccountId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return <BenchmarkWorksPicker {...props} />;
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/materials/ai-copy-generator.tsx
git commit -m "feat(materials): add AICopyGenerator client component"
```

---

## Task 10: `/materials/ai-generate` 页

**Files:**
- Create: `src/app/(app)/materials/ai-generate/page.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/app/(app)/materials/ai-generate/page.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AICopyGenerator } from '@/components/materials/ai-copy-generator';

export default function AIGeneratePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI 批量生成文案</h1>
          <p className="text-sm text-muted-foreground">
            按要求和对标参考一次产出多条文案，挑选后批量入库
          </p>
        </div>
        <Link href="/materials">
          <Button variant="ghost">← 返回素材库</Button>
        </Link>
      </div>
      <AICopyGenerator />
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/\(app\)/materials/ai-generate/page.tsx
git commit -m "feat(materials): add /materials/ai-generate page"
```

---

## Task 11: 素材库入口按钮

在 `/materials` 页右上角加 `AI 生成文案` 按钮，跳到新页。

**Files:**
- Modify: `src/app/(app)/materials/page.tsx:184-198`

- [ ] **Step 1: 修改文件**

修改 `src/app/(app)/materials/page.tsx`：
1. 顶部 import 加 `Link`：
   ```tsx
   import Link from 'next/link';
   ```
2. 把第 184–198 行的 header 区块改成（注意保留搜索框和原"新建素材"按钮）：
   ```tsx
   <main className="flex-1 space-y-6 p-6">
     <div className="flex items-center justify-between">
       <h1 className="text-2xl font-semibold">素材库</h1>
       <div className="flex items-center gap-3">
         <Input
           placeholder="搜索标题"
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
           className="w-60"
         />
         <Link href="/materials/ai-generate">
           <Button variant="outline">AI 生成文案</Button>
         </Link>
         <Button onClick={() => { setCreateType(activeType === 'ALL' ? 'COPY' : activeType); setCreateDialogOpen(true); }}>
           新建素材
         </Button>
       </div>
     </div>
   ```

- [ ] **Step 2: 启动 dev 验证**

Run: `pnpm dev`
然后浏览器打开 `http://localhost:3000/materials`，确认：
1. 右上角看到 `AI 生成文案` 按钮
2. 点击后跳到 `/materials/ai-generate` 页
3. 页面渲染表单 + 空预览状态

按 Ctrl+C 停掉 dev。

- [ ] **Step 3: 提交**

```bash
git add src/app/\(app\)/materials/page.tsx
git commit -m "feat(materials): add AI generate entry button to library page"
```

---

## Task 12: 端到端手动验证 + 检查清单

**Files:** 无修改

- [ ] **Step 1: 跑完整测试套件**

Run: `pnpm test`
Expected: 全绿（包含新增 `parse-generated-copies`、`copy-batch-gen`、`copy-batch-gen-save`）。

- [ ] **Step 2: lint**

Run: `pnpm lint`
Expected: 无错误。

- [ ] **Step 3: build**

Run: `pnpm build`
Expected: 成功，无类型错误。

- [ ] **Step 4: dev 端到端验证**

Run: `pnpm dev`
打开 `http://localhost:3000/materials/ai-generate`，按以下场景手动验证：

  1. **最小路径：** 仅填 niche + direction + count=3 → 点生成 → 看到 3 张卡片流式出现 → 全选保存 → toast 提示 N 条 → 跳到 `/materials?type=COPY` → 看到 3 条新文案带「AI 生成」标签
  2. **对标路径：** 选一个对标账号 → 看到作品 picker → 勾 2 条 → 生成 5 条 → 检查文案是否参考了对标内容的角度
  3. **风格路径：** 选风格参考账号（要求该账号有作品） → 生成 → owner 自动跟随 reference
  4. **取消：** 点生成中点取消 → toast「已取消」→ 已生成的卡片保留可挑选保存
  5. **降级：** 修改 prompt 让模型故意不分隔（或人工触发：将 direction 改为很短的内容观察） → 看到黄色警告 + 单卡显示
  6. **count 上限：** 数字框输 25 → 自动夹到 20
  7. **未选取消保存：** 全部取消勾选 → 保存按钮禁用

记录任何异常截图或行为，修复后重新跑前 3 步。

- [ ] **Step 5: 收尾提交（如有 fix）**

如有手动验证发现的修复，每个 fix 单独提交，前缀 `fix(...)`。

- [ ] **Step 6: 完成**

至此功能完整，spec 中所有需求覆盖。

---

## Self-Review

**Spec coverage：**
- 入口按钮 → Task 11 ✓
- /materials/ai-generate 页 → Task 10 ✓
- 表单字段（niche/direction/count/reference/benchmark/works/owner）→ Task 9 ✓
- 流式 SSE 生成 → Task 6 + Task 4 ✓
- 切片显示 → Task 2 + Task 9 ✓
- 一键再来一批 → Task 9 ✓
- 挑选 + 编辑 → Task 9 ✓
- 批量入库 + AI 生成 tag → Task 7 ✓
- 错误降级（无分隔符、取消、入库失败、count 越界）→ Task 7 + Task 9 ✓
- 测试覆盖（parseGeneratedCopies / prompt assembly / save endpoint）→ Tasks 2/5/7 ✓
- 现有 `COPY_OPTIMIZE`/`BENCHMARK`/`TOPIC_SUGGEST` 不动 ✓

**Placeholder scan：** 无 TBD/TODO；所有代码块均完整可粘贴。

**Type consistency：**
- `GeneratedCopyCard`（Task 2）+ `EditableCard`（Task 9，扩展）：一致
- `parseGeneratedCopies(text, streaming)` 二参签名：Task 2 定义，Task 9 调用，一致
- `streamCopyBatchGen(input)`：Task 4 定义，Task 6 调用，一致
- `CopyBatchGenInput` 字段：与 stream API zod schema 字段一致
- `AI 生成` tag 名：Task 7 常量（路由）+ Task 7 测试（断言）一致

无遗漏。
