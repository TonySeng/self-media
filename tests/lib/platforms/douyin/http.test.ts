import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { douyinFetch, sleep, HttpError } from '@/lib/platforms/douyin/http';

let agent: MockAgent;
let original: Dispatcher;

beforeEach(() => {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  agent.assertNoPendingInterceptors();
  setGlobalDispatcher(original);
  await agent.close();
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
});

describe('sleep', () => {
  it('resolves after at least the given ms', async () => {
    const t0 = Date.now();
    await sleep(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});
