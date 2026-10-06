'use strict';
/**
 * 独立运行窗口的现场验证
 *   node tools/electron.cjs tools/probe-player.cjs
 *
 * 这条路跨了两个进程（编辑器 / 运行窗口），只看截图看不出对错，所以逐项核：
 * 窗口真的开出来了、里面真的在跑、键盘能驱动角色、编辑器改完会热重载、
 * 关掉之后编辑器按钮状态复位。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');
const { registerIpc } = require('../ipc.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-player'));
registerScheme();

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  installHandler(path.join(ROOT, 'src'), ROOT);
  registerIpc();

  const win = new BrowserWindow({
    width: 1680, height: 1020, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  const logs = [];
  win.webContents.on('console-message', (e) => { const m = (e && e.message) || ''; if (m) logs.push('[编辑器] ' + m); });
  await win.loadURL(APP_URL);
  await sleep(2400);
  const run = (js) => win.webContents.executeJavaScript(js);

  /** 找运行窗口（不是编辑器那个） */
  const playerWin = () => BrowserWindow.getAllWindows().find((w) => w !== win && !w.isDestroyed());

  /* ---- 1. 点按钮开窗 ---- */
  console.log('\n=== 1. 点「▶ 运行」（默认就是开独立窗口） ===');
  {
    const before = BrowserWindow.getAllWindows().length;
    await run(`document.querySelector('#btn-run').click()`);
    let pw = null;
    for (let i = 0; i < 30 && !pw; i++) { await sleep(200); pw = playerWin(); }
    check('运行窗口开出来了', !!pw && BrowserWindow.getAllWindows().length === before + 1,
      `窗口数 ${before} → ${BrowserWindow.getAllWindows().length}`);
    if (!pw) { console.log('\n开不出窗口，后续跳过'); app.exit(1); return; }

    pw.webContents.on('console-message', (e) => { const m = (e && e.message) || ''; if (m) logs.push('[运行窗口] ' + m); });
    // 让它可见但不抢焦点，rAF 才会走
    try { pw.showInactive(); } catch { /* ignore */ }
    await sleep(1400);

    const title = pw.getTitle();
    check('窗口标题带项目名', /运行/.test(title), title);
    const ratio = await run(`(() => {
      const s = window.__tl.store.project.settings;
      return { sw: s.stageWidth, sh: s.stageHeight };
    })()`);
    const [cw, ch] = pw.getContentSize();
    const want = ratio.sw / ratio.sh;
    const got = cw / Math.max(1, ch - 46);
    check('窗口大小按舞台比例', Math.abs(want - got) < 0.12,
      `舞台 ${ratio.sw}×${ratio.sh} → 窗口内容 ${cw}×${ch}（比例 ${got.toFixed(2)} vs ${want.toFixed(2)}）`);
  }

  const pw = playerWin();
  const prun = (js) => pw.webContents.executeJavaScript(js);

  /* ---- 2. 里面真的在跑 ---- */
  console.log('\n=== 2. 运行窗口里真的在跑 ===');
  {
    const r = await prun(`(() => {
      const tl = window.__tl;
      if (!tl || !tl.rt) return { ready: false };
      return {
        ready: true,
        running: tl.rt.isRunning(),
        frame: tl.rt.frame,
        project: tl.project && tl.project.name,
        entities: tl.rt.state.order.length,
        canvas: [document.querySelector('#player-canvas').width, document.querySelector('#player-canvas').height],
      };
    })()`);
    console.log('  ', JSON.stringify(r));
    check('项目传过去了', r.ready && r.entities === 6, `${r.entities} 个实体 · 项目「${r.project}」`);
    check('自动在运行', r.running === true, 'running=' + r.running);
    await sleep(700);
    const f2 = await prun(`window.__tl.rt.frame`);
    check('帧在推进（不是在装样子）', f2 > r.frame + 3, `帧 ${r.frame} → ${f2}`);
    check('画布跟着窗口尺寸', r.canvas[0] > 400 && r.canvas[1] > 300, r.canvas.join('×'));
  }

  /* ---- 3. 画面真的画出来了 ---- */
  console.log('\n=== 3. 画面内容 ===');
  {
    const px = await prun(`(() => {
      const c = document.querySelector('#player-canvas');
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) {
        seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      }
      return { colours: seen.size };
    })()`);
    check('画布不是一片纯色', px.colours > 2, px.colours + ' 种取样颜色');
  }

  /* ---- 4. 键盘能驱动运行窗口里的角色 ---- */
  console.log('\n=== 4. 键盘能玩 ===');
  {
    const sendKey = async (type, keyCode) => { pw.webContents.sendInputEvent({ type, keyCode }); await sleep(60); };
    const before = await prun(`(() => {
      const rt = window.__tl.rt;
      rt.state.vars['生命'] = 9999;
      const p = rt.state.entities['玩家'];
      for (let i = 0; i < 90; i++) rt.step(1 / 60);
      return { x: p.x, y: p.y };
    })()`);
    await sendKey('keyDown', 'Right');
    const held = await prun(`[...window.__tl.rt.input.keys]`);
    await prun(`(() => { const rt = window.__tl.rt; for (let i = 0; i < 40; i++) rt.step(1/60); return 1; })()`);
    await sendKey('keyUp', 'Right');
    const movedX = await prun(`window.__tl.rt.state.entities['玩家'].x`);
    check('真实键盘进得了运行窗口', held.includes('ArrowRight'), 'keys=' + JSON.stringify(held));
    check('按住 → 角色往右走', movedX > before.x + 40, `x ${before.x.toFixed(0)} → ${movedX.toFixed(0)}`);

    await sendKey('keyDown', 'Space');
    await prun(`(() => { window.__tl.rt.step(1/60); return 1; })()`);
    const vy = await prun(`window.__tl.rt.state.entities['玩家'].vy`);
    await sendKey('keyUp', 'Space');
    check('按空格能起跳', vy > 100, 'vy=' + Number(vy).toFixed(0));
  }

  /* ---- 5. 工具条 ---- */
  console.log('\n=== 5. 工具条 ===');
  {
    await prun(`document.querySelector('#btn-player-pause').click()`);
    await sleep(200);
    const paused = await prun(`({ paused: window.__tl.rt.paused, label: document.querySelector('#btn-player-pause').textContent })`);
    check('暂停按钮管用', paused.paused === true && /继续/.test(paused.label), JSON.stringify(paused));
    await prun(`document.querySelector('#btn-player-pause').click()`);
    await sleep(200);
    const resumed = await prun(`window.__tl.rt.paused`);
    check('再点继续', resumed === false, 'paused=' + resumed);

    await prun(`(() => { window.__tl.rt.state.vars['分数'] = 7; return 1; })()`);
    await prun(`document.querySelector('#btn-player-restart').click()`);
    await sleep(300);
    const afterRestart = await prun(`({ 分数: window.__tl.rt.state.vars['分数'], running: window.__tl.rt.isRunning() })`);
    check('「重来」把状态重置回初始值', afterRestart.分数 === 0 && afterRestart.running === true, JSON.stringify(afterRestart));
  }

  /* ---- 6. 热重载 ---- */
  console.log('\n=== 6. 编辑器改完 → 运行窗口热重载 ===');
  {
    await run(`(() => { window.__tl.store.project.variables['冒烟热重载'] = { name: '冒烟热重载', value: 0 }; window.__tl.store.commit('加变量'); return 1; })()`);
    let got = null;
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      got = await prun(`!!(window.__tl.project && window.__tl.project.variables && window.__tl.project.variables['冒烟热重载'])`);
      if (got) break;
    }
    check('改动推到了运行窗口', got === true, got ? '运行窗口里出现了新变量' : '一直没同步过去');
    const stillRunning = await prun(`window.__tl.rt.isRunning()`);
    check('热重载之后还在跑', stillRunning === true, 'running=' + stillRunning);
  }

  /* ---- 7. 出图 ---- */
  {
    await prun(`(() => {
      const rt = window.__tl.rt;
      rt.state.vars['生命'] = 3; rt.state.vars['分数'] = 2;
      const p = rt.state.entities['玩家'];
      p.x = -40; p.y = -60; p.vx = 0; p.vy = 0;
      for (let i = 0; i < 20; i++) rt.step(1/60);
      return 1;
    })()`);
    await sleep(400);
    // 抓不到图不能让整轮挂掉：这里是 await 在 async 里，抛出去就是 unhandled
    // rejection，后面的汇总和 app.exit() 都不执行，进程会一直挂着
    // （「Current display surface not available for capture」就是这种情况）。
    let ok = false;
    try {
      await pw.webContents.capturePage();          // 预热：第一张常是上一帧
      await sleep(200);
      fs.writeFileSync(path.join(ROOT, 'tools', 'shots', '11-player-window.png'),
        (await pw.webContents.capturePage()).toPNG());
      ok = true;
    } catch { /* 下面按没抓到处理 */ }
    console.log(ok ? '  已保存 tools/shots/11-player-window.png' : '  ⚠ 这张图没抓到（窗口没被合成），跳过 —— 不影响上面的断言');
  }

  /* ---- 8. 关窗之后编辑器复位 ---- */
  console.log('\n=== 8. 关掉运行窗口 ===');
  {
    await prun(`document.querySelector('#btn-player-close').click()`);
    let gone = false;
    for (let i = 0; i < 25 && !gone; i++) { await sleep(200); gone = !playerWin(); }
    check('窗口关掉了', gone);
    let reset = false;
    for (let i = 0; i < 20 && !reset; i++) {
      await sleep(150);
      reset = await run(`({ open: window.__tl.playerOpen, on: document.querySelector('#btn-run').classList.contains('on') })`)
        .then((r) => r.open === false && r.on === false).catch(() => false);
    }
    check('编辑器里按钮状态复位了', reset, 'playerOpen=false / 按钮去掉高亮');
  }

  const bad = logs.filter((m) => !/DevTools|Autofill|GPU|deprecated/i.test(m));
  console.log(`\n=== 结果 ${results.filter(Boolean).length}/${results.length} ===`);
  if (bad.length) { console.log('--- 控制台 ---'); bad.slice(-12).forEach((m) => console.log('  ' + m)); }
  else console.log('控制台无报错');
  app.exit(results.every(Boolean) && !bad.length ? 0 : 1);
});
