const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  selectDirectory: () => ipcRenderer.invoke('select-directory')
});
