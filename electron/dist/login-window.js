"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDouyinLoginWindow = openDouyinLoginWindow;
exports.captureReplySign = captureReplySign;
const electron_1 = require("electron");
/**
 * 弹出一个独立 BrowserWindow 让用户登录抖音
 * 登录完成后从 session.cookies 读取 cookie（Electron 内置 cookie store，不受 Chrome ABE 影响）
 */
async function openDouyinLoginWindow() {
    // 使用独立 partition 的 session，避免污染主应用的 cookies
    const partition = 'persist:douyin-login';
    const ses = electron_1.session.fromPartition(partition);
    const win = new electron_1.BrowserWindow({
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
        async function checkLogin() {
            if (resolved)
                return;
            try {
                const cookies = await ses.cookies.get({});
                const dyCookies = cookies.filter((c) => c.domain && (c.domain.endsWith('.douyin.com') || c.domain === 'douyin.com'));
                const hasSession = dyCookies.some((c) => c.name === 'sessionid_ss' && c.value && c.value.length > 10);
                if (!hasSession)
                    return;
                // 已登录，构建 cookie 字符串并尝试提取 sec_uid
                const cookieStr = dyCookies
                    .filter((c) => c.value && /^[\x09\x20-\x7E]*$/.test(c.value))
                    .map((c) => `${c.name}=${c.value}`)
                    .join('; ');
                if (!cookieStr.includes('sessionid_ss'))
                    return;
                // 尝试在登录页面 evaluate 中提取 sec_uid
                let secUid = null;
                let nickname = null;
                try {
                    const result = await win.webContents.executeJavaScript(`(function(){
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
            })()`);
                    if (result && typeof result === 'object') {
                        secUid = result.secUid ?? null;
                        nickname = result.nickname ?? null;
                    }
                }
                catch { /* ignore eval errors */ }
                resolved = true;
                clearInterval(checkInterval);
                win.close();
                resolve({ cookie: cookieStr, secUid, nickname });
            }
            catch (e) {
                // 继续轮询
            }
        }
        const checkInterval = setInterval(() => { void checkLogin(); }, 2000);
        // 立即检查一次（如果已登录就不必再让用户登录）
        void checkLogin();
        win.on('closed', () => {
            if (resolved)
                return;
            resolved = true;
            clearInterval(checkInterval);
            reject(new Error('用户取消登录'));
        });
        // 5 分钟超时
        setTimeout(() => {
            if (resolved)
                return;
            resolved = true;
            clearInterval(checkInterval);
            try {
                win.close();
            }
            catch { /* ignore */ }
            reject(new Error('登录超时（5 分钟）'));
        }, 5 * 60 * 1000);
    });
}
/**
 * 弹出一个 BrowserWindow，引导用户在抖音创作者中心找一条评论回复一下，
 * 监听 `multi_publish` 请求，从 URL 自动提取 msToken / aBogus 签名。
 *
 * 用同一个 partition 的 session（已登录态），所以无需重新扫码。
 */
async function captureReplySign() {
    const partition = 'persist:douyin-login';
    const ses = electron_1.session.fromPartition(partition);
    // 检查 cookie 是否存在
    const cookies = await ses.cookies.get({ domain: '.douyin.com' });
    const hasSession = cookies.some((c) => c.name === 'sessionid_ss' && c.value);
    if (!hasSession) {
        throw new Error('请先扫码登录抖音');
    }
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 900,
        title: '抓取评论签名 - 请到任意作品下回复一条评论',
        webPreferences: {
            partition,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    return new Promise((resolve, reject) => {
        let resolved = false;
        const TARGET_REGEX = /multi_publish\/.*[?&]msToken=([^&]+).*[?&]a_bogus=([^&]+)/;
        function done(value) {
            if (resolved)
                return;
            resolved = true;
            try {
                win.webContents.session.webRequest.onBeforeRequest(null);
            }
            catch { /* ignore */ }
            try {
                win.close();
            }
            catch { /* ignore */ }
            if (value instanceof Error)
                reject(value);
            else
                resolve(value);
        }
        // 监听所有发出的请求 URL
        win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*.douyin.com/*multi_publish*'] }, (details, callback) => {
            try {
                const url = details.url;
                // 直接从查询字符串解析（更稳）
                const u = new URL(url);
                const msToken = u.searchParams.get('msToken') ?? '';
                const aBogus = u.searchParams.get('a_bogus') ?? '';
                if (msToken && aBogus) {
                    // 让请求继续完成，再异步关闭窗口
                    setTimeout(() => done({ msToken, aBogus }), 200);
                }
                else {
                    // 兜底正则
                    const m = url.match(TARGET_REGEX);
                    if (m && m[1] && m[2]) {
                        setTimeout(() => done({
                            msToken: decodeURIComponent(m[1]),
                            aBogus: decodeURIComponent(m[2]),
                        }), 200);
                    }
                }
            }
            catch { /* ignore parse errors */ }
            callback({});
        });
        // 引导用户：直接打开创作者中心首页，让用户进作品评论区回复
        void win.loadURL('https://creator.douyin.com/creator-micro/content/manage');
        win.on('closed', () => {
            if (resolved)
                return;
            resolved = true;
            reject(new Error('用户取消抓取签名'));
        });
        // 3 分钟超时
        setTimeout(() => {
            if (!resolved)
                done(new Error('未检测到评论回复请求（请在 3 分钟内回复一条评论）'));
        }, 3 * 60 * 1000);
    });
}
