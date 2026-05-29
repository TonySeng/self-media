# Plan 3: 素材管理 (Material Management)

**日期**: 2026-05-29  
**状态**: 实施中  
**前置**: Plan 1 (基础设施) + Plan 2 (抖音集成)  
**目标**: 实现 7 种素材类型的统一管理，支持文件上传、富文本编辑、标签系统、关联作品，为 Plan 4 (AI Chat) 提供上下文素材库。

---

## 1. 背景与目标

### 1.1 需求来源

Spec 第 7 节《素材管理》定义了 7 种素材类型：

| 类型 | 用途 | 存储形式 |
|---|---|---|
| COPY | 文案库 | 富文本 (Tiptap) |
| TOPIC | 选题库 | 标题 + 描述 + 标签 |
| VIDEO | 视频素材 | 文件上传 |
| IMAGE | 图片素材 | 文件上传 |
| AUDIO | 音频素材 | 文件上传 |
| IDEA | 创意选题 | 标题 + 描述 + 状态（构思中/已采用/已废弃） |
| REFERENCE | 参考资料 | URL + 摘要 |

**核心价值**：
- AI Chat (Plan 4) 通过 `@` 引用素材作为上下文
- 作品关联：记录"这条作品用了哪些素材"
- 标签系统：跨类型检索

### 1.2 技术决策

**v0.1 范围**（本 Plan）：
- ✅ 7 种素材类型完整 CRUD
- ✅ 文件上传：**仅 LocalStorageProvider**（存 `data/uploads/{type}/{yyyy-mm}/{uuid}-{filename}`）
- ✅ 富文本：引入 **Tiptap** (COPY 类型用)
- ✅ 看板视图：IDEA 类型实现三栏拖拽（构思中/已采用/已废弃）
- ✅ 标签系统：多对多关联表 `MaterialTag` + `_MaterialToTag`
- ✅ 作品关联：多对多 `_MaterialToWork`

**v0.2 延后**（Plan 5 polish）：
- ❌ COS 对象存储（v0.1 只 local）
- ❌ 素材模板（预设文案结构）
- ❌ 批量导入

---

## 2. 数据模型

### 2.1 核心表

```prisma
enum MaterialType {
  COPY
  TOPIC
  VIDEO
  IMAGE
  AUDIO
  IDEA
  REFERENCE
}

enum IdeaStatus {
  DRAFT       // 构思中
  ADOPTED     // 已采用
  DISCARDED   // 已废弃
}

model Material {
  id          String       @id @default(cuid())
  type        MaterialType
  title       String
  content     String?      // COPY 富文本 HTML / TOPIC 描述 / REFERENCE 摘要
  fileKey     String?      // VIDEO/IMAGE/AUDIO 文件路径（相对 storage root）
  fileSize    Int?         // 字节
  fileMime    String?      // MIME type
  url         String?      // REFERENCE 外链
  ideaStatus  IdeaStatus?  // IDEA 专用
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  tags        MaterialTag[]
  works       Work[]       @relation("MaterialToWork")

  @@index([type, createdAt])
  @@index([type, ideaStatus])  // IDEA 看板筛选
}

model MaterialTag {
  id        String   @id @default(cuid())
  name      String   @unique
  color     String?  // hex color for UI badge
  createdAt DateTime @default(now())

  materials Material[]
}
```

**设计要点**：
- 单表 + `type` enum：7 种类型共用字段，避免 7 张表
- `fileKey` 存相对路径（如 `video/2026-05/abc123-demo.mp4`），`storage.getUrl(fileKey)` 返回可访问 URL
- `ideaStatus` 仅 IDEA 类型使用，其他类型为 null
- 多对多通过 Prisma 隐式中间表 `_MaterialToTag` / `_MaterialToWork`

### 2.2 关联 Work

修改 `Work` 模型（Plan 2 已有）：

```prisma
model Work {
  // ...已有字段...
  materials Material[] @relation("MaterialToWork")
}
```

---

## 3. 存储抽象层

### 3.1 接口定义

`src/lib/storage/types.ts`:

```ts
export type UploadResult = {
  key: string;      // 相对路径，如 "video/2026-05/abc-demo.mp4"
  size: number;
  mime: string;
};

export interface StorageProvider {
  upload(buffer: Buffer, filename: string, type: string): Promise<UploadResult>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
}
```

### 3.2 LocalStorageProvider

`src/lib/storage/local.ts`:

- `upload()`: 写入 `data/uploads/{type}/{yyyy-mm}/{uuid}-{filename}`
- `getUrl()`: 返回 `/uploads/{key}` (Next.js static serve)
- `delete()`: `fs.unlink`

