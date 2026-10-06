'use strict';
/**
 * 动效探针：验证 Material You 那一层动效真的挂上了、参数在规范区间、降级有效。
 *   npm run motion
 *
 * 断言落在**计算后**的样式上，理由和主题探针一样：
 * 「写了 .css 规则」和「这条规则真的生效」之间隔着好几层（引入顺序、
 * 特异性、被后面的规则覆盖），只看源码是发现不了的。
 *
 * 还验两条降级：
 *   1. 系统级 prefers-reduced-motion（用 CDP 真的改媒体特性，不是改内部变量）
 *   2. 手动开关 localStorage 'tl.motion' = 'off'
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-motion'));
registerScheme();
const ROOT = path.join(__dirname, '..');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✖'} ${name} — ${detail}`);
}
// 两套单位别混：读 :root 里的 token 拿到的是毫秒（'200ms'），
// 而 getComputedStyle 的 animationDuration 是秒（'0.3s'）。
const sec = (v) => parseFloat(v);      // '0.3s' → 0.3
const ms = (v) => parseFloat(v);       // '200ms' → 200
// M3 的强调型动效在 200–500ms 之间；按压反馈是例外（更短才有手感）
const inRange = (v) => ms(v) >= 200 && ms(v) <= 500;

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
  const shotDir = path.join(ROOT, 'tools', 'shots');
  fs.mkdirSync(shotDir, { recursive: true });

  await win.loadURL(APP_URL);
  // 必须让窗口真的被合成出来：隐藏窗口里 CSS 过渡和 rAF 都不推进，
  // 「按下」这种要靠过渡表现的东西就永远停在起点，读出来的值全是假的
  win.showInactive();
  await new Promise((r) => setTimeout(r, 2300));
  const run = (js) => win.webContents.executeJavaScript(js);
  const shot = async (file) => {
    let buf = null;
    for (let i = 0; i < 3; i++) {
      try { buf = (await win.webContents.capturePage()).toPNG(); } catch { /* 这一拍没抓到，下一拍再来 */ }
      await new Promise((r) => setTimeout(r, 420));
    }
    if (buf) fs.writeFileSync(file, buf);
  };

  try {
    /* ============================================================ */
    console.log('\n=== 1. M3 动效 token ===');
    const tokens = await run(`(() => {
      const cs = getComputedStyle(document.documentElement);
      const get = (n) => cs.getPropertyValue(n).trim();
      return {
        easeStandard: get('--ease-standard'),
        easeDecel: get('--ease-emphasized-decelerate'),
        easeAccel: get('--ease-standard-accelerate'),
        short: get('--dur-short'), medium: get('--dur-medium'), long: get('--dur-long'),
        press: get('--dur-press'), motion: get('--motion'),
        pressScale: get('--press-scale'), zoom: get('--zoom-from'), slideY: get('--slide-y'),
      };
    })()`);
    check('六条 M3 曲线都定义了（standard / decelerate / accelerate）',
      tokens.easeStandard.startsWith('cubic-bezier') && tokens.easeDecel.startsWith('cubic-bezier')
        && tokens.easeAccel.startsWith('cubic-bezier'),
      `standard=${tokens.easeStandard}｜decelerate=${tokens.easeDecel}`);
    check('时长落在 M3 的 200–500ms 区间（按压反馈单独走 90ms 的短档）',
      inRange(tokens.short) && inRange(tokens.medium) && inRange(tokens.long)
        && ms(tokens.press) > 0 && ms(tokens.press) < 150,
      `short=${tokens.short} medium=${tokens.medium} long=${tokens.long} press=${tokens.press}`);
    check('全局运动开关 --motion 默认是开的（1）', tokens.motion === '1', `--motion=${tokens.motion}`);
    check('幅度也是变量（--press-scale / --zoom-from / --slide-y 都能单独调）',
      Number(tokens.pressScale) < 1 && Number(tokens.zoom) < 1 && tokens.slideY.endsWith('px'),
      `press=${tokens.pressScale} zoom=${tokens.zoom} slideY=${tokens.slideY}`);

    /* ============================================================ */
    console.log('\n=== 2. 容器变换：对话框 ===');
    const modal = await run(`(async () => {
      document.querySelector('#btn-settings').click();
      await new Promise(r => setTimeout(r, 60));
      const back = document.querySelector('.modal-back');
      const box = document.querySelector('.modal');
      if (!back || !box) return { err: '没弹出对话框' };
      const bs = getComputedStyle(back), ms = getComputedStyle(box);
      const b = {
        backAnim: bs.animationName, backDur: bs.animationDuration,
        anim: ms.animationName, dur: ms.animationDuration, ease: ms.animationTimingFunction,
      };
      return b;
    })()`);
    check('对话框走 container transform（m3-container-in），300ms + emphasized decelerate',
      !modal.err && modal.anim === 'm3-container-in' && sec(modal.dur) === 0.3
        && modal.ease === 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      modal.err || `${modal.anim} ${modal.dur} ${modal.ease}`);
    check('遮罩单独一层 200ms 淡入（背景和卡片不同曲线）',
      !modal.err && modal.backAnim === 'm3-backdrop-in' && sec(modal.backDur) === 0.2,
      modal.err || `${modal.backAnim} ${modal.backDur}`);
    await shot(path.join(shotDir, '19-motion-dialog.png'));
    await run(`(() => { const b = document.querySelector('.modal-back'); b && b.remove(); })()`);

    /* ============================================================ */
    console.log('\n=== 3. 共享轴：视图切换 / 停靠面板 ===');
    const axis = await run(`(async () => {
      const tabs = document.querySelector('#mode-tabs');
      const codeBtn = tabs.querySelector('button[data-view=code]');
      codeBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const v = document.querySelector('#view-code');
      const vs = getComputedStyle(v);
      const panelTabs = document.querySelector('#dock-tabs');
      const before = document.querySelector('#dock-body').classList.contains('mo-axis-y');
      panelTabs.querySelector('button[data-panel=vars]').click();
      await new Promise(r => setTimeout(r, 40));
      const body = document.querySelector('#dock-body');
      const bs = getComputedStyle(body);
      return {
        viewAnim: vs.animationName, viewDur: vs.animationDuration,
        before, after: body.classList.contains('mo-axis-y'),
        panelAnim: bs.animationName, panelDur: bs.animationDuration,
      };
    })()`);
    check('切视图走 fade through（m3-fade-through，300ms）',
      axis.viewAnim === 'm3-fade-through' && sec(axis.viewDur) === 0.3,
      `${axis.viewAnim} ${axis.viewDur}`);
    check('点停靠页签 → 面板重播一次共享轴 Y（之前没这个类）',
      axis.before === false && axis.after === true && axis.panelAnim === 'm3-axis-y'
        && sec(axis.panelDur) === 0.3,
      `切换前=${axis.before} 切换后=${axis.after}｜${axis.panelAnim} ${axis.panelDur}`);

    /* ============================================================ */
    console.log('\n=== 4. 列表项逐项进出场 ===');
    const list = await run(`(async () => {
      document.querySelector('#mode-tabs button[data-view=blocks]').click();
      await new Promise(r => setTimeout(r, 120));
      const rows = [...document.querySelectorAll('#hierarchy > *')].slice(0, 3);
      return rows.map((el, i) => {
        const cs = getComputedStyle(el);
        return { i, anim: cs.animationName, dur: cs.animationDuration, delay: cs.animationDelay };
      });
    })()`);
    check('层级行的进出场是错开的（同一动画，逐项延迟）',
      list.length >= 2 && list.every((r) => r.anim === 'm3-item-in')
        && sec(list[0].delay) === 0 && sec(list[1].delay) > 0,
      list.map((r) => `第${r.i + 1}项 ${r.anim} 延迟${r.delay}`).join('｜') || '没有列表行');

    /* ============================================================ */
    console.log('\n=== 5. 按压反馈 ===');
    const press = await run(`(() => {
      const b = document.querySelector('#btn-run');
      const cs = getComputedStyle(b);
      return { props: cs.transitionProperty, dur: cs.transitionDuration, ease: cs.transitionTimingFunction };
    })()`);
    check('按钮的 transition 里带了 transform（按下去能回弹）',
      /transform/.test(press.props) && /background-color/.test(press.props),
      `property=${press.props}`);
    check('松开回位走 emphasized decelerate（曲线名就是 M3 的那一条）',
      /cubic-bezier\(0.05, 0.7, 0.1, 1\)/.test(press.ease),
      `timing=${press.ease}`);
    // :active 才是「按下去」那一瞬 —— 用 CDP 强制伪状态，真的读到它
    let forced = { ok: false, detail: 'CDP 不可用（已降级：只验 transition 与曲线名）' };
    try {
      await win.webContents.debugger.attach('1.3');
      const send = (cmd, params) => win.webContents.debugger.sendCommand(cmd, params);
      await send('DOM.enable');
      await send('CSS.enable');
      const doc = await send('DOM.getDocument');
      const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#btn-run' });
      await send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: ['active'] });
      // 强制之后不能立刻读：transform 是带过渡的，此刻还在「起跑线」上（none）。
      // 等它跑完（90ms 那条曲线）再读，才是真的按下去的样子。
      await new Promise((r) => setTimeout(r, 160));
      const active = await run(`(() => {
        const b = document.querySelector('#btn-run');
        const cs = getComputedStyle(b);
        return { transform: cs.transform, dur: cs.transitionDuration, ease: cs.transitionTimingFunction };
      })()`);
      await send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] });
      const m = /matrix\(([\d.]+)/.exec(active.transform || '');
      const scaled = !!m && Number(m[1]) < 1 && Number(m[1]) >= 0.9;
      forced = {
        ok: scaled,
        detail: `:active 时 ${active.transform}｜${active.dur} ${active.ease}`,
        transform: active.transform,
      };
    } catch (err) {
      forced = { ok: false, detail: `CDP 不可用（${String(err && err.message || err).slice(0, 60)}）` };
    }
    check('按下真的缩下去（用 CDP 强制 :active 读到真实 transform）',
      forced.ok, forced.detail);
    if (!forced.ok) {
      // 退一步：直接问 CSSOM 那条规则本身 —— 至少证明「按下会缩」这件事写进去了
      const rule = await run(`(() => {
        for (const sheet of document.styleSheets) {
          let rules; try { rules = sheet.cssRules; } catch { continue; }
          for (const r of rules) {
            if (r.selectorText && /button\\:active\\:not\\(\\:disabled\\)/.test(r.selectorText) && r.style && r.style.transform)
              return { sel: r.selectorText, transform: r.style.transform };
          }
        }
        return null;
      })()`);
      check('（降级核对）:active 规则里确实写了 scale(var(--press-scale))',
        !!rule && /scale\(var\(--press-scale\)\)/.test(rule.transform),
        rule ? `${rule.sel} → ${rule.transform}` : '没找到那条规则');
    }

    /* ============================================================ */
    console.log('\n=== 6. 降级：prefers-reduced-motion ===');
    let reduced = { err: null };
    try {
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await new Promise((r) => setTimeout(r, 200));
      reduced = await run(`(() => {
        const cs = getComputedStyle(document.documentElement);
        const box = document.querySelector('.modal') || { style: {} };
        document.querySelector('#btn-settings').click();
        const real = document.querySelector('.modal');
        const ms = real ? getComputedStyle(real) : null;
        return {
          motion: cs.getPropertyValue('--motion').trim(),
          slideY: cs.getPropertyValue('--slide-y').trim(),
          pressScale: cs.getPropertyValue('--press-scale').trim(),
          dur: ms ? ms.animationDuration : '',
          backDur: document.querySelector('.modal-back') ? getComputedStyle(document.querySelector('.modal-back')).animationDuration : '',
        };
      })()`);
    } catch (err) { reduced = { err: String(err && err.message || err) }; }
    check('系统说「减少动态效果」→ 全局开关归零，时长也就跟着归零',
      !reduced.err && reduced.motion === '0' && reduced.dur === '0s' && reduced.backDur === '0s',
      reduced.err || `--motion=${reduced.motion}｜对话框 ${reduced.dur}｜遮罩 ${reduced.backDur}`);
    check('降级后位移与缩放也归零（不是「时长短一点」，是真的不动）',
      !reduced.err && reduced.slideY === '0px' && Number(reduced.pressScale) === 1,
      reduced.err || `--slide-y=${reduced.slideY} --press-scale=${reduced.pressScale}`);
    await run(`(() => { const b = document.querySelector('.modal-back'); b && b.remove(); })()`);
    try {
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '', features: [] });
    } catch { /* 收不到就算了，下面还要验证手动开关 */ }

    /* ============================================================ */
    console.log('\n=== 7. 降级：手动开关 ===');
    const manual = await run(`(async () => {
      window.__tl.motion.setMotion(false);
      const enabled = window.__tl.motion.enabled();
      document.querySelector('#dock-tabs button[data-panel=subs]').click();
      await new Promise(r => setTimeout(r, 40));
      const offClass = document.querySelector('#dock-body').classList.contains('mo-axis-y');
      window.__tl.motion.setMotion(true);
      document.querySelector('#dock-tabs button[data-panel=console]').click();
      await new Promise(r => setTimeout(r, 40));
      const onClass = document.querySelector('#dock-body').classList.contains('mo-axis-y');
      return { enabled, offClass, onClass, ls: localStorage.getItem('tl.motion') };
    })()`);
    check('手动关掉动效后，切面板不再触发动画（enabled=false 且没挂类名）',
      manual.enabled === false && manual.offClass === false,
      `enabled=${manual.enabled}｜切面板后挂类=${manual.offClass}`);
    check('再打开就恢复（不再是「关一次再也开不回来」）',
      manual.onClass === true && manual.ls === null,
      `恢复后挂类=${manual.onClass}｜localStorage=${manual.ls}`);

    await shot(path.join(shotDir, '20-motion-dock.png'));
  } catch (err) {
    check('探针自身没崩', false, String(err && err.stack || err));
  }

  /* ============================================================ */
  console.log('\n=== 控制台错误 ===');
  const bad = pageErrors.filter((m) => !/^\s*$/.test(m));
  check('整个过程零控制台错误', bad.length === 0, bad.slice(0, 3).join(' / ') || '干净');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=========== 动效探针：${results.length - failed.length} 通过 / ${failed.length} 失败 ===========`);
  if (failed.length) console.log(failed.map((f) => '  ✖ ' + f.name + ' — ' + f.detail).join('\n'));
  if (failed.length) process.exitCode = 1;
  await win.destroy();
  app.exit(failed.length ? 1 : 0);
});
