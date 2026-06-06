import { request } from 'undici';
import { browserFetchJson } from './signer';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36';

/**
 * 公开接口（www.douyin.com）是否使用浏览器签名器自动签名。
 * 设为 '0' 关闭，回退到手抓的 endpoints.local.ts 静态签名。
 */
function useBrowserSigner(): boolean {
  return process.env.DOUYIN_BROWSER_SIGNER !== '0';
}

export type DouyinFetchOptions = {
  cookie: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  referer?: string;
  maxRetries?: number;
  retryDelayMs?: number;
};

export type DouyinResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * 抖音对签名过期 / 未登录 / 触发风控的请求会返回 HTTP 200 + 空 body。
 * 单独抛出便于上层给出可执行的提示（重抓 endpoints.local.ts 签名）。
 */
export class DouyinSignatureExpiredError extends Error {
  constructor(url: string) {
    super(
      '抖音返回空响应（签名/msToken 已过期或被风控）。请按 `src/lib/platforms/douyin/endpoints.ts` 注释的抓包步骤，' +
        '在隐身浏览器打开 https://www.douyin.com/user/<sec_uid>，重抓该接口最新参数，' +
        '更新 `endpoints.local.ts` 的 msToken / a_bogus / timestamp / x-secsdk-web-signature。' +
        ` 失败 URL: ${url.slice(0, 120)}...`,
    );
    this.name = 'DouyinSignatureExpiredError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function douyinFetch(url: string, opts: DouyinFetchOptions): Promise<DouyinResponse> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.retryDelayMs ?? 500;
  const isPublic = url.includes('www.douyin.com');

  // 公开接口走浏览器签名器（GET 请求）：让真实页面里的 webmssdk 自动注入 a_bogus / msToken / x-secsdk-web-signature
  // 同时把用户 cookie 注入浏览器上下文，避免抖音对未登录请求的频控（第 2 页就 status_code=0 空响应）
  if (isPublic && useBrowserSigner() && (opts.method ?? 'GET') === 'GET') {
    return douyinFetchViaBrowser(url, opts.cookie);
  }

  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const referer = opts.referer ?? (isPublic ? 'https://www.douyin.com/' : 'https://creator.douyin.com/');
      const res = await request(url, {
        method: opts.method ?? 'GET',
        headers: {
          'User-Agent': UA,
          Referer: referer,
          ...(opts.cookie ? { Cookie: opts.cookie } : {}),
          Accept: 'application/json, text/plain, */*',
          ...(opts.headers ?? {}),
        },
        body: opts.body,
      });
      if (res.statusCode >= 500 && attempt < maxRetries) {
        await res.body.dump();
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }
      if (res.statusCode >= 400) {
        const text = await res.body.text();
        throw new HttpError(res.statusCode, text);
      }
      const buf = await res.body.arrayBuffer();
      // 抖音风控：HTTP 200 但 body 为空（或仅空白），需提示用户重抓签名而不是抛 JSON 解析错误
      if (buf.byteLength === 0) {
        throw new DouyinSignatureExpiredError(url);
      }
      return {
        status: res.statusCode,
        headers: res.headers,
        json: async () => JSON.parse(Buffer.from(buf).toString('utf8')) as unknown,
        text: async () => Buffer.from(buf).toString('utf8'),
      };
    } catch (e) {
      // 4xx is permanent — don't retry
      if (e instanceof HttpError && e.status < 500) throw e;
      // 签名过期不是网络问题，重试也是空响应，直接抛
      if (e instanceof DouyinSignatureExpiredError) throw e;
      lastErr = e;
      if (attempt >= maxRetries) throw e;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }
  throw lastErr ?? new Error('douyinFetch: unreachable');
}

export function randomDelayMs(min = 1000, max = 3000): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function douyinFetchViaBrowser(url: string, cookie?: string): Promise<DouyinResponse> {
  const { status, body } = await browserFetchJson(url, cookie);
  if (status >= 400) {
    throw new HttpError(status, body);
  }
  if (!body || body.trim().length === 0) {
    // 浏览器签名器内部已经 reload+重试一次仍空，抛出明确错误
    throw new DouyinSignatureExpiredError(url);
  }
  return {
    status,
    headers: {},
    json: async () => JSON.parse(body) as unknown,
    text: async () => body,
  };
}
