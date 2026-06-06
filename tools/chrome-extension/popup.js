// Self-Media Chrome Extension - Popup Logic

const DEFAULT_SERVER = 'http://localhost:3000';

const $ = (s) => document.getElementById(s);
const statusEl = $('status');
const loginSection = $('login-section');
const mainSection = $('main-section');

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function clearStatus() {
  statusEl.className = 'status';
  statusEl.textContent = '';
}

async function getServerUrl() {
  const data = await chrome.storage.local.get('serverUrl');
  return data.serverUrl || DEFAULT_SERVER;
}

async function getSession() {
  const data = await chrome.storage.local.get('sessionCookie');
  return data.sessionCookie || null;
}

// Extract sec_uid from cookies or active tab URL or fetch from douyin API
async function extractSecUid(cookies) {
  // Priority 1: current tab URL (if on douyin.com/user/MS4wLjAB...)
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (url) {
      // Match both /user/MS4wLjAB... and sec_user_id= in URL
      const match = url.match(/(?:user\/|sec_user_id=)(MS4wLjAB[A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }
  } catch (e) {
    // activeTab permission may fail in some contexts
  }

  // Priority 2: FOLLOW_NUMBER_YELLOW_POINT_INFO cookie
  const follow = cookies.find(c => c.name === 'FOLLOW_NUMBER_YELLOW_POINT_INFO');
  if (follow) {
    const decoded = decodeURIComponent(follow.value);
    const match = decoded.match(/(MS4wLjAB[A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }

  // Priority 3: passport_assist_user cookie (base64)
  const passport = cookies.find(c => c.name === 'passport_assist_user');
  if (passport) {
    try {
      const decoded = decodeURIComponent(passport.value);
      const match = decoded.match(/(MS4wLjAB[A-Za-z0-9_-]+)/);
      if (match) return match[1];
    } catch (e) {
      // base64 decode may fail
    }
  }

  // Priority 4: Fetch from douyin API using the cookies
  try {
    const cookieString = buildCookieString(cookies);
    const res = await fetch('https://www.douyin.com/aweme/v1/web/im/user/info/', {
      headers: {
        'Cookie': cookieString,
        'Referer': 'https://www.douyin.com/',
      },
    });
    if (res.ok) {
      const json = await res.json();
      const secUid = json?.data?.sec_uid || json?.user?.sec_uid;
      if (secUid && secUid.startsWith('MS4wLjAB')) return secUid;
    }
  } catch (e) {
    // fetch may fail due to CORS or network
  }

  return null;
}

// Build cookie string from chrome cookies
function buildCookieString(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// Login to Self-Media
async function login(password) {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || '登录失败');
  }
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    await chrome.storage.local.set({ sessionCookie: setCookie });
  }
  await chrome.storage.local.set({ loggedIn: true });
}

// Detect douyin account from browser cookies
async function detectAccount() {
  const cookies = await chrome.cookies.getAll({ domain: '.douyin.com' });
  const creatorCookies = await chrome.cookies.getAll({ domain: 'creator.douyin.com' });
  const allCookies = [...creatorCookies, ...cookies];

  const uniqueMap = {};
  for (const c of allCookies) {
    if (!uniqueMap[c.name]) uniqueMap[c.name] = c;
  }
  const dedupedCookies = Object.values(uniqueMap);

  const sessionCookie = dedupedCookies.find(c => c.name === 'sessionid_ss');
  if (!sessionCookie || !sessionCookie.value) {
    return { ok: false, error: '未检测到抖音登录态（缺少 sessionid_ss）', cookieString: null, sessionId: null };
  }

  const cookieString = buildCookieString(dedupedCookies);
  const sessionId = sessionCookie.value;
  const secUid = await extractSecUid(dedupedCookies);

  if (!secUid) {
    return { ok: false, error: '无法解析 sec_uid', cookieString, sessionId };
  }

  return {
    ok: true,
    cookieString,
    secUid,
    sessionId,
  };
}

// Sync account to Self-Media
async function syncAccount(account) {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/platforms/douyin/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cookie: account.cookieString,
      secUid: account.secUid,
    }),
    credentials: 'include',
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || j.error || `HTTP ${res.status}`);
  }
  return await res.json();
}

