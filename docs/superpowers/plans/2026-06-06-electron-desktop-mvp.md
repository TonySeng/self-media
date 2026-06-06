# Electron 桌面应用 MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Next.js Web 应用改造为可在 Windows 桌面运行的 Electron 应用，支持自动读取 Chrome cookie 获取抖音登录信息，并验证同步作品功能正常。

**Architecture:** Electron 主进程启动内嵌的 Next.js standalone 服务器（随机端口），渲染进程加载 localhost；数据库从 PostgreSQL 迁移到 SQLite（修改 Prisma provider）；Chrome cookie 读取通过 Electron 主进程直接操作浏览器 SQLite 数据库（复制后解密），经 IPC 传递给渲染进程。

**Tech Stack:** Electron 33, electron-builder 25, better-sqlite3 11, dpapi（Windows DPAPI 解密）, portfinder, TypeScript, 现有 Next.js 15 + Prisma（切换 sqlite provider）

---

## 文件地图

### 新建文件

| 文件 | 职责 |
|------|------|
| `electron/main.ts` | Electron 主进程入口：端口分配、Next.js 进程启动、窗口创建 |
| `electron/preload.ts` | contextBridge 暴露白名单 IPC API 给渲染进程 |
| `electron/ipc-handlers.ts` | IPC 处理器注册：cookie 读取 |
| `electron/cookie-reader/browsers.ts` | 检测 Chrome/Edge 的 Profile 目录列表 |
| `electron/cookie-reader/decrypt.ts` | Windows DPAPI 解密 cookie encrypted_value |
| `electron/cookie-reader/reader.ts` | 复制浏览器 SQLite → 查询 → 解密 → 返回 cookie 字符串 |
| `electron/cookie-reader/index.ts` | 对外统一导出 `readChromeCookies()` |
| `electron/tsconfig.json` | Electron 代码的独立 TypeScript 配置 |
| `electron-builder.yml` | 打包配置（Windows NSIS）|

### 修改文件

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | `provider = "sqlite"`；删除 `@db.Text` 注解；`Decimal` → `Float` |
| `prisma/migrations/` | 新建 sqlite 兼容迁移（旧 pg 迁移不删，仅新建） |
| `next.config.ts` | 确保 `output: 'standalone'` 已启用 |
| `package.json` | 新增 electron/electron-builder/better-sqlite3/portfinder/dpapi 依赖；新增 `electron:dev`/`electron:build` 脚本 |
| `src/app/(app)/settings/platforms/page.tsx` | 新增"从 Chrome 导入 Cookie"区块，调用 `window.electron.readChromeCookies()` |
| `src/app/api/platforms/douyin/accounts/route.ts` | POST 端点新增内部接口：`/api/platforms/douyin/accounts/import-cookie`（接收 accountId + cookie，更新并返回新 cookie） |
| `.env.example` | 将 `DATABASE_URL` 示例改为 sqlite 格式 |

---

## Task 1: 数据库迁移 PostgreSQL → SQLite

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `.env` / `.env.example`
- Create: `prisma/migrations/20260606000000_sqlite_init/migration.sql`（通过命令生成）

- [ ] **Step 1: 修改 `prisma/schema.prisma`**

将以下内容：
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
改为：
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

然后删除所有 `@db.Text` 注解（SQLite 无需此修饰）。具体有以下字段需要处理（只删注解，保留字段定义）：

- `WorkComment.content  String  @db.Text` → `content  String`
- `WorkComment.autoReplyContent  String?  @db.Text` → `autoReplyContent  String?`
- `BenchmarkWork.description  String?  @db.Text` → `description  String?`
- `BenchmarkWork.notes  String?  @db.Text` → `notes  String?`
- `BenchmarkAccount.notes  String?  @db.Text` → `notes  String?`
- `PromptTemplate.systemPrompt  String  @db.Text` → `systemPrompt  String`
- `PromptTemplate.userTemplate  String  @db.Text` → `userTemplate  String`
- `AIAnalysis.prompt  String  @db.Text` → `prompt  String`
- `AIAnalysis.response  String?  @db.Text` → `response  String?`
- `AIChatMessage.content  String  @db.Text` → `content  String`
- `Publish.description  String?  @db.Text` → `description  String?`
- `Publish.error  String?  @db.Text` → `error  String?`

