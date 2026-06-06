import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as portfinder from 'portfinder';

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let serverPort = 3000;

const isDev = process.env.ELECTRON_DEV === '1';

async function findPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    portfinder.getPort({ port: 3000 }, (err, port) => {
      if (err) reject(err);
      else resolve(port);
    });
  });
}

async function startNextServer(port: number): Promise<void> {
  if (isDev) {
    // 开发模式：连接到已运行的 next dev（端口3000）
    console.log(`[electron] dev mode — expecting Next.js at http://127.0.0.1:${port}`);
    await new Promise((r) => setTimeout(r, 2000));
    return;
  }

  // 生产模式：启动 standalone server
  const serverPath = path.join(__dirname, '..', '..', '.next', 'standalone', 'server.js');
  const dataDir = app.getPath('userData');

  return new Promise((resolve, reject) => {
    nextProcess = spawn(process.execPath, [serverPath], {
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

    nextProcess.stdout?.on('data', (data: Buffer) => {
      const out = data.toString();
      console.log('[next]', out.trim());
      if (!resolved && (out.includes('Ready') || out.includes('started server') || out.includes('Listening'))) {
        resolved = true;
        resolve();
      }
    });

    nextProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[next:err]', data.toString().trim());
    });

    nextProcess.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });

    setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 20000);
  });
}

function createWindow(port: number): void {
  mainWindow = new BrowserWindow({
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

app.whenReady().then(async () => {
  serverPort = isDev ? 3000 : await findPort();
  console.log(`[electron] starting on port ${serverPort}`);
  await startNextServer(serverPort);
  console.log(`[electron] ready, opening window`);
  createWindow(serverPort);

  const { registerIpcHandlers } = await import('./ipc-handlers');
  registerIpcHandlers(ipcMain);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    nextProcess?.kill();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow(serverPort);
  }
});

process.on('exit', () => {
  nextProcess?.kill();
});
