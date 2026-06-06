"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readDouyinCookiesFromProfile = readDouyinCookiesFromProfile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const decrypt_1 = require("./decrypt");
/**
 * Windows でロック中のファイルを共有読み取りでコピーする
 * Node の fs.copyFileSync は Chrome がロックしている Cookies を開けないが、
 * PowerShell の Copy-Item は FILE_SHARE_READ で開くため成功する。
 */
function copyLockedFile(src, dst) {
    const escSrc = src.replace(/'/g, "''");
    const escDst = dst.replace(/'/g, "''");
    (0, child_process_1.execFileSync)('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Copy-Item -LiteralPath '${escSrc}' -Destination '${escDst}' -Force`,
    ], { timeout: 10000 });
}
async function readDouyinCookiesFromProfile(profilePath) {
    // Chrome v96+ は Cookies を Profile/Network/Cookies に置く。古い版は Profile/Cookies。
    let cookiesDbPath = path.join(profilePath, 'Network', 'Cookies');
    if (!fs.existsSync(cookiesDbPath)) {
        cookiesDbPath = path.join(profilePath, 'Cookies');
    }
    if (!fs.existsSync(cookiesDbPath)) {
        throw new Error(`未找到 Cookies 文件：${profilePath}`);
    }
    const tmpPath = path.join(os.tmpdir(), `self-media-cookies-${Date.now()}.db`);
    // まず通常のコピーを試し、ロックエラーなら PowerShell Copy-Item へフォールバック
    try {
        fs.copyFileSync(cookiesDbPath, tmpPath);
    }
    catch (e) {
        try {
            copyLockedFile(cookiesDbPath, tmpPath);
        }
        catch {
            throw new Error('无法读取 Chrome Cookies（被浏览器独占锁定）。请暂时关闭 Chrome 后重试，' +
                '读取完成后可以重新打开 Chrome。这只需要几秒钟。');
        }
    }
    let cookieStr = '';
    try {
        const db = new better_sqlite3_1.default(tmpPath, { readonly: true, fileMustExist: true });
        const rows = db
            .prepare(`SELECT name, encrypted_value, host_key FROM cookies
         WHERE host_key LIKE '%.douyin.com' OR host_key = 'douyin.com'
         ORDER BY host_key, name`)
            .all();
        db.close();
        // User Data 目录 = Profile 目录的父级
        const userDataDir = path.dirname(profilePath);
        const masterKey = (0, decrypt_1.getMasterKey)(userDataDir);
        const parts = [];
        let sessionRowSeen = false;
        for (const row of rows) {
            if (row.name === 'sessionid_ss')
                sessionRowSeen = true;
            try {
                const value = (0, decrypt_1.decryptCookieValue)(row.encrypted_value, masterKey);
                if (!value)
                    continue;
                if (row.name === 'sessionid_ss' || row.name === 'sessionid' || row.name === 'passport_csrf_token') {
                    const printable = /^[\x09\x20-\x7E]*$/.test(value);
                    console.log(`[cookie-reader] ${row.name}: len=${value.length} printable=${printable} preview=${JSON.stringify(value.slice(0, 80))}`);
                }
                const safeValue = value.replace(/[^\x09\x20-\x7E]/g, '');
                if (!safeValue)
                    continue;
                parts.push(`${row.name}=${safeValue}`);
            }
            catch (e) {
                if (row.name === 'sessionid_ss') {
                    console.log(`[cookie-reader] sessionid_ss DECRYPT FAILED: ${e instanceof Error ? e.message : String(e)}, prefix=${row.encrypted_value.subarray(0, 3).toString('ascii')}, len=${row.encrypted_value.length}`);
                }
            }
        }
        console.log('[cookie-reader] sessionid_ss row found:', sessionRowSeen, 'total parts:', parts.length);
        cookieStr = parts.join('; ');
    }
    finally {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch {
            /* ignore */
        }
    }
    if (!cookieStr.includes('sessionid_ss')) {
        throw new Error('读取到的 cookie 中缺少 sessionid_ss，请确认该浏览器已登录抖音（www.douyin.com 或 creator.douyin.com）');
    }
    return cookieStr;
}
