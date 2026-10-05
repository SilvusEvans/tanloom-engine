'use strict';
/**
 * 积木总览工具：把每一块积木用 scratch-blocks 真实渲染出来并截图。
 *   node tools/electron.cjs tools/gallery.cjs
 * 产出 tools/shots/blocks-gallery.png
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler } = require('../app-protocol.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'dualforge-gallery'));

registerScheme();
const ROOT = path.join(__dirname, '..');

app.whenReady().then(async () => {
  installHandler(path.join(ROOT, 'src'), ROOT);
  const win = new BrowserWindow({
    width: 1600, height: 1000, show: false, backgroundColor: '#f9f9f9',
    enableLargerThanScreen: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  const logs = [];
  win.webContents.on('console-message', (e) => { const m = (e && e.message) || ''; if (m) logs.push(m); });

  await win.loadURL('df://app/_gallery.html');
  await new Promise((r) => setTimeout(r, 1200));

  let rep = null;
  try { rep = await win.webContents.executeJavaScript('window.__gallery'); }
  catch (e) { console.log('执行失败:', e && e.message); }
  const err = await win.webContents.executeJavaScript('window.__err');
  if (err) console.log('页面错误:', err);

  const size = await win.webContents.executeJavaScript('window.__gallerySize || { w: 1600, h: 1000 }');
  const W = Math.min(Math.round(size.w), 8000);
  const H = Math.min(Math.round(size.h), 8000);
  win.setContentSize(W, H);
  await new Promise((r) => setTimeout(r, 600));
  await win.webContents.executeJavaScript(`window.__galleryResize(${W}, ${H})`);
  await new Promise((r) => setTimeout(r, 400));

  const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
  const full = H;
  const out = path.join(ROOT, 'tools', 'shots', 'blocks-gallery.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG());

  if (rep) {
    console.log(`\n=== 积木总览 ===`);
    console.log(`  共 ${rep.total} 块 / ${rep.categories.length} 个分类`);
    for (const c of rep.categories) console.log(`    ${c.name.padEnd(6)} ${c.count}`);
    if (rep.degraded.length) console.log(`  ⚠ 降级成「未识别」的积木：${rep.degraded.join(', ')}`);
    else console.log('  全部积木都有对应的 scratch-blocks 定义');
  }
  console.log(`  截图：tools/shots/blocks-gallery.png（${W}×${full}）`);

  // 想单独核对某一块积木：node tools/electron.cjs tools/gallery.cjs SetSubscribed
  // 注意 Electron 下的 argv 形如 [electron.exe, '--no-proxy-server', 'tools/gallery.cjs', 'SetSubscribed']，
  // 直接取 argv[2] 拿到的是脚本路径，得把脚本名和开关过滤掉。
  const self = path.basename(__filename);
  const extra = process.argv.slice(2).filter((a) => !a.endsWith(self) && !a.startsWith('-'));
  const want = extra[extra.length - 1];
  if (want && rep && rep.boxes && rep.boxes[want]) {
    const b = rep.boxes[want];
    const region = { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.w + 24, height: b.h + 24 };
    try { await win.webContents.capturePage(region); } catch { /* 预热 */ }
    await new Promise((r) => setTimeout(r, 150));
    const one = path.join(ROOT, 'tools', 'shots', `block-${want}.png`);
    fs.writeFileSync(one, (await win.webContents.capturePage(region)).toPNG());
    console.log(`  单块截图：tools/shots/block-${want}.png（${region.width}×${region.height}）`);
  } else if (want) {
    console.log(`  ⚠ 总览里没有 op = ${want} 的积木`);
  }
  if (logs.length) { console.log('--- 控制台 ---'); logs.slice(0, 12).forEach((l) => console.log('  ' + l)); }
  app.exit(0);
});
