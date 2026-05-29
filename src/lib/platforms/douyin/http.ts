import { request } from 'undici';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36';

export type DouyinFetchOptions = {
  cookie: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
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

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function douyinFetch(url: string, opts: DouyinFetchOptions): Promise<DouyinResponse> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.retryDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await request(url, {
        method: opts.method ?? 'GET',
        headers: {
          'User-Agent': UA,
          Referer: 'https://creator.douyin.com/',
          Cookie: opts.cookie,
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
      return {
        status: res.statusCode,
        headers: res.headers,
        json: async () => JSON.parse(Buffer.from(buf).toString('utf8')) as unknown,
        text: async () => Buffer.from(buf).toString('utf8'),
      };
    } catch (e) {
      // 4xx is permanent — don't retry
      if (e instanceof HttpError && e.status < 500) throw e;
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