- [ ] **Step 2: 更新 `.env` 中的 DATABASE_URL**

将：
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/selfmedia"
```
改为：
```
DATABASE_URL="file:./dev.db"
```

更新 `.env.example` 中的注释和示例值同步修改：
```
# SQLite 数据库（桌面客户端模式）
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 3: 重新生成并应用 SQLite 迁移**

```bash
pnpm prisma migrate dev --name sqlite_init
```

预期输出：提示创建新迁移，Prisma 生成 SQLite 兼容的 SQL，最后显示 `✓ Generated Prisma Client`。

如果提示有已有迁移历史与当前数据库不匹配，执行：
```bash
pnpm prisma migrate reset --force
pnpm prisma migrate dev --name sqlite_init
```

- [ ] **Step 4: 验证 Prisma Client 可以连接 SQLite**

```bash
pnpm prisma studio
```

浏览器打开 `http://localhost:5555`，能看到所有表（PlatformAccount、Work 等），无报错。关闭 studio 后继续。

- [ ] **Step 5: 确认 next.config.ts 已启用 standalone**

读取 `next.config.ts`，确保有 `output: 'standalone'`。如果没有，添加：

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // ...其他现有配置保持不变
}

export default nextConfig
```

- [ ] **Step 6: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/ .env.example next.config.ts
git commit -m "feat(db): migrate from postgresql to sqlite for desktop app"
```

---

## Task 2: Electron 主进程与窗口框架

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: 安装 Electron 相关依赖**

```bash
pnpm add -D electron@33 electron-builder@25 portfinder@1
pnpm add -D @types/portfinder
```

预期：`node_modules/electron` 目录存在，`package.json` 的 devDependencies 中出现这些包。

- [ ] **Step 2: 创建 `electron/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "electron/dist",
    "rootDir": "electron/src",
    "skipLibCheck": true
  },
  "include": ["electron/src/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 `electron/src/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  readChromeCookies: (profilePath: string) =>
    ipcRenderer.invoke('read-chrome-cookies', profilePath),
  listChromeProfiles: () =>
    ipcRenderer.invoke('list-chrome-profiles'),
});
```

- [ ] **Step 4: 创建 `electron/src/main.ts`**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as portfinder from 'portfinder';

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let serverPort = 3000;

async function findPort(): Promise<number> {
  portfinder.basePort = 3000;
  return portfinder.getPortPromise();
}

async function startNextServer(port: number): Promise<void> {
  const serverPath = path.join(__dirname, '../../.next/standalone/server.js');
  const dataDir = app.getPath('userData');

  return new Promise((resolve, reject) => {
    nextProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        DATABASE_URL: `file:${path.join(dataDir, 'data.db')}`,
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });

    nextProcess.stdout?.on('data', (data: Buffer) => {
      const out = data.toString();
      console.log('[next]', out);
      if (out.includes('Ready') || out.includes('started server')) {
        resolve();
      }
    });

    nextProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[next:err]', data.toString());
    });

    nextProcess.on('error', reject);

    // 最多等待 15 秒
    setTimeout(resolve, 15000);
  });
}

function createWindow(port: number): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  serverPort = await findPort();
  await startNextServer(serverPort);
  createWindow(serverPort);

  // 注册 IPC handlers
  const { registerIpcHandlers } = await import('./ipc-handlers');
  registerIpcHandlers(ipcMain);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    nextProcess?.kill();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow(serverPort);
  }
});
```

- [ ] **Step 5: 更新 `package.json` 的 scripts 和 main 字段**

在 `package.json` 中添加：

