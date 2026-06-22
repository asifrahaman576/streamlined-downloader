import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, net } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;
let logStream = null;

function setupLogging() {
  try {
    const logDir = app.getPath('userData');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, 'app-debug.log');
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    log(`--- App started: ${new Date().toISOString()} ---`);
    log(`Logging initialized at: ${logPath}`);
  } catch (err) {
    console.error('Failed to initialize logging:', err);
  }
}

function log(msg) {
  const formatted = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  if (logStream) {
    logStream.write(formatted);
  }
}

function sendTelemetryPing() {
  try {
    const telemetryFile = path.join(app.getPath('userData'), 'telemetry-id.json');
    let telemetryId = '';
    
    if (fs.existsSync(telemetryFile)) {
      try {
        const content = fs.readFileSync(telemetryFile, 'utf8');
        const parsed = JSON.parse(content);
        telemetryId = parsed.id;
      } catch (_) {}
    }
    
    if (!telemetryId) {
      telemetryId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
      try {
        fs.writeFileSync(telemetryFile, JSON.stringify({ id: telemetryId }), 'utf8');
      } catch (_) {}
    }
    
    const payload = {
      event: 'app_launch',
      properties: {
        distinct_id: telemetryId,
        platform: process.platform,
        arch: process.arch,
        app_version: app.getVersion() || '0.0.0',
        os_version: os.release(),
        timestamp: new Date().toISOString()
      }
    };
    
    const targetUrl = process.env.TELEMETRY_URL || 'https://streamlined-downloader-production-b92e.up.railway.app/api/telemetry/ping';
    log(`[Telemetry] Sending launch ping to ${targetUrl} for ID: ${telemetryId}`);
    
    const request = net.request({
      method: 'POST',
      url: targetUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    request.on('error', (err) => {
      log(`[Telemetry Error] Failed to dispatch launch event: ${err.message}`);
    });
    
    request.write(JSON.stringify(payload));
    request.end();
  } catch (err) {
    log(`[Telemetry Error] Initialization exception: ${err.message}`);
  }
}

function startLocalServer() {
  if (app.isPackaged) {
    const serverPath = path.join(__dirname, '../dist/server.js');
    log(`Starting local Express server at: ${serverPath}`);
    
    serverProcess = fork(serverPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        PORT: '3000',
        NODE_ENV: 'production'
      }
    });

    serverProcess.stdout.on('data', (data) => {
      log(`[Server Out]: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
      log(`[Server Err]: ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      log(`Server process spawn error: ${err.message}`);
    });

    serverProcess.on('exit', (code) => {
      log(`Server process exited with code ${code}`);
    });
  } else {
    log('Running in development mode. Assuming server is already running.');
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Start hidden, show only when fully loaded (prevents blank screen)
    title: 'StreamlineDL - Desktop Downloader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Hide the default browser menu bar
  mainWindow.setMenu(null);

  // Open DevTools only in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Right-click Context Menu for Copy, Cut, Paste, etc.
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Select All', role: 'selectall' }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    }
    if (menu.items.length > 0) {
      menu.popup(mainWindow);
    }
  });

  let reloadAttempts = 0;
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log(`Failed to load URL: ${validatedURL} (Error ${errorCode}: ${errorDescription})`);
    if (reloadAttempts < 10) {
      reloadAttempts++;
      log(`Retrying connection in 1.5 seconds... (Attempt ${reloadAttempts}/10)`);
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.loadURL('http://localhost:3000');
        }
      }, 1500);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log(`Window loaded successfully: ${mainWindow.webContents.getURL()}`);
    if (mainWindow) {
      mainWindow.show(); // Reveal window only when page has loaded (no white screen)
    }
  });

  // If server is starting, wait a short moment before initial load
  if (app.isPackaged) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  log('Triggering initial window load of http://localhost:3000');
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handler for folder selection
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Download Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

app.whenReady().then(() => {
  setupLogging();
  sendTelemetryPing();
  autoUpdater.checkForUpdatesAndNotify();
  startLocalServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    log('Killing background server process...');
    serverProcess.kill();
  }
  if (logStream) {
    logStream.end();
  }
});
