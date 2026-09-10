const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kapibala', Object.freeze({
  getStoredStatus: () => ipcRenderer.invoke('kapibala:get-stored-status'),
  login: (username, password) => ipcRenderer.invoke('kapibala:login', { username, password }),
  refresh: () => ipcRenderer.invoke('kapibala:refresh'),
  logout: () => ipcRenderer.invoke('kapibala:logout'),
  openExternal: (url) => ipcRenderer.invoke('kapibala:open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  setMinimumSizeForMode: mode => ipcRenderer.invoke('window:set-min-size', mode),
  setModeBounds: payload => ipcRenderer.invoke('window:set-mode-bounds', payload)
  ,ensurePrimaryDisplay: () => ipcRenderer.invoke('window:ensure-primary-display')
  ,getWindowSettings: () => ipcRenderer.invoke('window:get-settings')
  ,setWindowSettings: patch => ipcRenderer.invoke('window:set-settings', patch)
  ,setAlwaysOnTop: enabled => ipcRenderer.invoke('window:set-always-on-top', Boolean(enabled))
}));
