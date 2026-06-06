# Electron 桌面应用改造设计

## 概述

将现有的 Next.js Web 应用改造为 Electron 桌面应用，并通过自动读取浏览器 cookie 数据库的方式简化抖音账号登录流程。

## 目标

- 提供原生桌面应用体验（系统托盘、开机启动、自动更新）
- 支持多个抖音账号管理和切换
- 自动从浏览器读取 cookie，并在 cookie 过期时自动重读
- 最小化代码改动，保持现有业务逻辑和 UI

## 整体架构

采用 **Electron + 内嵌 Next.js 服务** 的混合架构：

- **Electron 主进程**：窗口管理、系统托盘、自动更新、浏览器 cookie 读取
- **Next.js 服务**：保持现有 Web 应用架构，作为嵌入式服务运行
- **渲染进程**：加载 Next.js UI，通过 IPC 与主进程通信
- **数据库**：从 PostgreSQL 迁移到 SQLite，单文件存储在用户数据目录

### 启动流程

1. 用户双击应用图标
2. Electron 主进程启动
3. 选择随机可用端口（`portfinder` 库）
4. 启动内置 Next.js 服务器（生产模式，`node server.js`）
5. 创建应用窗口，加载 `http://localhost:<port>`
6. 显示主界面

### 文件结构

```
self-media/
├── electron/                   # Electron 相关代码
│   ├── main.ts                 # 主进程入口
│   ├── preload.ts              # 预加载脚本（IPC 桥接）
│   ├── ipc-handlers.ts         # IPC 处理器
│   ├── cookie-reader/          # Cookie 读取模块
│   │   ├── index.ts
│   │   ├── browsers.ts         # 浏览器检测与路径定位
│   │   ├── decrypt.ts          # Cookie 解密（DPAPI/Keychain）
│   │   └── reader.ts           # SQLite 读取与解析
│   ├── tray.ts                 # 系统托盘
│   └── updater.ts              # 自动更新
├── src/                        # 现有 Next.js 应用
├── package.json
└── electron-builder.yml        # 打包配置
```

## 数据库迁移：PostgreSQL → SQLite

### 迁移原因

- **单文件部署**：无需外部数据库服务
- **用户数据隔离**：每个用户独立数据库文件
- **跨平台一致性**：SQLite 内置于 Node.js，无需安装外部依赖

### 数据存储位置

- **Windows**: `%APPDATA%/self-media/data.db`
- **macOS**: `~/Library/Application Support/self-media/data.db`
- **Linux**: `~/.local/share/self-media/data.db`

使用 `electron.app.getPath('userData')` 自动获取正确路径。

### Prisma Schema 调整

```prisma
datasource db {
  provider = "sqlite"  // 从 postgresql 改为 sqlite
  url      = env("DATABASE_URL")  // 格式: file:/path/to/data.db
}
```

需要适配的类型：
- `@db.Text` → 删除（SQLite 无需显式指定）
- `Decimal` → `Float`（SQLite 无原生 Decimal 类型）
- `Json` → 保持（Prisma 会序列化为 TEXT）

### 迁移脚本

提供数据导出/导入工具，帮助用户从旧版本迁移：
- 从 PostgreSQL 导出为 JSON
- 导入到新的 SQLite 数据库

## Cookie 自动读取机制

### 多浏览器配置

每个抖音账号可以绑定一个浏览器配置：

**数据模型**：
```prisma
model BrowserConfig {
  id                 String   @id @default(cuid())
  platformAccountId  String   @unique
  platformAccount    PlatformAccount @relation(fields: [platformAccountId], references: [id], onDelete: Cascade)
  browserType        String   // 'chrome' | 'edge' | 'brave' | 'firefox'
  profilePath        String   // 绝对路径
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

**浏览器检测**：
- 自动扫描常见浏览器安装路径
- **Chrome**: 
  - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data`
  - macOS: `~/Library/Application Support/Google/Chrome`
  - Linux: `~/.config/google-chrome`
