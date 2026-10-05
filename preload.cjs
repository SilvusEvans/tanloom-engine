'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualforge', {
  isElectron: true,
  platform: process.platform,
  openProject: () => ipcRenderer.invoke('df:open-project'),
  saveProject: (payload) => ipcRenderer.invoke('df:save-project', payload),
  exportCode: (payload) => ipcRenderer.invoke('df:export-code', payload),
  setFullScreen: (on) => ipcRenderer.invoke('df:set-fullscreen', on),
  isFullScreen: () => ipcRenderer.invoke('df:get-fullscreen'),

  // 独立运行窗口
  openPlayer: (payload) => ipcRenderer.invoke('df:player-open', payload),
  updatePlayer: (payload) => ipcRenderer.invoke('df:player-update', payload),
  closePlayer: () => ipcRenderer.invoke('df:player-close'),
  playerStatus: () => ipcRenderer.invoke('df:player-status'),
  playerGetProject: () => ipcRenderer.invoke('df:player-get-project'),
  onPlayerClosed: (cb) => {
    ipcRenderer.on('df:player-closed', () => cb());
  },
  onPlayerProject: (cb) => {
    ipcRenderer.on('df:player-project', (_e, text) => cb(text));
  }
});
