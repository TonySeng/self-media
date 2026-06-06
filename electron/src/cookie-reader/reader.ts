import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { getMasterKey, decryptCookieValue } from './decrypt';

type RawCookieRow = {
  name: string;
  encrypted_value: Buffer;
};

export async function readDouyinCookiesFromProfile(profilePath: string): Promise<string> {
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
    } catch {
      if (i < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!copied) {
    throw new Error('无法读取 Cookies 文件，请关闭浏览器后重试');
  }

  let cookieStr = '';

  try {
    const db = new Database(tmpPath, { readonly: true, fileMustExist: true });

    const rows = db
      .prepare(
        `SELECT name, encrypted_value FROM cookies
         WHERE host_key LIKE '%.douyin.com' OR host_key = 'douyin.com'
         ORDER BY name`
      )
      .all() as RawCookieRow[];

    db.close();

    // User Data 目录 = Profile 目录的父级
    const userDataDir = path.dirname(profilePath);
    const masterKey = getMasterKey(userDataDir);

    const parts: string[] = [];
    for (const row of rows) {
      try {
        const value = decryptCookieValue(row.encrypted_value, masterKey);
        if (value) parts.push(`${row.name}=${value}`);
      } catch {
        // 单个 cookie 解密失败不影响整体
      }
    }
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
