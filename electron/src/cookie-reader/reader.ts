import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';
import { getMasterKey, decryptCookieValue } from './decrypt';

type RawCookieRow = {
  name: string;
  encrypted_value: Buffer;
};

/**
 * Windows でロック中のファイルを共有読み取りでコピーする
 * Node の fs.copyFileSync は Chrome がロックしている Cookies を開けないが、
 * PowerShell の Copy-Item は FILE_SHARE_READ で開くため成功する。
 */
function copyLockedFile(src: string, dst: string): void {
  const escSrc = src.replace(/'/g, "''");
  const escDst = dst.replace(/'/g, "''");
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Copy-Item -LiteralPath '${escSrc}' -Destination '${escDst}' -Force`,
    ],
    { timeout: 10000 }
  );
}

export async function readDouyinCookiesFromProfile(profilePath: string): Promise<string> {
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
  } catch (e) {
    try {
      copyLockedFile(cookiesDbPath, tmpPath);
    } catch {
      throw new Error(
        '无法读取 Chrome Cookies（被浏览器独占锁定）。请暂时关闭 Chrome 后重试，' +
          '读取完成后可以重新打开 Chrome。这只需要几秒钟。'
      );
    }
  }

  let cookieStr = '';

  try {
    const db = new Database(tmpPath, { readonly: true, fileMustExist: true });

    const rows = db
      .prepare(
        `SELECT name, encrypted_value, host_key FROM cookies
         WHERE host_key LIKE '%.douyin.com' OR host_key = 'douyin.com'
         ORDER BY host_key, name`
      )
      .all() as Array<RawCookieRow & { host_key: string }>;

    db.close();

    // User Data 目录 = Profile 目录的父级
    const userDataDir = path.dirname(profilePath);
    const masterKey = getMasterKey(userDataDir);

    const parts: string[] = [];
    let sessionRowSeen = false;
    for (const row of rows) {
      if (row.name === 'sessionid_ss') sessionRowSeen = true;
      try {
        const value = decryptCookieValue(row.encrypted_value, masterKey);
        if (!value) continue;
        if (row.name === 'sessionid_ss' || row.name === 'sessionid' || row.name === 'passport_csrf_token') {
          const printable = /^[\x09\x20-\x7E]*$/.test(value);
          console.log(`[cookie-reader] ${row.name}: len=${value.length} printable=${printable} preview=${JSON.stringify(value.slice(0, 80))}`);
        }
        const safeValue = value.replace(/[^\x09\x20-\x7E]/g, '');
        if (!safeValue) continue;
        parts.push(`${row.name}=${safeValue}`);
      } catch (e) {
        if (row.name === 'sessionid_ss') {
          console.log(`[cookie-reader] sessionid_ss DECRYPT FAILED: ${e instanceof Error ? e.message : String(e)}, prefix=${row.encrypted_value.subarray(0, 3).toString('ascii')}, len=${row.encrypted_value.length}`);
        }
      }
    }
    console.log('[cookie-reader] sessionid_ss row found:', sessionRowSeen, 'total parts:', parts.length);
    cookieStr = parts.join('; ');
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }

  if (!cookieStr.includes('sessionid_ss')) {
    throw new Error('读取到的 cookie 中缺少 sessionid_ss，请确认该浏览器已登录抖音（www.douyin.com 或 creator.douyin.com）');
  }

  return cookieStr;
}
