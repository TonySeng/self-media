// E2E 端到端: 启动 Electron → 登录 → 调用 openDouyinLogin → 用户扫码 → 提取 sec_uid → 导入账号 → 同步 → 检查作品
const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const ELECTRON_BIN = path.join(
  __dirname, '..', 'node_modules', '.pnpm', 'electron@33.4.11',
  'node_modules', 'electron', 'dist', 'electron.exe'
);
const APP_DIR = path.join(__dirname, '..');
const DEBUG_PORT = 19265;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getTargets() {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json/list`, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => {
        try { res(JSON.parse(b)); } catch(e) { rej(e); }
      });
    }).on('error', rej);
  });
}

async function main() {
  console.log('[e2e] launching Electron (please scan QR code in popup window when it appears)...');
  const p = spawn(ELECTRON_BIN, [`--remote-debugging-port=${DEBUG_PORT}`, '.'], {
    env: { ...process.env, ELECTRON_DEV: '1' },
    cwd: APP_DIR,
    stdio: 'pipe'
  });
  p.stdout.on('data', d => process.stdout.write('[el] ' + d.toString()));
  p.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('DevTools') || s.includes('Debugger')) return;
    process.stderr.write('[el:err] ' + s);
  });

  let target = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    try {
      const targets = await getTargets();
      target = targets.find(t => t.type === 'page' && t.url.includes('localhost') === false ? t.url.includes('127.0.0.1') : true);
      target = (await getTargets()).find(t => t.type === 'page');
      if (target) break;
    } catch { }
  }
  if (!target) throw new Error('No page target');
  console.log('[e2e] page:', target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  const pending = new Map();
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch { }
  });

  let nextId = 1;
  function send(method, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)); }
      }, timeoutMs);
    });
  }

  async function evlAsync(expression, timeoutMs = 60000) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, timeoutMs);
    if (r.result && r.result.exceptionDetails) {
      const det = r.result.exceptionDetails;
      throw new Error('eval exception: ' + (det.exception?.description || det.text || JSON.stringify(det)).slice(0, 500));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  async function evl(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  for (let i = 0; i < 25; i++) {
    if (await evl('document.readyState === "complete" && location.href.startsWith("http")')) break;
    await sleep(500);
  }

  console.log('\n[STEP 1] login...');
  const loginResult = await evlAsync(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({password:'admin123'}),
      credentials: 'include'
    }).then(r => r.json())
  `, 15000);
  console.log('  login:', JSON.stringify(loginResult));

  console.log('\n[STEP 2] open douyin login window — please scan QR code in the popup...');
  console.log('  (waiting up to 5 minutes for QR scan + login)');
  const loginData = await evlAsync(`
    window.electron.openDouyinLogin()
  `, 5 * 60 * 1000);
  console.log('  login result: cookie length:', loginData.cookie.length, 'sec_uid:', loginData.secUid, 'nickname:', loginData.nickname);

  if (!loginData.secUid) {
    throw new Error('Failed to extract sec_uid from login session');
  }

  console.log('\n[STEP 3] import account...');
  const importResult = await evlAsync(`
    fetch('/api/platforms/douyin/accounts', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        cookie: ${JSON.stringify(loginData.cookie)},
        secUid: ${JSON.stringify(loginData.secUid)},
        nickname: ${JSON.stringify(loginData.nickname || '抖音账号')}
      }),
      credentials: 'include'
    }).then(r => r.json().then(j => ({ status: r.status, body: j })))
  `, 30000);
  console.log('  import:', JSON.stringify(importResult).slice(0, 300));
  if (importResult.status !== 201) {
    throw new Error('import failed: ' + JSON.stringify(importResult.body).slice(0, 200));
  }
  const accountId = importResult.body.id;

  console.log('\n[STEP 4] trigger sync (may take 30-60s for browser signer)...');
  const syncResult = await evlAsync(`
    fetch('/api/sync/run/${accountId}', {
      method: 'POST',
      credentials: 'include'
    }).then(r => r.json().then(j => ({ status: r.status, body: j })))
  `, 240000);
  console.log('  sync:', JSON.stringify(syncResult).slice(0, 600));

  console.log('\n[STEP 5] query works...');
  const worksResult = await evlAsync(`
    fetch('/api/works?accountId=${accountId}&limit=5', {
      credentials: 'include'
    }).then(r => r.json())
  `, 15000);
  console.log('  works count:', worksResult?.items?.length ?? 0);
  if (worksResult?.items && worksResult.items.length > 0) {
    console.log('  first work:', JSON.stringify({
      title: worksResult.items[0].title?.slice(0, 50),
      publishedAt: worksResult.items[0].publishedAt,
    }));
  }

  ws.close();
  p.kill();

  console.log('\n=== E2E SUMMARY ===');
  console.log('✓ Login successful');
  console.log('✓ Douyin login via Electron BrowserWindow:', loginData.cookie.length, 'chars');
  console.log('✓ sec_uid extracted:', loginData.secUid);
  console.log('✓ Account imported:', accountId);
  console.log((syncResult.status === 200 && syncResult.body?.status === 'DONE' ? '✓' : '✗') + ' Sync status:', syncResult.body?.status, syncResult.body?.error || '');
  console.log((worksResult?.items?.length > 0 ? '✓' : '✗') + ' Works synced:', worksResult?.items?.length ?? 0);
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
