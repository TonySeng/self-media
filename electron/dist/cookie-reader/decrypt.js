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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterKey = getMasterKey;
exports.decryptCookieValue = decryptCookieValue;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const child_process_1 = require("child_process");
// 缓存每个 User Data 目录对应的解密主密钥
const keyCache = new Map();
function getEncryptedKey(userDataDir) {
    const localStatePath = path.join(userDataDir, 'Local State');
    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
    if (!encryptedKeyB64)
        throw new Error('Local State 中未找到 encrypted_key');
    // 去掉 DPAPI 前缀 (前5字节 = 'DPAPI')
    return Buffer.from(encryptedKeyB64, 'base64').subarray(5);
}
function dpApiDecrypt(data) {
    // PowerShell 5 (Windows 10/11 デフォルト) は System.Security アセンブリを明示的にロードする必要がある
    const b64 = data.toString('base64');
    const script = [
        `Add-Type -AssemblyName System.Security`,
        `$bytes = [System.Convert]::FromBase64String('${b64}')`,
        `$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
        `[System.Convert]::ToBase64String($dec)`,
    ].join('; ');
    const result = (0, child_process_1.execFileSync)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        timeout: 15000,
        encoding: 'utf8',
    }).trim();
    return Buffer.from(result, 'base64');
}
function getMasterKey(userDataDir) {
    const cached = keyCache.get(userDataDir);
    if (cached)
        return cached;
    const encryptedKey = getEncryptedKey(userDataDir);
    const key = dpApiDecrypt(encryptedKey);
    keyCache.set(userDataDir, key);
    return key;
}
function decryptCookieValue(encryptedValue, masterKey) {
    if (encryptedValue.length === 0)
        return '';
    const prefix = encryptedValue.subarray(0, 3).toString('ascii');
    if (prefix === 'v20') {
        // Chrome 130+ App-Bound Encryption — 需要不同的解密流程
        // 简化处理：跳过此值
        throw new Error('v20 (app-bound) cookies not supported');
    }
    if (prefix !== 'v10' && prefix !== 'v11') {
        // 旧格式：可能是纯文本或旧 DPAPI 格式
        return encryptedValue.toString('utf8');
    }
    // Chrome v10/v11 格式: 3字节标签 + 12字节 nonce + 密文 + 16字节 auth tag
    const nonce = encryptedValue.subarray(3, 15);
    const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16);
    const authTag = encryptedValue.subarray(encryptedValue.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    // Chrome 110+: 解密后值前缀 32 字节是 SHA256(host_key) 校验，需要剥离
    // 检测启发式: 如果前 32 字节看起来不像 ASCII 文本，认为是校验和
    if (decrypted.length > 32) {
        const possibleChecksum = decrypted.subarray(0, 32);
        const remainder = decrypted.subarray(32);
        const remainderText = remainder.toString('utf8');
        // 如果 remainder 是有效 UTF-8 ASCII，使用它
        if (/^[\x09\x20-\x7E]*$/.test(remainderText)) {
            return remainderText;
        }
        // 否则检查整体是否 ASCII（旧格式）
        void possibleChecksum;
    }
    return decrypted.toString('utf8');
}