- **Edge**: 
  - Windows: `%LOCALAPPDATA%\Microsoft\Edge\User Data`
  - macOS: `~/Library/Application Support/Microsoft Edge`
- **Brave**: 
  - Windows: `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data`
  - macOS: `~/Library/Application Support/BraveSoftware/Brave-Browser`
- **Firefox**: 
  - Windows: `%APPDATA%\Mozilla\Firefox\Profiles`
  - macOS: `~/Library/Application Support/Firefox/Profiles`

支持多 Profile（Chrome 的 "Default", "Profile 1", "Profile 2" 等）。

### Cookie 读取流程

1. **用户配置**：在账号设置页面，点击"绑定浏览器"
2. **浏览器选择**：界面显示已检测到的浏览器列表（带图标）
3. **Profile 选择**：展示该浏览器下所有 Profile 目录
4. **权限确认**：首次读取弹窗提示需要访问浏览器数据
5. **读取执行**（Electron 主进程）：
   - 复制 `Cookies` 文件到临时目录（避免锁定）
   - 使用 `better-sqlite3` 打开数据库
   - 查询：`SELECT name, encrypted_value, expires_utc FROM cookies WHERE host_key LIKE '%douyin.com%'`
   - 解密 `encrypted_value` 字段
   - 构建 cookie 字符串
6. **保存到应用**：通过 IPC 返回渲染进程，调用现有的账号导入 API
7. **清理**：删除临时 Cookies 文件

### Cookie 解密实现

**Windows (DPAPI)**：
```typescript
import { unprotectData } from 'dpapi'
const decrypted = unprotectData(encryptedValue, null, 'CurrentUser')
```

**macOS (Keychain)**：
```typescript
import { execSync } from 'child_process'
// 从 Keychain 获取 Chrome Safe Storage 密钥
const key = execSync(
  'security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"'
).toString().trim()
// 使用 key 和 AES-128-CBC 解密
```

**Linux**：
- Chrome 使用本地密钥（`peanuts` 或从 `~/.config/google-chrome/Local State` 读取）
- 直接 AES-128-CBC 解密

使用 `keytar` 或 `node-keytar` 封装跨平台实现。

### Cookie 过期自动重读

**触发时机**：
1. **被动触发**：API 请求返回 `DouyinSignatureExpiredError` 或空响应
2. **主动预检**：定时任务每 6 小时检查一次（可配置关闭）

**自动重读流程**：

```typescript
// 在 src/lib/platforms/douyin/http.ts 中扩展
async function douyinFetchWithAutoRefresh(url: string, opts: DouyinFetchOptions, accountId: string) {
  try {
    return await douyinFetch(url, opts);
  } catch (e) {
    if (e instanceof DouyinSignatureExpiredError) {
      // 尝试从浏览器重读 cookie
      const refreshed = await tryRefreshCookieFromBrowser(accountId);
      if (refreshed) {
        // 使用新 cookie 重试
        return await douyinFetch(url, { ...opts, cookie: refreshed });
      }
    }
    throw e;
  }
}

async function tryRefreshCookieFromBrowser(accountId: string): Promise<string | null> {
  // 1. 查询该账号的 BrowserConfig
  const config = await db.browserConfig.findUnique({ where: { platformAccountId: accountId } });
  if (!config) return null;
  
  // 2. 调用 Electron IPC 读取浏览器 cookie
  const newCookie = await window.electron.readBrowserCookie(config.browserType, config.profilePath);
  if (!newCookie) return null;
  
  // 3. 更新数据库中的 cookie
  await db.platformAccount.update({
    where: { id: accountId },
    data: { cookie: newCookie, status: 'ACTIVE' }
  });
  
  return newCookie;
}
```

