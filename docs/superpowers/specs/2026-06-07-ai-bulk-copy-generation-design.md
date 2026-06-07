# AI 批量生成文案 — 设计文档

- 日期：2026-06-07
- 状态：Spec 已确认，待生成实施计划

## 背景与目标

素材库现有的「文案」分类需要用户手工撰写或借助 `/ai/copy-optimize`（草稿优化）一条条产出。为提升内容生产效率，新增**一次性按要求生成 N 条新文案**的能力，并允许用户用对标账号 + 本账号风格做上下文增强。生成结果先在预览页挑选编辑，再批量入库为 `Material(type=COPY)`。

入口：`/materials` 页右上角新增「AI 生成文案」按钮 → 进入 `/materials/ai-generate`。

## 范围

**包含：**
- 单一表单收集生成参数（要求、数量、可选对标账号 + 作品、可选本账号风格参考）
- LLM 单次流式调用产出 N 条 markdown 文案，前端按 `---` 分隔符增量切片成卡片
- 预览页支持挑选、编辑、整批重新生成
- 挑选后批量入库 `Material(type=COPY)`，自动打「AI 生成」标签
- 复用现有 `streamAnalysisTask`、`getDefaultLLMClient`、`<Markdown>`、`parseSSEStream` 等基建

**不包含：**
- 单条「重新生成」（仅支持整批再来一次）
- 视频/图片素材的 AI 生成
- 与 `/ai/copy-optimize`（草稿优化）的合并
- 跨账号勾选对标作品（一次只能选一个对标账号）

## 架构与模块边界

### 新增

| 路径 | 职责 |
|---|---|
| `prisma/schema.prisma` | `AIAnalysisType` enum 中新增 `COPY_BATCH_GEN` |
| `src/lib/ai-tasks/copy-batch-gen.ts` | 新任务模块，结构对齐 `benchmark.ts`，导出 `streamCopyBatchGen()` |
| `src/lib/llm/default-prompts.ts` | 新增 `COPY_BATCH_GEN` 默认 prompt |
| `src/lib/ai-tasks/parse-generated-copies.ts` | 纯函数 `parseGeneratedCopies(text)`，把流式 markdown 切成卡片数组（前后端共享、便于单测） |
| `src/app/api/ai/copy-batch-gen/stream/route.ts` | SSE 端点 |
| `src/app/api/ai/copy-batch-gen/save/route.ts` | 批量入库端点 |
| `src/app/(app)/materials/ai-generate/page.tsx` | 表单 + 预览一体页 |
| `src/components/materials/ai-copy-generator.tsx` | 客户端组件：表单、流式预览、操作条 |
| `src/components/materials/benchmark-works-picker.tsx` | 账号 → 勾选作品的级联选择器 |

### 复用（不动）

- `streamAnalysisTask()`（`src/lib/ai-tasks/stream.ts`）— 流式 + 落 `AIAnalysis` 记录
- `getDefaultLLMClient()`（`src/lib/llm/registry.ts`）
- `BenchmarkAccount` / `BenchmarkWork` 模型与 `/api/benchmark-works` 列表 API
- `Material` / `MaterialTag` 模型
- `<Markdown>` 渲染、`parseSSEStream()` 前端流式解析
- 现有 `/ai/copy-optimize` 不动（草稿优化是不同任务）

### 数据流

```
[表单] ──提交──▶ POST /api/ai/copy-batch-gen/stream
                  │
                  ├─ 拉对标作品（BenchmarkWork by ids）
                  ├─ 拉本账号风格样本（高互动 Work）
                  ├─ 组 prompt（niche、direction、count、benchmarksBlock、styleSamplesBlock）
                  └─ streamAnalysisTask({ type: 'COPY_BATCH_GEN', ... })
                                  │
                                  └─ SSE: text deltas + finish(analysisId)
                                          │
[预览页] ◀──text deltas──┘
   │
   ├─ 累积 fullText，按 \n+---\n+ 切片为卡片，最后一张未完成
   ├─ 用户勾选 / 编辑标题 / 编辑正文
   └─ 「保存所选」 ──POST──▶ /api/ai/copy-batch-gen/save
                              │
                              └─ 事务批量创建 Material(type=COPY) + connect "AI 生成" tag
```

## 表单字段

