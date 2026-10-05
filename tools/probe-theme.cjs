'use strict';
/**
 * 外观探针：验证「主题色 / 重点色 / 字体」这条路真的能走通。
 *   node tools/electron.cjs tools/probe-theme.cjs
 *
 * 断言的是**计算后**的样式（getComputedStyle），不是「记得调过哪个函数」——
 * 变量写进了 <style> 但被 base.css 盖住，是这条线最可能出的错，
 * 光看内部 state 是发现不了的。
 *
 * 还要证明两条设计约束：
 *   1. 外观不写进项目文件（换台机器打开同一个游戏，皮肤各随各的）
 *   2. 关窗退订 —— 反复开关对话框不能攒下一堆失效回调
 */
const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'tanloom-theme'));
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
  const shotDir = path.join(ROOT, 'tools', 'shots');
  fs.mkdirSync(shotDir, { recursive: true });

  await win.loadURL(APP_URL);
  await new Promise((r) => setTimeout(r, 2300));
  const run = (js) => win.webContents.executeJavaScript(js);
  // capturePage 在「隐藏窗口 + 整页换肤」这种大范围重绘下，抓一次很可能还是旧帧
  // （比冒烟测试里的「第一张是上一帧」更严重：抓到的可能是几秒前那一帧）。
  // 所以连抓三拍、每拍之间留足重绘时间，取最后一拍。
  const shot = async (file) => {
    let buf = null;
    for (let i = 0; i < 3; i++) {
      try { buf = (await win.webContents.capturePage()).toPNG(); } catch { /* 这一拍没抓到，下一拍再来 */ }
      await new Promise((r) => setTimeout(r, 420));
    }
    if (buf) fs.writeFileSync(file, buf);
  };

  /* ============================================================ */
  console.log('\n=== 启动即应用（不闪默认皮肤） ===');
  const boot = await run(`(() => {
    const el = document.getElementById('tanloom-appearance');
    const cs = getComputedStyle(document.documentElement);
    return {
      hasStyle: !!el,
      isLastInHead: document.head.lastElementChild === el,
      css: el ? el.textContent : '',
      dark: document.documentElement.dataset.themeDark,
      accent: cs.getPropertyValue('--accent').trim(),
      panel: cs.getPropertyValue('--panel').trim(),
      theme: window.__tl && window.__tl.appearance && window.__tl.appearance.state.theme,
    };
  })()`);
  check('外观样式表已注入 head 末尾（同特异性靠后胜出）',
    boot.hasStyle && boot.isLastInHead,
    `#tl-appearance ${boot.hasStyle ? '存在' : '缺失'}，head 末位=${boot.isLastInHead}`);
  check('默认主题生效（计算值来自暗色皮肤）',
    boot.accent === '#4c97ff' && boot.panel === '#212734' && boot.dark === '1',
    `theme=${boot.theme} --accent=${boot.accent} --panel=${boot.panel} data-theme-dark=${boot.dark}`);

  /* ============================================================ */
  console.log('\n=== 打开外观对话框 → 切主题（走真实点击） ===');
  const opened = await run(`(async () => {
    const before = getComputedStyle(document.body).backgroundColor;
    document.querySelector('#btn-appearance').click();
    await new Promise(r => setTimeout(r, 260));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '点了「外观」但没弹对话框' };
    return {
      before,
      title: modal.querySelector('h3').textContent,
      themes: [...modal.querySelectorAll('.ap-theme .ap-name')].map(e => e.textContent),
      dots: modal.querySelectorAll('.ap-dot').length,
      selects: [...modal.querySelectorAll('select')].length,
      preview: !!modal.querySelector('.ap-preview'),
    };
  })()`);
  check('顶栏「外观」能弹出对话框',
    !!opened.title,
    opened.err || `${opened.title}｜主题卡 ${(opened.themes || []).length} 张（含「跟随系统」）·重点色 ${opened.dots} 个（含自定义取色器）·下拉 ${opened.selects} 个｜预览=${opened.preview}`);

  const theme = await run(`(async () => {
    const modal = document.querySelector('.modal-back');
    const jsonBefore = window.__tl.store.toJSON();
    const btns = [...modal.querySelectorAll('.ap-theme')];
    const names = [...modal.querySelectorAll('.ap-theme .ap-name')].map(e => e.textContent);
    const i = names.findIndex(n => n.includes('晨曦'));
    btns[i].click();
    await new Promise(r => setTimeout(r, 200));
    const cs = getComputedStyle(document.documentElement);
    return {
      jsonSame: window.__tl.store.toJSON() === jsonBefore,
      dark: document.documentElement.dataset.themeDark,
      accent: cs.getPropertyValue('--accent').trim(),
      panel: cs.getPropertyValue('--panel').trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      marked: btns[i].classList.contains('on'),
      state: window.__tl.appearance.state.theme,
    };
  })()`);
  check('点「晨曦 · 白」→ 计算样式真的变浅（不是只改了内部状态）',
    theme.dark === '0' && theme.panel === '#ffffff' && theme.accent === '#2f6fd0',
    `--panel=${theme.panel} --accent=${theme.accent} data-theme-dark=${theme.dark}`);
  check('对话框里当前主题被打上选中标记', theme.marked, `state.theme=${theme.state}`);
  check('换主题不动项目数据（外观不进项目文件）',
    theme.jsonSame, '切主题前后 store.toJSON() 完全一致');

  /* ============================================================ */
  console.log('\n=== 重点色 ===');
  const accent = await run(`(async () => {
    const modal = document.querySelector('.modal-back');
    const dots = [...modal.querySelectorAll('.ap-dot')];
    const auto = modal.querySelector('.ap-auto');
    const cs = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const pink = dots.find(d => d.title === '品红');
    pink.click();
    await new Promise(r => setTimeout(r, 160));
    const picked = cs();
    const dotsOnAfterPick = dots.filter(d => d.classList.contains('on')).length;
    auto.click();
    await new Promise(r => setTimeout(r, 160));
    return {
      picked, dotsOnAfterPick,
      auto: cs(), autoOn: auto.classList.contains('on'),
      dotsOnAfterAuto: dots.filter(d => d.classList.contains('on')).length,
      state: window.__tl.appearance.state.accent,
    };
  })()`);
  check('选「品红」→ --accent 变成品红',
    accent.picked === '#e05e9b', `--accent=${accent.picked}（同时选中的色点 ${accent.dotsOnAfterPick} 个）`);
  check('点「跟随主题」→ 退回主题自带重点色',
    accent.auto === '#2f6fd0' && accent.autoOn && accent.dotsOnAfterAuto === 0 && accent.state === null,
    `--accent=${accent.auto} accent(state)=${accent.state} 「跟随主题」高亮=${accent.autoOn} 色点选中=${accent.dotsOnAfterAuto} 个`);

  /* ============================================================ */
  console.log('\n=== 自定义重点色（取色器 + 字色自动配） ===');
  const custom = await run(`(async () => {
    const ap = window.__tl.appearance;
    const modal = document.querySelector('.modal-back');
    const inp = modal.querySelector('.ap-custom input[type="color"]');
    if (!inp) return { err: '重点色那一排没有取色器' };
    const cs = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const lsAccent = () => { try { return JSON.parse(localStorage.getItem('tl.appearance.v1') || '{}').accent; } catch { return '(坏值)'; } };
    ap.setAccent(null);
    await new Promise(r => setTimeout(r, 140));
    // 浅黄：白字会看不见，所以字色必须自动翻成深的
    inp.value = '#ffd400';
    inp.dispatchEvent(new Event('input', { bubbles: true }));   // 拖动中的中间态
    await new Promise(r => setTimeout(r, 180));
    const light = {
      accent: cs('--accent'), on: cs('--on-accent'), side: cs('--accent-2'),
      ls: lsAccent(), hex: modal.querySelector('.ap-hex').textContent,
      dotOn: modal.querySelector('.ap-custom').classList.contains('on'),
    };
    inp.dispatchEvent(new Event('change', { bubbles: true }));   // 松手
    await new Promise(r => setTimeout(r, 180));
    const persisted = lsAccent();
    // 深蓝：白字
    inp.value = '#1b2a6b';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 180));
    return { light, persisted, dark: { accent: cs('--accent'), on: cs('--on-accent'), state: ap.state.accent } };
  })()`);
  check('取色器挑任意色 → --accent 跟着改',
    custom.light && custom.light.accent === '#ffd400',
    custom.err || `--accent=${custom.light.accent} 侧边色=${custom.light.side} 色点高亮=${custom.light.dotOn} 显示的 hex=${custom.light.hex}`);
  check('浅色重点色自动改用深字（--on-accent）',
    custom.light && custom.light.on === '#11161f',
    custom.err || `#ffd400 上 --on-accent=${custom.light.on}`);
  check('拖动中的中间态不落盘，松手才存',
    custom.light && custom.light.ls === null && custom.persisted === '#ffd400',
    custom.err || `拖动时 localStorage=${JSON.stringify(custom.light.ls)} → 松手后=${custom.persisted}`);
  check('深色重点色用白字',
    custom.dark && custom.dark.on === '#ffffff' && custom.dark.accent === '#1b2a6b',
    custom.err || `#1b2a6b 上 --on-accent=${custom.dark && custom.dark.on} accent=${custom.dark && custom.dark.accent}`);

  /* ============================================================ */
  console.log('\n=== 字体与字号（界面 / 代码分开） ===');
  const font = await run(`(async () => {
    const ap = window.__tl.appearance;
    const modal = document.querySelector('.modal-back');
    const pick = (sel, v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
    // 按类名找控件，不靠「第几个 select」—— 加了字号下拉之后下标就变了
    const uiSel = modal.querySelector('.ap-sel-ui-font');
    const codeSel = modal.querySelector('.ap-sel-code-font');
    pick(uiSel, 'serif');
    pick(codeSel, 'serif');
    await new Promise(r => setTimeout(r, 200));
    const uiFam = getComputedStyle(document.body).fontFamily;
    const preFam = getComputedStyle(modal.querySelector('.ap-preview')).fontFamily;
    const vars = getComputedStyle(document.documentElement);
    return {
      uiFam, preFam,
      uiVar: vars.getPropertyValue('--ui').trim(),
      monoVar: vars.getPropertyValue('--mono').trim(),
      state: ap.state,
    };
  })()`);
  check('界面字体切「衬线」→ body 实际字体跟着换',
    /Georgia/i.test(font.uiFam), `body font-family=${font.uiFam.slice(0, 60)}…`);
  check('代码字体与界面字体分开设置（预览区走 --mono）',
    /Georgia/i.test(font.preFam) && /JetBrains Mono/i.test(font.uiVar) === false,
    `--mono=${font.monoVar.slice(0, 46)}…`);
  check('状态里两项字体各自独立', font.state.uiFont === 'serif' && font.state.codeFont === 'serif',
    `uiFont=${font.state.uiFont} codeFont=${font.state.codeFont}`);

  // 字号：样式表里全是 calc(基准px * var(--ui-scale))，所以这里比的是「实际算出来的 px」
  const scale = await run(`(async () => {
    const ap = window.__tl.appearance;
    const modal = document.querySelector('.modal-back');
    const pick = (sel, v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
    const fs = (sel) => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : -1;
    };
    const cs = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const snap = () => ({ brand: fs('.brand-name'), code: fs('.code-editor pre'), preview: fs('.ap-preview') });
    pick(modal.querySelector('.ap-sel-ui-scale'), 'md');
    pick(modal.querySelector('.ap-sel-code-scale'), 'md');
    await new Promise(r => setTimeout(r, 200));
    const base = snap();
    pick(modal.querySelector('.ap-sel-ui-scale'), 'xl');
    await new Promise(r => setTimeout(r, 220));
    const bigUi = snap();
    pick(modal.querySelector('.ap-sel-code-scale'), 'xl');
    await new Promise(r => setTimeout(r, 220));
    const bigBoth = snap();
    pick(modal.querySelector('.ap-sel-ui-scale'), 'md');
    await new Promise(r => setTimeout(r, 220));
    const onlyCode = snap();
    return { base, bigUi, bigBoth, onlyCode, vUi: cs('--ui-scale'), vCode: cs('--code-scale'), state: ap.state };
  })()`);
  const near = (a, b) => Math.abs(a - b) < 0.05;
  check('两档字号都有明确的基准值（15px 顶栏 / 12.5px 代码）',
    near(scale.base.brand, 15) && near(scale.base.code, 12.5) && near(scale.base.preview, 12.5),
    `顶栏=${scale.base.brand}px 代码=${scale.base.code}px 预览=${scale.base.preview}px`);
  check('界面字号调大 → 界面真的变大，且不动代码区',
    near(scale.bigUi.brand, 15 * 1.26) && near(scale.bigUi.code, 12.5),
    `顶栏=${scale.bigUi.brand}px（期望 ${15 * 1.26}）代码=${scale.bigUi.code}px（应保持 12.5）`);
  check('代码字号调大 → 代码编辑器与预览一起变大',
    near(scale.bigBoth.code, 12.5 * 1.26) && near(scale.bigBoth.preview, 12.5 * 1.26),
    `代码=${scale.bigBoth.code}px 预览=${scale.bigBoth.preview}px（期望 ${12.5 * 1.26}）`);
  check('两项字号互不牵连（界面回标准，代码保持特大）',
    near(scale.onlyCode.brand, 15) && near(scale.onlyCode.code, 12.5 * 1.26),
    `顶栏=${scale.onlyCode.brand}px 代码=${scale.onlyCode.code}px`);
  check('字号是编译成一个变量乘数，而不是改每条规则',
    Number(scale.vUi) === 1 && Number(scale.vCode) === 1.26,
    `--ui-scale=${scale.vUi} --code-scale=${scale.vCode}`);

  /* ============================================================ */
  console.log('\n=== 关窗退订 ===');
  const unsub = await run(`(async () => {
    const ap = window.__tl.appearance;
    const before = ap._listeners.size;
    // 用「完成」按钮关窗（第一个 foot 按钮）
    document.querySelector('.modal-back .foot button').click();
    await new Promise(r => setTimeout(r, 120));
    const closed = !document.querySelector('.modal-back');
    const afterClose = ap._listeners.size;
    // 再开一次，确认能重新订阅
    document.querySelector('#btn-appearance').click();
    await new Promise(r => setTimeout(r, 220));
    const afterReopen = ap._listeners.size;
    return { before, closed, afterClose, afterReopen };
  })()`);
  check('关窗后退订（不攒失效回调）', unsub.closed && unsub.afterClose === 0,
    `开窗前 ${unsub.before} 个监听 → 关窗后 ${unsub.afterClose} 个`);
  check('重开对话框能重新订阅', unsub.afterReopen === 1, `重开后 ${unsub.afterReopen} 个监听`);

  /* ============================================================ */
  console.log('\n=== 持久化（localStorage，不进项目文件） ===');
  const stored = await run(`(() => {
    const raw = localStorage.getItem('tl.appearance.v1');
    const j = JSON.parse(raw || '{}');
    return { raw, j, inProject: window.__tl.store.toJSON().includes('appearance') };
  })()`);
  check('选择写进了 localStorage',
    stored.j.theme === 'light' && stored.j.uiFont === 'serif' && stored.j.codeFont === 'serif',
    `保存值：${stored.raw}`);
  check('项目文件里没有 appearance 字段（皮肤各随各的）',
    !stored.inProject, 'store.toJSON() 不含 appearance');

  win.webContents.reload();
  await new Promise((r) => setTimeout(r, 2600));
  const reloaded = await run(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const el = document.getElementById('tanloom-appearance');
    return {
      dark: document.documentElement.dataset.themeDark,
      panel: cs.getPropertyValue('--panel').trim(),
      accent: cs.getPropertyValue('--accent').trim(),
      codeScale: cs.getPropertyValue('--code-scale').trim(),
      codeFs: parseFloat(getComputedStyle(document.querySelector('.code-editor pre')).fontSize),
      fam: getComputedStyle(document.body).fontFamily,
      hasStyle: !!el,
      state: window.__tl.appearance.state,
    };
  })()`);
  check('重载后外观自动恢复（浅色 + 衬线 + 自定义重点色 + 代码特大）',
    reloaded.dark === '0' && reloaded.panel === '#ffffff' && /Georgia/i.test(reloaded.fam)
      && reloaded.hasStyle && reloaded.accent === '#1b2a6b' && Math.abs(reloaded.codeFs - 12.5 * 1.26) < 0.05,
    `--panel=${reloaded.panel} theme=${reloaded.state.theme} 重点色=${reloaded.accent} 代码字号=${reloaded.codeFs}px（--code-scale=${reloaded.codeScale}）｜body=${reloaded.fam.slice(0, 30)}…`);

  /* ============================================================ */
  console.log('\n=== 截图 ===');
  // (a) 对话框 + 浅色主题：整套外观控件一屏
  const diag = await run(`(async () => {
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    document.querySelector('#btn-appearance').click();
    await new Promise(r => setTimeout(r, 420));
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : '(无)'; };
    const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return {
      theme: window.__tl.appearance.state.theme,
      rootPanel: v('--panel'), rootTopbarA: v('--topbar-a'),
      topbar: cs('.topbar'), modal: cs('.modal'), dock: cs('.dock'),
      preview: cs('.ap-preview'), scrim: cs('.modal-back'),
    };
  })()`);
  console.log(`  主题=${diag.theme}  --panel=${diag.rootPanel}  --topbar-a=${diag.rootTopbarA}`);
  console.log(`  实绘：顶栏=${diag.topbar} 对话框=${diag.modal} 调试坞=${diag.dock} 预览=${diag.preview} 遮罩=${diag.scrim}`);
  await new Promise((r) => setTimeout(r, 3200));   // 等 toast 淡出
  await shot(path.join(shotDir, '12-appearance-dialog.png'));
  console.log('  已保存 tools/shots/12-appearance-dialog.png');

  // (b) 关掉对话框、换 Solarized 主题：看整个编辑器（含积木区）跟着变
  await run(`(async () => {
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    window.__tl.appearance.setTheme('solarized');
    await new Promise(r => setTimeout(r, 420));
    return 1;
  })()`);
  await shot(path.join(shotDir, '13-appearance-solarized.png'));
  console.log('  已保存 tools/shots/13-appearance-solarized.png');

  // (c) 代码视图 + 等宽字体：字体族这一档的效果
  await run(`(async () => {
    window.__tl.appearance.setTheme('midnight');
    window.__tl.appearance.setUiFont('mono');
    window.__tl.appearance.setCodeFont('mono');
    document.querySelector('#mode-tabs button[data-view="code"]').click();
    await new Promise(r => setTimeout(r, 600));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 3400));
  await shot(path.join(shotDir, '14-appearance-mono-code.png'));
  console.log('  已保存 tools/shots/14-appearance-mono-code.png');

  // (d) 对话框下半段：自定义取色器 / 字体与字号 / 预览 / 分享码
  await run(`(async () => {
    window.__tl.appearance.setTheme('dark');
    await new Promise(r => setTimeout(r, 220));
    document.querySelector('#btn-appearance').click();
    await new Promise(r => setTimeout(r, 460));
    const modal = document.querySelector('.modal-back .modal');
    if (modal) modal.scrollTop = modal.scrollHeight;
    await new Promise(r => setTimeout(r, 240));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 3200));
  await shot(path.join(shotDir, '15-appearance-sections.png'));
  console.log('  已保存 tools/shots/15-appearance-sections.png');

  // (e) 界面字号「特大」：整个编辑器一起变大；代码字号故意留在标准，好一眼看出两者是分开的
  await run(`(async () => {
    const back = document.querySelector('.modal-back');
    if (back) back.querySelector('.foot button').click();
    const ap = window.__tl.appearance;
    ap.setTheme('dark'); ap.setUiFont('sans'); ap.setCodeFont('mono');
    ap.setUiScale('xl'); ap.setCodeScale('md'); ap.setAccent(null);
    document.querySelector('#mode-tabs button[data-view="blocks"]').click();
    await new Promise(r => setTimeout(r, 560));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 3400));
  await shot(path.join(shotDir, '16-appearance-ui-scale.png'));
  console.log('  已保存 tools/shots/16-appearance-ui-scale.png');

  /* ============================================================ */
  console.log('\n=== 恢复默认 ===');
  const reset = await run(`(async () => {
    document.querySelector('#mode-tabs button[data-view="blocks"]').click();
    await new Promise(r => setTimeout(r, 260));
    document.querySelector('#btn-appearance').click();
    await new Promise(r => setTimeout(r, 260));
    const modal = document.querySelector('.modal-back');
    const okText = modal.querySelectorAll('.foot button')[1].textContent.trim();
    modal.querySelectorAll('.foot button')[1].click();
    await new Promise(r => setTimeout(r, 220));
    const cs = getComputedStyle(document.documentElement);
    return {
      okText,
      stillOpen: !!document.querySelector('.modal-back'),
      state: window.__tl.appearance.state,
      accent: cs.getPropertyValue('--accent').trim(),
      dark: document.documentElement.dataset.themeDark,
      fam: getComputedStyle(document.body).fontFamily,
      codeFs: parseFloat(getComputedStyle(document.querySelector('.code-editor pre')).fontSize),
      saved: localStorage.getItem('tl.appearance.v1'),
    };
  })()`);
  check('「恢复默认」按钮文字正确', reset.okText === '恢复默认', `按钮＝${reset.okText}`);
  check('恢复默认后回到暗色 + 非衬线 + 等宽 + 标准字号',
    reset.state.theme === 'dark' && reset.state.uiFont === 'sans' && reset.state.codeFont === 'mono'
      && reset.state.uiScale === 'md' && reset.state.codeScale === 'md' && reset.state.followSystem === false
      && reset.dark === '1' && reset.accent === '#4c97ff' && Math.abs(reset.codeFs - 12.5) < 0.05
      && !/Georgia/i.test(reset.fam),
    `state=${JSON.stringify(reset.state)} --accent=${reset.accent} 代码字号=${reset.codeFs}px`);
  check('恢复默认留在对话框里（能接着调）', reset.stillOpen, '点完不关窗');
  check('恢复默认也写进 localStorage',
    JSON.parse(reset.saved || '{}').theme === 'dark', `保存值：${reset.saved}`);

  /* ============================================================ */
  // 「跟随系统」不好测在「点一下」上 —— 它真正的价值是**实时**：
  // 主进程把 nativeTheme.themeSource 一改，页面什么都没做就该跟着变。
  // 所以这里由主进程去改系统偏好，页面完全不参与。
  console.log('\n=== 跟随系统（主进程驱动 prefers-color-scheme） ===');
  await run(`(() => { const m = document.querySelector('.modal-back'); if (m) m.querySelector('.foot button').click(); return 1; })()`);
  nativeTheme.themeSource = 'dark';
  await new Promise((r) => setTimeout(r, 320));
  const sysFollow = await run(`(async () => {
    const ap = window.__tl.appearance;
    document.querySelector('#btn-appearance').click();
    await new Promise(r => setTimeout(r, 300));
    const modal = document.querySelector('.modal-back');
    const sysBtn = [...modal.querySelectorAll('.ap-theme')].find(b => b.textContent.includes('跟随系统'));
    if (!sysBtn) return { err: '主题区没有「跟随系统」卡片' };
    sysBtn.click();
    await new Promise(r => setTimeout(r, 220));
    return {
      following: ap.state.followSystem, sysOn: sysBtn.classList.contains('on'),
      dark: document.documentElement.dataset.themeDark,
      flag: document.documentElement.dataset.themeFollowing,
      themeNow: ap.theme.id, picked: ap.state.theme,
      cards: [...modal.querySelectorAll('.ap-theme')].length,
    };
  })()`);
  check('主题区有「跟随系统」这张卡，点了能选中',
    sysFollow.sysOn === true && sysFollow.following === true,
    sysFollow.err || `主题卡共 ${sysFollow.cards} 张｜followSystem=${sysFollow.following} 卡片高亮=${sysFollow.sysOn}`);
  check('系统是深色 → 用暗色主题',
    sysFollow.dark === '1' && sysFollow.themeNow === 'dark' && sysFollow.flag === '1',
    sysFollow.err || `data-theme-dark=${sysFollow.dark} 生效主题=${sysFollow.themeNow}`);

  // 关键一步：改系统偏好，页面不做任何操作。
  // 注意这是**跨进程的异步事件**（主进程 nativeTheme → 渲染进程的 media query），
  // 固定等 500ms 会偶发抢跑（实测：偶发 dataset 还是旧值，而实时 getter 已经是新值）。
  // 所以这里轮询等它翻过来，最多 2.5 秒；真翻不过来才算失败。
  nativeTheme.themeSource = 'light';
  let flipped = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 100));
    flipped = await run(`document.documentElement.dataset.themeDark === '0'`);
    if (flipped) break;
  }
  const sysLight = await run(`(() => {
    const ap = window.__tl.appearance;
    const modal = document.querySelector('.modal-back');
    const cards = [...modal.querySelectorAll('.ap-theme')];
    const eff = cards.filter(b => b.classList.contains('eff')).map(b => b.querySelector('.ap-name').textContent);
    const on = cards.filter(b => b.classList.contains('on')).map(b => b.querySelector('.ap-name').textContent);
    return {
      dark: document.documentElement.dataset.themeDark, themeNow: ap.theme.id,
      picked: ap.state.theme, eff, on,
      panel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(),
    };
  })()`);
  check('系统切浅色 → 页面实时跟随（没重启、没点任何东西）',
    flipped && sysLight.dark === '0' && sysLight.themeNow === 'light' && sysLight.panel === '#ffffff',
    `等到了=${flipped} data-theme-dark=${sysLight.dark} 生效主题=${sysLight.themeNow} --panel=${sysLight.panel}`);
  check('跟随系统时仍然记得用户手选的那套主题',
    sysLight.picked === 'dark' && sysLight.eff.some((n) => n.includes('晨曦')) && sysLight.on.some((n) => n.includes('跟随系统')),
    `手选=${sysLight.picked}（reserved）· 高亮=${sysLight.on.join('/')} · 虚线生效=${sysLight.eff.join('/')}`);

  const sysOff = await run(`(async () => {
    const ap = window.__tl.appearance;
    const modal = document.querySelector('.modal-back');
    const cards = [...modal.querySelectorAll('.ap-theme')];
    const sol = cards.find(b => b.textContent.includes('Solarized'));
    sol.click();
    await new Promise(r => setTimeout(r, 240));
    return {
      following: ap.state.followSystem, themeNow: ap.theme.id, picked: ap.state.theme,
      dark: document.documentElement.dataset.themeDark,
      sysOn: cards.find(b => b.textContent.includes('跟随系统')).classList.contains('on'),
    };
  })()`);
  check('点具体主题 → 退出跟随，回到手选',
    sysOff.following === false && sysOff.themeNow === 'solarized' && sysOff.sysOn === false && sysOff.dark === '0',
    `followSystem=${sysOff.following} 生效主题=${sysOff.themeNow} 手选=${sysOff.picked} 「跟随系统」高亮=${sysOff.sysOn}`);
  nativeTheme.themeSource = 'system';

  /* ============================================================ */
  console.log('\n=== 分享码（把一套外观发给别人） ===');
  const share = await run(`(async () => {
    const ap = window.__tl.appearance;
    const modal = document.querySelector('.modal-back');
    const box = modal.querySelector('.ap-share-code');
    const btn = (t) => [...modal.querySelectorAll('.ap-share-btns button')].find(b => b.textContent.includes(t));
    const snap = () => JSON.stringify(ap.state);
    if (!box) return { err: '对话框里没有分享码输入框' };
    // 先摆一套有特征的外观（Nord + 自定义浅黄 + 衬线 + 特大代码字号 + 小界面字号）
    ap.setFollowSystem(false);
    ap.setTheme('nord');
    ap.setAccent('#ffd400');
    ap.setUiFont('serif');
    ap.setUiScale('sm');
    ap.setCodeScale('xl');
    await new Promise(r => setTimeout(r, 220));
    const picked = snap();
    btn('生成').click();
    await new Promise(r => setTimeout(r, 160));
    const code = box.value;
    let parsed = null;
    try { parsed = JSON.parse(code); } catch { /* 下面会断言为 null */ }
    const parsedState = parsed && typeof parsed === 'object' ? { ...parsed } : null;
    if (parsedState) delete parsedState.v;
    // 先把外观换得面目全非，再用分享码整套还原
    ap.setFollowSystem(true);
    ap.setTheme('monokai');
    ap.setAccent('#00ff88');
    ap.setUiScale('xl');
    await new Promise(r => setTimeout(r, 220));
    const messed = snap();
    btn('应用').click();
    await new Promise(r => setTimeout(r, 240));
    const restored = snap();
    // 垃圾输入必须被拒，而且不能把现有外观清掉
    box.value = 'hello，这不是分享码';
    btn('应用').click();
    await new Promise(r => setTimeout(r, 200));
    const afterJunk = snap();
    box.value = '{"foo":1,"bar":2}';
    btn('应用').click();
    await new Promise(r => setTimeout(r, 200));
    return { picked, code, parsedState, messed, restored, afterJunk, afterUnknown: snap() };
  })()`);
  check('「生成分享码」吐出的就是当前外观，一个字段不多不少',
    !!share.parsedState && JSON.stringify(share.parsedState) === share.picked,
    share.err || `生成时=${share.picked}\n      分享码=${(share.code || '').slice(0, 120)}…`);
  check('先把外观改乱，再用分享码整套还原',
    !!share.messed && share.messed !== share.picked && share.restored === share.picked,
    share.err || `生成时=${share.picked}｜改乱后=${share.messed}｜还原后=${share.restored}`);
  check('认不出来的分享码被拒绝，而且不动现有外观',
    !!share.afterJunk && share.afterJunk === share.picked && share.afterUnknown === share.picked,
    share.err || `乱文本后=${(share.afterJunk || '').slice(0, 60)}｜陌生 JSON 后=${(share.afterUnknown || '').slice(0, 60)}`);

  /* ============================================================ */
  console.log('\n=== 全屏游玩不跟皮肤（游戏画面保持深色） ===');
  const players = await run(`(async () => {
    // 先把上一节留着的对话框正式关掉（走「完成」按钮，顺带验证退订）
    const open = document.querySelector('.modal-back');
    if (open) { open.querySelector('.foot button').click(); await new Promise(r => setTimeout(r, 140)); }
    // 再切到浅色皮肤 —— 全屏层必须还是它自己的深色，不能被编辑器皮肤带走
    window.__tl.appearance.setTheme('light');
    await new Promise(r => setTimeout(r, 220));
    const fsLayer = document.getElementById('fullscreen-layer');
    return {
      theme: window.__tl.appearance.state.theme,
      listeners: window.__tl.appearance._listeners.size,
      bg: getComputedStyle(fsLayer).backgroundColor,
      chrome: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
  check('编辑器是浅色时，全屏层仍然深色',
    players.theme === 'light' && players.bg === 'rgb(5, 7, 11)',
    `theme=${players.theme} 编辑器底色=${players.chrome} 全屏层底色=${players.bg}（残留监听 ${players.listeners} 个）`);
  await run(`window.__tl.appearance.reset()`);

  /* ============================================================ */
  console.log('\n=== 页面错误 ===');
  const errs = pageErrors.filter((m) => /uncaught|Invalid|violat|TypeError|Cannot read|before initialization/i.test(m));
  if (errs.length) errs.slice(0, 12).forEach((m) => console.log('  ' + m));
  else console.log('  （无）');

  const bad = results.filter((r) => !r.ok);
  console.log(`\n=========== ${results.length - bad.length} 通过 / ${bad.length} 失败 ===========`);
  if (bad.length) bad.forEach((r) => console.log(`  ✖ ${r.name} / ${r.detail}`));
  app.exit(bad.length ? 1 : 0);
});