**定时预检任务**：
```typescript
// 在 src/lib/cron/index.ts 中新增
cron.schedule('0 */6 * * *', async () => {  // 每 6 小时
  const accounts = await db.platformAccount.findMany({
    where: { browserConfig: { isNot: null } },
    include: { browserConfig: true }
  });
  
  for (const account of accounts) {
    try {
      const newCookie = await readBrowserCookie(
        account.browserConfig.browserType,
        account.browserConfig.profilePath
      );
      
      // 对比是否变化（简单比较 sessionid_ss）
      const oldSessionId = extractSessionId(account.cookie);
      const newSessionId = extractSessionId(newCookie);
      
      if (oldSessionId !== newSessionId) {
        await db.platformAccount.update({
          where: { id: account.id },
          data: { cookie: newCookie }
        });
        console.log(`[Cookie Refresh] Updated account ${account.name}`);
      }
    } catch (e) {
      console.error(`[Cookie Refresh] Failed for account ${account.name}:`, e);
    }
  }
});
```

### 错误处理

**浏览器数据库锁定**：
- Chrome/Edge 运行时，Cookies 文件被锁定
- 解决：先复制到临时目录再读取
- 如果复制失败（权限问题），等待 500ms 后重试，最多 3 次

**解密失败**：
- 系统密钥变更（如重装系统）导致 DPAPI/Keychain 解密失败
- 降级为手动粘贴模式，UI 提示用户

**Profile 路径失效**：
- 浏览器卸载或用户目录迁移
- UI 红色警告，引导用户重新配置

**Cookie 读取成功但仍过期**：
- 浏览器中的 cookie 本身已过期
- 标记账号为 EXPIRED 状态，UI 提示用户在浏览器中重新登录

## UI 调整

### 账号设置页面

新增"浏览器绑定"区域：
- **未绑定状态**：显示"点击绑定浏览器"按钮
- **绑定后**：显示浏览器图标 + Profile 名称（如"Chrome - 默认"）
- **操作**：
  - "立即刷新 Cookie"：手动触发一次读取
  - "解除绑定"：删除 BrowserConfig 记录
  - "重新绑定"：更换浏览器/Profile

### 浏览器选择弹窗

- 左侧：浏览器列表（带图标：Chrome、Edge、Brave、Firefox）
- 右侧：选中浏览器的 Profile 列表
- 底部：权限提示文字 + "确认绑定"按钮

### 顶部状态栏

当 Cookie 过期时：
- 显示黄色/橙色提示条："账号「xxx」的 Cookie 已过期，正在尝试自动刷新..."
- 刷新成功：提示条消失
- 刷新失败：红色提示条 + "需要在浏览器中重新登录" + "去设置"按钮

## 桌面特性

### 系统托盘

- **图标**：应用最小化时缩至托盘（Windows 任务栏右下角，macOS 菜单栏右侧）
- **右键菜单**：
  - 显示主窗口
  - 设置
  - 退出应用
- **状态提示**：托盘图标颜色反映应用状态（正常/同步中/错误）

### 窗口管理

- **关闭行为**：点击关闭按钮默认最小化到托盘，而非退出应用（可在设置中改为直接退出）
- **启动行为**：可配置开机启动 + 启动时最小化到托盘
- **单实例限制**：禁止同时打开多个应用实例（通过 `app.requestSingleInstanceLock()` 实现）

### 自动更新

- 使用 `electron-updater` 检查更新
- 每次启动时后台检查 GitHub Releases
- 有新版本时：托盘通知 → 用户点击下载 → 下载完成后提示"重启更新"
- 更新包签名验证（Windows: Authenticode, macOS: Notarization）

### 本地通知

- 同步完成、Cookie 过期、更新可用等事件触发系统通知
- 点击通知打开应用主窗口并跳转到相关页面

## 依赖库选型

### Electron 核心

- **electron**: `^33.0.0`（最新稳定版）
- **electron-builder**: `^25.0.0`（打包工具）
- **electron-updater**: `^6.3.0`（自动更新）

### Cookie 读取

- **better-sqlite3**: `^11.0.0`（读取浏览器 SQLite 数据库）
- **dpapi**: `^1.0.0`（Windows DPAPI 解密）
- **keytar**: `^7.9.0`（macOS/Linux Keychain 访问）
- **node-machine-id**: `^1.1.12`（设备 ID，用于许可绑定）

### 工具库

