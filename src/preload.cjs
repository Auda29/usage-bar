const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usageBar', {
  getState: () => ipcRenderer.invoke('usage:get'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  setExpanded: (expanded) => ipcRenderer.invoke('usage:expanded', expanded),
  setHeight: (height) => ipcRenderer.send('usage:height', height),
  hide: () => ipcRenderer.send('usage:hide'),
  showMenu: () => ipcRenderer.send('usage:menu'),
  openProvider: (id) => ipcRenderer.invoke('usage:open-provider', id),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('usage:state', listener);
    return () => ipcRenderer.removeListener('usage:state', listener);
  },
});
