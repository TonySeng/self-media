import { BrowserWindow, session } from 'electron';

/**
 * 弹出一个独立 BrowserWindow 让用户登录抖音
 * 登录完成后从 session.cookies 读取 cookie（Electron 内置 cookie store，不受 Chrome ABE 影响）
 */
export async function openDouyinLoginWindow(): Promise<{
  cookie: string;
  secUid: string | null;
  nickname: string | null;
}> {
  // 使用独立 partition 的 session，避免污染主应用的 cookies
  const partition = 'persist:douyin-login';
  const ses = session.fromPartition(partition);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '登录抖音 - 完成后自动关闭',
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await win.loadURL('https://www.douyin.com/');

  // 等待用户登录：检测 cookie 中出现 sessionid_ss
  return new Promise((resolve, reject) => {
    let resolved = false;

    async function checkLogin(): Promise<void> {
      if (resolved) return;
      try {
        const cookies = await ses.cookies.get({});
        const dyCookies = cookies.filter(
          (c) => c.domain && (c.domain.endsWith('.douyin.com') || c.domain === 'douyin.com')
        );
        const hasSession = dyCookies.some((c) => c.name === 'sessionid_ss' && c.value && c.value.length > 10);
        if (!hasSession) return;

        // 已登录，构建 cookie 字符串并尝试提取 sec_uid
        const cookieStr = dyCookies
          .filter((c) => c.value && /^[\x09\x20-\x7E]*$/.test(c.value))
          .map((c) => `${c.name}=${c.value}`)
          .join('; ');

        if (!cookieStr.includes('sessionid_ss')) return;

        // 尝试在登录页面 evaluate 中提取 sec_uid
        let secUid: string | null = null;
        let nickname: string | null = null;
        try {
          const result = await win.webContents.executeJavaScript(
            `(function(){
              try {
                // 1. 从 RENDER_DATA 提取
                const rd = document.getElementById('RENDER_DATA');
                if (rd && rd.textContent) {
                  const decoded = decodeURIComponent(rd.textContent);
                  const m = decoded.match(/"sec_uid"\\s*:\\s*"(MS4wLjAB[A-Za-z0-9_-]+)"/);
                  if (m) {
                    const nm = decoded.match(/"nickname"\\s*:\\s*"([^"]+)"/);
                    return { secUid: m[1], nickname: nm ? nm[1] : null };
                  }
                }
                // 2. 从 HTML 全文搜索
                const html = document.documentElement.outerHTML;
                const m2 = html.match(/MS4wLjAB[A-Za-z0-9_-]{40,}/);
                if (m2) return { secUid: m2[0], nickname: null };
                return null;
              } catch(e) { return null; }
            })()`
          );
          if (result && typeof result === 'object') {
            secUid = (result as { secUid?: string }).secUid ?? null;
            nickname = (result as { nickname?: string }).nickname ?? null;
          }
        } catch { /* ignore eval errors */ }

        resolved = true;
        clearInterval(checkInterval);
        win.close();
        resolve({ cookie: cookieStr, secUid, nickname });
      } catch (e) {
        // 继续轮询
      }
    }

    const checkInterval = setInterval(() => { void checkLogin(); }, 2000);

    // 立即检查一次（如果已登录就不必再让用户登录）
    void checkLogin();

    win.on('closed', () => {
      if (resolved) return;
      resolved = true;
      clearInterval(checkInterval);
      reject(new Error('用户取消登录'));
    });

    // 5 分钟超时
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      clearInterval(checkInterval);
      try { win.close(); } catch { /* ignore */ }
      reject(new Error('登录超时（5 分钟）'));
    }, 5 * 60 * 1000);
  });
}
