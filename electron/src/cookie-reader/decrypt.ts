import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';

// 缓存每个 User Data 目录对应的解密主密钥
const keyCache = new Map<string, Buffer>();

function getEncryptedKey(userDataDir: string): Buffer {
  const localStatePath = path.join(userDataDir, 'Local State');
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8')) as {
    os_crypt?: { encrypted_key?: string };
  };
  const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) throw new Error('Local State 中未找到 encrypted_key');
  // 去掉 DPAPI 前缀 (前5字节 = 'DPAPI')
  return Buffer.from(encryptedKeyB64, 'base64').subarray(5);
}

function dpApiDecrypt(data: Buffer): Buffer {
  // PowerShell 5 (Windows 10/11 デフォルト) は System.Security アセンブリを明示的にロードする必要がある
  const b64 = data.toString('base64');
  const script = [
    `Add-Type -AssemblyName System.Security`,
    `$bytes = [System.Convert]::FromBase64String('${b64}')`,
    `$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    `[System.Convert]::ToBase64String($dec)`,
  ].join('; ');

  const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 15000,
    encoding: 'utf8',
  }).trim();

  return Buffer.from(result, 'base64');
}

export function getMasterKey(userDataDir: string): Buffer {
  const cached = keyCache.get(userDataDir);
  if (cached) return cached;
  const encryptedKey = getEncryptedKey(userDataDir);
  const key = dpApiDecrypt(encryptedKey);
  keyCache.set(userDataDir, key);
  return key;
}

export function decryptCookieValue(encryptedValue: Buffer, masterKey: Buffer): string {
  if (encryptedValue.length === 0) return '';

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
