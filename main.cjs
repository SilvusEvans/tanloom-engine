'use strict';
const { app, BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const { registerScheme, installHandler, APP_URL } = require('./app-protocol.cjs');
const { registerIpc } = require('./ipc.cjs');

const IS_DEV = process.argv.includes('--dev');
const SRC = path.join(__dirname, 'src');

// 编辑器资源走自定义协议 df://，不经过网络栈（端口 / 代理 / 防火墙都不会影响它）
registerScheme();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#12151c',
    title: 'DualForge',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  installHandler(SRC, __dirname);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC 都放在 ipc.cjs —— 测试脚本能挂同一套 handler，全屏那条路才真的被测到
registerIpc();