```json
{
  "main": "electron/dist/main.js",
  "scripts": {
    "electron:dev": "tsc -p electron/tsconfig.json && electron .",
    "electron:build": "next build && tsc -p electron/tsconfig.json && electron-builder"
  }
}
```

注意：只添加这些 scripts，不要删除现有的 `dev`、`build`、`test` 等脚本。

- [ ] **Step 6: 先做一次 Next.js 生产构建并测试 Electron 启动**

```bash
pnpm build
pnpm exec tsc -p electron/tsconfig.json
pnpm exec electron .
```

预期：Electron 窗口弹出，显示应用界面（可能需要登录）。控制台有 `[next] Ready` 或 `[next] started server` 输出。

如果窗口出现但页面空白，检查 `DATABASE_URL` 路径是否正确（Prisma 会在 `app.getPath('userData')` 下创建 data.db）。

如果出现 `Cannot find module 'server.js'`，检查 `next.config.ts` 中 `output: 'standalone'` 是否已设置，重新 `pnpm build`。

- [ ] **Step 7: 提交**

```bash
git add electron/ package.json
git commit -m "feat(electron): add electron main process and window scaffold"
```

---

## Task 3: Chrome Cookie 自动读取

**Files:**
- Create: `electron/src/cookie-reader/browsers.ts`
- Create: `electron/src/cookie-reader/decrypt.ts`
- Create: `electron/src/cookie-reader/reader.ts`
- Create: `electron/src/cookie-reader/index.ts`
- Create: `electron/src/ipc-handlers.ts`

- [ ] **Step 1: 安装 cookie 读取所需依赖**

```bash
pnpm add better-sqlite3@11
pnpm add -D @types/better-sqlite3
```

对于 Windows DPAPI 解密，使用 Node.js 内置的 `crypto` 加 `child_process` 调用 PowerShell，无需额外包（避免 native module 编译问题）：

```bash
# 不需要安装 dpapi 包，用 PowerShell 调用
```

- [ ] **Step 2: 创建 `electron/src/cookie-reader/browsers.ts`**

检测 Chrome/Edge 的 User Data 目录并枚举 Profile 列表：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type BrowserProfile = {
  browserType: 'chrome' | 'edge' | 'brave';
  label: string;      // 显示给用户的名称，如 "Chrome - 默认"
  profilePath: string; // 完整路径到 Profile 目录
};

function getUserDataDirs(): Array<{ browser: 'chrome' | 'edge' | 'brave'; dir: string }> {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  void appData;

  return [
    {
      browser: 'chrome',
      dir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    },
    {
      browser: 'edge',
      dir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
    },
    {
      browser: 'brave',
      dir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    },
  ].filter((b) => fs.existsSync(b.dir));
}

function getProfiles(userDataDir: string): string[] {
  const profileNames: string[] = [];
  if (fs.existsSync(path.join(userDataDir, 'Default'))) {
    profileNames.push('Default');
  }
  try {
    const entries = fs.readdirSync(userDataDir);
    for (const e of entries) {
      if (/^Profile \d+$/.test(e) && fs.existsSync(path.join(userDataDir, e, 'Cookies'))) {
        profileNames.push(e);
      }
    }
  } catch {
    // ignore
  }
  return profileNames;
}

