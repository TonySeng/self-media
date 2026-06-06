"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = registerIpcHandlers;
const cookie_reader_1 = require("./cookie-reader");
function registerIpcHandlers(ipcMain) {
    ipcMain.handle('list-chrome-profiles', () => {
        return (0, cookie_reader_1.listBrowserProfiles)();
    });
    ipcMain.handle('read-chrome-cookies', async (_event, profilePath) => {
        if (typeof profilePath !== 'string' || !profilePath) {
            throw new Error('profilePath 参数无效');
        }
        return (0, cookie_reader_1.readDouyinCookiesFromProfile)(profilePath);
    });
}
