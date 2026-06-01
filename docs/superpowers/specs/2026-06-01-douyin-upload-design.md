# 抖音作品自动上传 · 设计文档

**创建日期**：2026-06-01
**状态**：Draft

---

## 1. 概述

### 1.1 目标

MVP 验证"从素材库一键发布视频到抖音"的可行性。用户在素材库 VIDEO 详情页点击"发布到抖音"，填写标题/描述/封面，系统通过 Playwright 自动化浏览器完成上传。

### 1.2 范围

- 单条视频发布（从素材库 VIDEO 类型素材）
- 发布字段：视频文件 + 标题 + 描述（含 #话题、@提及）+ 自定义封面（可选）
- 异步任务模型：提交后后台执行，前端轮询状态
- 失败截图存证 + 错误信息展示
- 开发环境本地运行 + 生产环境 Docker 运行

### 1.3 非目标

- 批量排期发布
- 定时发布
- AI 全流程闭环（AI 生成 → 自动发布）
- 风控自动绕过（滑块/扫脸验证）
- 多平台发布

---

## 2. 技术路径

**Playwright 浏览器自动化**

理由：
- 抖音不开放个人创作者上传 API（需企业蓝 V）
- HTTP 接口模拟签名参数复杂且频繁变化，维护成本高
- Playwright 模拟真人操作，和手动上传行为一致，风控风险最低
- 适合 MVP 验证阶段，逻辑简单直观

**环境配置**：
- 开发：`headless: false`（可视化调试）
- 生产 Docker：`headless: true`，基于 `mcr.microsoft.com/playwright:v1.x-jammy` 官方镜像
- 通过 `PLAYWRIGHT_HEADLESS` 环境变量切换

---

## 3. 架构

### 3.1 数据流

```
用户点 "发布到抖音"
    ↓
POST /api/publishes → 创建 Publish 记录 (status=PENDING) → 返回 publishId
    ↓
异步 worker (setImmediate, Next.js 进程内)
    ↓
lib/platforms/douyin/upload.ts (Playwright 流程)
    ↓
1. 启动 Chromium
2. 注入 cookie (PlatformAccount.cookieEncrypted 解密 → addCookies)
3. 导航到 creator.douyin.com/creator-micro/content/upload
4. setInputFiles 上传视频文件
5. 等待上传进度条完成
6. 填写标题、描述
7. 上传自定义封面（可选）
8. 点击 "发布" 按钮
9. 等待成功提示
10. 截图存证 → 更新 Publish.status=DONE
    ↓
失败任何一步: status=FAILED + error + 截图
```

### 3.2 前端交互

```
素材库 VIDEO 详情页
    ↓ 点击 "发布到抖音"
弹出发布表单 Dialog:
  - 选择账号（下拉，从 PlatformAccount 列表）
  - 标题（默认取素材 title）
  - 描述（textarea，支持 #话题 @提及）
  - 封面（可选，上传图片或不传用视频默认帧）
    ↓ 提交
显示发布进度：
  - 轮询 GET /api/publishes/:id 每 2s
  - 状态：排队中 → 运行中 → 成功/失败
  - 失败时显示错误信息 + 截图预览
```

---

## 4. 数据模型

### 4.1 新增 Publish 模型

```prisma
model Publish {
  id                String         @id @default(cuid())
  platformAccountId String
  materialId        String
  title             String
  description       String?        @db.Text
  coverKey          String?        // 自定义封面文件路径
  status            PublishStatus  @default(PENDING)
  error             String?        @db.Text
  screenshotKey     String?        // 截图文件路径（成功/失败都截）
  publishedWorkId   String?        // 发布成功后回填的抖音作品 ID
  startedAt         DateTime?
  finishedAt        DateTime?
  createdAt         DateTime       @default(now())

  account           PlatformAccount @relation(fields: [platformAccountId], references: [id], onDelete: Cascade)
  material          Material        @relation(fields: [materialId], references: [id], onDelete: Restrict)

  @@index([platformAccountId, createdAt])
  @@index([status, createdAt])
}

enum PublishStatus {
  PENDING
  RUNNING
  DONE
  FAILED
  CANCELLED
}
```