export function listBrowserProfiles(): BrowserProfile[] {
  const results: BrowserProfile[] = [];
  for (const { browser, dir } of getUserDataDirs()) {
    const browserName = browser === 'chrome' ? 'Chrome' : browser === 'edge' ? 'Edge' : 'Brave';
    for (const profile of getProfiles(dir)) {
      const displayName = profile === 'Default' ? '默认' : profile;
      results.push({
        browserType: browser,
        label: `${browserName} - ${displayName}`,
        profilePath: path.join(dir, profile),
      });
    }
  }
  return results;
}
```

- [ ] **Step 3: 创建 `electron/src/cookie-reader/decrypt.ts`**

Windows Chrome 对 cookie 使用 AES-256-GCM + DPAPI 加密（v10 格式）。通过 PowerShell 调用 DPAPI 解密主密钥：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

// 缓存每个 User Data 目录对应的解密主密钥
const keyCache = new Map<string, Buffer>();

function getEncryptedKey(userDataDir: string): Buffer {
  const localStatePath = path.join(userDataDir, 'Local State');
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8')) as {
    os_crypt?: { encrypted_key?: string };
  };
  const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) throw new Error('Local State 中未找到 encrypted_key');
  // 去掉 DPAPI 前缀 (前5字节 = 'DPAPI')
  const encryptedKey = Buffer.from(encryptedKeyB64, 'base64').subarray(5);
  return encryptedKey;
}

function dpApiDecrypt(data: Buffer): Buffer {
  // 通过 PowerShell 调用 .NET DPAPI
  const hex = data.toString('hex');
  const script = `
    $bytes = [System.Convert]::FromHexString('${hex}')
    $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.Convert]::ToHexString($decrypted)
  `;
  const result = execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, {
    timeout: 10000,
  })
    .toString()
    .trim();
  return Buffer.from(result, 'hex');
}

export function getMasterKey(userDataDir: string): Buffer {
  const cached = keyCache.get(userDataDir);
  if (cached) return cached;
  const encryptedKey = getEncryptedKey(userDataDir);
  const key = dpApiDecrypt(encryptedKey);
  keyCache.set(userDataDir, key);
  return key;
}

export function decryptCookieValue(encryptedValue: Buffer, masterKey: Buffer): string {
  // Chrome v10 格式: 3字节标签 "v10" + 12字节 nonce + 密文 + 16字节 auth tag
  const prefix = encryptedValue.subarray(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v11') {
    // 旧格式（未加密或纯 DPAPI），尝试直接转字符串
    return encryptedValue.toString('utf8');
  }
  const nonce = encryptedValue.subarray(3, 15);
  const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16);
  const authTag = encryptedValue.subarray(encryptedValue.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: 创建 `electron/src/cookie-reader/reader.ts`**

复制浏览器 SQLite → 查询 douyin.com cookies → 解密 → 返回 cookie 字符串：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { getMasterKey, decryptCookieValue } from './decrypt';

type RawCookieRow = {
  name: string;
  encrypted_value: Buffer;
};

export async function readDouyinCookiesFromProfile(profilePath: string): Promise<string> {
  const cookiesDbPath = path.join(profilePath, 'Cookies');
  if (!fs.existsSync(cookiesDbPath)) {
    throw new Error(`未找到 Cookies 文件：${cookiesDbPath}`);
  }

  // 复制到临时文件，避免浏览器锁定
  const tmpPath = path.join(os.tmpdir(), `self-media-cookies-${Date.now()}.db`);
  fs.copyFileSync(cookiesDbPath, tmpPath);

  let cookieStr = '';

  try {
    const db = new Database(tmpPath, { readonly: true });

    const rows = db
      .prepare(
        `SELECT name, encrypted_value FROM cookies
         WHERE host_key LIKE '%.douyin.com' OR host_key = 'douyin.com'
         ORDER BY name`
      )
      .all() as RawCookieRow[];

    db.close();

    // 获取 User Data 目录（profilePath 的上两级）
    const userDataDir = path.dirname(profilePath);
    const masterKey = getMasterKey(userDataDir);

    const parts: string[] = [];
    for (const row of rows) {
      try {
        const value = decryptCookieValue(row.encrypted_value, masterKey);
        if (value) parts.push(`${row.name}=${value}`);
      } catch {
        // 单个 cookie 解密失败不影响整体
      }
    }
    cookieStr = parts.join('; ');
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  if (!cookieStr.includes('sessionid_ss')) {
    throw new Error('读取到的 cookie 中缺少 sessionid_ss，请确认该浏览器已登录抖音');
  }

  return cookieStr;
}
```

- [ ] **Step 5: 创建 `electron/src/cookie-reader/index.ts`**

