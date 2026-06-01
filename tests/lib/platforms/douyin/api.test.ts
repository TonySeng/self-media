import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { douyinAdapter } from '@/lib/platforms/douyin';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/douyin', name), 'utf8');

let agent: MockAgent;
let original: Dispatcher;

beforeEach(() => {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  setGlobalDispatcher(original);
  await agent.close();
});

describe('douyinAdapter.validateCookie', () => {
  it('returns ok=true with account info on 200', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: /\/aweme\/v1\/creator\/check\/user\//, method: 'GET' })
      .reply(200, JSON.parse(fixture('user-info.json')), {
        headers: { 'content-type': 'application/json' },
      });
    const r = await douyinAdapter.validateCookie('sessionid_ss=valid');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.nickname).toBe('测试昵称');
  });

  it('returns ok=false with reason=invalid when sessionid_ss missing', async () => {
    const r = await douyinAdapter.validateCookie('foo=bar');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('returns ok=false with reason=expired on 401/403', async () => {
    const pool = agent.get('https://creator.douyin.com');
    pool.intercept({ path: /\/aweme\/v1\/creator\/check\/user\//, method: 'GET' })
      .reply(401, '');
    const r = await douyinAdapter.validateCookie('sessionid_ss=stale');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });
});
