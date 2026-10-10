'use strict';
/**
 * 层级列表面板探针：拖积木不该让整棵树重建。
 *   node tools/electron.cjs tools/probe-hierarchy.cjs
 *
 * 症状回归：拖完积木会走 _writeBack。若「只是挪了位置」也被当成一次编辑，
 * store 一广播，afterChange 就把 #hierarchy 整棵重建 —— 入场的逐项动画
 * 整体重播，看起来就是「每动一次积木，层级列表就刷新」。这里用真鼠标拖动
 * （不是调内部函数）验证：
 *   · 位置照样写回 IR（重开画布还在原处）
 *   · #hierarchy 的 DOM 一个节点都没动（MutationObserver 计数为 0）
 *   · 拖积木不产生撤销步（它不是一次「编辑」）
 * 再补两条防「修死」的：切实体只原地换 active；新增实体照常出新行。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
// 关键：**不能**用 show:false 的纯隐藏窗口跑这个探针。
// 隐藏窗口里 rAF 会被饿死（实测 1.4s 只跑 2 拍），而 _writeBack 挂在 rAF 上 ——
// 于是「拖动后的写回」根本不会发生，断言全落空（这个坑真踩过，结果还被误读成
// “旧代码不写回”。真实原因是窗口没在渲染）。这里把窗口挪到屏幕外显示：
// 渲染帧照跑、鼠标事件照发，用户看不见。
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-hierprobe'));
// 每轮干净：语言等 localStorage 残留会传染断言
try { fs.rmSync(path.join(require('os').tmpdir(), 'tanloom-hierprobe'), { recursive: true, force: true }); } catch { /* 没有就正好 */ }
registerScheme();
const ROOT = path.join(__dirname, '..');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✖'} ${name} — ${detail}`);
}

