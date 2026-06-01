# Plan 4b: AI 分析任务（P0）

**创建日期**：2026-05-31  
**状态**：In Progress  
**依赖**：Plan 4a (AI Foundation) ✅

---

## 目标

实现 3 个 P0 AI 分析任务：
1. **单作品复盘** (WORK_REVIEW)
2. **选题建议** (TOPIC_SUGGEST)
3. **文案优化** (COPY_OPTIMIZE)

每个任务包含：
- 数据准备逻辑（从 DB 查询 + 组装变量）
- API 端点（触发分析 + 保存结果）
- UI 入口（作品详情页 / 独立页面）

---

## 架构设计

### 1. 目录结构

```
src/
├── lib/
│   └── ai-tasks/
│       ├── work-review.ts       # 单作品复盘
│       ├── topic-suggest.ts     # 选题建议
│       ├── copy-optimize.ts     # 文案优化
│       └── utils.ts             # 共享工具（数据聚合、格式化）
├── app/
│   └── api/
│       └── ai/
│           ├── work-review/route.ts      # POST /api/ai/work-review
│           ├── topic-suggest/route.ts    # POST /api/ai/topic-suggest
│           ├── copy-optimize/route.ts    # POST /api/ai/copy-optimize
│           └── analyses/
│               ├── route.ts              # GET /api/ai/analyses (列表)
│               └── [id]/route.ts         # GET /api/ai/analyses/:id (详情)
└── app/(app)/
    ├── works/[id]/page.tsx               # 作品详情页（添加"AI 复盘"按钮）
    ├── ai/
    │   ├── topic-suggest/page.tsx        # 选题建议页
    │   ├── copy-optimize/page.tsx        # 文案优化页
    │   └── history/page.tsx              # AI 分析历史
    └── ai-chat/page.tsx                  # AI Chat（Plan 4c）
```

### 2. 数据流

```
用户触发 → API Route → ai-tasks/*.ts → LLM Client → 保存 AIAnalysis → 返回结果
                ↓
         准备 Prompt 变量
         (查询 Work/Metrics/历史数据)
```

---

## 任务详细设计

### Task 1: 单作品复盘 (WORK_REVIEW)

**触发入口**：作品详情页 `/works/:id` 的"AI 复盘"按钮

**API**：`POST /api/ai/work-review`

**请求体**：
```json
{
  "workId": "cm..."
}
```

**数据准备**（`lib/ai-tasks/work-review.ts`）：
1. 查询 Work 基本信息（title, description, publishedAt, duration）
2. 查询最新 WorkMetric（play, like, comment, share, collect, finishRate）
3. 查询同账号近 30 天作品的平均指标（historicalAvg）
4. 填充 Prompt 模板变量

**响应**：
```json
{
  "analysisId": "cm...",
  "result": "复盘文本...",
  "tokensUsed": { "input": 123, "output": 456 }
}
```

**UI 流程**：
1. 点击"AI 复盘"按钮 → 显示 loading
2. 调用 API → 流式显示结果（或一次性显示）
3. 完成后显示"查看历史"链接

---

### Task 2: 选题建议 (TOPIC_SUGGEST)

**触发入口**：独立页面 `/ai/topic-suggest`

**API**：`POST /api/ai/topic-suggest`

**请求体**：
```json
{
  "accountId": "cm...",      // 可选，不传则用所有账号
  "niche": "美食探店",        // 用户输入
  "direction": "夏日冷饮"     // 用户输入
}
```

**数据准备**（`lib/ai-tasks/topic-suggest.ts`）：
1. 查询指定账号（或所有账号）的 Top 10 爆款作品（按 play 排序）
2. 查询近 30 天作品的趋势数据（平均播放量、互动率变化）
3. 填充 Prompt 模板变量

**响应**：
```json
{
  "analysisId": "cm...",
  "result": "1. 选题A - 理由...\n2. 选题B - 理由...",
  "tokensUsed": { "input": 200, "output": 300 }
}
```