**Next.js 配置**：在 `next.config.ts` 添加 `rewrites` 把 `/uploads/*` 映射到 `data/uploads/*`（或用 API route serve）。

### 3.3 Registry

`src/lib/storage/index.ts`:

```ts
import { env } from '@/lib/env';
import { LocalStorageProvider } from './local';

export function getStorageProvider(): StorageProvider {
  const type = env.STORAGE_TYPE; // 'local' | 'cos'
  if (type === 'local') return new LocalStorageProvider();
  throw new Error(`Unsupported STORAGE_TYPE: ${type}`);
}
```

---

## 4. API 设计

### 4.1 素材 CRUD

**POST /api/materials**
- Body: `{ type, title, content?, fileKey?, url?, ideaStatus?, tagIds? }`
- 返回: `{ id, ...fields }`

**GET /api/materials**
- Query: `type?`, `tagId?`, `q?` (标题搜索), `limit?`, `cursor?`
- 返回: `{ items: Material[], nextCursor? }`

**GET /api/materials/[id]**
- 返回: `{ ...material, tags: Tag[], works: Work[] }`

**PATCH /api/materials/[id]**
- Body: 部分字段更新
- 返回: 更新后的 material

**DELETE /api/materials/[id]**
- 级联删除关联（tags 解绑，works 解绑，文件删除）

### 4.2 文件上传

**POST /api/materials/upload**
- Body: `multipart/form-data` with `file` field + `type` field
- 流程：
  1. 校验 MIME (VIDEO: mp4/mov; IMAGE: jpg/png/webp; AUDIO: mp3/wav)
  2. 校验大小 (VIDEO ≤100MB, IMAGE ≤10MB, AUDIO ≤20MB)
  3. 调 `storage.upload(buffer, filename, type)`
  4. 返回 `{ key, size, mime, url }`
- 前端拿到 `key` 后，再调 `POST /api/materials` 创建 Material 记录

### 4.3 标签管理

**GET /api/materials/tags**
- 返回所有标签 + 使用计数

**POST /api/materials/tags**
- Body: `{ name, color? }`
- 返回新标签

**DELETE /api/materials/tags/[id]**
- 解绑所有关联后删除

---

## 5. UI 设计

### 5.1 素材列表页 `/materials`

**布局**：
- 顶部：类型 tab (ALL / COPY / TOPIC / VIDEO / ...)
- 左侧：标签筛选 sidebar
- 右上：搜索框 + "新建素材"按钮
- 主区域：
  - IDEA 类型 → 看板视图（三栏拖拽）
  - 其他类型 → 网格卡片（封面/标题/标签/创建时间）

### 5.2 素材表单 (新建/编辑)

**通用字段**：
- 类型选择（新建时）
- 标题
- 标签（多选 + 新建）

**类型特定字段**：
- COPY: Tiptap 富文本编辑器
- TOPIC: 描述 textarea
- VIDEO/IMAGE/AUDIO: 文件上传区 + 预览
- IDEA: 描述 + 状态下拉
- REFERENCE: URL input + 摘要 textarea

### 5.3 IDEA 看板视图

**三栏**：
- 构思中 (DRAFT)
- 已采用 (ADOPTED)
- 已废弃 (DISCARDED)

**交互**：
- 拖拽卡片在栏间移动 → 调 `PATCH /api/materials/[id]` 更新 `ideaStatus`
- 卡片显示：标题 + 标签 + 创建时间
- 点击卡片 → 打开详情抽屉

**实现**：用 `@dnd-kit/core` 或简单的 HTML5 drag API。

---

## 6. 富文本编辑器 (Tiptap)

### 6.1 依赖

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
```

### 6.2 组件

`src/components/materials/tiptap-editor.tsx`:

```tsx
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

