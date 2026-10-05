'use strict';
/**
 * 定义探针：让 scratch-blocks 自己把每个积木的输入名 / 字段名 / 形状吐出来，
 * 用来核对 IR ↔ XML 映射表里的参数名，避免靠猜。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, BUNDLE_URL } = require('../app-protocol.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-probe'));

registerScheme();
const ROOT = path.join(__dirname, '..');

app.whenReady().then(async () => {
  installHandler(path.join(ROOT, 'src'), ROOT);
  const win = new BrowserWindow({
    width: 960, height: 660, show: false, backgroundColor: '#f9f9f9',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('LOAD FAIL', code, desc, url));
  await win.loadURL('tanloom://app/_probe.html');
  await new Promise((r) => setTimeout(r, 500));

  let out = null;
  try { out = await win.webContents.executeJavaScript('window.__probe'); }
  catch (e) { console.log('执行失败:', e && e.message); }
  const err = await win.webContents.executeJavaScript('window.__err');
  if (err) console.log('页面错误:', err);

  if (out) {
    if (out.errors && out.errors.length) console.log('问题:', out.errors.join(' | '));
    const dump = {};
    for (const [t, v] of Object.entries(out.blocks || {})) {
      dump[t] = {
        out: v.output, shape: v.outputShape, prev: v.prev, next: v.next,
        args: v.inputs.map((i) => i.kind === 'input'
          ? `#${i.name}:${i.type}`
          : `@${i.field}=${JSON.stringify(i.value)}`),
      };
    }
    fs.writeFileSync(path.join(ROOT, 'tools', 'defs-dump.json'), JSON.stringify(dump, null, 1), 'utf-8');
    console.log('已写出 tools/defs-dump.json，共', Object.keys(dump).length, '个积木');
    for (const [t, v] of Object.entries(dump)) {
      console.log(`${t}\n    ${v.args.join('  ')}\n    out=${JSON.stringify(v.out)} shape=${v.shape} prev=${v.prev} next=${v.next}`);
    }
  }
  app.exit(0);
});