**UI 流程**：
1. 表单输入：账号选择（下拉）、定位、方向
2. 点击"生成选题" → 流式显示结果
3. 结果可"保存为素材"（创建 TOPIC 类型 Material）

---

### Task 3: 文案优化 (COPY_OPTIMIZE)

**触发入口**：独立页面 `/ai/copy-optimize`

**API**：`POST /api/ai/copy-optimize`

**请求体**：
```json
{
  "draft": "用户输入的草稿文案",
  "accountId": "cm..."       // 可选，用于获取历史高互动文案样本
}
```

**数据准备**（`lib/ai-tasks/copy-optimize.ts`）：
1. 查询指定账号的高互动作品（like + comment > 阈值）的 title/description
2. 脱敏处理（去掉具体人名、地名等）
3. 填充 Prompt 模板变量

**响应**：
```json
{
  "analysisId": "cm...",
  "result": "优化版：...\n\n改动点：\n1. ...\n2. ...",
  "tokensUsed": { "input": 150, "output": 250 }
}
```

**UI 流程**：
1. 文本框输入草稿
2. 账号选择（可选）
3. 点击"优化文案" → 显示结果
4. 结果可"保存为素材"（创建 COPY 类型 Material）

---

## 共享逻辑

### `lib/ai-tasks/utils.ts`

```typescript
// 计算历史平均指标
export async function getHistoricalAvg(accountId: string, days: number): Promise<{
  avgPlay: number;
  avgLike: number;
  avgComment: number;
  avgShare: number;
  avgCollect: number;
  avgFinishRate: number | null;
}>;

// 获取 Top N 作品
export async function getTopWorks(accountId: string, limit: number): Promise<Work[]>;

// 格式化指标为可读文本
export function formatMetrics(metric: WorkMetric): string;

// 脱敏文案
export function sanitizeCopy(text: string): string;
```

---

## API 通用流程

每个 AI 分析 API 的标准流程：

```typescript
export async function POST(req: Request) {
  // 1. 解析请求体
  const body = await req.json();
  
  // 2. 获取 Prompt 模板（DB 自定义 or 默认）
  const template = await getPromptTemplate('WORK_REVIEW');
  
  // 3. 准备数据 + 填充变量
  const vars = await prepareWorkReviewData(body.workId);
  const userPrompt = fillTemplate(template.userTemplate, vars);
  
  // 4. 调用 LLM
  const client = await getDefaultLLMClient();
  const result = await client.generate({
    system: template.systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 1000,
  });
  
  // 5. 保存 AIAnalysis 记录
  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'WORK_REVIEW',
      targetRefs: { workId: body.workId },
      prompt: userPrompt,
      response: result.text,
      modelUsed: result.model,
      llmProviderId: client.providerId,
      tokensUsed: result.usage,
      status: 'DONE',
    },
  });
  
  // 6. 返回结果
  return NextResponse.json({
    analysisId: analysis.id,
    result: result.text,
    tokensUsed: result.usage,
  });
}
```

---

## UI 组件

### 1. 作品详情页增强

`src/app/(app)/works/[id]/page.tsx`：
- 在数据卡片下方添加"AI 复盘"按钮
- 点击后调用 API，显示结果 Modal 或展开区域
- 显示 token 消耗和"查看历史"链接

### 2. 选题建议页

`src/app/(app)/ai/topic-suggest/page.tsx`：
- 表单：账号选择、定位输入、方向输入
- 提交按钮 → 显示 loading → 结果区域
- 结果区域：Markdown 渲染 + "保存为素材"按钮

### 3. 文案优化页

`src/app/(app)/ai/copy-optimize/page.tsx`：
- 左侧：草稿输入框（Textarea）
- 右侧：优化结果展示
- "优化文案"按钮 + "保存为素材"按钮

### 4. AI 分析历史页

`src/app/(app)/ai/history/page.tsx`：
- 列表展示所有 AIAnalysis 记录
- 筛选：按类型、按日期
- 点击查看详情（Prompt + Response + Token 消耗）