export function TiptapEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '输入文案内容...' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  return <EditorContent editor={editor} className="prose" />;
}
```

**存储**：HTML 字符串存 `Material.content`。

---

## 7. 实施计划

### Phase A: DB Schema (1 task)

**Task 1**: 新增 Material / MaterialTag 模型 + Work 反向关系
- 文件: `prisma/schema.prisma`, migration
- 步骤: 添加 enum + 2 model + Work 的 `materials` 字段 → migrate → tsc → commit

### Phase B: 存储抽象层 (2 tasks)

**Task 2**: 实现 LocalStorageProvider + 测试
- 文件: `src/lib/storage/{types,local,index}.ts`, `tests/lib/storage/local.test.ts`
- TDD: 测试 upload/getUrl/delete → 实现 → 通过

**Task 3**: Next.js 静态文件 serve 配置
- 文件: `next.config.ts` (添加 rewrites 或 API route)
- 验证: `pnpm dev` 后访问 `/uploads/test.txt` 能读到 `data/uploads/test.txt`

### Phase C: 素材 CRUD API (7 tasks, **可并行**)

每种类型一个任务，模式相同：

**Task 4-10**: POST/GET/PATCH/DELETE `/api/materials` (type=COPY/TOPIC/VIDEO/IMAGE/AUDIO/IDEA/REFERENCE)
- 文件: `src/app/api/materials/route.ts` (共用), `tests/api/materials/{type}.test.ts`
- 步骤:
  1. 写测试（创建 + 查询 + 更新 + 删除，type 特定字段校验）
  2. 实现 route handler（Zod schema 按 type 分支）
  3. 测试通过 → commit

**合并策略**：7 个 route handler 可以写在同一个 `route.ts` 里，用 `switch (body.type)` 分支；或者拆成 7 个文件。推荐**单文件 + switch**，减少重复。

### Phase D: 文件上传 API (1 task)

**Task 11**: POST `/api/materials/upload`
- 文件: `src/app/api/materials/upload/route.ts`, 测试
- 依赖: `formidable` 或 Next.js 15 内置 `request.formData()`
- 步骤: multipart 解析 → 校验 MIME/size → `storage.upload()` → 返回 key

### Phase E: 标签管理 API (1 task)

**Task 12**: GET/POST/DELETE `/api/materials/tags`
- 文件: `src/app/api/materials/tags/route.ts`, `[id]/route.ts`, 测试
- 步骤: CRUD + 使用计数查询

### Phase F: UI 层 (4 tasks)

**Task 13**: 素材列表页 `/materials`
- 文件: `src/app/(app)/materials/page.tsx`
- 功能: 类型 tab + 标签筛选 + 搜索 + 网格卡片

**Task 14**: 素材表单组件
- 文件: `src/components/materials/material-form.tsx`
- 功能: 通用字段 + 类型特定字段（含 Tiptap）

**Task 15**: IDEA 看板视图
- 文件: `src/components/materials/idea-board.tsx`
- 功能: 三栏拖拽 + 状态更新

**Task 16**: 文件上传组件
- 文件: `src/components/materials/file-uploader.tsx`
- 功能: 拖拽上传 + 进度条 + 预览

### Phase G: 收尾 (1 task)

**Task 17**: 最终验证 Gate
- 步骤: tsc + lint + test + build → 清理 warnings → commit
- 预期测试数: 48 (Plan 2) + ~15 (Plan 3) = **63 tests**

---

## 8. 测试策略

### 8.1 单元测试

- `LocalStorageProvider`: 文件写入/读取/删除
- 各类型 Material CRUD: 字段校验、关联查询

### 8.2 集成测试

- 文件上传 → 创建 Material → 查询 → 删除（级联删文件）
- 标签关联 → 筛选查询

### 8.3 E2E (手动)

- 上传视频 → 创建 VIDEO 素材 → 列表显示缩略图
- IDEA 看板拖拽 → 状态更新
- Tiptap 编辑 COPY → 保存 → 重新打开（HTML 保留格式）

---

## 9. 风险与限制

### 9.1 已知限制

- **本地存储无 CDN**：`/uploads/*` 直接 serve，生产环境需 Nginx 或切 COS (v0.2)
- **文件大小上限**：VIDEO 100MB 受 Next.js body size limit 约束，需配置 `api.bodyParser.sizeLimit`
- **Tiptap bundle 大小**：~80KB gzipped，COPY 类型页面 First Load JS 会增加

### 9.2 技术债务

- 文件删除无垃圾回收：删 Material 后 `storage.delete()` 同步调用，失败会留孤儿文件
- 标签无使用计数缓存：每次查询实时 count，标签多时慢（v0.2 加 Redis）

---

## 10. 成功标准

- ✅ 7 种素材类型完整 CRUD，测试覆盖
- ✅ 文件上传 (VIDEO/IMAGE/AUDIO) 端到端流程通
- ✅ Tiptap 富文本编辑器集成，COPY 类型可用
- ✅ IDEA 看板视图三栏拖拽正常
- ✅ 标签系统跨类型筛选
- ✅ `pnpm build` 通过，无 lint warning
- ✅ 手动 smoke: 上传视频 → 创建素材 → 列表查看 → 删除（文件也删）

---

## 11. 后续计划

**Plan 4 (AI Chat)** 将依赖本 Plan 的素材库：
- `@material:id` 引用语法
- Chat 上下文注入素材内容
- 基于素材生成文案/选题

**Plan 5 (Polish)** 优化：
- 切换 COS 对象存储
- 素材模板系统
- 批量导入/导出