### 4.2 关联更新

- `PlatformAccount` 增加 `publishes Publish[]` 关系
- `Material` 增加 `publishes Publish[]` 关系

---

## 5. API 设计

### 5.1 创建发布任务

`POST /api/publishes`

```json
{
  "platformAccountId": "cm...",
  "materialId": "cm...",
  "title": "视频标题",
  "description": "#话题 @某人 描述文案",
  "coverKey": "uploads/cover-xxx.jpg"  // 可选
}
```

响应：`{ "id": "cm...", "status": "PENDING" }`

### 5.2 查询发布状态

`GET /api/publishes/:id`

响应：
```json
{
  "id": "cm...",
  "status": "RUNNING",
  "error": null,
  "screenshotKey": null,
  "startedAt": "2026-06-01T...",
  "finishedAt": null,
  "createdAt": "2026-06-01T..."
}
```

### 5.3 发布历史列表

`GET /api/publishes?accountId=cm...&limit=20`

### 5.4 取消发布

`POST /api/publishes/:id/cancel`

仅 PENDING 状态可取消。RUNNING 状态不中断（Playwright 进程难以安全中断）。

---

## 6. Playwright 上传流程

### 6.1 核心模块

`src/lib/platforms/douyin/upload.ts`

```typescript
export type PublishInput = {
  videoPath: string;       // 视频文件绝对路径
  title: string;
  description?: string;
  coverPath?: string;      // 封面文件绝对路径，可选
  cookie: string;          // 解密后的 cookie 字符串
};

export type PublishResult = {
  success: boolean;
  screenshotPath?: string;
  error?: string;
};

export async function douyinPublish(input: PublishInput): Promise<PublishResult>;
```

### 6.2 Playwright 步骤详解

```
1. chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' })
2. context = browser.newContext()
3. context.addCookies(parsedCookies)  // domain: '.douyin.com'
4. page = context.newPage()
5. page.goto('https://creator.douyin.com/creator-micro/content/upload')
6. 等待页面加载完成（检测上传区域出现）
7. page.setInputFiles('input[type="file"]', videoPath)
8. 等待上传进度 100%（轮询进度条元素 or 等待"上传完成"文本）
9. 填写标题：清空默认 → 输入 title
10. 填写描述：定位描述输入框 → 输入 description
11. 上传封面（可选）：点击"更换封面" → setInputFiles → 确认
12. 点击 "发布" 按钮
13. 等待成功提示（toast / 跳转到作品管理页）
14. 截图存证
15. browser.close()
```

### 6.3 选择器策略

抖音创作者中心页面 DOM 结构可能变化，选择器需要：
- 优先用 `data-testid`、`aria-label`、`role` 等语义属性
- 其次用稳定的 class 前缀（如 `upload-`、`editor-`）
- 避免依赖动态生成的 hash class
- 所有选择器集中定义在 `SELECTORS` 常量对象中，方便维护

```typescript
const SELECTORS = {
  fileInput: 'input[type="file"][accept*="video"]',
  uploadProgress: '[class*="progress"]',
  titleInput: '[class*="title"] input, [data-testid="title-input"]',
  descInput: '[class*="desc"] textarea, [class*="description"]',
  coverButton: '[class*="cover"] button, text=更换封面',
  publishButton: 'button:has-text("发布"), [data-testid="publish-btn"]',
  successToast: '[class*="toast"]:has-text("成功"), [class*="success"]',
  captchaModal: '[class*="captcha"], [class*="verify-modal"]',
};
```

### 6.4 Cookie 注入

```typescript
function cookieStringToPlaywright(raw: string, domain: string) {
  return raw.split(';').map(pair => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name.trim(), value: rest.join('='), domain, path: '/' };
  });
}
```

---

## 7. 并发与资源控制

- **全局并发上限 1**：同一时刻只允许一个 Publish 处于 RUNNING 状态
- 新任务提交时，如果已有 RUNNING 任务，新任务保持 PENDING 排队
- Worker 循环：完成当前任务后，检查是否有 PENDING 任务，有则继续执行
- Playwright 浏览器实例在每次任务完成后关闭，释放内存
- 超时保护：单次发布总时长上限 5 分钟，超时强制 FAILED