---

## 数据库 Schema 检查

已有模型（Plan 4a）：
```prisma
model AIAnalysis {
  id            String          @id @default(cuid())
  type          AIAnalysisType
  targetRefs    Json            // { workId?, accountId?, materialId? }
  prompt        String          @db.Text
  response      String          @db.Text
  modelUsed     String
  llmProviderId String?
  llmProvider   LLMProvider?    @relation(fields: [llmProviderId], references: [id], onDelete: SetNull)
  tokensUsed    Json            // { input: number, output: number }
  status        AIAnalysisStatus
  error         String?         @db.Text
  createdAt     DateTime        @default(now())
}

enum AIAnalysisType {
  WORK_REVIEW
  TOPIC_SUGGEST
  COPY_OPTIMIZE
  WORKS_COMPARE
  TREND
  COMMENT_INSIGHT
  BENCHMARK
}

enum AIAnalysisStatus {
  RUNNING
  DONE
  FAILED
}
```

✅ Schema 已就绪，无需修改。

---

## 实现步骤

### Step 1: 共享工具函数
- [ ] `lib/ai-tasks/utils.ts`
  - [ ] `getHistoricalAvg()`
  - [ ] `getTopWorks()`
  - [ ] `formatMetrics()`
  - [ ] `sanitizeCopy()`

### Step 2: AI 任务执行器
- [ ] `lib/ai-tasks/work-review.ts`
  - [ ] `prepareWorkReviewData(workId)`
  - [ ] `executeWorkReview(workId)`
- [ ] `lib/ai-tasks/topic-suggest.ts`
  - [ ] `prepareTopicSuggestData(accountId, niche, direction)`
  - [ ] `executeTopicSuggest(...)`
- [ ] `lib/ai-tasks/copy-optimize.ts`
  - [ ] `prepareCopyOptimizeData(draft, accountId)`
  - [ ] `executeCopyOptimize(...)`

### Step 3: API Routes
- [ ] `app/api/ai/work-review/route.ts` (POST)
- [ ] `app/api/ai/topic-suggest/route.ts` (POST)
- [ ] `app/api/ai/copy-optimize/route.ts` (POST)
- [ ] `app/api/ai/analyses/route.ts` (GET - 列表)
- [ ] `app/api/ai/analyses/[id]/route.ts` (GET - 详情)

### Step 4: UI 页面
- [ ] 修改 `app/(app)/works/[id]/page.tsx` - 添加"AI 复盘"按钮
- [ ] 新建 `app/(app)/ai/topic-suggest/page.tsx`
- [ ] 新建 `app/(app)/ai/copy-optimize/page.tsx`
- [ ] 新建 `app/(app)/ai/history/page.tsx`

### Step 5: 导航菜单
- [ ] 更新侧边栏导航，添加 AI 相关菜单项

### Step 6: 测试
- [ ] 手动测试 3 个 AI 任务
- [ ] 验证 token 消耗记录
- [ ] 验证历史记录查看

---

## 非功能需求

### 1. 错误处理
- LLM 调用失败 → 保存 status=FAILED + error 信息
- 数据准备失败 → 返回 400 错误
- Token 超限 → 提示用户

### 2. 性能
- 历史数据查询添加索引（publishedAt, play）
- Top N 查询限制最多 100 条

### 3. 安全
- API 需要登录验证（已有 auth middleware）
- 用户输入长度限制（draft < 5000 字符）

---

## 预估工作量

- Step 1-2: 4 小时（核心逻辑）
- Step 3: 2 小时（API Routes）
- Step 4: 4 小时（UI 页面）
- Step 5-6: 1 小时（导航 + 测试）

**总计**：约 11 小时（1.5 天）

---

## 后续优化（v0.2+）

- 流式响应（SSE）- 实时显示 LLM 输出
- 批量分析 - 一次分析多个作品
- 结果导出 - PDF/Markdown
- 自定义 Prompt 变量 - 用户可添加自定义字段
