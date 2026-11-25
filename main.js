const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// 2. Local App Settings Management
const userDataPath = app.getPath('userData');
const settingsFile = path.join(userDataPath, 'live-studio-settings.json');

let defaultSettings = {
  runAtStartup: false,
  closeToTray: true,
  theme: 'ios27'
};

let appSettings = { ...defaultSettings };
try {
  if (fs.existsSync(settingsFile)) {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    appSettings = { ...defaultSettings, ...JSON.parse(raw) };
  }
} catch (e) {
  console.warn('[Settings] Could not load saved settings, using defaults:', e.message);
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(appSettings, null, 2), 'utf8');
  } catch (e) {
    console.error('[Settings] Failed to save settings:', e.message);
  }
}

// 3. Global references
let mainWindow = null;
let tray = null;
app.isQuitting = false;

// 4. Start Embedded Server (server.js)
const PORT = process.env.PORT || 3000;
let serverStarted = false;

function startEmbeddedServer() {
  if (serverStarted) return;
  try {
    console.log('[Electron] Initializing embedded Live Studio PRO server...');
    require('./server.js');
    serverStarted = true;
  } catch (err) {
    console.error('[Electron] Failed to start embedded server:', err.message);
  }
}

// 5. Create Tray Icon
function createTrayIcon() {
  // Try to load icon from assets or create 16x16 icon programmatically
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Elegant fallback icon (red live dot inside a rounded squircle)
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="9" fill="#0f172a" stroke="#8b5cf6" stroke-width="2"/>
        <circle cx="16" cy="16" r="6" fill="#ef4444"/>
        <circle cx="16" cy="16" r="10" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 3"/>
      </svg>
    `;
    icon = nativeImage.createFromBuffer(Buffer.from(svgIcon));
  }

  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('Live Studio PRO - iOS 27 Edition (កំពុងដំណើរការ)');

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🎬 Live Studio PRO (iOS 27)',
      enabled: false
    },
    {
      label: '🟢 ស្ថានភាព៖ ដំណើរការធម្មតា (Active)',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '📺 បង្ហាញផ្ទាំងកម្មវិធី (Show Studio)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '🚀 បើកស្វ័យប្រវត្តិពេលបើកកុំព្យូទ័រ (Run on Startup)',
      type: 'checkbox',
      checked: appSettings.runAtStartup,
      click: (item) => {
        setRunAtStartup(item.checked);
      }
    },
    {
      label: '🛡️ បិទទៅ Taskbar Tray មិនដាច់ Live (Close to Tray)',
      type: 'checkbox',
      checked: appSettings.closeToTray,
      click: (item) => {
        appSettings.closeToTray = item.checked;
        saveSettings();
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('settings-changed', appSettings);
        }
      }
    },
    { type: 'separator' },
    {
      label: '🔄 Reload កម្មវិធី',
      click: () => {
        if (mainWindow) mainWindow.reload();
      }
    },
    {
      label: '❌ ចាកចេញទាំងស្រុង (Exit App)',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// 6. Run on Startup Handler
function setRunAtStartup(enable) {
  appSettings.runAtStartup = enable;
  saveSettings();

  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden']
    });
    console.log(`[Startup] Set runAtStartup = ${enable}`);
  } catch (err) {
    console.error('[Startup] Failed to set login item settings:', err.message);
  }

  updateTrayMenu();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('settings-changed', appSettings);
  }
}

// 7. Create Main Window
function createMainWindow() {
  const isStartHidden = process.argv.includes('--hidden');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: !isStartHidden,
    frame: false, // Frameless for iOS 27 glass look & traffic lights
    titleBarStyle: 'hidden',
    backgroundColor: '#070a13',
    title: 'Live Studio PRO',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow local media & camera feeds smoothly
    }
  });

  // Load Express Studio URL
  const studioUrl = `http://localhost:${PORT}`;
  
  // Wait slightly for Express server to be ready before first load
  const loadStudio = (retries = 10) => {
    mainWindow.loadURL(studioUrl).catch((err) => {
      if (retries > 0) {
        console.log(`[Electron] Waiting for server at ${studioUrl}... (${retries} retries left)`);
        setTimeout(() => loadStudio(retries - 1), 1000);
      } else {
        console.error('[Electron] Failed to load studio URL:', err.message);
      }
    });
  };

  loadStudio();

  // Window Ready
  mainWindow.once('ready-to-show', () => {
    if (!isStartHidden) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Minimize to Taskbar Tray on Close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && appSettings.closeToTray) {
      event.preventDefault();
      mainWindow.hide();

      if (tray) {
        try {
          tray.displayBalloon({
            title: '🎬 Live Studio PRO',
            content: 'កម្មវិធីកំពុងដំណើរការនៅផ្ទៃខាងក្រោយ (System Tray)។ ការផ្សាយ Live នឹងមិនដាច់ឡើយ!',
            iconType: 'info'
          });
        } catch (e) {
          // displayBalloon is Windows only
        }
      }
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 8. IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('get-app-settings', () => {
  return appSettings;
});

ipcMain.handle('set-run-at-startup', (event, enabled) => {
  setRunAtStartup(Boolean(enabled));
  return appSettings;
});

ipcMain.handle('set-close-to-tray', (event, enabled) => {
  appSettings.closeToTray = Boolean(enabled);
  saveSettings();
  updateTrayMenu();
  return appSettings;
});

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  startEmbeddedServer();
  createTrayIcon();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !appSettings.closeToTray) {
    app.quit();
  }
});
