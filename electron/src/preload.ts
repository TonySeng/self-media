import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  readChromeCookies: (profilePath: string) =>
    ipcRenderer.invoke('read-chrome-cookies', profilePath),
  listChromeProfiles: () =>
    ipcRenderer.invoke('list-chrome-profiles'),
  openDouyinLogin: () =>
    ipcRenderer.invoke('open-douyin-login'),
  captureReplySign: () =>
    ipcRenderer.invoke('capture-reply-sign'),
});