```typescript
export { listBrowserProfiles } from './browsers';
export type { BrowserProfile } from './browsers';
export { readDouyinCookiesFromProfile } from './reader';
```

- [ ] **Step 6: 创建 `electron/src/ipc-handlers.ts`**

```typescript
import type { IpcMain } from 'electron';
import { listBrowserProfiles, readDouyinCookiesFromProfile } from './cookie-reader';

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('list-chrome-profiles', () => {
    return listBrowserProfiles();
  });

  ipcMain.handle('read-chrome-cookies', async (_event, profilePath: string) => {
    if (typeof profilePath !== 'string' || !profilePath) {
      throw new Error('profilePath 参数无效');
    }
    return readDouyinCookiesFromProfile(profilePath);
  });
}
```

- [ ] **Step 7: 编译并验证 TypeScript 无错误**

```bash
pnpm exec tsc -p electron/tsconfig.json --noEmit
```

预期：无任何错误输出。

如果报 `Cannot find module 'better-sqlite3'`，检查 `@types/better-sqlite3` 是否安装。

- [ ] **Step 8: 提交**

```bash
git add electron/src/
git commit -m "feat(electron): add Chrome cookie reader with DPAPI decryption"
```

---

## Task 4: UI 集成 — 在账号设置页添加"从 Chrome 导入"入口

**Files:**
- Modify: `src/app/(app)/settings/platforms/page.tsx`
- Create: `src/types/electron.d.ts`（全局类型声明）

- [ ] **Step 1: 创建 `src/types/electron.d.ts`（让 TypeScript 认识 `window.electron`）**

```typescript
// src/types/electron.d.ts
export {};

declare global {
  interface Window {
    electron?: {
      readChromeCookies: (profilePath: string) => Promise<string>;
      listChromeProfiles: () => Promise<Array<{
        browserType: 'chrome' | 'edge' | 'brave';
        label: string;
        profilePath: string;
      }>>;
    };
  }
}
```

- [ ] **Step 2: 在 `src/app/(app)/settings/platforms/page.tsx` 中添加 `ChromeImportCard` 组件**

在文件末尾、`export default function PlatformsPage()` 的 JSX 里，在现有"添加抖音账号（粘贴 Cookie）"Card 之前，插入如下组件调用：

```tsx
{typeof window !== 'undefined' && window.electron && (
  <ChromeImportCard onImported={load} />
)}
```

然后在文件末尾添加 `ChromeImportCard` 组件：

```tsx
type ChromeProfile = {
  browserType: 'chrome' | 'edge' | 'brave';
  label: string;
  profilePath: string;
};

function ChromeImportCard({ onImported }: { onImported: () => void }) {
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [secUid, setSecUid] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  async function fetchProfiles() {
    if (!window.electron) return;
    setLoadingProfiles(true);
    try {
      const list = await window.electron.listChromeProfiles();
      setProfiles(list);
      if (list.length > 0) setSelectedProfile(list[0]!.profilePath);
    } catch (e) {
      toast.error('读取浏览器列表失败');
    } finally {
      setLoadingProfiles(false);
    }
  }

  useEffect(() => { void fetchProfiles(); }, []);

  async function importCookie() {
    if (!selectedProfile || !secUid.trim()) return;
    setLoading(true);
    try {
      const cookie = await window.electron!.readChromeCookies(selectedProfile);
      const res = await fetch('/api/platforms/douyin/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cookie,
          secUid: secUid.trim(),
          nickname: nickname.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(j.message ?? '导入失败');
        return;
      }
      toast.success('Cookie 已从浏览器读取并导入');
      setSecUid('');
      setNickname('');
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '读取 Cookie 失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 border-blue-200 bg-blue-50/30">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">从浏览器自动读取 Cookie</span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">桌面版专属</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">选择浏览器 Profile</Label>
        {loadingProfiles ? (
          <div className="text-xs text-muted-foreground">检测浏览器中…</div>
        ) : (
          <select
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.profilePath} value={p.profilePath}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="chrome-secuid">
            sec_uid（必填）
          </Label>
          <input
            id="chrome-secuid"
            type="text"
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
            placeholder="MS4wLjAB..."
            value={secUid}
            onChange={(e) => setSecUid(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="chrome-nickname">
            账号昵称（选填）
          </Label>
          <input
            id="chrome-nickname"
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="给账号起个备注名"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        请确保已在浏览器中登录抖音，应用会自动读取 <code className="font-mono">douyin.com</code> 的 Cookie。
      </div>

      <Button
        onClick={() => void importCookie()}
        disabled={loading || !selectedProfile || !secUid.trim()}
      >
        {loading ? '读取中…' : '从浏览器读取 Cookie'}
      </Button>
    </Card>
  );
}
```

