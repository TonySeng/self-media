import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type BrowserProfile = {
  browserType: 'chrome' | 'edge' | 'brave';
  label: string;
  profilePath: string;
};

function getUserDataDirs(): Array<{ browser: 'chrome' | 'edge' | 'brave'; dir: string }> {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');

  return [
    {
      browser: 'chrome' as const,
      dir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    },
    {
      browser: 'edge' as const,
      dir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
    },
    {
      browser: 'brave' as const,
      dir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    },
  ].filter((b) => fs.existsSync(b.dir));
}

function getProfiles(userDataDir: string): string[] {
  const profileNames: string[] = [];
  if (fs.existsSync(path.join(userDataDir, 'Default', 'Cookies'))) {
    profileNames.push('Default');
  }
  try {
    const entries = fs.readdirSync(userDataDir);
    for (const e of entries) {
      if (/^Profile \d+$/.test(e) && fs.existsSync(path.join(userDataDir, e, 'Cookies'))) {
        profileNames.push(e);
      }
    }
  } catch {
    // ignore
  }
  return profileNames;
}

export function listBrowserProfiles(): BrowserProfile[] {
  const results: BrowserProfile[] = [];
  for (const { browser, dir } of getUserDataDirs()) {
    const browserName = browser === 'chrome' ? 'Chrome' : browser === 'edge' ? 'Edge' : 'Brave';
    for (const profile of getProfiles(dir)) {
      const displayName = profile === 'Default' ? '默认' : profile;
      results.push({
        browserType: browser,
        label: `${browserName} - ${displayName}`,
        profilePath: path.join(dir, profile),
      });
    }
  }
  return results;
}