app.whenReady().then(async () => {
  installHandler(path.join(ROOT, 'src'), ROOT);
  const win = new BrowserWindow({
    width: 1680, height: 1020, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false }
  });
  // 挪到屏幕外再显示 —— 有渲染帧（rAF 正常跑）但用户看不见、不抢焦点。
  // 见文件头：隐藏窗口里 rAF 被饿死，这个探针必须让窗口真的在渲染。
  win.setSkipTaskbar(true);
  win.setPosition(-2400, -2400);
  win.showInactive();
  const pageErrors = [];
  win.webContents.on('console-message', (e) => {
    const m = (e && e.message) || '';
    if (m) pageErrors.push(m);
  });
  await win.loadURL(APP_URL);
  await new Promise((r) => setTimeout(r, 2300));
  {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      try { if (await win.webContents.executeJavaScript('!!(window.__tl && window.__tl.ws && window.__tl.ws.ws)')) break; } catch { /* 下一拍再来 */ }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const run = (js) => win.webContents.executeJavaScript(js);
  {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      try { if (await run('window.__tl.ws.ws.getTopBlocks(true).length') > 0) break; } catch { /* 下一拍 */ }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  /* ================================================================ */
  console.log('\n=== 拖积木：层级列表不动 ===');

  const prep = await run(`(() => {
    const tl = window.__tl;
    const ws = tl.ws.ws;
    // 飞出面板开着的话可能挡住画布左侧的积木，先收起来
    try {
      const fly = ws.getFlyout();
      if (fly && fly.isVisible && fly.isVisible() && fly.hide) fly.hide();
    } catch { /* 收不起来就绕开它 */ }

    const tops = ws.getTopBlocks(true).filter((b) => !b.isInFlyout)
      .sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
    if (!tops.length) return { err: '工作区里没有积木' };

    // 找一摞「真的露在画布上、没被面板挡住」的积木，取一个避开字段文字的抓取点
    const inField = (el) => !!(el && el.closest && el.closest('.blocklyEditableField, .blocklyFieldRect, .blocklyHtmlInput, .blocklyDropDownDiv'));
    let pick = null;
    for (const b of tops) {
      const r = b.getSvgRoot().getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.left < 0 || r.top < 0) continue;
      outer: for (const dx of [6, 10, 14, 4]) {
        for (const dy of [r.height / 2, 10, r.height - 10]) {
          const px = Math.round(r.left + dx), py = Math.round(r.top + dy);
          const el = document.elementFromPoint(px, py);
          const hit = el && el.closest ? el.closest('.blocklyDraggable') : null;
          if (hit && hit.getAttribute('data-id') === b.id && !inField(el)) {
            pick = { id: b.id, type: b.type, x: px, y: py };
            break outer;
          }
        }
      }
      if (pick) break;
    }
    if (!pick) return { err: '找不到露在画布上的积木（都被人挡了？）' };

    // 落点：工作区里的空白处（避开积木 / 飞出面板 / 缩放按钮 / 垃圾桶 / 工具箱）
    const host = document.querySelector('#blockly-host');
    const hr = host.getBoundingClientRect();
    const free = (el) => !!(el && !el.closest('.blocklyDraggable, .blocklyFlyout, .blocklyZoom, .blocklyTrash, .blocklyToolboxDiv'));
    let tx = null, ty = null;
    outer2: for (const fx of [0.9, 0.8, 0.65, 0.5, 0.35, 0.2]) {
      for (const fy of [0.15, 0.45, 0.8]) {
        const px = Math.round(hr.left + hr.width * fx), py = Math.round(hr.top + hr.height * fy);
        if (free(document.elementFromPoint(px, py))) { tx = px; ty = py; break outer2; }
      }
    }
    if (tx == null) return { err: '工作区里找不到空白落点' };

    // 基线：脚本结构 / 坐标 / 撤销栈 / 首行 DOM 引用 + DOM 变更监听
    const ent = tl.store.entityById(tl.ws.currentEntityId);
    window.__hierProbe = {
      scripts: JSON.stringify(ent.scripts),
      pos: JSON.stringify(ent.scriptPos || null),
      undoDepth: tl.store.history.length,
      row0: document.querySelector('#hierarchy .hier-row'),
      rows: document.querySelectorAll('#hierarchy .hier-row').length,
      mutations: 0,
      mo: null,
    };
    const mo = new MutationObserver((recs) => { window.__hierProbe.mutations += recs.length; });
    mo.observe(document.querySelector('#hierarchy'), { childList: true, subtree: true, attributes: true });
    window.__hierProbe.mo = mo;
    return { sx: pick.x, sy: pick.y, tx, ty, type: pick.type, kinds: tops.map((b) => b.type) };
  })()`);

  if (prep.err) {
    check('准备：找到露在画布上的积木与空白落点', false, prep.err);
  } else {
    // 真鼠标拖动：按住 → 一步步挪 → 松手
    await win.webContents.sendInputEvent({ type: 'mouseMove', x: prep.sx, y: prep.sy });
    await win.webContents.sendInputEvent({ type: 'mouseDown', x: prep.sx, y: prep.sy, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 80));
    for (const t of [0.15, 0.35, 0.6, 0.85, 1]) {
      await win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: Math.round(prep.sx + (prep.tx - prep.sx) * t),
        y: Math.round(prep.sy + (prep.ty - prep.sy) * t),
        button: 'left'
      });
      await new Promise((r) => setTimeout(r, 45));
    }
    await win.webContents.sendInputEvent({ type: 'mouseUp', x: prep.tx, y: prep.ty, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 800));   // 写回在 rAF 里，级联也在下一帧

    const after = await run(`(() => {
      const tl = window.__tl;
      const p = window.__hierProbe;
      p.mo.disconnect();
      const ent = tl.store.entityById(tl.ws.currentEntityId);
      return {
        scriptsSame: JSON.stringify(ent.scripts) === p.scripts,
        posChanged: JSON.stringify(ent.scriptPos || null) !== p.pos,
        pos: JSON.stringify(ent.scriptPos || null),
        mutations: p.mutations,
        rowKept: p.row0 === document.querySelector('#hierarchy .hier-row') && !!p.row0.isConnected,
        rowsNow: document.querySelectorAll('#hierarchy .hier-row').length,
        rowsBefore: p.rows,
        undoDepth: tl.store.history.length,
        undoBefore: p.undoDepth,
      };
    })()`);

    const moved = { sx: prep.sx, sy: prep.sy, tx: prep.tx, ty: prep.ty };
    check('拖动完成，而且只挪了位置（脚本结构没变）', after.scriptsSame,
      `拖动 (${moved.sx},${moved.sy}) → (${moved.tx},${moved.ty})（${prep.type}）` +
      (after.scriptsSame ? '' : '｜脚本结构被改动（大概吸附到别的积木上了）'));
    check('坐标写回 IR（重开画布还在原处）', after.posChanged, `scriptPos → ${after.pos}`);
    check('#hierarchy 没重建：整棵树的 DOM 零变更', after.mutations === 0,
      `MutationObserver 记到 ${after.mutations} 次变更｜行数 ${after.rowsBefore} → ${after.rowsNow}`);
    check('首行还是同一个 DOM 节点（没被整树洗掉）', after.rowKept,
      after.rowKept ? '引用未变' : '节点被替换了');
    check('拖积木不产生撤销步（它不是一次「编辑」）', after.undoDepth === after.undoBefore,
      `撤销栈深度 ${after.undoBefore} → ${after.undoDepth}`);
  }

  /* ================================================================ */
  console.log('\n=== 点层级行：原地换选中，不整树重建 ===');
  const sel = await run(`(async () => {
    const rowsBefore = [...document.querySelectorAll('#hierarchy .hier-row')];
    const other = rowsBefore.find((r) => !r.classList.contains('active'));
    if (!other) return { err: '只有一个实体行，没法测切换' };
    other.click();
    await new Promise((r) => setTimeout(r, 350));
    const rowsAfter = [...document.querySelectorAll('#hierarchy .hier-row')];
    return {
      kept: rowsAfter.length === rowsBefore.length && rowsBefore.every((el) => el.isConnected && rowsAfter.includes(el)),
      activeMoved: other.classList.contains('active'),
      activeCount: rowsAfter.filter((r) => r.classList.contains('active')).length,
    };
  })()`);
  if (sel.err) check('点层级行切换选中', false, sel.err);
  else check('点层级行：只原地换 active，行节点全部保留',
    sel.kept && sel.activeMoved && sel.activeCount === 1,
    `节点保留=${sel.kept}｜active 移到点击行=${sel.activeMoved}｜active 行数=${sel.activeCount}`);

  /* ================================================================ */
  console.log('\n=== 结构变化：列表照常更新 ===');
  const add = await run(`(async () => {
    const tl = window.__tl;
    const before = document.querySelectorAll('#hierarchy .hier-row').length;
    tl.store.addEntity({ name: '探针实体', x: 0, y: 0, render: { shape: 'box', color: '#E53935', width: 30, height: 30 } });
    await new Promise((r) => setTimeout(r, 450));
    const rows = [...document.querySelectorAll('#hierarchy .hier-row')];
    return { before, after: rows.length, found: rows.some((r) => r.textContent.includes('探针实体')) };
  })()`);
  check('新建实体 → 列表照常刷出新行', add.after === add.before + 1 && add.found,
    `行数 ${add.before} → ${add.after}｜出现「探针实体」=${add.found}`);

  /* ================================================================ */
  console.log('\n=== 页面错误 ===');
  const errs = pageErrors.filter((m) => /uncaught|Invalid|violat|TypeError|Cannot read|before initialization/i.test(m));
  if (errs.length) errs.slice(0, 12).forEach((m) => console.log('  ' + m));
  else console.log('  （无）');

  const bad = results.filter((r) => !r.ok);
  console.log(`\n=========== ${results.length - bad.length} 通过 / ${bad.length} 失败 ===========`);
  if (bad.length) bad.forEach((r) => console.log(`  ✖ ${r.name} / ${r.detail}`));
  app.exit(bad.length ? 1 : 0);
});
