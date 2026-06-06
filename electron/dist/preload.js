"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    readChromeCookies: (profilePath) => electron_1.ipcRenderer.invoke('read-chrome-cookies', profilePath),
    listChromeProfiles: () => electron_1.ipcRenderer.invoke('list-chrome-profiles'),
    openDouyinLogin: () => electron_1.ipcRenderer.invoke('open-douyin-login'),
});