---

## 8. 失败处理

### 8.1 错误分类

| 错误类型 | 检测方式 | 处理 |
|---|---|---|
| Cookie 失效 | 页面跳转到登录页 | FAILED + 提示用户更新 Cookie |
| 风控弹窗 | 检测 captcha/verify 元素出现 | 截图 + FAILED + 提示"需要手动验证" |
| 上传超时 | 60s 内进度无变化 | FAILED + "上传卡住" |
| 网络错误 | page.goto 超时 / net::ERR | FAILED + 网络错误信息 |
| 发布失败 | 点击发布后出现错误提示 | 截图 + FAILED + 错误文本 |
| 未知错误 | catch-all | 截图 + FAILED + 异常信息 |

### 8.2 截图存证

- 每次失败都截图保存到 `data/screenshots/publish-{id}.png`
- 成功也截图（确认发布成功的页面状态）
- 截图路径存入 `Publish.screenshotKey`
- 前端可通过 `/api/publishes/:id/screenshot` 查看

---

## 9. 目录结构

```
src/
├── lib/
│   └── platforms/
│       └── douyin/
│           └── upload.ts          # Playwright 上传核心逻辑
├── lib/
│   └── publish/
│       └── worker.ts              # 异步 worker（取任务、执行、更新状态）
├── app/
│   └── api/
│       └── publishes/
│           ├── route.ts           # POST (创建) + GET (列表)
│           └── [id]/
│               ├── route.ts       # GET (详情)
│               ├── cancel/route.ts
│               └── screenshot/route.ts
└── components/
    └── publish/
        └── publish-dialog.tsx     # 发布表单弹窗
```

---

## 10. 部署

### 10.1 开发环境

```bash
pnpm add -D playwright @playwright/test
npx playwright install chromium
```

环境变量：
```
PLAYWRIGHT_HEADLESS=false   # 开发时可视化
```

### 10.2 生产 Docker

Dockerfile 改为多阶段构建：
```dockerfile
FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS base
# ... 安装 Node.js 依赖、构建 Next.js ...
```

环境变量：
```
PLAYWRIGHT_HEADLESS=true
```

docker-compose 资源限制：
```yaml
services:
  web:
    mem_limit: 1g        # Chromium 吃内存，从 512m 提到 1g
    shm_size: 256m       # Chromium 需要 /dev/shm
```

---

## 11. 测试策略

### 11.1 单元测试

- `upload.ts` 的纯逻辑函数：cookie 解析、选择器常量、错误分类
- `worker.ts` 的状态机逻辑：PENDING→RUNNING→DONE/FAILED 转换
- Mock `chromium.launch` 验证调用参数

### 11.2 手动 E2E 测试

- 开发机 headed 模式，用真实小号传 1 个测试视频
- 验证：上传成功、标题/描述正确、封面正确
- 验证失败场景：断网、Cookie 过期、视频格式不支持

### 11.3 集成测试（延后）

- 用 Playwright 自己的 mock route 模拟创作者中心页面
- 验证脚本能正确填表、点击、等待

---

## 12. 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| 抖音页面 DOM 结构变化 | 高 | 选择器集中管理 + 失败截图快速定位 |
| 风控升级（强制扫脸） | 中 | 截图通知用户手动处理，不尝试绕过 |
| Chromium 内存泄漏 | 低 | 每次任务后关闭浏览器实例 |
| 视频文件过大上传慢 | 低 | 5 分钟超时 + 进度检测 |
| Docker 镜像体积增大 | 低 | 接受 ~600MB，换取稳定性 |

---

## 13. 预估工作量

- Prisma schema + migration：0.5h
- API routes (CRUD + cancel + screenshot)：2h
- lib/platforms/douyin/upload.ts (Playwright 核心)：4h
- lib/publish/worker.ts (异步执行器)：2h
- UI: publish-dialog 组件 + 素材详情页集成：3h
- Docker 镜像调整：1h
- 手动 E2E 测试 + 修复：2h

**总计**：约 14.5 小时（2 天）

