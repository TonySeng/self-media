# 抖音自动上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MVP 验证从素材库一键发布视频到抖音（Playwright 自动化）

**Architecture:** 异步任务模型 — POST 创建 Publish 记录后立即返回，后台 worker 用 Playwright 启动 Chromium 模拟创作者中心上传流程。全局并发 1，每次任务完成后关闭浏览器释放内存。

**Tech Stack:** Playwright (chromium), Prisma, Next.js API Routes, React (Dialog 组件)

---

## File Structure

```
prisma/
  schema.prisma                          # 新增 Publish model + PublishStatus enum
  migrations/YYYYMMDD_add_publish/       # migration

src/lib/publish/
  worker.ts                              # 异步 worker：取任务、执行、更新状态
  types.ts                               # PublishInput, PublishResult 类型

src/lib/platforms/douyin/
  upload.ts                              # Playwright 上传核心逻辑
  selectors.ts                           # DOM 选择器常量集中管理

src/app/api/publishes/
  route.ts                               # POST (创建) + GET (列表)
  [id]/route.ts                          # GET (详情)
  [id]/cancel/route.ts                   # POST (取消)
  [id]/screenshot/route.ts              # GET (截图文件)

src/components/publish/
  publish-dialog.tsx                     # 发布表单弹窗

tests/lib/publish/
  worker.test.ts                         # worker 状态机测试
```

---

### Task 1: Prisma Schema — Publish model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add PublishStatus enum and Publish model to schema.prisma**

在文件末尾添加 enum 和 model。在 `PlatformAccount` 中添加 `publishes Publish[]`，在 `Material` 中添加 `publishes Publish[]`。

- [ ] **Step 2: Run migration**

Run: `npx prisma migrate dev --name add_publish_model`
Expected: Migration created, prisma generate succeeds.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(db): add Publish model for douyin auto-upload"
```

---

### Task 2: Install Playwright + selectors + types

**Files:**
- Create: `src/lib/platforms/douyin/selectors.ts`
- Create: `src/lib/publish/types.ts`

- [ ] **Step 1: Install Playwright**

Run: `pnpm add playwright && npx playwright install chromium`

- [ ] **Step 2: Create selectors.ts and types.ts**

- [ ] **Step 3: Verify types** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**

---

### Task 3: Playwright upload core logic

**Files:**
- Create: `src/lib/platforms/douyin/upload.ts`

- [ ] **Step 1: Implement douyinPublish function**
- [ ] **Step 2: Verify types** — `npx tsc --noEmit`
- [ ] **Step 3: Commit**

---

### Task 4: Async worker

**Files:**
- Create: `src/lib/publish/worker.ts`
- Create: `tests/lib/publish/worker.test.ts`

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Implement worker**
- [ ] **Step 3: Run tests** — `pnpm test`
- [ ] **Step 4: Commit**

---

### Task 5: API Routes

**Files:**
- Create: `src/app/api/publishes/route.ts`
- Create: `src/app/api/publishes/[id]/route.ts`
- Create: `src/app/api/publishes/[id]/cancel/route.ts`
- Create: `src/app/api/publishes/[id]/screenshot/route.ts`

- [ ] **Step 1: Implement all routes**
- [ ] **Step 2: Verify types** — `npx tsc --noEmit`
- [ ] **Step 3: Commit**

---

### Task 6: Publish Dialog UI

**Files:**
- Create: `src/components/publish/publish-dialog.tsx`
- Modify: `src/app/(app)/materials/page.tsx`

- [ ] **Step 1: Create publish-dialog component**
- [ ] **Step 2: Integrate into materials page**
- [ ] **Step 3: Verify in browser** — `pnpm dev`
- [ ] **Step 4: Commit**

---

### Task 7: E2E manual test

- [ ] **Step 1: Prepare test environment**
- [ ] **Step 2: Execute publish with headed browser**
- [ ] **Step 3: Verify success**
- [ ] **Step 4: Test failure scenario**
- [ ] **Step 5: Final commit**