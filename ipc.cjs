'use strict';
/**
 * 主进程 IPC。
 * 单独放一个模块，是为了让测试脚本也能挂上同一套 handler ——
 * 否则测试里跑的是自己那个 entry，`ipcRenderer.invoke` 全都会报
 * 「No handler registered」，等于全屏这条路根本没被测到。
 */
const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PLAYER_URL } = require('./app-protocol.cjs');

/* ------------------------------------------------------------------ */
/* 独立运行窗口                                                        */
/* ------------------------------------------------------------------ */
/**
 * 「运行效果单开一个窗口」。
 *
 * 跨进程没法共享运行中的状态，所以那个窗口里跑的是**另一份 Runtime** ——
 * 项目数据由主进程在中间转交：开窗时给一次，之后编辑器每次改动再推一次
 * （所以它同时也是热重载：改完积木那边立刻生效）。
 */
let playerWindow = null;
let playerProject = null;

/** 把消息发给所有「不是播放器」的窗口（也就是编辑器），用来同步按钮状态 */
function notifyEditors(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === playerWindow || w.isDestroyed()) continue;
    try { w.webContents.send(channel, payload); } catch { /* 窗口可能正在销毁 */ }
  }
}

/** 按舞台比例挑一个合适的窗口大小，尽量整个装进工作区 */
function playerSize(payload) {
  const sw = payload.stageWidth || 480;
  const sh = payload.stageHeight || 360;
  const BAR = 46;
  let area = { width: 1280, height: 800 };
  try {
    // screen 在 app ready 之前不能 require，所以这里现取
    area = require('electron').screen.getPrimaryDisplay().workAreaSize;
  } catch { /* 取不到就用默认 */ }
  let w = Math.min(1080, Math.max(360, area.width - 120));
  let h = Math.round((w * sh) / sw) + BAR;
  if (h > area.height - 100) {
    h = Math.max(240, area.height - 100);
    w = Math.round(((h - BAR) * sw) / sh);
  }
  return { width: Math.max(320, w), height: Math.max(220, h) };
}

function openPlayerWindow(payload) {
  playerProject = payload.text || null;
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus();
    if (playerProject) playerWindow.webContents.send('tl:player-project', playerProject);
    return true;
  }
  const size = playerSize(payload);
  playerWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 320,
    minHeight: 220,
    show: false,
    backgroundColor: '#05070b',
    title: ((payload.name || 'Tanloom Engine') + ' · 运行'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  playerWindow.once('ready-to-show', () => playerWindow.show());
  playerWindow.on('closed', () => {
    playerWindow = null;
    playerProject = null;
    notifyEditors('tl:player-closed');
  });
  playerWindow.loadURL(PLAYER_URL);
  return true;
}

function registerIpc() {
  // ---- 界面语言：系统语言 ----
  // 同步回一次就够（preload 在页面脚本之前跑）。用 sendSync 是因为
  // i18n.js 在**模块加载时**就要定下语言，异步来不及。
  ipcMain.on('tl:system-locale', (e) => {
    let loc = '';
    try { loc = require('electron').app.getSystemLocale(); } catch { loc = ''; }
    e.returnValue = loc || '';
  });

  // ---- 全屏游玩 ----
  // 渲染进程的「全屏游玩」是两层：一层是盖住编辑器的舞台层，
  // 另一层是真的让窗口占满屏幕（连标题栏一起去掉）。后者只能主进程做。
  ipcMain.handle('tl:set-fullscreen', (e, on) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    const want = !!on;
    if (win.isFullScreen() !== want) win.setFullScreen(want);
    return win.isFullScreen();
  });

  ipcMain.handle('tl:get-fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return win ? win.isFullScreen() : false;
  });

  // ---- 独立运行窗口 ----
  ipcMain.handle('tl:player-open', (_e, payload) => openPlayerWindow(payload || {}));

  // 编辑器改动 → 推给运行窗口（热重载）
  ipcMain.handle('tl:player-update', (_e, payload) => {
    playerProject = (payload && payload.text) || playerProject;
    if (!playerWindow || playerWindow.isDestroyed()) return false;
    if (playerProject) {
      try { playerWindow.webContents.send('tl:player-project', playerProject); } catch { return false; }
    }
    return true;
  });

  ipcMain.handle('tl:player-close', () => {
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close();
    return true;
  });

  ipcMain.handle('tl:player-status', () => !!playerWindow && !playerWindow.isDestroyed());

  ipcMain.handle('tl:player-get-project', () => playerProject);

  // ---- 项目文件：打开 / 保存 / 导出 ----
  const owner = (e) => BrowserWindow.fromWebContents(e.sender) || undefined;

  ipcMain.handle('tl:open-project', async (e) => {
    const r = await dialog.showOpenDialog(owner(e), {
      title: '打开 Tanloom Engine 项目',
      filters: [{ name: 'Tanloom Engine Project', extensions: ['dfp', 'json'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return null;
    const file = r.filePaths[0];
    return { path: file, text: fs.readFileSync(file, 'utf-8') };
  });

  ipcMain.handle('tl:save-project', async (e, { filePath, text, suggestedName }) => {
    let target = filePath;
    if (!target) {
      const r = await dialog.showSaveDialog(owner(e), {
        title: '保存 Tanloom Engine 项目',
        defaultPath: (suggestedName || 'project') + '.tle',
        filters: [{ name: 'Tanloom Engine Project', extensions: ['dfp'] }]
      });
      if (r.canceled || !r.filePath) return null;
      target = r.filePath;
    }
    fs.writeFileSync(target, text, 'utf-8');
    return { path: target };
  });

  ipcMain.handle('tl:export-code', async (e, { suggestedName, files }) => {
    const r = await dialog.showOpenDialog(owner(e), {
      title: '选择代码导出目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths.length) return null;
    const dir = path.join(r.filePaths[0], (suggestedName || 'project') + '-src');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const p = path.join(dir, f.name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.text, 'utf-8');
    }
    return { path: dir };
  });
}

module.exports = { registerIpc };
