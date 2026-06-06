# 抖音扫码登录：Stealth + 短信验证码 Fallback

## 背景

当前 qrlogin 模块使用 Playwright headless 浏览器实现抖音扫码登录。扫码成功后抖音会触发二次验证（短信验证码），headless 模式下无法完成验证，导致登录失败。临时方案是 `headless: false`，但服务器端无桌面环境无法使用。

## 目标

- 服务器端（无桌面）可完成完整的扫码登录流程
- 优先用 stealth 插件绕过二次验证
- 绕过失败时，将短信验证码流程代理到前端由用户完成
- 兼容 Linux 服务器和 Docker 容器部署

## 设计

### 状态机

```
WAITING_QR → WAITING_SCAN → CONFIRMED (stealth 绕过成功，直接拿到 cookie)
                          → NEED_SMS_CODE → CONFIRMED (用户输入验证码后完成)
                                         → FAILED (验证码错误/超时)
```

### 依赖变更

新增：
- `playwright-extra`：Playwright 的插件化封装
- `puppeteer-extra-plugin-stealth`：反检测插件，兼容 playwright-extra

### 后端改造（`src/lib/platforms/douyin/qrlogin.ts`）

**启动阶段：**
- 使用 `playwright-extra` 的 chromium 替代原生 playwright
- 加载 stealth 插件
- 保持 `headless: true`

**扫码检测阶段（poll）：**
- 监听 `check_qrconnect` 响应判断扫码状态
- 扫码确认后，等待最多 5 秒检查 `sessionid_ss` cookie → 有则 CONFIRMED
- 如果 5 秒内未出现 cookie，检测 `second_verification_web` 相关网络请求 → 触发了二次验证
- 进入 NEED_SMS_CODE 状态：
  - 从页面提取脱敏手机号（如 `138****1234`）
  - 点击"发送验证码"按钮
  - 返回 `{ status: 'NEED_SMS_CODE', phone: '138****1234' }`

**验证码提交阶段（新接口 `/api/platforms/douyin/qrlogin/verify`）：**
- 接收 `{ sessionId, code }`
- 通过 Playwright 将验证码填入输入框
- 点击提交/确认按钮
- 等待 `sessionid_ss` cookie 出现（最多 15 秒）
- 成功则返回 CONFIRMED + cookie，失败则返回 FAILED

### QRSession 类型扩展

```typescript
export type QRSession = {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  status: 'WAITING_QR' | 'WAITING_SCAN' | 'NEED_SMS_CODE' | 'CONFIRMED' | 'EXPIRED' | 'FAILED';
  qrDataUrl?: string;
  cookie?: string;
  phone?: string;
  smsCodeSentAt?: number;
  error?: string;
};
```

### API 接口

| 接口 | 方法 | 请求体 | 响应 |
|------|------|--------|------|
| `/api/platforms/douyin/qrlogin/start` | POST | — | `{ sessionId, qrDataUrl }` |
| `/api/platforms/douyin/qrlogin/poll` | POST | `{ sessionId }` | `{ status, phone?, error? }` |
| `/api/platforms/douyin/qrlogin/verify` | POST | `{ sessionId, code }` | `{ status, account?, error? }` |
| `/api/platforms/douyin/qrlogin/cancel` | POST | `{ sessionId }` | `{ ok: true }` |

### 前端改造（`src/components/platforms/qr-login-dialog.tsx`）

新增 `NEED_SMS_CODE` 状态的 UI：
- 显示脱敏手机号
- 验证码输入框（6 位数字）
- 提交按钮
- 提交后调用 `/verify` 接口，根据返回结果切换到 CONFIRMED 或 FAILED

### 二次验证 DOM 选择器策略

抖音的二次验证弹窗通过动态加载 `second_verification_web` SDK 渲染。检测方式：
1. 监听网络请求中包含 `second_verification_web` 的 URL
2. 等待验证弹窗 DOM 出现（class 包含 `verification` 或 `verify`）
3. 在弹窗内查找手机号文本和验证码输入框

选择器可能随抖音前端更新而变化，需要做好容错：
- 使用多个候选选择器
- 超时后返回 FAILED 并附带错误信息，而非无限等待

### 部署注意事项

- Docker 容器需安装 Chromium 依赖（`playwright install-deps chromium`）
- 无桌面环境下 `headless: true` 即可，不需要 Xvfb
- stealth 插件不需要额外系统依赖
