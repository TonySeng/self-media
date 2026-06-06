/**
 * 抖音公开接口浏览器签名器
 *
 * 抖音对 `/aweme/v1/web/...` 接口要求 `a_bogus` / `msToken` / `x-secsdk-web-signature`
 * 等签名参数，由前端 webmssdk.js 注入。这些签名时间敏感（数小时失效），手抓维护成本高。
 *
 * 这里的做法是用 Playwright 启动一个 headless Chromium，导航到抖音首页让 webmssdk 自动加载，
 * 之后所有公开接口请求都通过 `page.evaluate(fetch)` 在浏览器上下文中发起，签名由抖音自己注入。
 *
 * 设计要点：
 *   - 模块级单例：浏览器进程跨请求复用，避免每次冷启动 2-3s
 *   - 互斥串行：page 同一时刻只跑一个 evaluate，避免竞态
 *   - 空闲回收：IDLE_MS 内无请求自动关闭浏览器，释放内存
 *   - 容错重试：webmssdk 偶发未加载完导致空 body，reload 后再试一次
 *
 * 关闭：测试中可手动 `await shutdownSigner()`；进程退出时 Playwright 会自动清理。
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

const SIGNER_HOME = 'https://www.douyin.com/';
const IDLE_MS = 5 * 60 * 1000;
const NAV_TIMEOUT_MS = 30_000;
/** webmssdk 在 DOMContentLoaded 后异步加载，留窗口给它注入 fetch 拦截 */
const WARMUP_MS = 2_500;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let initPromise: Promise<void> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
/** 互斥锁：保证 page.evaluate 串行 */
let queue: Promise<unknown> = Promise.resolve();
/** 当前浏览器上下文已注入的 cookie 指纹（避免重复 addCookies + reload） */
let injectedCookieFingerprint: string | null = null;

function isHeadless(): boolean {
  // 与 upload.ts 保持一致的开关
  return process.env.PLAYWRIGHT_HEADLESS !== 'false';
}

async function ensureBrowser(): Promise<void> {
  if (page && !page.isClosed() && browser?.isConnected()) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 旧实例残留时清掉
    if (browser) {
      await browser.close().catch(() => {});
    }
    browser = await chromium.launch({
      headless: isHeadless(),
      // 容器场景下用系统 chromium（alpine 包），由环境变量指定路径
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      // 容器里跑无头浏览器需要的标志：禁用 sandbox（容器无 user namespace）、共享内存改成 /tmp（默认 /dev/shm 太小）
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1560, height: 1040 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);
    await page.goto(SIGNER_HOME, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });
    // webmssdk 需要时间加载
    await page.waitForTimeout(WARMUP_MS);
  })();

  try {
    await initPromise;
  } catch (e) {
    // 启动失败要把状态清干净，下次还能重试
    await shutdownSigner().catch(() => {});
    throw e;
  } finally {
    initPromise = null;
  }
}

function scheduleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void shutdownSigner();
  }, IDLE_MS);
  // 不阻止进程退出
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

export async function shutdownSigner(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const b = browser;
  browser = null;
  context = null;
  page = null;
  injectedCookieFingerprint = null;
  if (b) {
    await b.close().catch(() => {});
  }
}

/**
 * 由 webmssdk 注入的查询参数；用户传入的 URL 如果带了过期值，先剥掉再交给浏览器签名。
 */
const SIGNER_OWNED_PARAMS = [
  'msToken',
  'a_bogus',
  '_signature',
  'X-Bogus',
  'x-secsdk-web-signature',
  'timestamp',
  'fp',
  'verifyFp',
  'webid',
  'uifid',
];

function stripSignedParams(url: string): string {
  try {
    const u = new URL(url);
    for (const k of SIGNER_OWNED_PARAMS) {
      u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Exposed for tests; keep stripSignedParams private. */
export const __test = { stripSignedParams };

export type BrowserFetchResult = {
  status: number;
  body: string;
};

/** 把 "a=1; b=2" 形式的 cookie 头解析成 Playwright addCookies 格式 */
function parseCookieHeader(
  cookieStr: string,
  domain = '.douyin.com',
): Array<{ name: string; value: string; domain: string; path: string }> {
  const out: Array<{ name: string; value: string; domain: string; path: string }> = [];
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    out.push({ name, value, domain, path: '/' });
  }
  return out;
}

async function ensureCookies(cookie?: string): Promise<void> {
  const fp = cookie ? cookie.slice(0, 100) + ':' + cookie.length : '';
  if (fp === injectedCookieFingerprint) return;
  if (!context) return;
  if (cookie) {
    const cookies = parseCookieHeader(cookie);
    if (cookies.length > 0) {
      await context.addCookies(cookies);
      // 注入新 cookie 后必须 reload 让 webmssdk 用新身份重新初始化
      await page?.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page?.waitForTimeout(WARMUP_MS);
    }
  }
  injectedCookieFingerprint = fp;
}

/**
 * 在受信任的 douyin.com 上下文中发起 fetch；签名参数由 webmssdk 自动注入。
 *
 * 注意：URL 必须是 www.douyin.com 同源接口，否则浏览器签名不会生效（CORS 也会阻拦）。
 *
 * @param cookie 可选的用户 cookie（"k1=v1; k2=v2" 格式）。带 cookie 时抖音视为已登录用户，
 *               能拉取更深层数据；不带则第 2 页常被风控返回 `{status_code: 0}`。
 */
export async function browserFetchJson(
  url: string,
  cookie?: string,
): Promise<BrowserFetchResult> {
  const cleaned = stripSignedParams(url);

  // 互斥串行
  const prev = queue;
  let release: () => void = () => {};
  queue = new Promise<void>((r) => {
    release = r;
  });
  await prev.catch(() => {});

  try {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    await ensureBrowser();
    await ensureCookies(cookie);

    let result = await runFetch(cleaned);
    // 空 body 多半是 webmssdk 未就绪或会话被风控，reload 重试一次
    if (!result.body || result.body.trim().length === 0) {
      await page?.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page?.waitForTimeout(WARMUP_MS);
      result = await runFetch(cleaned);
    }
    return result;
  } finally {
    scheduleShutdown();
    release();
  }
}

async function runFetch(url: string): Promise<BrowserFetchResult> {
  if (!page || page.isClosed()) {
    throw new Error('douyin signer: browser page is not available');
  }
  return page.evaluate(async (u: string) => {
    const r = await fetch(u, {
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    return { status: r.status, body: await r.text() };
  }, url);
}
