import type { IpcMain } from 'electron';
import { listBrowserProfiles, readDouyinCookiesFromProfile } from './cookie-reader';
import { openDouyinLoginWindow, captureReplySign } from './login-window';

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('list-chrome-profiles', () => {
    return listBrowserProfiles();
  });

  ipcMain.handle('read-chrome-cookies', async (_event, profilePath: string) => {
    if (typeof profilePath !== 'string' || !profilePath) {
      throw new Error('profilePath 参数无效');
    }
    return readDouyinCookiesFromProfile(profilePath);
  });

  ipcMain.handle('open-douyin-login', async () => {
    return openDouyinLoginWindow();
  });

  ipcMain.handle('capture-reply-sign', async () => {
    return captureReplySign();
  });
}