- [ ] **Step 3: 编译并运行 Electron 验证 UI**

```bash
pnpm build
pnpm exec tsc -p electron/tsconfig.json
pnpm exec electron .
```

打开应用后：
1. 导航到"设置" → "平台账号"
2. 页面顶部应出现蓝色"从浏览器自动读取 Cookie"卡片
3. 下拉框显示检测到的 Chrome/Edge Profile 列表
4. 填入 sec_uid（从浏览器地址栏 `www.douyin.com/user/MS4wLjAB...` 复制）
5. 点击"从浏览器读取 Cookie"
6. 应显示 toast "Cookie 已从浏览器读取并导入"
7. 账号列表刷新出现新账号，状态为"正常"

- [ ] **Step 4: 验证同步作品功能**

1. 在账号列表找到刚导入的账号
2. 点击"立即同步"
3. 等待同步完成（toast 显示"同步完成"）
4. 导航到"作品"页面，确认作品列表出现数据

如果同步失败且错误信息包含"签名/msToken 已过期"：
- 这是正常的，表示 cookie 读取成功但 Playwright 签名器需要 Chrome cookie 注入
- 检查 `DOUYIN_BROWSER_SIGNER` 环境变量，如果设为 `'0'` 则走静态端点，需要更新 `endpoints.local.ts`

- [ ] **Step 5: 提交**

```bash
git add src/app/\(app\)/settings/platforms/page.tsx src/types/electron.d.ts
git commit -m "feat(ui): add Chrome cookie import UI on platforms settings page"
```

---

## 自查结果

本计划覆盖了目标的核心路径：

1. ✅ **数据库迁移**（Task 1）：PostgreSQL → SQLite，Prisma 配置调整
2. ✅ **Electron 框架**（Task 2）：主进程启动 Next.js，渲染进程加载 localhost，IPC 框架
3. ✅ **Chrome Cookie 读取**（Task 3）：浏览器检测、DPAPI 解密、douyin.com cookie 提取
4. ✅ **UI 集成**（Task 4）：账号设置页浏览器选择下拉 + 导入按钮
5. ✅ **同步验证**（Task 4 Step 4）：点"立即同步"验证作品数据写入

**已知范围内未包含的功能**（非 MVP 目标，后续计划处理）：
- cookie 过期自动重读（设计文档 Phase 3）
- 系统托盘（设计文档 Phase 5）
- electron-builder 打包成 .exe 安装包（设计文档 Phase 4）
- macOS/Linux 支持（设计文档 Phase 4）

**类型一致性确认**：
- `BrowserProfile.profilePath`：在 `browsers.ts` 定义、`index.ts` 重新导出、`ipc-handlers.ts` 接收、`preload.ts` 透传、`electron.d.ts` 声明、`platforms/page.tsx` 使用——全链路一致。
- `readDouyinCookiesFromProfile(profilePath: string): Promise<string>`：在 `reader.ts` 定义，`index.ts` 导出，`ipc-handlers.ts` 调用，`preload.ts` 包装为 `readChromeCookies(profilePath)`，UI 调用 `window.electron.readChromeCookies(selectedProfile)`——全链路一致。