| 字段 | 类型 | 必填 | 校验 / 行为 |
|---|---|---|---|
| `niche` | text | 是 | 1–50 字 |
| `direction` | textarea | 是 | 1–500 字 |
| `count` | number | 是 | 1–20，默认 5；超过 20 表单拦截 |
| `referenceAccountId` | select(PlatformAccount) | 否 | 选中时取该账号近期高互动 `Work` 文案做风格样本（复用 `copy-optimize.ts` 筛选逻辑：均值 ×1.5 以上、最多 5 条） |
| `benchmarkAccountId` | select(BenchmarkAccount) | 否 | 选中后下方出现作品勾选区 |
| `benchmarkWorkIds` | checkbox list | 否 | 候选 = 该对标账号 Top 20 作品（按 `play` 排序），最多勾 10 条；超过即禁用未勾项 |
| `ownerAccountId` | select(PlatformAccount) | 否 | 入库时 `Material.platformAccountId`；默认与 `referenceAccountId` 联动，可改 |

校验：
- `count > 20` 客户端拦截 + 服务端 zod 拦截
- 服务端校验 `benchmarkWorkIds` 全部属于 `benchmarkAccountId`
- 三个上下文（direction / 风格样本 / 对标作品）至少 `direction` 非空（已由必填覆盖）

## Prompt 设计

写入 `default-prompts.ts` 的 `COPY_BATCH_GEN` 项：

**System：**
> 你是短视频文案创作者，擅长在抖音/小红书等平台写出有钩子、有节奏、自然口语化的短文案。基于用户给定的方向、对标爆款和风格样本，批量产出 N 条**风格各异**的可直接发布的文案。每条都应有差异化角度（开头钩子、叙事方式、情绪基调），避免雷同。

**User template：**
```
账号定位：{{niche}}
本次方向 / 要求：{{direction}}
需要生成数量：{{count}} 条

{{benchmarksBlock}}
{{styleSamplesBlock}}

输出格式（严格遵守）：
- 每条文案：先一行 `## ` 开头的标题（不含编号），空一行后写正文
- 正文允许换行、emoji、话题标签
- 每条之间用单独一行 `---` 分隔（首条前面不写、末条后面不写）
- 不要输出任何编号、解释、前后语、不要包裹引号