- **portfinder**: `^1.0.32`（自动分配端口）
- **electron-store**: `^10.0.0`（持久化配置，如窗口位置、用户偏好）

## 打包配置

### electron-builder.yml

```yaml
appId: com.yourdomain.selfmedia
productName: Self-Media
copyright: Copyright © 2026

directories:
  output: dist/electron

files:
  - electron/dist/**/*      # 编译后的 Electron 代码
  - .next/standalone/**/*   # Next.js standalone 输出
  - .next/static/**/*
  - prisma/**/*
  - node_modules/**/*       # 运行时依赖
  - package.json

extraFiles:
  - from: data
    to: data
    filter: ["*.db"]        # 初始空数据库模板

win:
  target:
    - nsis
  icon: build/icon.ico
  
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true

mac:
  target:
    - dmg
  icon: build/icon.icns
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

linux:
  target:
    - AppImage
    - deb
  icon: build/icon.png
  category: Office
```

### macOS 权限配置

`build/entitlements.mac.plist`：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

（JIT 权限用于 V8/Node.js，必需）

## 安全考虑

### Cookie 数据保护

- 解密后的 cookie 仅存储在本地 SQLite 数据库，不上传云端
- 数据库文件位于用户私有目录，权限限制为当前用户读写
- 临时 Cookies 文件用后立即删除（使用 `fs.rm` + `recursive: true`）

### IPC 安全

- 启用 `contextIsolation: true` 和 `nodeIntegration: false`
- 通过 preload 脚本暴露白名单 API：
  ```typescript
  // electron/preload.ts
  contextBridge.exposeInMainWorld('electron', {
    readBrowserCookie: (type: string, path: string) => ipcRenderer.invoke('read-browser-cookie', type, path),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  });
  ```
- 主进程验证所有 IPC 调用参数（路径遍历、命令注入）

### 代码签名

- **Windows**: Authenticode 签名（需购买代码签名证书）
- **macOS**: Apple Developer ID 签名 + Notarization（需 Apple Developer 账号）
- **Linux**: GPG 签名 deb 包（可选）

未签名时 Windows/macOS 会显示安全警告，建议正式发布前完成签名。

## 数据迁移

### 从 Web 版迁移

提供数据导出/导入工具：

**导出脚本**（在旧版 Web 应用中运行）：
```bash
node scripts/export-data.mjs > data-export.json
```

**导入功能**（桌面应用菜单）：
- "文件" → "导入数据"
- 选择 `data-export.json`
- 自动解析并写入 SQLite

**迁移内容**：
- 平台账号（不含 cookie，需重新绑定浏览器）
- 作品历史记录
- AI 分析记录
- 素材文件（复制到新的本地存储路径）

## 测试策略

### 单元测试

- Cookie 读取模块（mock 浏览器数据库）
- 解密逻辑（各平台独立测试）
- IPC 消息处理

### 集成测试

- Electron 启动流程
- Next.js 服务器嵌入
- Cookie 自动刷新流程

### 手动测试

- 各平台打包安装（Windows 10/11, macOS 13+, Ubuntu 22.04）
- 多浏览器兼容性（Chrome/Edge/Brave）
- Cookie 过期场景模拟

## 实施路径

### 阶段一：基础框架

- Electron 基础脚手架（主进程、渲染进程、preload）
- 内嵌 Next.js 服务器启动逻辑
- SQLite 数据库迁移（Prisma schema 调整）
- 基本窗口管理（最小化到托盘、单实例）

**验收标准**：应用可启动，显示现有 UI，数据读写正常。

### 阶段二：Cookie 自动读取

- 浏览器检测与路径定位
- Cookie 读取与解密（Windows DPAPI 优先实现）
- UI 界面：浏览器绑定设置页
- IPC 通信：渲染进程 ↔ 主进程

**验收标准**：Windows 上可绑定 Chrome，自动读取 cookie 并成功拉取抖音数据。

### 阶段三：自动刷新机制

- Cookie 过期检测扩展
- 自动重读流程实现
- 定时预检任务
- 错误处理与降级

