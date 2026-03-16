const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  pairDevice: (url) => ipcRenderer.invoke('pair-device', url),
  testAtol: () => ipcRenderer.invoke('test-atol'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  
  onPrintSuccess: (callback) => ipcRenderer.on('print-success', (_event, data) => callback(data)),
  onPrintError: (callback) => ipcRenderer.on('print-error', (_event, data) => callback(data)),
});
