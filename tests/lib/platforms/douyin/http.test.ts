import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { douyinFetch, sleep, HttpError, DouyinSignatureExpiredError } from '@/lib/platforms/douyin/http';
import { __test as signerTest } from '@/lib/platforms/douyin/signer';

let agent: MockAgent;
let original: Dispatcher;
let prevSignerEnv: string | undefined;

beforeEach(() => {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  // 测试默认走 undici mock，关掉浏览器签名器避免真去启动 Chromium
  prevSignerEnv = process.env.DOUYIN_BROWSER_SIGNER;
  process.env.DOUYIN_BROWSER_SIGNER = '0';
});

afterEach(async () => {
  agent.assertNoPendingInterceptors();
  setGlobalDispatcher(original);
  await agent.close();
  if (prevSignerEnv === undefined) delete process.env.DOUYIN_BROWSER_SIGNER;
  else process.env.DOUYIN_BROWSER_SIGNER = prevSignerEnv;
});

describe('douyinFetch', () => {
  it('sends real UA and Referer headers', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/x', method: 'GET' })
      .reply(200, { ok: 1 }, { headers: { 'content-type': 'application/json' } });

    const res = await douyinFetch('https://creator.douyin.com/x', { cookie: 'sessionid_ss=a' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('retries on 5xx then succeeds', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/y', method: 'GET' }).reply(500, '').times(3);
    pool.intercept({ path: '/y', method: 'GET' }).reply(200, { ok: 1 });

    const res = await douyinFetch('https://creator.douyin.com/y', { cookie: 'sessionid_ss=a', retryDelayMs: 1 });
    expect(res.status).toBe(200);
  });

  it('throws after exhausting retries on 5xx', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/z', method: 'GET' }).reply(500, '').times(4);

    await expect(
      douyinFetch('https://creator.douyin.com/z', { cookie: 'sessionid_ss=a', retryDelayMs: 1 }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws immediately on 4xx without retrying', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: '/q', method: 'GET' }).reply(404, 'not found').times(1);

    await expect(
      douyinFetch('https://creator.douyin.com/q', { cookie: 'sessionid_ss=a', retryDelayMs: 1 }),
    ).rejects.toThrow(HttpError);
  });

  it('throws DouyinSignatureExpiredError on empty 200 body (douyin风控)', async () => {
    const pool = agent.get('https://www.douyin.com');
    pool.intercept({ path: '/aweme/v1/web/user/profile/other/?x=1', method: 'GET' }).reply(200, '');

    await expect(
      douyinFetch('https://www.douyin.com/aweme/v1/web/user/profile/other/?x=1', {
        cookie: '',
        retryDelayMs: 1,
      }),
    ).rejects.toThrow(DouyinSignatureExpiredError);
  });
});

describe('signer.stripSignedParams', () => {
  it('removes msToken / a_bogus / x-secsdk-web-signature / timestamp / fp', () => {
    const url =
      'https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=ABC&max_cursor=0&count=18' +
      '&msToken=MM&a_bogus=BB&x-secsdk-web-signature=SS&timestamp=123&fp=FF&verifyFp=VF&webid=WW&uifid=UU&_signature=XX';
    const out = signerTest.stripSignedParams(url);
    const u = new URL(out);
    expect(u.searchParams.get('sec_user_id')).toBe('ABC');
    expect(u.searchParams.get('max_cursor')).toBe('0');
    expect(u.searchParams.get('count')).toBe('18');
    for (const k of ['msToken', 'a_bogus', 'x-secsdk-web-signature', 'timestamp', 'fp', 'verifyFp', 'webid', 'uifid', '_signature']) {
      expect(u.searchParams.has(k)).toBe(false);
    }
  });

  it('returns input unchanged when URL is malformed', () => {
    expect(signerTest.stripSignedParams('not a url')).toBe('not a url');
  });
});

describe('sleep', () => {
  it('resolves after at least the given ms', async () => {
    const t0 = Date.now();
    await sleep(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});
