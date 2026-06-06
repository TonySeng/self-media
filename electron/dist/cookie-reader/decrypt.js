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
    // 通过 PowerShell 调用 .NET DPAPI 解密
    const hex = data.toString('hex');
    const script = [
        `$bytes = [System.Convert]::FromHexString('${hex}')`,
        `$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
        `[System.Convert]::ToHexString($dec)`,
    ].join('; ');
    const result = (0, child_process_1.execFileSync)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        timeout: 15000,
        encoding: 'utf8',
    }).trim();
    return Buffer.from(result, 'hex');
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
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