请输出 {{count}} 条文案。
```

**变量拼装：**
- `benchmarksBlock`：勾选了对标作品时为 `对标爆款（{n} 条）：\n{list}`，每条 `{title}\n描述：{description前100字}\n数据：播放 X、点赞 Y、评论 Z`；未勾时为 `（无对标参考）`
- `styleSamplesBlock`：选了风格参考账号且有高互动样本时为 `本账号高互动文案样本：\n{list}`；否则为 `（无风格参考）`

**`maxOutputTokens`**：`Math.min(8000, 400 * count + 500)`。

`targetRefs` 写入 `{ niche, direction, count, referenceAccountId, benchmarkAccountId, benchmarkWorkIds, ownerAccountId }` 便于审计。

## 流式切片

抽成纯函数 `parseGeneratedCopies(text: string, streaming: boolean): { title: string; content: string; done: boolean }[]`：

```ts
export function parseGeneratedCopies(text: string, streaming: boolean) {
  const parts = text.split(/\n+---\n+/);
  return parts.map((part, i) => {
    const m = part.match(/^##\s+(.+?)\n+([\s\S]*)$/);
    const title = m?.[1]?.trim() ?? '';
    const content = m?.[2]?.trim() ?? part.trim();
    const isLast = i === parts.length - 1;
    const done = !streaming || !isLast;
    return { title, content, done };
  });
}
```

前端在 SSE 循环里每收一个 `text` 事件就 `setCards(parseGeneratedCopies(fullText, true))`；`finish` 事件后改为 `parseGeneratedCopies(fullText, false)` 让所有卡片标记 done。

## 入库流程

`POST /api/ai/copy-batch-gen/save`：

**请求体（zod）：**
```ts
{
  items: Array<{ title: string; content: string }>,  // min 1, max 20; title 1-100, content 1-5000
  ownerAccountId?: string | null,
  sourceAnalysisId?: string                          // streamAnalysisTask 落库的 AIAnalysis id
}
```

**逻辑：**
1. 在 `db.$transaction` 中：
   - upsert 名为 `AI 生成` 的 `MaterialTag`（color `#8b5cf6`）
   - 对每个 item `db.material.create({ data: { type: 'COPY', title, content, platformAccountId: ownerAccountId ?? null, tags: { connect: [{ id: aiTagId }] } } })`
2. 返回 `{ created: number, ids: string[] }`
3. 任一 create 失败整体回滚（事务隐式）

前端收到响应后 `toast.success('已保存 N 条到素材库')` 跳 `/materials?type=COPY`。

## UI 与入口

### 入口

`/materials` 页右上角现有「新建素材」按钮旁加一个 `<Button variant="outline">AI 生成文案</Button>`，`<Link>` 到 `/materials/ai-generate`。

### `/materials/ai-generate` 页

单页两栏布局：

**左栏 — 表单（约 ⅖ 宽）：**
- 标题 `AI 批量生成文案`
- niche 输入框
- direction textarea
- count number input（带 1–20 提示）
- referenceAccountId select（"不参考本账号风格" + 账号列表）
- benchmarkAccountId select（"不使用对标账号" + 对标账号列表）
- benchmarkWorkIds — 选中对标账号后出现，复用 `<BenchmarkWorksPicker>`
- ownerAccountId select（默认与 reference 联动）
- `[ 生成 N 条文案 ]` 主按钮，`[ 重置 ]` 次按钮

**右栏 — 预览（约 ⅗ 宽）：**
- 未生成：空状态文案
- 生成中 / 已生成：卡片流（grid 2 列）
  - 每卡：左上 checkbox + 标题 input + Markdown 正文（可点「编辑」切到 textarea）+ 字符数 + done 状态光标
- 底部 sticky 操作条：`一键再来一批 / 已选 X / Y / 保存所选`

### `<BenchmarkWorksPicker>` 组件

Props：`{ benchmarkAccountId, value: string[], onChange, max?: 10 }`。

挂载或 id 变化时 `fetch('/api/benchmark-works?accountId=...')`，前端拿到 `{ items }` 后按 `play ?? 0` 降序排序、截前 20 条，再渲染紧凑列表：每行 checkbox + 标题（line-clamp 1）+ play/like 数。`value.length >= max` 时禁用未勾项。

> 现有 `/api/benchmark-works` GET 仅支持 `accountId` 过滤，返回 `{ items }`，默认按 `createdAt desc`。无需改后端，排序和截断在 picker 客户端完成。

## 错误处理

| 场景 | 行为 |
|---|---|
| LLM 调用失败 | streamAnalysisTask 内部 catch → SSE error 事件；前端 toast，保留已生成卡片可挑选；`AIAnalysis.status='FAILED'` |
| 模型不按格式输出（无 `---`） | 整段作为单卡显示，预览页顶部黄色提示「模型未严格分隔，可手动编辑或重新生成」 |
| 用户取消（关页 / 点取消按钮） | `AbortController` 取消 fetch，后端 streamText 中断，`AIAnalysis.error='cancelled'` |
| 入库部分失败 | 事务回滚，toast 错误，不清空预览 |
| `count > 20` | 表单层 + zod 双重拦截 |
| `benchmarkWorkIds` 不属于所选账号 | 服务端 400 |

## 测试

参照 `tests/` 现有结构：

- `tests/lib/ai-tasks/copy-batch-gen.test.ts`：mock LLM client，断言
  - 三种组合的 prompt 拼装：仅 direction / + 风格样本 / + 对标 / 全开
  - `count` 不同时 `maxOutputTokens` 计算
  - `targetRefs` 字段完整
- `tests/lib/ai-tasks/parse-generated-copies.test.ts`：纯函数单测
  - 标准输出（含/不含 emoji、话题标签、代码块）
  - 缺标题（无 `##` 行）
  - 缺分隔（整段单卡）
  - 流式中（最后一张 done=false）vs 完成（全 done）
- `tests/api/ai/copy-batch-gen-save.test.ts`：批量入库 API
  - 成功：N 条 Material 全部入库 + 关联 tag
  - 部分失败：mock 第 K 条 create 抛错，断言事务回滚（最终 Material count 不变）
  - tag upsert 幂等性（已存在时 connect 同一 id）

UI 不强制写自动化测试（项目当前无前端组件测试基建），手动验证：
- 生成中流式可见
- 未严格分隔时降级单卡 + 提示
- 取消按钮中断
- 保存后跳 `/materials?type=COPY` 可见新条目带「AI 生成」标签

## 与现有任务的关系

- **`COPY_OPTIMIZE`**：输入 1 条草稿 → 输出优化版 + 改动点。本任务输入要求 → 输出 N 条新文案。两者独立保留。
- **`BENCHMARK`**：输入对标 → 输出**分析报告**（不是可发布文案）。本任务输入对标 → 输出**可发布文案**。复用对标数据源逻辑，但输出形态不同。
- **`TOPIC_SUGGEST`**：输出选题（标题 + 一句话理由），不是完整文案。

三者在 `/ai/*` 页面独立存在；本任务入口在素材库内（生成→入库一体），不进 `/ai/*` 侧边栏。

## 实施顺序

1. Schema：加 enum 项 + `pnpm prisma migrate dev --name add_copy_batch_gen_type`
2. 后端：`copy-batch-gen.ts` + `default-prompts.ts` + 两个 API 路由 + `parse-generated-copies.ts`
3. 单测：`copy-batch-gen` / `parse-generated-copies` / `save`
4. 前端：`<BenchmarkWorksPicker>` → `<AICopyGenerator>` → `/materials/ai-generate` 页 → `/materials` 入口按钮
5. 手动端到端验证（含异常路径）
6. lint + test + build
