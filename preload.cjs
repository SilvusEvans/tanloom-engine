'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tanloom', {
  isElectron: true,
  platform: process.platform,
  // 系统语言（主进程的 app.getSystemLocale()）。Electron 的 navigator.language
  // 在没设 --lang 时固定是 en-US，中文系统上会误判成英语，所以界面语言优先用这个。
  systemLocale: (() => { try { return ipcRenderer.sendSync('tl:system-locale'); } catch { return ''; } })(),
  openProject: () => ipcRenderer.invoke('tl:open-project'),
  saveProject: (payload) => ipcRenderer.invoke('tl:save-project', payload),
  exportCode: (payload) => ipcRenderer.invoke('tl:export-code', payload),
  setFullScreen: (on) => ipcRenderer.invoke('tl:set-fullscreen', on),
  isFullScreen: () => ipcRenderer.invoke('tl:get-fullscreen'),

  // 独立运行窗口
  openPlayer: (payload) => ipcRenderer.invoke('tl:player-open', payload),
  updatePlayer: (payload) => ipcRenderer.invoke('tl:player-update', payload),
  closePlayer: () => ipcRenderer.invoke('tl:player-close'),
  playerStatus: () => ipcRenderer.invoke('tl:player-status'),
  playerGetProject: () => ipcRenderer.invoke('tl:player-get-project'),
  onPlayerClosed: (cb) => {
    ipcRenderer.on('tl:player-closed', () => cb());
  },
  onPlayerProject: (cb) => {
    ipcRenderer.on('tl:player-project', (_e, text) => cb(text));
  }
});
