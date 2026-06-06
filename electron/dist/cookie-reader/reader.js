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
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const decrypt_1 = require("./decrypt");
async function readDouyinCookiesFromProfile(profilePath) {
    const cookiesDbPath = path.join(profilePath, 'Cookies');
    if (!fs.existsSync(cookiesDbPath)) {
        throw new Error(`未找到 Cookies 文件：${cookiesDbPath}`);
    }
    const tmpPath = path.join(os.tmpdir(), `self-media-cookies-${Date.now()}.db`);
    // 复制到临时文件（避免浏览器锁定），重试最多 3 次
    let copied = false;
    for (let i = 0; i < 3; i++) {
        try {
            fs.copyFileSync(cookiesDbPath, tmpPath);
            copied = true;
            break;
        }
        catch {
            if (i < 2)
                await new Promise((r) => setTimeout(r, 500));
        }
    }
    if (!copied) {
        throw new Error('无法读取 Cookies 文件，请关闭浏览器后重试');
    }
    let cookieStr = '';
    try {
        const db = new better_sqlite3_1.default(tmpPath, { readonly: true, fileMustExist: true });
        const rows = db
            .prepare(`SELECT name, encrypted_value FROM cookies
         WHERE host_key LIKE '%.douyin.com' OR host_key = 'douyin.com'
         ORDER BY name`)
            .all();
        db.close();
        // User Data 目录 = Profile 目录的父级
        const userDataDir = path.dirname(profilePath);
        const masterKey = (0, decrypt_1.getMasterKey)(userDataDir);
        const parts = [];
        for (const row of rows) {
            try {
                const value = (0, decrypt_1.decryptCookieValue)(row.encrypted_value, masterKey);
                if (value)
                    parts.push(`${row.name}=${value}`);
            }
            catch {
                // 单个 cookie 解密失败不影响整体
            }
        }
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
