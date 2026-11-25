const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  // Window control commands
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Application Settings (Startup & Tray)
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setRunAtStartup: (enabled) => ipcRenderer.invoke('set-run-at-startup', enabled),
  setCloseToTray: (enabled) => ipcRenderer.invoke('set-close-to-tray', enabled),

  // Events from Main process (e.g., tray action)
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', (event, data) => callback(data));
  },
  onStreamAlert: (callback) => {
    ipcRenderer.on('stream-alert', (event, data) => callback(data));
  }
});
