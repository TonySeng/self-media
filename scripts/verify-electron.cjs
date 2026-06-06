// シンプル CDP ドライバー - レスポンス処理を1ハンドラに統合
const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const ELECTRON_BIN = path.join(
  __dirname, '..', 'node_modules', '.pnpm', 'electron@33.4.11',
  'node_modules', 'electron', 'dist', 'electron.exe'
);
const APP_DIR = path.join(__dirname, '..');
const DEBUG_PORT = 19238;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getTargets() {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json/list`, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });
}

async function main() {
  console.log('[driver] launching Electron...');
  const p = spawn(ELECTRON_BIN, [`--remote-debugging-port=${DEBUG_PORT}`, '.'], {
    env: { ...process.env, ELECTRON_DEV: '1' },
    cwd: APP_DIR,
    stdio: 'pipe'
  });
  p.stdout.on('data', d => process.stdout.write(d.toString()));

  // ウィンドウ待ち
  let target = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    try {
      const targets = await getTargets();
      target = targets.find(t => t.type === 'page');
      if (target) break;
    } catch { }
  }
  if (!target) { console.log('NO TARGET'); p.kill(); process.exit(1); }
  console.log('[driver] page target:', target.url);

  // 単一の WebSocket 接続を維持
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  console.log('[driver] WS connected');

  // 1つのメッセージリスナーで全レスポンスを処理
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
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)); }
      }, 10000);
    });
  }

  async function evalExpr(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  async function waitForReady(maxMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const ready = await evalExpr('document.readyState === "complete" && location.href.startsWith("http")');
      if (ready) return;
      await sleep(500);
    }
  }

  // ロード完了を待つ
  await waitForReady();

  // Step 1: 初期状態確認
  const initialUrl = await evalExpr('location.href');
  console.log('[step1] initial URL:', initialUrl);
  const electronType = await evalExpr('typeof window.electron');
  console.log('[step1] window.electron:', electronType);

  // Step 2: ログイン (API 直叩き、Cookie を CDP 経由で設定)
  const hasPassword = await evalExpr('!!document.querySelector("input[type=password]")');
  console.log('[step2] has login form:', hasPassword);

  // fetch API でログインして Cookie を取得（同じ origin なので自動的にセットされる）
  await evalExpr([
    'window.__loginResult = "pending";',
    'fetch("/api/auth/login", {',
    '  method: "POST",',
    '  headers: { "content-type": "application/json" },',
    '  body: JSON.stringify({ password: "admin123" }),',
    '  credentials: "include"',
    '}).then(r => r.json()).then(j => { window.__loginResult = JSON.stringify(j); }).catch(e => { window.__loginResult = "ERR: " + e.message; });'
  ].join(''));
  await sleep(2000);
  const loginResult = await evalExpr('window.__loginResult');
  console.log('[step2] login API result:', loginResult);

  // ホームへ移動（ログイン成功なら / に行ける）
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/' });
  await sleep(3000);
  const pathAfterLogin = await evalExpr('location.pathname');
  console.log('[step2] path after login:', pathAfterLogin);

  // Step 3: settings/platforms へ移動
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/settings/platforms' });
  await sleep(4000);
  const platformsPath = await evalExpr('location.pathname');
  console.log('[step3] on page:', platformsPath);

  const bodyText = await evalExpr('document.body.innerText');
  console.log('[step3] === PAGE TEXT (700) ===');
  console.log(String(bodyText).slice(0, 700));

  const hasCard = await evalExpr('document.body.innerText.includes("桌面版专属")');
  console.log('[step3] ChromeImportCard visible:', hasCard);

  // Step 4: Chrome プロファイル取得
  await evalExpr([
    'window.__profiles = "pending";',
    'window.electron.listChromeProfiles().then(p => { window.__profiles = JSON.stringify(p); }).catch(e => { window.__profiles = "ERR: " + e.message; });'
  ].join(''));
  await sleep(2500);
  const profiles = await evalExpr('window.__profiles');
  console.log('[step4] Chrome profiles result:', profiles);

  ws.close();
  p.kill();

  console.log('');
  console.log('=== VERIFICATION ===');
  console.log('✓ Electron app launched');
  console.log('✓ Next.js loaded:', initialUrl);
  console.log((electronType !== 'undefined' ? '✓' : '✗') + ' window.electron API:', electronType);
  console.log((pathAfterLogin === '/' ? '✓' : '✗') + ' login successful, path:', pathAfterLogin);
  console.log((platformsPath === '/settings/platforms' ? '✓' : '✗') + ' navigated to platforms');
  console.log((hasCard ? '✓' : '✗') + ' ChromeImportCard (桌面版专属) rendered');
  console.log('Chrome profiles:', profiles);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
