'use strict';
/**
 * Tanloom Engine — Electron 启动器
 * ================================================================
 * 本机无法访问 npm registry，所以 Electron 是以「离线解压 + 自带二进制」的方式
 * 内置在 node_modules/electron/dist 里的（不是官方的 npm 包）。
 *
 * 注意：node_modules/electron 里**不能**有 index.js / package.json，
 * 否则 `require('electron')` 会解析到那个本地包，而不是 Electron 的内置模块。
 * 所以入口统一走这个启动器。
 *
 *   node tools/electron.cjs .            启动编辑器
 *   node tools/electron.cjs . --dev      带开发者工具
 *   node tools/electron.cjs tools/smoke.cjs
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const exe = path.join(ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

if (!fs.existsSync(exe)) {
  console.error('找不到 Electron 二进制：' + exe);
  console.error('请把 electron-v*-win32-x64.zip 解压到 node_modules/electron/dist/');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) args.push('.');
// 启动参数：本地静态服务器不能被系统代理接管，否则 127.0.0.1 会走死代理
if (!args.includes('--no-proxy-server')) args.unshift('--no-proxy-server');

// 关键：如果外部环境带着 ELECTRON_RUN_AS_NODE=1，electron.exe 会退化成一个
// 普通 Node 进程（没有 app / BrowserWindow / require('electron')）。
// 必须把变量整个删掉，而不能只置空。
const env = Object.assign({}, process.env, { ELECTRON_DISABLE_SECURITY_WARNINGS: '1' });
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, args, { cwd: ROOT, stdio: 'inherit', env });
child.on('close', (code) => process.exit(code === null ? 0 : code));
