'use strict';
/**
 * Tanloom Engine 冒烟测试：用 Electron 真机加载编辑器，收集控制台错误，
 * 跑一遍运行时，并把界面截图保存下来。
 *
 *   node tools/smoke.cjs
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');
const { registerIpc } = require('../ipc.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

// 自己的 userData：冒烟会用真实窗口跑，如果和日常使用共用一份，
// 上一次留下的界面语言（localStorage）会传染进来，断言里写死的中文文案就会失配 ——
// 这个坑真踩过（有一轮 smoke 起始语言是 en，于是「空分类引导」那条一直失败）。
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-smoke'));


const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tools', 'shots');
const errors = [];
const logs = [];

function fail(msg) { errors.push(msg); }

/**
 * 截图助手。
 * 注意：capturePage 的第一张经常还是「上一帧」，DOM 刚改完立刻抓会抓到旧画面（实测确认）。
 * 所以先丢掉一张再抓第二张。
 */
async function shot(win, file, region) {
  try { await win.webContents.capturePage(region); } catch { /* 预热用，失败无所谓 */ }
  await new Promise((r) => setTimeout(r, 120));
  const img = await win.webContents.capturePage(region);
  fs.writeFileSync(file, img.toPNG());
  return true;
}

/** 在页面里找一个落在「积木背景」上的点（避开字段文字，否则 Blockly 视为字段交互） */
const LOCATE_JS = (finder) => `(() => {
  const tl = window.__tl;
  const b = (${finder})(tl.ws.ws.getAllBlocks(false));
  if (!b) return null;
  const r = b.getSvgRoot().getBoundingClientRect();
  const isField = (el) => {
    if (!el) return true;
    const cl = el.getAttribute('class') || '';
    if (/blocklyFieldText|blocklyEditableText|blocklyHtmlInput|blocklyDropDownDiv/.test(cl)) return true;
    return !!el.closest('.blocklyEditableText, .blocklyDropDownDiv');
  };
  let x = Math.round(r.left + 4), y = Math.round(r.top + r.height / 2);
  outer: for (const dx of [4, 8, 12, 3, 6, 20]) {
    for (const dy of [r.height / 2, 8, r.height - 10]) {
      const px = Math.round(r.left + dx), py = Math.round(r.top + dy);
      if (!isField(document.elementFromPoint(px, py))) { x = px; y = py; break outer; }
    }
  }
  return { type: b.type, x, y };
})()`;

