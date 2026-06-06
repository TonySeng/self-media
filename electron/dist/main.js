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
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const portfinder = __importStar(require("portfinder"));
let mainWindow = null;
let nextProcess = null;
let serverPort = 3000;
async function findPort() {
    return new Promise((resolve, reject) => {
        portfinder.getPort({ port: 3000 }, (err, port) => {
            if (err)
                reject(err);
            else
                resolve(port);
        });
    });
}
async function startNextServer(port) {
    // standalone 服务器路径（相对于 electron/dist/main.js → ../../.next/standalone）
    const serverPath = path.join(__dirname, '..', '..', '.next', 'standalone', 'server.js');
    const dataDir = electron_1.app.getPath('userData');
    return new Promise((resolve, reject) => {
        nextProcess = (0, child_process_1.spawn)(process.execPath, [serverPath], {
            env: {
                ...process.env,
                PORT: String(port),
                HOSTNAME: '127.0.0.1',
                DATABASE_URL: `file:${path.join(dataDir, 'data.db')}`,
                NODE_ENV: 'production',
            },
            stdio: 'pipe',
        });
        let resolved = false;
        nextProcess.stdout?.on('data', (data) => {
            const out = data.toString();
            console.log('[next]', out.trim());
            if (!resolved && (out.includes('Ready') || out.includes('started server') || out.includes('Listening'))) {
                resolved = true;
                resolve();
            }
        });
        nextProcess.stderr?.on('data', (data) => {
            console.error('[next:err]', data.toString().trim());
        });
        nextProcess.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });
        // 最多等待 20 秒后继续（Next.js 可能不打印特定就绪字符串）
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        }, 20000);
    });
}
function createWindow(port) {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Self-Media 自媒体管理',
    });
    void mainWindow.loadURL(`http://127.0.0.1:${port}`);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(async () => {
    serverPort = await findPort();
    console.log(`[electron] starting Next.js on port ${serverPort}`);
    await startNextServer(serverPort);
    console.log(`[electron] Next.js ready, opening window`);
    createWindow(serverPort);
    const { registerIpcHandlers } = await Promise.resolve().then(() => __importStar(require('./ipc-handlers')));
    registerIpcHandlers(electron_1.ipcMain);
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        nextProcess?.kill();
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow(serverPort);
    }
});
process.on('exit', () => {
    nextProcess?.kill();
});