**验收标准**：模拟 cookie 过期，应用自动重读浏览器数据库并恢复正常。

### 阶段四：跨平台支持

- macOS Keychain 解密实现
- Linux 明文 cookie 支持
- 多浏览器（Edge/Brave/Firefox）适配
- macOS/Linux 打包配置

**验收标准**：三大平台均可打包安装运行。

### 阶段五：桌面特性完善

- 系统托盘完整功能
- 自动更新（electron-updater）
- 本地通知
- 开机启动选项

**验收标准**：通过 GitHub Releases 发布测试版，验证自动更新流程。

### 阶段六：安全加固与发布

- 代码签名（Windows/macOS）
- 安全审计（IPC、文件操作）
- 性能优化（启动速度、内存占用）
- 用户文档编写

**验收标准**：正式版发布，通过 Windows Defender SmartScreen 和 macOS Gatekeeper 验证。

## 风险与缓解

### 风险一：浏览器加密算法变更

- **风险**：Chrome/Edge 未来版本改变 cookie 加密方式，导致解密失败
- **缓解**：保留手动粘贴 cookie 作为降级方案；监控 Chromium 更新日志；使用成熟的社区库（如 `chrome-cookies-secure`）快速跟进

### 风险二：打包体积过大

- **风险**：Electron + Next.js + Node 模块可能超过 200MB
- **缓解**：
  - 使用 `asar` 压缩 app 目录
  - 生产依赖精简（移除 devDependencies）
  - 考虑 Electron 9+ 的 V8 代码缓存
  - 增量更新（仅下载变更部分）

### 风险三：跨平台兼容性问题

- **风险**：SQLite、Playwright、Prisma 在不同平台表现不一致
- **缓解**：每个平台独立 CI 构建和测试；使用 Docker 容器统一开发环境；提供平台特定的故障排查文档

### 风险四：Cookie 读取权限被拒

- **风险**：用户系统安全软件（杀毒软件、EDR）阻止访问浏览器数据库
- **缓解**：
  - 应用签名和白名单申请（主流杀毒厂商）
  - 提供"信任设置"指引文档
  - 降级为手动粘贴模式

## 未来扩展

### 多平台支持

- 小红书、B站、视频号等平台接入
- 统一的 Cookie 管理界面
- 跨平台数据对比分析

### 云同步（可选）

- 用户可选将数据加密后同步到私有云（WebDAV/S3）
- 多设备数据一致性
- 端到端加密，服务端无法解密

### 插件系统

- 允许用户编写自定义脚本（JavaScript/TypeScript）
- 扩展 AI 分析提示词
- 自定义数据看板

## 附录

### 相关文档

- [Next.js Standalone Output](https://nextjs.org/docs/app/api-reference/next-config-js/output)
- [Electron Security Checklist](https://www.electronjs.org/docs/tutorial/security)
- [Prisma SQLite Guide](https://www.prisma.io/docs/orm/overview/databases/sqlite)

### 技术参考

- **chrome-cookies-secure**: https://github.com/bertrandom/chrome-cookies-secure
- **dpapi (Windows)**: https://github.com/jduncanator/node-dpapi
- **keytar (macOS/Linux)**: https://github.com/atom/node-keytar
- **electron-builder**: https://www.electron.build/

### 估算指标

- **开发工时**：6-8 周（1 名全职开发者）
  - 阶段一：1 周
  - 阶段二：1.5 周
  - 阶段三：1 周
  - 阶段四：1.5 周
  - 阶段五：1 周
  - 阶段六：1 周
- **安装包大小**：
  - Windows: ~180MB（NSIS 安装器）
  - macOS: ~160MB（DMG）
  - Linux: ~170MB（AppImage）
- **运行时内存**：200-350MB（取决于作品数量和 Playwright 使用情况）
- **启动时间**：3-5 秒（冷启动，含 Next.js 服务器初始化）

---

**设计版本**: v1.0  
**更新日期**: 2026-06-06  
**作者**: Claude + 用户协作