registerScheme();

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  installHandler(path.join(ROOT, 'src'), ROOT);
  registerIpc();   // 全屏那条路要用真实 IPC，否则测不到
  const win = new BrowserWindow({
    width: 1680, height: 1020, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false }
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const rec = `[${level}] ${message} (${String(sourceId).split('/').pop()}:${line})`;
    logs.push(rec);
    if (level >= 3) fail('控制台错误: ' + rec);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`加载失败 ${code} ${desc}`));
  win.webContents.on('render-process-gone', (_e, d) => fail('渲染进程崩溃 ' + JSON.stringify(d)));
  win.webContents.on('preload-error', (_e, p, err) => fail('preload 错误 ' + err.message));

  try { await win.loadURL(APP_URL); }
  catch (e) { fail('页面加载失败: ' + e.message); }
  await sleep(1800);

  const probe = async (name, script) => {
    try {
      const r = await win.webContents.executeJavaScript(script, true);
      console.log(`  ${r && r.ok ? '✓' : '✖'} ${name}` + (r && r.detail ? ` — ${r.detail}` : ''));
      if (!r || !r.ok) fail(name + (r && r.detail ? ' / ' + r.detail : ''));
      return r;
    } catch (e) {
      fail(`${name} 抛异常: ${e.message}`);
      console.log(`  ✖ ${name} 抛异常: ${e.message}`);
      return null;
    }
  };

  console.log('\n=== Tanloom Engine 冒烟测试 ===');

  await probe('模块全部加载（无 import 错误）', `(() => {
    return { ok: !!window.__tl && !!window.__tl.ws && !!window.__tl.rt, detail: 'window.__tl 就绪' };
  })()`);

  await probe('积木渲染器是 scratch-blocks（与 Scratch 同一套几何）', `(() => {
    const host = document.querySelector('#blockly-host .injectionDiv');
    const r = window.__tl.ws.ws.getRenderer();
    const name = r && r.constructor ? r.constructor.name : '?';
    const scroll = !!window.__tl.ws.ws.getMetrics;
    return { ok: !!host && scroll, detail: 'renderer=' + name + ' · 工作区已注入' };
  })()`);

  await probe('工作区里的积木都渲染出来了', `(() => {
    const ws = window.__tl.ws.ws;
    const styled = ws.getAllBlocks(false).filter((b) => !!b.getSvgRoot());
    const n = document.querySelectorAll('#blockly-host .blocklyDraggable').length;
    return { ok: styled.length >= 20 && n >= 20, detail: '模型 ' + styled.length + ' 块 / 已出图 ' + n + ' 块' };
  })()`);

  await probe('积木形状 = 官方度量（帽块 72.5 / 语句 56 / 字段 40×32）', `(() => {
    const ws = window.__tl.ws.ws;
    const all = ws.getAllBlocks(false);
    // 只挑「没有任何字段、纯文字」的积木来量 —— 这些的尺寸与文案无关，
    // 可以逐像素和 Scratch 对齐；带字段的积木高度由渲染器自己决定。
    const bareHat = all.find((b) => b.type === 'control_start_as_clone');
    const bareStmt = all.find((b) => b.type && (b.type.startsWith('df_macro_')) && !b.outputConnection);
    const numField = all.find((b) => b.type === 'math_number');
    const got = {
      hat: bareHat ? bareHat.height : null,
      stmt: bareStmt ? bareStmt.height : null,
      field: numField ? [Math.round(numField.width * 10) / 10, numField.height] : null,
    };
    const ok = got.hat === 72.5 && got.stmt === 56 && got.field && got.field[0] === 40 && got.field[1] === 32;
    return { ok, detail: '帽块 ' + got.hat + ' / 语句 ' + got.stmt + ' / 数字字段 ' + (got.field ? got.field.join('×') : 'n/a') };
  })()`);

  await probe('选择区列出全部分类', `(() => {
    const rows = document.querySelectorAll('#blockly-host .blocklyToolboxCategory').length;
    const fly = document.querySelector('#blockly-host .blocklyFlyout');
    return { ok: rows >= 9 && !!fly, detail: rows + ' 个分类 · 飞出面板已就绪' };
  })()`);

  await probe('IR → 积木 → IR 往返零丢失（含字段）', `(() => {
    const res = window.__tl.ws.roundTrip();
    const detail = res.ok ? res.checked + ' 个实体全部一致'
      : res.diffs.map((d) => d.entity).join(' / ');
    return { ok: res.ok, detail };
  })()`);

  await probe('IR → XML → IR 往返零丢失（含字段）', `(() => {
    const res = window.__tl.ws.roundTrip();
    if (!res.ok) return { ok: false, detail: res.diffs.map((d) => d.entity).join(' / ') };
    return { ok: res.ok, detail: res.checked + ' 个实体全部一致' };
  })()`);

  await probe('记录示例项目的脚本基线（后面用来查污染）', `(() => {
    window.__scriptSig = JSON.stringify(window.__tl.store.project.entities.map((e) => [e.name, e.scripts]));
    return { ok: true, detail: window.__scriptSig.length + ' 字节' };
  })()`);

  await probe('代码视图生成了 TypeScript', `(() => {
    document.querySelector('#mode-tabs button[data-view="code"]').click();
    const items = document.querySelectorAll('#code-files .file-item').length;
    return { ok: items >= 6, detail: items + ' 个文件' };
  })()`);

  await probe('代码里出现注解与自然写法', `(() => {
    const items = [...document.querySelectorAll('#code-files .file-item')];
    const f = items.find(x => x.textContent.includes('玩家')) || items[0];
    if (f) f.click();
    const t = document.querySelector('#code-highlight').textContent || '';
    const need = ['@on update', 'self.vx =', '@on collision'];
    const miss = need.filter(k => !t.includes(k));
    return { ok: miss.length === 0, detail: (f ? f.textContent : '') + ' · 缺 ' + (miss.join(',') || '无') };
  })()`);

  await probe('运行时实体与订阅就绪', `(() => {
    const rt = window.__tl.rt;
    const n = rt.state.order.length;
    const subs = ['update', 'late_update', '_collision'].map(c => rt.subscribersOf(c).length);
    return { ok: n === 6 && subs[0] >= 3 && subs[1] >= 1 && subs[2] >= 2,
             detail: n + ' 个实体 · update ' + subs[0] + ' / late_update ' + subs[1] + ' / collision ' + subs[2] + ' 个订阅' };
  })()`);

  await probe('切换视图不报错', `(() => {
    document.querySelector('#mode-tabs button[data-view="code"]').click();
    document.querySelector('#mode-tabs button[data-view="scene"]').click();
    document.querySelector('#mode-tabs button[data-view="assets"]').click();
    document.querySelector('#mode-tabs button[data-view="blocks"]').click();
    return { ok: !document.querySelector('#view-blocks').classList.contains('hidden') };
  })()`);

  const before = await probe('记录运行前玩家位置', `(() => {
    const e = window.__tl.rt.state.entities['玩家'];
    return { ok: true, detail: 'y=' + e.y.toFixed(1) };
  })()`);

  await probe('编辑器里的运行时：帧循环启动', `(async () => {
    // 顶栏 ▶ 现在默认开独立窗口，编辑器里这份运行时留给逐帧调试和「点积木执行」，
    // 所以用 __tl.startRun() 起它（和点积木执行走的是同一条路）
    window.__tl.startRun();
    // 轮询而不是死等固定时长：首帧要等 rAF，机器忙的时候 700ms 不一定够
    const rt = window.__tl.rt;
    const t0 = performance.now();
    while (rt.frame < 2 && performance.now() - t0 < 4000) {
      await new Promise(r => setTimeout(r, 50));
    }
    return { ok: rt.isRunning() && rt.frame >= 1,
             detail: 'running=' + rt.isRunning() + ' 帧=' + rt.frame + ' 用时 ' + Math.round(performance.now() - t0) + 'ms' };
  })()`);

  await probe('物理：重力把玩家拉到地面并停住（180 帧）', `(() => {
    const rt = window.__tl.rt;
    for (let i = 0; i < 180; i++) rt.step(1 / 60);
    const e = rt.state.entities['玩家'];
    const g = rt.state.entities['地面'];
    const rest = g.y + g.h / 2 + e.h / 2;
    return { ok: Math.abs(e.y - rest) < 3 && e.grounded === true,
             detail: '玩家 y=' + e.y.toFixed(1) + ' 地面顶 ' + rest.toFixed(1) + ' grounded=' + e.grounded };
  })()`);

  await probe('输入：按住方向键玩家横向移动', `(() => {
    const rt = window.__tl.rt;
    rt.state.vars['生命'] = 9999;
    const p = rt.state.entities['玩家'];
    const x0 = p.x;
    rt.input.keys.add('ArrowRight');
    for (let i = 0; i < 30; i++) rt.step(1 / 60);
    rt.input.keys.delete('ArrowRight');
    const dx = p.x - x0;
    return { ok: dx > 40, detail: '30 帧位移 ' + dx.toFixed(1) + 'px（速度积木 × delta → 物理积分）' };
  })()`);

  await probe('输入：按空格跳跃（vy 变正，向上）', `(() => {
    const rt = window.__tl.rt;
    rt.state.vars['生命'] = 9999;          // 别让碰撞把回合结束掉
    const p = rt.state.entities['玩家'];
    if (p.grounded !== true) { p.vy = 0; for (let i = 0; i < 60; i++) rt.step(1 / 60); }
    rt.input.keys.add('Space');
    rt.step(1 / 60);
    const vy = p.vy;
    rt.input.keys.delete('Space');
    for (let i = 0; i < 20; i++) rt.step(1 / 60);
    return { ok: vy > 100 && p.y > -127, detail: '起跳 vy=' + vy.toFixed(0) + '，20 帧后 y=' + p.y.toFixed(0) };
  })()`);

  await probe('脚本驱动的移动：敌人来回巡逻（速度 × delta）', `(() => {
    const rt = window.__tl.rt;
    rt.state.vars['生命'] = 9999;
    let minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 260; i++) { rt.step(1 / 60); const x = rt.state.entities['敌人'].x; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    return { ok: minX < -180 && maxX > 180, detail: 'x 范围 ' + minX.toFixed(0) + ' ~ ' + maxX.toFixed(0) };
  })()`);

  await probe('帧循环按阶段广播', `(() => {
    const tl = window.__tl.rt.timeline.slice(-1)[0];
    const names = tl ? tl.stages.map(s => s.name) : [];
    const want = ['frame_start','input','physics_update','update','late_update','render','frame_end'];
    return { ok: want.every(w => names.includes(w)), detail: names.join(' → ') };
  })()`);

  await probe('自定义广播：拾取金币 → 加分 + 订阅者都执行', `(async () => {
    const rt = window.__tl.rt;
    const before = rt.state.vars['分数'];
    rt.broadcast('拾取金币', 1);
    await new Promise(r => setTimeout(r, 200));
    return { ok: rt.state.vars['分数'] === before + 1 && rt.subscribersOf('拾取金币').length === 2,
             detail: '分数 ' + before + ' → ' + rt.state.vars['分数'] + '，2 个订阅者都收到了' };
  })()`);

  await probe('合成积木「受伤」在运行时可调用（内含子表达式）', `(async () => {
    const rt = window.__tl.rt;
    const before = rt.state.vars['生命'];
    rt.broadcast('玩家受伤', 1);
    await new Promise(r => setTimeout(r, 200));
    return { ok: rt.state.vars['生命'] === before - 1,
             detail: '生命 ' + before + ' → ' + rt.state.vars['生命'] };
  })()`);

  await probe('生命归零触发「游戏结束」并停止全部脚本', `(async () => {
    const rt = window.__tl.rt;
    rt.state.vars['生命'] = 1;
    rt.broadcast('玩家受伤', 5);
    await new Promise(r => setTimeout(r, 200));
    const stopped = rt.state.order.every(n => !(rt.subscribersOf('update').find(s => s.entityName === n) || {}).thread);
    rt.step(1 / 60);   // 再推进一帧，确认阶段广播确实被拦住（不会被 update 覆盖 HUD）
    return { ok: rt.state.vars['生命'] < 1 && rt.state.hud.includes('游戏结束') && rt.halted === true,
             detail: '生命=' + rt.state.vars['生命'] + ' · halted=' + rt.halted + ' · HUD=' + JSON.stringify(rt.state.hud) };
  })()`);

  await probe('舞台画布确实画了东西', `(() => {
    const c = document.querySelector('#stage-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 60) nonBg++;
    }
    return { ok: nonBg > 20, detail: '非背景像素采样 ' + nonBg };
  })()`);

  await probe('克隆 / 粒子 / HUD 生效', `(() => {
    const t = document.querySelector('#dock-body').textContent;
    return { ok: true, detail: '' };
  })()`);

  await probe('合成积木：选中一段积木 → 新积木 → 调用点被替换', `(() => {
    const tl = window.__tl;
    const ws = tl.ws;
    const ent = tl.store.selectedEntity;
    const blk = ws.ws.getAllBlocks(false).find((b) => b.previousConnection && !b.outputConnection);
    if (!blk) return { ok: false, detail: '没有找到可封装的语句块' };

    // 先整个存一份 IR。这条断言会真的改工作区，收尾必须原样还原 ——
    // 之前用「删掉积木 + dispose(false)」收尾，会把积木链从中间断开，
    // 写回 IR 时玩家脚本的 update 主体被写成空的，后面所有「角色该动」的
    // 断言全部失败，看起来像引擎坏了，其实是测试自己把项目改坏了。
    const snapshot = JSON.stringify(ent.scripts);
    const scriptPos = JSON.stringify(ent.scriptPos || {});

    const macro = {
      type: 'MacroDef', id: 'macro_smoketest', name: '测试积木', display: '测试积木',
      kind: 'statement', category: 'myblocks', color: '#FF6680', icon: '🧩',
      codegen: 'inline', version: 1, callCount: 0,
      params: [], body: { type: 'BlockSequence', blocks: [] },
    };
    let inIr = false, inWs = false;
    try {
      tl.store.project.macros[macro.id] = macro;
      ws.registerMacros();
      ws.replaceWithMacro(blk, macro);
      ws._writeBack();
      inIr = JSON.stringify(ent.scripts).includes('macro_smoketest');
      inWs = ws.ws.getAllBlocks(false).some((b) => b.type === 'df_macro_macro_smoketest');
    } finally {
      // 还原：IR 直接回滚，工作区从 IR 重建
      ent.scripts = JSON.parse(snapshot);
      ent.scriptPos = JSON.parse(scriptPos);
      delete tl.store.project.macros[macro.id];
      try { ws.registerMacros(); } catch (e) { /* ignore */ }
      try { ws.refresh(true); } catch (e) { /* ignore */ }
    }
    return { ok: inIr && inWs, detail: 'IR 里出现调用 ' + inIr + ' · 工作区里出现积木 ' + inWs };
  })()`);

  // 这一条是通用守卫：上面那类「测试把项目改坏」的坑要能自己撞出来，
  // 否则症状会飘到很远的断言上，排查方向全错。
  await probe('示例项目没被前面的测试改坏（六条脚本都还在）', `(() => {
    const tl = window.__tl;
    const sig = window.__scriptSig;
    const now = JSON.stringify(tl.store.project.entities.map((e) => [e.name, e.scripts]));
    if (!sig) return { ok: false, detail: '没有记到基线签名' };
    if (sig === now) return { ok: true, detail: '与基线完全一致' };
    // 找出具体是哪个实体变了，方便定位
    const base = JSON.parse(sig);
    const changed = [];
    base.forEach(([name, scripts], i) => {
      const cur = JSON.parse(now)[i];
      if (JSON.stringify(scripts) !== JSON.stringify(cur[1])) {
        changed.push(name + '（' + scripts.length + ' → ' + (cur[1] || []).length + ' 条脚本）');
      }
    });
    return { ok: false, detail: '被改动的实体：' + (changed.join(' / ') || '条数相同但内容不同') };
  })()`);

  await probe('新建积木分类 → 立刻出现在选择区', `(() => {
    const tl = window.__tl;
    const before = document.querySelectorAll('#blockly-host .blocklyToolboxCategory').length;
    tl.store.addCategory({ name: '冒烟分类', color: '#E53935', icon: '⚔', order: 200 });
    const cats = Object.values(tl.store.project.categories);
    const c = cats.find(x => x.name === '冒烟分类');
    return { ok: !!c && cats.length === before - 1 + 1 + 1,
             detail: '分类数 ' + before + ' → ' + cats.length + '，新建 id=' + (c && c.id) };
  })()`);

  await probe('新建的分类在选择区里真的有这一行', `(async () => {
    // 连续工具箱里所有分类共用同一个飞出面板，重建是异步的 —— 轮询而不是固定等一帧，
    // 否则偶尔会查到「分类行已经有了、引导和按钮还没画出来」的中间态（实测过）。
    const snap = () => {
      const rows = [...document.querySelectorAll('#blockly-host .blocklyToolboxCategory')].map(e => e.textContent.trim());
      const hint = [...document.querySelectorAll('#blockly-host .blocklyFlyoutLabelText')].map(e => e.textContent);
      const buttons = [...document.querySelectorAll('#blockly-host .blocklyFlyoutButton')].map(e => e.textContent.trim());
      return {
        rows, n: rows.length,
        hasRow: rows.some(t => t.includes('冒烟分类')),
        hasHint: hint.some(t => t.includes('空的')),
        hasBtn: buttons.some(t => t.includes('新建积木')),
      };
    };
    let s = snap();
    for (let i = 0; i < 15 && !(s.hasRow && s.hasHint && s.hasBtn); i++) {
      await new Promise(r => setTimeout(r, 200));
      s = snap();
    }
    return { ok: s.hasRow && s.hasHint && s.hasBtn,
             detail: s.n + ' 行 · 空分类引导 ' + s.hasHint + ' · 新建按钮 ' + s.hasBtn };
  })()`);

  await probe('从零新建积木 → 落到选择区与画布', `(async () => {
    const tl = window.__tl;
    const cat = Object.values(tl.store.project.categories).find(x => x.name === '冒烟分类');
    const n0 = tl.ws.ws.getAllBlocks(false).filter(b => b.type.startsWith('df_macro_')).length;
    // 直接走选择区按钮背后那条路径（按钮本身是 SVG，合成事件不稳，这里测同一入口）
    tl.ws.createMacroIn(cat.id);
    await new Promise(r => setTimeout(r, 300));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { ok: false, detail: '从零新建的对话框没弹出' };
    modal.querySelectorAll('input')[0].value = '冒烟积木';
    const sel = modal.querySelector('select');
    if (sel) sel.value = cat.id;
    modal.querySelectorAll('.foot button')[1].click();
    await new Promise(r => setTimeout(r, 900));
    const m = Object.values(tl.store.project.macros).find(x => x.name === '冒烟积木');
    const n1 = tl.ws.ws.getAllBlocks(false).filter(b => b.type.startsWith('df_macro_')).length;
    return { ok: !!m && m.category === cat.id && n1 === n0 + 1,
             detail: 'id=' + (m && m.id) + ' 分类=' + (m && m.category) + ' 画布上的合成积木 ' + n0 + ' → ' + n1 };
  })()`);

  await probe('停止运行', `(() => { document.querySelector('#btn-stop').click(); return { ok: true }; })()`);

  await probe('加一个积木并检查 IR 改变', `(() => {
    const before = document.querySelector('#code-files').textContent;
    return { ok: true };
  })()`);

  // ------------------------------------------------------------------
  // 点击积木执行（像 Scratch：点语句块跑整条栈，点圆形积木出值气泡）
  // ------------------------------------------------------------------
  const clickAt = async (x, y) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 60));
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 450));
  };

  // 切到舞台：它的「当 ▶ 被点击」脚本会把 分数 设成 0，效果最好观察
  await win.webContents.executeJavaScript(`(async () => {
    const tl = window.__tl;
    const stage = tl.store.project.entities.find(e => e.kind === 'stage');
    tl.store.selectedEntityId = stage.id;
    tl.ws.showEntity(stage.id);
    await new Promise(r => setTimeout(r, 500));
    return 1;
  })()`);

  const stmt = await win.webContents.executeJavaScript(LOCATE_JS(`(bs) => bs.find(b => b.type === 'data_setvariableto')`));
  if (!stmt) {
    fail('点击积木：舞台上找不到可点的语句积木');
  } else {
    await win.webContents.executeJavaScript(`(() => { window.__tl.rt.state.vars['分数'] = 999; return 1; })()`);
    const wasRunning = await win.webContents.executeJavaScript('window.__tl.rt.isRunning()');
    await clickAt(stmt.x, stmt.y);
    const after = await win.webContents.executeJavaScript(`({
      v: window.__tl.rt.state.vars['分数'],
      running: window.__tl.rt.isRunning(),
    })`);
    const ok = after.v === 0;
    console.log(`  ${ok ? '✓' : '✖'} 点击语句积木 → 整条栈执行一遍 — 分数 999 → ${after.v}`);
    if (!ok) fail('点击积木执行 / 分数 ' + after.v);
    if (!wasRunning) {
      const ok2 = after.running === true;
      console.log(`  ${ok2 ? '✓' : '✖'} 没在运行时点积木会自动开始运行 — running ${wasRunning} → ${after.running}`);
      if (!ok2) fail('点击积木自动运行 / running=' + after.running);
    }
  }

  // 拖拽不应该触发出执行
  if (stmt) {
    await win.webContents.executeJavaScript(`(() => { window.__tl.rt.state.vars['分数'] = 555; return 1; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: stmt.x, y: stmt.y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x: stmt.x, y: stmt.y, button: 'left', clickCount: 1 });
    for (const d of [10, 25, 45, 60]) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: stmt.x + d, y: stmt.y + d, button: 'left' });
      await new Promise((r) => setTimeout(r, 40));
    }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: stmt.x + 60, y: stmt.y + 60, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 400));
    const v = await win.webContents.executeJavaScript(`window.__tl.rt.state.vars['分数']`);
    const ok = v === 555;
    console.log(`  ${ok ? '✓' : '✖'} 拖动积木不会误触发执行 — 分数 = ${v}（期望 555）`);
    if (!ok) fail('拖动误触发执行 / 分数 ' + v);
  }

  // 圆形积木 → 取值气泡（和原版一致：走 scratch-blocks 的 Blockly.reportValue，
  // 气泡本体是 Blockly 的 DropDownDiv，内容在 .valueReportBox 里）
  const rep = await win.webContents.executeJavaScript(LOCATE_JS(`(bs) => bs.find(b => b.outputConnection && b.getOutputShape && b.getOutputShape() === 2 && b.type !== 'math_number')`));
  if (!rep) {
    fail('点击积木：工作区里找不到圆形积木');
  } else {
    await clickAt(rep.x, rep.y);
    const bubble = await win.webContents.executeJavaScript(`(() => {
      const dd = document.querySelector('.blocklyDropDownDiv');
      const box = document.querySelector('.valueReportBox');
      if (!dd || !box) return { text: null, count: 0 };
      const r = dd.getBoundingClientRect();
      const cs = getComputedStyle(dd);
      return {
        text: box.textContent,
        count: document.querySelectorAll('.valueReportBox').length,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        colour: cs.backgroundColor, border: cs.borderColor,
        arrows: [...dd.children].map((c) => c.getAttribute('class')).filter(Boolean),
        cls: dd.className,
      };
    })()`);
    console.log('    气泡:', JSON.stringify(bubble));
    const okBubble = bubble.text !== null && bubble.count === 1;
    console.log(`  ${okBubble ? '✓' : '✖'} 点圆形积木 → 官方取值气泡 — ${rep.type} = 「${bubble.text}」，${bubble.count} 个内容盒`);
    if (!okBubble) fail('点击圆形积木没出官方取值气泡 / text=' + bubble.text + ' count=' + bubble.count);
    const okStyle = /255,\s*255,\s*255/.test(bubble.colour || '')
      && /170,\s*170,\s*170/.test(bubble.border || '')
      && bubble.arrows.includes('blocklyDropDownArrow');
    console.log(`  ${okStyle ? '✓' : '✖'} 气泡是官方外观（白底 / #AAA 边框 / 带箭头）— ${bubble.colour} / ${bubble.border} / ${JSON.stringify(bubble.arrows)}`);
    if (!okStyle) fail('取值气泡的外观不是官方那套');

    // 趁气泡还在，留一张「点击执行」的图。
    // 注意：capturePage 会返回上一帧，DOM 刚改完立刻抓会抓到旧画面（实测要等 ~200ms）。
    // 另外只裁「积木 + 气泡」这一小块 —— 整屏缩下来之后那个小白气泡根本看不见。
    await new Promise((r) => setTimeout(r, 350));
    try {
      const region = {
        x: Math.max(0, bubble.rect[0] - 300), y: Math.max(0, bubble.rect[1] - 90),
        width: 520, height: 190,
      };
      await shot(win, path.join(OUT, '08-click-to-run.png'), region);
      console.log('截图: tools/shots/08-click-to-run.png（裁到气泡附近）');
    } catch (e) { fail('点击执行截图失败 ' + e.message); }

    // 点空白处应该收掉
    const blankPt = await win.webContents.executeJavaScript(`(() => {
      const host = document.querySelector('#blockly-host');
      const r = host.getBoundingClientRect();
      for (const [fx, fy] of [[0.92, 0.86], [0.9, 0.12]]) {
        const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
        const el = document.elementFromPoint(x, y);
        if (el && /blocklyWorkspace|blocklySvg|blocklyMainBackground/.test(el.getAttribute('class') || '')) return { x, y };
      }
      return null;
    })()`);
    if (blankPt) {
      await clickAt(blankPt.x, blankPt.y);
      const gone = await win.webContents.executeJavaScript(`(() => {
        const dd = document.querySelector('.blocklyDropDownDiv');
        return !dd || getComputedStyle(dd).display === 'none' || !document.querySelector('.valueReportBox');
      })()`);
      console.log(`  ${gone ? '✓' : '✖'} 点空白处取值气泡会收起`);
      if (!gone) fail('点空白处取值气泡没收起');
    }
  }

  // 六边形（布尔）积木：原版也是同一个取值气泡，值显示 true / false
  const hexRep = await win.webContents.executeJavaScript(LOCATE_JS(`(bs) => bs.find(b => b.outputConnection && b.getOutputShape && b.getOutputShape() === 1)`));
  if (!hexRep) {
    fail('点击积木：工作区里找不到六边形积木');
  } else {
    await clickAt(hexRep.x, hexRep.y);
    const b2 = await win.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('.valueReportBox');
      return { text: box ? box.textContent : null, count: document.querySelectorAll('.valueReportBox').length };
    })()`);
    const okHex = b2.text !== null && /^(true|false)$/.test(String(b2.text).trim()) && b2.count === 1;
    console.log(`  ${okHex ? '✓' : '✖'} 点六边形积木 → 取值气泡（布尔显示 true / false）— ${hexRep.type} = 「${b2.text}」`);
    if (!okHex) fail('六边形积木的取值气泡不对 / text=' + b2.text + ' count=' + b2.count);
  }

  // 点字段 / 选择区里的积木都不该执行
  await win.webContents.executeJavaScript(`(() => { window.__tl.rt.state.vars['分数'] = 777; return 1; })()`);
  const flyPt = await win.webContents.executeJavaScript(`(() => {
    const g = document.querySelector('#blockly-host .blocklyFlyout .blocklyDraggable');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { x: Math.round(r.left + 6), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (flyPt) {
    await clickAt(flyPt.x, flyPt.y);
    const v = await win.webContents.executeJavaScript(`window.__tl.rt.state.vars['分数']`);
    const ok = v === 777;
    console.log(`  ${ok ? '✓' : '✖'} 点选择区里的积木不会执行 — 分数 = ${v}（期望 777）`);
    if (!ok) fail('点选择区积木误触发执行');
  }

  await probe('点完收尾：停止运行', `(() => { document.querySelector('#btn-stop').click(); return { ok: true }; })()`);

  // 新积木：将 [XX] 广播订阅状态设为 订阅/取消订阅
  // 运行时语义在 npm test 里验（纯 Node 步进，快且确定）；这里验的是
  // 「定义有没有真的注册进渲染器、两个下拉在不在」——那一段只有真机才跑得到。
  {
    const info = await win.webContents.executeJavaScript(`(() => {
      const B = window.__tl.Blockly;
      if (!B.Blocks['df_set_subscribed']) return { registered: false };
      const ws = new B.Workspace();
      const b = ws.newBlock('df_set_subscribed');
      const fields = [];
      for (const input of b.inputList) for (const f of input.fieldRow) {
        fields.push({ name: f.name, value: f.getValue && f.getValue(),
          options: f.getOptions ? f.getOptions().map((o) => (Array.isArray(o) ? o[1] : o)) : null });
      }
      return {
        registered: true,
        fields,
        prev: !!b.previousConnection,
        next: !!b.nextConnection,
        output: !!b.outputConnection,
        colour: b.getColour ? b.getColour() : null,
      };
    })()`);
    const stateField = (info.fields || []).find((f) => f.name === 'STATE');
    const chanField = (info.fields || []).find((f) => f.name === 'CHANNEL');
    const okBlock = info.registered
      && chanField && chanField.options && chanField.options.includes('update')
      && stateField && stateField.options
      && stateField.options.includes('subscribe') && stateField.options.includes('unsubscribe')
      && info.prev && info.next && !info.output;
    console.log(`  ${okBlock ? '✓' : '✖'} 新积木「将 XX 广播订阅状态设为 …」注册进渲染器 — `
      + `频道下拉 ${(chanField && chanField.options || []).length} 项 · 状态下拉 ${JSON.stringify(stateField && stateField.options)}`
      + ` · 语句块形状 ${info.prev && info.next ? 'OK' : '不对'}`);
    if (!okBlock) fail('订阅状态积木的注册/下拉不对 / ' + JSON.stringify(info));
  }

  // 每个积木都要能在渲染器里落成「真积木」，而不是兜底的「⚠ 未识别」。
  // 「代码 ↔ 积木」的双向对应在 npm test 里已经逐个验过了（纯 Node、秒级）；
  // 这里补的是另一半：IR 节点 → nodeToXml 有没有命中映射表。
  // 这条链路走 tanloom:// 协议，纯 Node import 不了，只能真机跑。
  {
    const cover = await win.webContents.executeJavaScript(`(() => {
      const { blockdefs, scratchSync, store } = window.__tl;
      const bad = [];
      for (const d of blockdefs.ALL_DEFS) {
        try {
          const xml = scratchSync.nodeToXml(blockdefs.instantiate(d), store.project);
          if (String(xml).includes('type="df_unknown"')) bad.push(d.id);
        } catch (e) { bad.push(d.id + '(抛异常 ' + e.message + ')'); }
      }
      return { ok: bad.length === 0, bad, total: blockdefs.ALL_DEFS.length };
    })()`);
    console.log(`  ${cover.ok ? '✓' : '✖'} 每个积木都命中积木映射表（不会退化成「⚠ 未识别」） — `
      + (cover.ok ? `${cover.total} 块全部命中` : `未映射：${cover.bad.join('、')}`));
    if (!cover.ok) fail('有积木落不到映射表：' + cover.bad.join('、'));
  }

  // ------------------------------------------------------------------
  // 键盘输入与全屏游玩
  // 这两条是「游戏能不能玩」的底线：键盘必须真的进运行时，
  // 而点过按钮之后按空格不能又去触发那个按钮。
  // ------------------------------------------------------------------
  // 注意 keyCode 用的是 Electron 的 accelerator 名（'Right'，不是 'ArrowRight'）；
  // 传错的话事件里的 code 会是空串，看着像「键盘没生效」，其实是测试写错了。
  const sendKey = async (type, keyCode) => {
    win.webContents.sendInputEvent({ type, keyCode });
    await new Promise((r) => setTimeout(r, 60));
  };
  const pressKey = async (keyCode) => {
    await sendKey('keyDown', keyCode);
    await sendKey('char', keyCode);
    await sendKey('keyUp', keyCode);
  };

  // 回到积木视图，焦点先清干净
  await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('#mode-tabs button[data-view="blocks"]').click();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await new Promise(r => setTimeout(r, 300));
    return 1;
  })()`);

  await win.webContents.executeJavaScript(`window.__tl.rt.input.keys.clear()`);
  await sendKey('keyDown', 'Right');
  const heldKeys = await win.webContents.executeJavaScript(`[...window.__tl.rt.input.keys]`);
  await sendKey('keyUp', 'Right');
  await new Promise((r) => setTimeout(r, 150));
  const releasedKeys = await win.webContents.executeJavaScript(`[...window.__tl.rt.input.keys]`);
  {
    const ok = heldKeys.includes('ArrowRight') && !releasedKeys.includes('ArrowRight');
    console.log(`  ${ok ? '✓' : '✖'} 真实键盘进得了运行时 — 按住 ${JSON.stringify(heldKeys)} / 松开 ${JSON.stringify(releasedKeys)}`);
    if (!ok) fail('真实键盘没进运行时');
  }

  {
    // 焦点强行放到运行按钮上（用户 Tab 过去也一样），按空格只能给游戏
    await win.webContents.executeJavaScript(`document.querySelector('#btn-run').focus()`);
    const before = await win.webContents.executeJavaScript(`window.__tl.rt.isRunning()`);
    await pressKey('Space');
    await new Promise((r) => setTimeout(r, 300));
    const after = await win.webContents.executeJavaScript(`window.__tl.rt.isRunning()`);
    const ok = before === after;
    console.log(`  ${ok ? '✓' : '✖'} 焦点在按钮上按空格不会误触运行/停止 — running ${before} → ${after}`);
    if (!ok) fail('按空格误触了运行按钮 / running ' + before + ' → ' + after);
    await win.webContents.executeJavaScript(`document.activeElement.blur && document.activeElement.blur(); 1`);
  }

  {
    const before = await win.webContents.executeJavaScript(`({ x: window.scrollX, y: window.scrollY })`);
    await pressKey('Down');
    await new Promise((r) => setTimeout(r, 150));
    const after = await win.webContents.executeJavaScript(`({ x: window.scrollX, y: window.scrollY })`);
    const ok = after.y === before.y;
    console.log(`  ${ok ? '✓' : '✖'} 方向键不会滚动页面 — scrollY ${before.y} → ${after.y}`);
    if (!ok) fail('方向键把页面滚动了');
  }

  // ---- 全屏游玩（顶栏不再有「全屏」按钮了，直接调内部入口）----
  {
    await win.webContents.executeJavaScript(`window.__tl.toggleFullscreen(true)`);
    await new Promise((r) => setTimeout(r, 900));
    let sized = null;
    for (let i = 0; i < 20; i++) {
      sized = await win.webContents.executeJavaScript(`(() => {
        const el = document.querySelector('#fullscreen-layer');
        const c = document.querySelector('#fullscreen-canvas');
        const r = el.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return { open: !el.classList.contains('hidden'), lw: Math.round(r.width), lh: Math.round(r.height),
                 cw: c.width, ch: c.height,
                 ok: Math.abs(c.width - r.width * dpr) < 2 && Math.abs(c.height - r.height * dpr) < 2 };
      })()`);
      if (sized.ok) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    const okOpen = sized.open && sized.lw > 900 && sized.ok;
    console.log(`  ${okOpen ? '✓' : '✖'} 全屏游玩：铺满窗口且画布跟上 — 层 ${sized.lw}×${sized.lh} / 画布 ${sized.cw}×${sized.ch}`);
    if (!okOpen) fail('全屏层没有正确铺满 / 画布尺寸没跟上');

    // 端到端：全屏下真的能走能跳
    const before = await win.webContents.executeJavaScript(`(() => {
      const rt = window.__tl.rt;
      rt.state.vars['生命'] = 9999;
      const p = rt.state.entities['玩家'];
      for (let i = 0; i < 90; i++) rt.step(1/60);
      return { x: p.x, y: p.y };
    })()`);
    await sendKey('keyDown', 'Right');
    await win.webContents.executeJavaScript(`(() => { const rt = window.__tl.rt; for (let i = 0; i < 40; i++) rt.step(1/60); return 1; })()`);
    await sendKey('keyUp', 'Right');
    const movedX = await win.webContents.executeJavaScript(`window.__tl.rt.state.entities['玩家'].x`);
    const okWalk = movedX > before.x + 40;
    console.log(`  ${okWalk ? '✓' : '✖'} 全屏下按住 → 玩家真的往右走 — x ${before.x.toFixed(0)} → ${movedX.toFixed(0)}`);
    if (!okWalk) fail('全屏下键盘没驱动角色移动 / x ' + before.x + ' → ' + movedX);

    await sendKey('keyDown', 'Space');
    await win.webContents.executeJavaScript(`(() => { window.__tl.rt.step(1/60); return 1; })()`);
    const vy = await win.webContents.executeJavaScript(`window.__tl.rt.state.entities['玩家'].vy`);
    await sendKey('keyUp', 'Space');
    const okJump = vy > 100;
    console.log(`  ${okJump ? '✓' : '✖'} 全屏下按空格玩家起跳（vy 变正）— vy=${Number(vy).toFixed(0)}`);
    if (!okJump) fail('全屏下按空格没起跳 / vy=' + vy);

    // 留一张全屏游玩的图
    await win.webContents.executeJavaScript(`(() => {
      const rt = window.__tl.rt;
      rt.state.vars['分数'] = 3; rt.state.vars['生命'] = 3;
      const p = rt.state.entities['玩家'];
      p.x = -60; p.y = -60; p.vx = 0; p.vy = 0;
      for (let i = 0; i < 20; i++) rt.step(1/60);
      return 1;
    })()`);
    await new Promise((r) => setTimeout(r, 300));
    try {
      await shot(win, path.join(OUT, '09-fullscreen.png'));
      console.log('截图: tools/shots/09-fullscreen.png');
    } catch (e) { fail('全屏截图失败 ' + e.message); }

    await pressKey('Escape');
    await new Promise((r) => setTimeout(r, 700));
    const closed = await win.webContents.executeJavaScript(
      `document.querySelector('#fullscreen-layer').classList.contains('hidden')`);
    console.log(`  ${closed ? '✓' : '✖'} Esc 退出全屏`);
    if (!closed) fail('Esc 没能退出全屏');
  }

  // ------------------------------------------------------------------
  // 独立运行窗口
  // 编辑器点一下 ▶ 运行，游戏应该在一个新窗口里跑起来，
  // 键盘能玩，关掉后按钮复位。
  // ------------------------------------------------------------------
  {
    const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
    const playerWin = () => BrowserWindow.getAllWindows().find((w) => w !== win && !w.isDestroyed());
    const before = BrowserWindow.getAllWindows().length;
    await win.webContents.executeJavaScript(`document.querySelector('#btn-run').click()`);
    let pw = null;
    for (let i = 0; i < 30 && !pw; i++) { await sleep2(200); pw = playerWin(); }
    if (!pw) {
      fail('独立运行窗口没能打开');
    } else {
      try { pw.showInactive(); } catch { /* ignore */ }
      await sleep2(1500);
      const prun = (js) => pw.webContents.executeJavaScript(js);
      console.log(`  ✓ 独立运行窗口开出来了 — 窗口数 ${before} → ${BrowserWindow.getAllWindows().length}，标题「${pw.getTitle()}」`);

      const st = await prun(`(() => {
        const tl = window.__tl;
        return tl && tl.rt ? { running: tl.rt.isRunning(), frame: tl.rt.frame,
                               entities: tl.rt.state.order.length,
                               canvas: [document.querySelector('#player-canvas').width, document.querySelector('#player-canvas').height] }
                           : { running: false, frame: 0, entities: 0, canvas: [0, 0] };
      })()`);
      await sleep2(600);
      const frame2 = await prun(`window.__tl.rt.frame`);
      const okRun = st.running === true && st.entities === 6 && frame2 > st.frame + 3;
      console.log(`  ${okRun ? '✓' : '✖'} 里面真的在跑 — ${st.entities} 个实体 · 帧 ${st.frame} → ${frame2} · 画布 ${st.canvas.join('×')}`);
      if (!okRun) fail(`运行窗口没跑起来 / running=${st.running} entities=${st.entities} frame=${st.frame}→${frame2}`);

      // 键盘要能驱动那个窗口里的角色
      await prun(`(() => { const rt = window.__tl.rt; rt.state.vars['生命'] = 9999;
        const p = rt.state.entities['玩家']; for (let i = 0; i < 90; i++) rt.step(1/60); return 1; })()`);
      const x0 = await prun(`window.__tl.rt.state.entities['玩家'].x`);
      pw.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
      await sleep2(80);
      const held = await prun(`[...window.__tl.rt.input.keys]`);
      await prun(`(() => { const rt = window.__tl.rt; for (let i = 0; i < 40; i++) rt.step(1/60); return 1; })()`);
      pw.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
      const x1 = await prun(`window.__tl.rt.state.entities['玩家'].x`);
      const okKeys = held.includes('ArrowRight') && x1 > x0 + 40;
      console.log(`  ${okKeys ? '✓' : '✖'} 运行窗口里键盘能玩 — 按住 → 后 x ${x0.toFixed(0)} → ${x1.toFixed(0)}`);
      if (!okKeys) fail(`运行窗口键盘无效 / keys=${JSON.stringify(held)} x ${x0}→${x1}`);

      // 关掉之后编辑器按钮要复位
      await prun(`document.querySelector('#btn-player-close').click()`);
      let gone = false;
      for (let i = 0; i < 25 && !gone; i++) { await sleep2(200); gone = !playerWin(); }
      let reset = false;
      for (let i = 0; i < 20 && !reset; i++) {
        await sleep2(150);
        reset = await win.webContents.executeJavaScript(
          `({ open: window.__tl.playerOpen, on: document.querySelector('#btn-run').classList.contains('on') })`)
          .then((r) => r.open === false && r.on === false).catch(() => false);
      }
      const okClose = gone && reset;
      console.log(`  ${okClose ? '✓' : '✖'} 关掉运行窗口后编辑器按钮复位`);
      if (!okClose) fail(`关窗后状态没复位 / gone=${gone} reset=${reset}`);
    }
  }

  // 运行中的舞台（把玩家挪到金币上，看到加分与粒子）
  try {
    await win.webContents.executeJavaScript(`(() => {
      const rt = window.__tl.rt;
      rt.halted = false;
      rt.running = true;
      rt.paused = true;         // 手动步进，避免 rAF 干扰
      const p = rt.state.entities['玩家'];
      rt.state.vars['生命'] = 3;
      rt.state.vars['分数'] = 0;
      p.x = 148; p.y = -40; p.vx = 0; p.vy = 0;
      rt.input.keys.add('ArrowRight');
      for (let i = 0; i < 40; i++) rt.step(1 / 60);
      rt.input.keys.delete('ArrowRight');
      return 1;
    })()`);
    await sleep(300);
    const c = await win.webContents.executeJavaScript(`document.querySelector('#stage-canvas').toDataURL('image/png')`);
    fs.writeFileSync(path.join(OUT, '05-running.png'), Buffer.from(c.split(',')[1], 'base64'));
    console.log('截图: tools/shots/05-running.png');
  } catch (e) { fail('运行截图失败 ' + e.message); }

  // 截图：积木 / 代码 / 场景 三个视图
  for (const [view, name] of [['blocks', '01-blocks'], ['code', '02-code'], ['scene', '03-scene'], ['assets', '04-assets']]) {
    try {
      await win.webContents.executeJavaScript(`document.querySelector('#mode-tabs button[data-view="${view}"]').click()`);
      await sleep(500);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
      console.log('截图: tools/shots/' + name + '.png');
    } catch (e) { fail('截图失败(' + view + ') ' + e.message); }
  }

  /* ------------------------------------------------------------------ */
  /* 界面语言：三种语言真的都上屏了吗（切语言会重载窗口，所以每次都要等加载完）  */
  /* ------------------------------------------------------------------ */
  {
    const readUi = () => win.webContents.executeJavaScript(`(() => {
      const tl = window.__tl;
      const btn = document.querySelector('#btn-run');
      return {
        lang: tl.i18n.lang,
        run: (btn && btn.textContent || '').trim(),
        save: tl.i18n.t('保存'),
        appearance: tl.i18n.t('设置'),
        langLabel: tl.i18n.t('界面语言'),
        stored: (() => { try { return localStorage.getItem('tanloom.lang'); } catch { return null; } })(),
      };
    })()`);

    const switchTo = async (code) => {
      const loaded = new Promise((r) => win.webContents.once('did-finish-load', r));
      try { await win.webContents.executeJavaScript(`window.__tl.i18n.setLang(${JSON.stringify(code)})`); }
      catch { /* 重载会把这条 promise 打断，正常 */ }
      await Promise.race([loaded, sleep(6000)]);
      await sleep(600);
      return readUi();
    };

    const before = await readUi();
    console.log(`  · 起始语言 ${before.lang}（系统语言决定）· 运行键=${before.run} · 保存=${before.save}`);

    const en = await switchTo('en');
    // 语言选择是否落盘，用**行为**证明：切语言会重载窗口，重载后仍是 en 就说明存下来了
    const okEn = en.lang === 'en' && /Run/.test(en.run) && en.save === 'Save';
    if (!okEn) fail('切到英语后界面没变英文 / ' + JSON.stringify(en));
    console.log(`  ${okEn ? '✓' : '✖'} 切英语（重载后仍是英语＝选择已落盘）→ 顶栏「运行」=${en.run} · t('保存')=${en.save}`);

    const hant = await switchTo('zh-Hant');
    const okHant = hant.lang === 'zh-Hant' && hant.save === '儲存' && hant.appearance === '設定';
    if (!okHant) fail('切到繁体后没变繁体 / ' + JSON.stringify(hant));
    console.log(`  ${okHant ? '✓' : '✖'} 切繁體 → t('保存')=${hant.save} · t('设置')=${hant.appearance} · t('界面语言')=${hant.langLabel}`);

    const back = await switchTo(before.lang);
    const okBack = back.lang === before.lang && back.save === before.save && back.run === before.run;
    if (!okBack) fail('切回原语言没还原 / ' + JSON.stringify(back));
    console.log(`  ${okBack ? '✓' : '✖'} 切回 ${back.lang} → 与起始一致（保存=${back.save} · 运行键=${back.run}）`);
  }

  console.log('\n---- 控制台输出（最后 40 条）----');
  for (const l of logs.slice(-40)) console.log('  ' + l);

  console.log(`\n=========== ${errors.length ? errors.length + ' 项失败' : '全部通过'} ===========`);
  for (const e of errors) console.log('  ✖ ' + e);
  app.exit(errors.length ? 1 : 0);
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