// --- UI Logic ---

let detectedAccount = null;

async function init() {
  // Load server URL
  const serverUrl = await getServerUrl();
  $('server-url').value = serverUrl;

  // Check if already logged in
  const { loggedIn } = await chrome.storage.local.get('loggedIn');
  if (loggedIn) {
    showMainSection();
  } else {
    loginSection.style.display = 'block';
    mainSection.style.display = 'none';
  }

  // Save server URL on change
  $('server-url').addEventListener('change', async (e) => {
    const url = e.target.value.replace(/\/+$/, '') || DEFAULT_SERVER;
    await chrome.storage.local.set({ serverUrl: url });
    e.target.value = url;
  });
}

async function showMainSection() {
  loginSection.style.display = 'none';
  mainSection.style.display = 'block';

  $('detected-info').textContent = '检测中...';
  $('manual-secuid-section').style.display = 'none';

  const result = await detectAccount();
  if (!result.ok) {
    $('detected-info').textContent = result.error;
    $('manual-secuid-section').style.display = 'block';
    $('btn-sync').disabled = false;
    showStatus('自动检测失败，请手动输入 sec_uid', 'info');
    return;
  }
  detectedAccount = result;
  $('detected-info').innerHTML =
    `<strong>sec_uid:</strong> ${result.secUid.slice(0, 20)}...<br>` +
    `<strong>sessionid_ss:</strong> ${result.sessionId.slice(0, 12)}...`;
  $('btn-sync').disabled = false;
}

// Login button
$('btn-login').addEventListener('click', async () => {
  const password = $('password').value.trim();
  if (!password) return;
  $('btn-login').disabled = true;
  clearStatus();
  try {
    await login(password);
    showStatus('连接成功', 'success');
    await showMainSection();
  } catch (e) {
    showStatus(e.message, 'error');
  } finally {
    $('btn-login').disabled = false;
  }
});

// Sync button
$('btn-sync').addEventListener('click', async () => {
  $('btn-sync').disabled = true;
  clearStatus();

  let account = detectedAccount;

  // If auto-detect failed, use manual input
  if (!account || !account.secUid) {
    const manualSecUid = $('manual-secuid').value.trim();
    if (!manualSecUid || !manualSecUid.startsWith('MS4wLjAB')) {
      showStatus('请输入有效的 sec_uid（格式：MS4wLjAB...）', 'error');
      $('btn-sync').disabled = false;
      return;
    }

    // Get cookies for the manual case
    const cookies = await chrome.cookies.getAll({ domain: '.douyin.com' });
    const creatorCookies = await chrome.cookies.getAll({ domain: 'creator.douyin.com' });
    const allCookies = [...creatorCookies, ...cookies];
    const uniqueMap = {};
    for (const c of allCookies) {
      if (!uniqueMap[c.name]) uniqueMap[c.name] = c;
    }
    const dedupedCookies = Object.values(uniqueMap);
    const sessionCookie = dedupedCookies.find(c => c.name === 'sessionid_ss');

    if (!sessionCookie) {
      showStatus('未检测到抖音登录态（缺少 sessionid_ss）', 'error');
      $('btn-sync').disabled = false;
      return;
    }

    account = {
      cookieString: buildCookieString(dedupedCookies),
      secUid: manualSecUid,
      sessionId: sessionCookie.value,
    };
  }

  try {
    const result = await syncAccount(account);
    showStatus(`同步成功：${result.nickname || '账号已添加'}`, 'success');
  } catch (e) {
    showStatus(`同步失败：${e.message}`, 'error');
  } finally {
    $('btn-sync').disabled = false;
  }
});

// Logout button
$('btn-logout').addEventListener('click', async () => {
  await chrome.storage.local.remove(['loggedIn', 'sessionCookie']);
  loginSection.style.display = 'block';
  mainSection.style.display = 'none';
  clearStatus();
});

// Enter key on password field
$('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-login').click();
});

init();
