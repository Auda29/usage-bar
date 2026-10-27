const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usageBar', {
  getState: () => ipcRenderer.invoke('usage:get'),
  getSetupState: () => ipcRenderer.invoke('usage:setup-state'),
  openSetup: () => ipcRenderer.invoke('usage:setup-open'),
  signInClaude: () => ipcRenderer.invoke('usage:claude-sign-in'),
  setProviders: (ids) => ipcRenderer.invoke('usage:providers', ids),
  saveCredential: (id, token) => ipcRenderer.invoke('usage:credential-save', id, token),
  removeCredential: (id) => ipcRenderer.invoke('usage:credential-remove', id),
  importCursor: () => ipcRenderer.invoke('usage:cursor-import'),
  selectCopilotAccount: (selection) => ipcRenderer.invoke('usage:copilot-account', selection),
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
