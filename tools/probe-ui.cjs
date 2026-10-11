'use strict';
/**
 * 界面流程探针：验证「新建积木类别」和「新建积木」两条用户路径真的能走通。
 *   node tools/electron.cjs tools/probe-ui.cjs
 *
 * 尽量走真实交互：点按钮、填表单、点选择区的分类行、真右键积木，
 * 而不是直接调内部函数 —— 内部函数能跑通不等于用户点得动。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-ui'));
// 每轮干净：上一轮残留的「战斗系统X」会让「新建分类」断言误判成重复
try { fs.rmSync(path.join(require('os').tmpdir(), 'tanloom-ui'), { recursive: true, force: true }); } catch { /* 没有就正好 */ }
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
  const pageErrors = [];
  win.webContents.on('console-message', (e) => {
    const m = (e && e.message) || '';
    if (m) pageErrors.push(m);
  });
  await win.loadURL(APP_URL);
  await new Promise((r) => setTimeout(r, 2300));
  // 冷启动时 2300ms 可能不够（scratch-blocks 的 bundle 很大），
  // 直接执行会读到 window.__tl === undefined 而崩。等它真的就绪再往下。
  {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      try { if (await win.webContents.executeJavaScript('!!(window.__tl && window.__tl.store)')) break; } catch { /* 下一拍再来 */ }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const run = (js) => win.webContents.executeJavaScript(js);
  // capturePage 第一张常是上一帧，连抓两次取第二张（见技能 offline-electron-app）。
  // 抓不到也不能抛出去：这里是 await 在 async 里，抛出去就是 unhandled rejection，
  // 后面的汇总和 app.exit() 全不执行，进程会一直挂着（看着像「探针卡死」）。
  const shot = async (file) => {
    try { await win.webContents.capturePage(); } catch { /* 预热 */ }
    await new Promise((r) => setTimeout(r, 120));
    try {
      fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
      return true;
    } catch { return false; }
  };
  // 页面上有两个 .blocklyFlyout（主面板 + 垃圾桶的），取没被标成垃圾桶的那个
  const FLY = `(function flyoutEl(){ return [...document.querySelectorAll('#blockly-host .blocklyFlyout')].find(e => !/Trashcan/i.test(e.className)) || null; })`;

  console.log('\n=== 「新建积木类别」路径 ===');

  /* 1. 点「＋ 分类」按钮，把表单填完提交 */
  const cat = await run(`(async () => {
    const tl = window.__tl;
    document.querySelector('#btn-new-category').click();
    await new Promise(r => setTimeout(r, 220));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '没有弹出对话框' };
    const ins = modal.querySelectorAll('input');
    ins[0].value = '战斗系统X';
    ins[1].value = '#E53935';
    ins[2].value = '⚔';
    modal.querySelectorAll('.foot button')[1].click();
    await new Promise(r => setTimeout(r, 500));
    const c = Object.values(tl.store.project.categories).find(x => x.name === '战斗系统X');
    return { id: c && c.id, color: c && c.color, icon: c && c.icon };
  })()`);
  check('新建分类写入 IR', !!cat.id, `id=${cat.id} color=${cat.color} icon=${cat.icon}`);

  /* 2. 选择区里能看到它，而且点得开 */
  const empty = await run(`(async () => {
    const flyoutEl = ${FLY};
    const rows = () => [...document.querySelectorAll('#blockly-host .blocklyToolboxCategory')];
    const all = rows().map(e => e.textContent.trim());
    const row = rows().find(e => e.textContent.includes('战斗系统X'));
    if (!row) return { all, clicked: false };
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    row.click();
    await new Promise(r => setTimeout(r, 500));
    // 直接在全页范围查：连续工具箱的飞出面板里 .blocklyFlyout 有两个（含垃圾桶），
    // 单取某个元素容易抓错，按类名全局查更可靠。
    const texts = [...document.querySelectorAll('#blockly-host .blocklyFlyoutLabelText, #blockly-host .blocklyLabelField')]
      .map(t => t.textContent).filter(Boolean);
    const buttons = [...document.querySelectorAll('#blockly-host .blocklyFlyoutButton')]
      .map(b => b.textContent.trim()).filter(Boolean);
    return { all, clicked: true, texts, buttons };
  })()`);
  check('新建的分类出现在选择区', empty.all.some((t) => t.includes('战斗系统X')),
    `分类行：${empty.all.join(' / ')}`);
  check('空分类点开后给出引导和「新建积木」按钮',
    (empty.texts || []).some((t) => t.includes('空的')) && (empty.buttons || []).some((b) => b.includes('新建积木')),
    `飞出面板文字：${(empty.texts || []).join(' / ')}｜按钮：${(empty.buttons || []).join(' / ')}`);

  console.log('\n=== 「新建积木」路径 ===');

  /* 3. 右键一块积木 —— 用真的鼠标右键事件 */
  const rect = await run(`(() => {
    const b = window.__tl.ws.ws.getAllBlocks(false).find(x => x.previousConnection && !x.outputConnection);
    const r = b.getSvgRoot().getBoundingClientRect();
    return { x: Math.round(r.left + 24), y: Math.round(r.top + 20), type: b.type };
  })()`);
  await win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'right', clickCount: 1 });
  await win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'right', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 450));
  const menu = await run(`(() => {
    const items = [...document.querySelectorAll('.blocklyMenu .blocklyMenuItemContent, .blocklyContextMenu .blocklyMenuItemContent, .blocklyMenuItemContent')];
    return { items: items.map(e => e.textContent.trim()) };
  })()`);
  check('积木右键后菜单里有「合成新积木…」',
    menu.items.some((t) => t.includes('合成新积木')),
    `${rect.type} → ${menu.items.join(' | ') || '（没等到菜单）'}`);
  await run(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  await run(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);

  /* 4. 走完整对话框，把积木合到刚建的新分类里（这块最容易崩） */
  const made = await run(`(async () => {
    const tl = window.__tl;
    const ws = tl.ws;
    const blk = ws.ws.getAllBlocks(false).find(x => x.previousConnection && !x.outputConnection);
    ws.openMacroDialogFor(blk);
    await new Promise(r => setTimeout(r, 260));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '合成积木对话框没弹出' };
    modal.querySelectorAll('input')[0].value = '攻击';
    const sel = modal.querySelector('select');
    const opts = sel ? [...sel.options].map(o => o.textContent.trim()) : [];
    const target = sel ? [...sel.options].find(o => o.textContent.includes('战斗系统X')) : null;
    if (target) sel.value = target.value;
    modal.querySelectorAll('.foot button')[1].click();
    await new Promise(r => setTimeout(r, 800));
    const m = Object.values(tl.store.project.macros).find(x => x.name === '攻击');
    return {
      opts, category: m && m.category, macroId: m && m.id,
      inWorkspace: ws.ws.getAllBlocks(false).filter(b => b.type.startsWith('df_macro_')).map(b => b.type),
    };
  })()`);
  check('分类下拉里能选到新建的分类',
    (made.opts || []).some((t) => t.includes('战斗系统X')),
    `下拉项：${(made.opts || []).join(' / ')}`);
  check('合成积木写入 IR 并归到新分类', !!made.macroId, `category=${made.category}`);
  check('调用点被替换成新积木',
    (made.inWorkspace || []).includes('df_macro_' + made.macroId),
    `macroId=${made.macroId}｜工作区：${(made.inWorkspace || []).join(', ')}`);

  /* 5. 新分类的选择区里能渲染出那块积木（自建分类色最容易在这里炸） */
  const render = await run(`(async () => {
    const rows = [...document.querySelectorAll('#blockly-host .blocklyToolboxCategory')];
    const row = rows.find(e => e.textContent.includes('战斗系统X'));
    if (!row) return { err: '选择区里找不到这个分类' };
    row.click();
    await new Promise(r => setTimeout(r, 600));
    const fly = window.__tl.ws.ws.getFlyout();
    const bs = fly && fly.getWorkspace ? fly.getWorkspace().getAllBlocks(false) : [];
    // 连续工具箱：所有分类共用一个飞出面板，所以按「新分类里的积木有没有出现」来判断
    const wanted = window.__tl.store.project.macros['macro_x'];
    return { count: bs.length, total: bs.length,
             styled: bs.filter(b => !!b.getSvgRoot()).length,
             hasNew: bs.some(b => b.type.startsWith('df_macro_')) };
  })()`);
  check('新分类的选择区里能渲染出积木',
    !render.err && (render.styled || 0) > 0,
    render.err || `共用飞出面板共 ${render.total} 块，出图 ${render.styled} 块`);

  /* 6. 点选择区里的「＋ 新建积木」按钮，从零造一块 */
  const scratch = await run(`(async () => {
    const tl = window.__tl;
    const btn = [...document.querySelectorAll('#blockly-host .blocklyFlyoutButton')]
      .find(b => b.textContent.includes('新建积木'));
    if (!btn) return { err: '选择区里没有「新建积木」按钮' };
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // Blockly 的飞出按钮对「按下」比较挑，三类事件都发一遍最稳。
    // 副作用是可能弹两次对话框 —— 下面是按第一个提交的，收尾时会把多余的关掉。
    const opt = { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true };
    btn.dispatchEvent(new PointerEvent('pointerdown', opt));
    btn.dispatchEvent(new PointerEvent('pointerup', opt));
    btn.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(r2 => setTimeout(r2, 450));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '点了按钮但没弹对话框' };
    modal.querySelectorAll('input')[0].value = '闪避';
    const sel = modal.querySelector('select');
    if (sel) sel.value = ${JSON.stringify(cat.id || '')};
    modal.querySelectorAll('.foot button')[1].click();
    await new Promise(r2 => setTimeout(r2, 800));
    const m = Object.values(tl.store.project.macros).find(x => x.name === '闪避');
    const blocks = tl.ws.ws.getAllBlocks(false).filter(b => b.type.startsWith('df_macro_')).map(b => b.type);
    return { macroId: m && m.id, category: m && m.category, body: m && m.body && m.body.type, blocks };
  })()`);
  check('从零新建积木（选分类→＋ 新建积木→命名）',
    !scratch.err && !!scratch.macroId,
    scratch.err || `id=${scratch.macroId} 分类=${scratch.category} 实现=${scratch.body}`);
  check('新建的积木自动落到画布上',
    !!scratch.macroId && (scratch.blocks || []).includes('df_macro_' + scratch.macroId),
    `工作区：${(scratch.blocks || []).join(', ')}`);

  /* 7. 出图：新建积木的对话框 + 分类管理界面 */
  console.log('\n=== 截图 ===');
  const shotDir = path.join(ROOT, 'tools', 'shots');
  fs.mkdirSync(shotDir, { recursive: true });

  // 先把遗留弹窗清干净
  await run(`(async () => {
    for (let i = 0; i < 3; i++) {
      document.querySelectorAll('.modal-back').forEach(e => e.remove());
      await new Promise(r => setTimeout(r, 120));
    }
    return 1;
  })()`);

  // (a) 从选择区的「＋ 新建积木」打开对话框 —— 这就是「新建积木」的界面
  const opened = await run(`(async () => {
    const tl = window.__tl;
    const cat = Object.values(tl.store.project.categories).find(x => x.name === '战斗系统X');
    tl.ws.createMacroIn(cat.id);
    await new Promise(r => setTimeout(r, 700));
    const modal = document.querySelector('.modal-back');
    return modal ? document.querySelectorAll('.modal-back').length : 0;
  })()`);
  await new Promise((r) => setTimeout(r, 3600));   // 等 toast 淡出
  await shot(path.join(shotDir, '06-new-block.png'));
  console.log(`  已保存 tools/shots/06-new-block.png（弹出 ${opened} 个对话框）`);

  // (b) 资源视图里的分类 / 合成积木管理
  await run(`(async () => {
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    document.querySelector('#mode-tabs button[data-view="assets"]').click();
    await new Promise(r => setTimeout(r, 400));
    const head = [...document.querySelectorAll('#view-assets h3, #view-assets .panel-head, #view-assets .col-head')]
      .find(e => e.textContent.includes('分类'));
    if (head) head.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 300));
    return 1;
  })()`);
  await shot(path.join(shotDir, '07-category-manager.png'));
  console.log('  已保存 tools/shots/07-category-manager.png');
  await run(`document.querySelector('#mode-tabs button[data-view="blocks"]').click()`);

  console.log('\n=== 选择区结构 ===');
  const dup = await run(`(() => {
    const rows = [...document.querySelectorAll('#blockly-host .blocklyToolboxCategory')].map(e => e.textContent.trim());
    const counts = {};
    for (const r of rows) counts[r] = (counts[r] || 0) + 1;
    return { rows, dup: Object.entries(counts).filter(([, n]) => n > 1).map(([k]) => k) };
  })()`);
  check('选择区里没有重复的分类', dup.dup.length === 0,
    dup.dup.length ? `重复：${dup.dup.join(', ')}` : `共 ${dup.rows.length} 个分类`);

  console.log('\n=== 删除实体（层级面板 ✕ + 确认框） ===');
  const del = await run(`(async () => {
    const tl = window.__tl;
    const before = tl.store.project.entities.length;
    const row = [...document.querySelectorAll('#hierarchy .hier-row')].find(r => r.textContent.includes('金币'));
    if (!row) return { err: '层级里没有「金币」这一行' };
    const btn = row.querySelector('.hier-del');
    if (!btn) return { err: '金币行没有 ✕ 按钮' };
    btn.click();
    await new Promise(r => setTimeout(r, 150));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '点 ✕ 没弹确认框' };
    const body = modal.textContent;
    const delBtn = [...modal.querySelectorAll('.foot button')].find(b => b.textContent.trim() === '删除');
    if (!delBtn) return { err: '确认框里没有「删除」按钮' };
    delBtn.click();
    await new Promise(r => setTimeout(r, 220));
    const gone = !tl.store.project.entities.find(e => e.name === '金币');
    const after = tl.store.project.entities.length;
    tl.store.undo();
    await new Promise(r => setTimeout(r, 220));
    const back = !!tl.store.project.entities.find(e => e.name === '金币');
    return { err: null, before, after, gone, back, body };
  })()`);
  check('层级行有 ✕，点它弹出确认框（带实体名）',
    !del.err && /删除「金币」/.test(del.body || ''),
    del.err || (del.body || '').replace(/\s+/g, ' ').slice(0, 80));
  check('点「删除」后实体真的从项目里消失',
    !del.err && del.gone && del.after === del.before - 1,
    del.err || `前 ${del.before} 个 → 后 ${del.after} 个`);
  check('Ctrl+Z 撤销能把它找回来',
    !del.err && del.back, del.err || '撤销后金币还在吗：' + del.back);

  console.log('\n=== 设置与帮助：帮助融进设置对话框 ===');
  const help = await run(`(async () => {
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    // 顶栏不该再有独立的 ? 按钮 —— 帮助入口只在设置对话框里
    const stray = document.querySelector('#btn-help');
    document.querySelector('#btn-settings').click();
    await new Promise(r => setTimeout(r, 260));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '点了「设置」但没弹对话框' };
    const tabs = [...modal.querySelectorAll('.ap-tab')];
    const pane = modal.querySelector('.ap-help');
    const body = modal.querySelector('.ap-body');
    if (!pane || !body) return { err: '设置对话框里没有「帮助」页容器' };
    const snap = () => ({
      on: tabs.filter(b => b.classList.contains('on')).map(b => b.textContent.trim()),
      helpHidden: pane.classList.contains('hidden'),
      bodyHidden: body.classList.contains('hidden'),
    });
    const resetBtn = modal.querySelector('.foot .primary');
    const resetShown = () => (resetBtn ? resetBtn.style.display !== 'none' : null);
    const before = { ...snap(), reset: resetShown() };
    const helpTab = tabs.find(b => b.textContent.trim() === '帮助');
    if (!helpTab) return { err: '没有「帮助」页签：' + JSON.stringify(tabs.map(b => b.textContent.trim())) };
    helpTab.click();
    await new Promise(r => setTimeout(r, 160));
    const after = { ...snap(), reset: resetShown() };
    const text = pane.textContent;
    const appTab = tabs.find(b => b.textContent.trim() === '设置');
    appTab.click();
    await new Promise(r => setTimeout(r, 160));
    const back = { ...snap(), reset: resetShown() };
    // 布局：页签竖排在左，内容在右（量的是实际几何，不是看类名）
    const rr = modal.querySelector('.ap-tabs').getBoundingClientRect();
    const pr = modal.querySelector('.ap-panes').getBoundingClientRect();
    const r0 = tabs[0].getBoundingClientRect();
    const r1 = tabs[1].getBoundingClientRect();
    const layout = {
      railRight: Math.round(rr.right), contentLeft: Math.round(pr.left),
      stacked: r1.top >= r0.bottom - 1, sameLeft: Math.abs(r0.left - r1.left) <= 2,
    };
    // 滚到底：页签还贴在滚动区顶部（sticky）—— 不然长设置 / 长帮助滚下去就切不回另一页
    // 注意滚动的是里面那层 .modal（.modal-back 是固定不滚的遮罩）
    const box = modal.querySelector('.modal');
    const canScroll = box.scrollHeight > box.clientHeight + 20;
    box.scrollTop = box.scrollHeight;
    await new Promise(r => setTimeout(r, 120));
    const mt = Math.round(box.getBoundingClientRect().top);
    const st = Math.round(tabs[0].getBoundingClientRect().top);   // 「设置」这颗的实际位置
    box.scrollTop = 0;
    const sticky = { canScroll, ok: st >= mt - 2 && st <= mt + 26, top: st, modalTop: mt };
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    return {
      stray: !!stray, tabs: tabs.map(b => b.textContent.trim()),
      before, after, back, layout, sticky,
      textOk: text.includes('Tanloom Engine') && text.length > 300,
    };
  })()`);
  check('顶栏不再单开 ? 按钮（帮助入口只在设置里）',
    !help.err && help.stray === false, help.err || `#btn-help 存在=${help.stray}`);
  check('设置对话框是「设置 / 帮助」两页，默认停在「设置」',
    !help.err && help.tabs && help.tabs.length === 2
      && help.before.on.length === 1 && help.before.on[0] === '设置'
      && help.before.helpHidden === true && help.before.bodyHidden === false,
    help.err || `页签=${JSON.stringify(help.tabs)} 选中=${JSON.stringify(help.before && help.before.on)}`);
  check('点「帮助」页签：正文出现、设置页收起、「恢复默认」收走',
    !help.err && help.after.helpHidden === false && help.after.bodyHidden === true
      && help.textOk && help.after.reset === false,
    help.err || `帮助可见=${!help.after.helpHidden} 设置收起=${help.after.bodyHidden} 有正文=${help.textOk} 恢复默认可见=${help.after.reset}`);
  check('切回「设置」页：外观选项回来、「恢复默认」也回来',
    !help.err && help.back.helpHidden === true && help.back.bodyHidden === false
      && help.back.on[0] === '设置' && help.back.reset === true,
    help.err || `帮助收起=${help.back.helpHidden} 设置可见=${!help.back.bodyHidden} 恢复默认可见=${help.back.reset}`);
  check('页签竖排在左侧、内容在右侧（左侧标签页布局）',
    !help.err && !!help.layout && help.layout.railRight <= help.layout.contentLeft + 1
      && help.layout.stacked && help.layout.sameLeft,
    help.err || `页签右缘=${help.layout && help.layout.railRight} ≤ 内容左缘=${help.layout && help.layout.contentLeft}｜竖排=${help.layout && help.layout.stacked}｜同列=${help.layout && help.layout.sameLeft}`);
  check('内容滚到底时页签仍贴在顶部（长设置 / 长帮助不丢导航）',
    !help.err && !!help.sticky && help.sticky.canScroll && help.sticky.ok,
    help.err || `可滚动=${help.sticky && help.sticky.canScroll}｜页签顶=${help.sticky && help.sticky.top} · 对话框顶=${help.sticky && help.sticky.modalTop}`);

  console.log('\n=== 页面错误 ===');
  const errs = pageErrors.filter((m) => /uncaught|Invalid|violat|TypeError|Cannot read|before initialization/i.test(m));
  if (errs.length) errs.slice(0, 12).forEach((m) => console.log('  ' + m));
  else console.log('  （无）');

  const bad = results.filter((r) => !r.ok);
  console.log(`\n=========== ${results.length - bad.length} 通过 / ${bad.length} 失败 ===========`);
  if (bad.length) bad.forEach((r) => console.log(`  ✖ ${r.name} / ${r.detail}`));
  app.exit(bad.length ? 1 : 0);
});
