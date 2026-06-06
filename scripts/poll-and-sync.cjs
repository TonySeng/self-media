// 等待用户在 Electron 中通过扫码登录添加账号，发现后自动触发同步并验证
const http = require('http');
const fs = require('fs');

function curl(method, path, data, cookies) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { 'content-type': 'application/json' }
    };
    if (cookies) opts.headers['cookie'] = cookies;
    const req = http.request(opts, r => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, 240000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Login
  console.log('[poll] login...');
  const loginRes = await curl('POST', '/api/auth/login', { password: 'admin123' });
  const session = (loginRes.headers['set-cookie'] || [])[0]?.split(';')[0];
  if (!session) throw new Error('login failed');
  console.log('[poll] session ok');

  // Poll accounts every 5s, watching for the account just added
  console.log('[poll] watching for new account... (use Electron UI to scan QR and add account)');
  let found = null;
  for (let i = 0; i < 60; i++) {  // 5 min max
    const r = await curl('GET', '/api/platforms/douyin/accounts', null, session);
    const list = JSON.parse(r.body);
    if (list.length > 0) {
      found = list[0];
      console.log('[poll] FOUND account:', JSON.stringify(found).slice(0, 200));
      break;
    }
    process.stdout.write('.');
    await sleep(5000);
  }
  if (!found) throw new Error('no account added in 5 min');
  console.log('');

  // Trigger sync
  console.log('[poll] triggering sync for', found.id, '...');
  const syncRes = await curl('POST', `/api/sync/run/${found.id}`, null, session);
  console.log('[poll] sync status:', syncRes.status);
  console.log('[poll] sync body:', syncRes.body.slice(0, 500));

  // Wait for sync (sync is synchronous in this codebase)
  await sleep(2000);

  // Check works
  console.log('[poll] querying works...');
  const worksRes = await curl('GET', `/api/works?accountId=${found.id}&limit=5`, null, session);
  const works = JSON.parse(worksRes.body);
  console.log('[poll] works count:', works?.items?.length ?? 0);
  if (works?.items?.length > 0) {
    console.log('[poll] sample works:');
    works.items.slice(0, 3).forEach((w, i) => {
      console.log(`  ${i + 1}. "${w.title?.slice(0, 40)}" published=${w.publishedAt} play=${w.metrics?.[0]?.play ?? '?'}`);
    });
  }

  console.log('\n=== FINAL ===');
  console.log('✓ Login');
  console.log('✓ Account added via Electron QR login:', found.nickname, '(', found.id, ')');
  const syncJson = JSON.parse(syncRes.body);
  console.log((syncJson.status === 'DONE' ? '✓' : '✗') + ' Sync:', syncJson.status, syncJson.error || '');
  console.log((works?.items?.length > 0 ? '✓' : '✗') + ' Works synced:', works?.items?.length ?? 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
