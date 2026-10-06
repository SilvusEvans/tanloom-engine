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
// 探针的 userData 必须每次干净：上一轮跑完 localStorage 里留着 theme=light、
// accent=#1b2a6b，下一轮开头那条「默认主题生效（暗色）」就会无辜地失败
try { fs.rmSync(path.join(require('os').tmpdir(), 'tanloom-theme'), { recursive: true, force: true }); } catch { /* 没有就正好 */ }
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

  try {
  await win.loadURL(APP_URL);
  await new Promise((r) => setTimeout(r, 2300));
  // executeJavaScript 是有可能「永不返回」的（页面卡在半路上、reload 后一直没回头），
  // 那会让整轮探针无声地挂死。给它加一道超时：超时就抛，由外面的 try/catch 收摊，
  // 至少能给出「第几步卡住了」这个结论。
  const run = async (js, ms = 25000) => {
    let timer;
    try {
      return await Promise.race([
        win.webContents.executeJavaScript(js),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`executeJavaScript 超时 ${ms}ms`)), ms); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  /** 页面回到「__tl 已就绪」为止 —— reload 之后不能只死等固定毫秒 */
  const waitReady = async (ms = 40000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await run('!!(window.__tl && window.__tl.appearance)', 4000)) return true; } catch { /* 下一拍再来 */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };
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
  console.log('\n=== 打开设置对话框 → 切主题（走真实点击） ===');
  const opened = await run(`(async () => {
    const before = getComputedStyle(document.body).backgroundColor;
    document.querySelector('#btn-settings').click();
    await new Promise(r => setTimeout(r, 260));
    const modal = document.querySelector('.modal-back');
    if (!modal) return { err: '点了「设置」但没弹对话框' };
    return {
      before,
      title: modal.querySelector('h3').textContent,
      themes: [...modal.querySelectorAll('.ap-theme .ap-name')].map(e => e.textContent),
      dots: modal.querySelectorAll('.ap-dot').length,
      selects: [...modal.querySelectorAll('select')].length,
      preview: !!modal.querySelector('.ap-preview'),
    };
  })()`);
  check('顶栏「设置」能弹出对话框',
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
  console.log('\n=== 编辑区主题：积木画布与代码区共用一套 ===');
  const codeTheme = await run(`(async () => {
    const ap = window.__tl.appearance;
    const sel = document.querySelector('.ap-sel-code-theme');
    if (!sel) return { err: '设置对话框里没有「编辑区主题」下拉' };
    const cs = () => getComputedStyle(document.documentElement);
    const preview = document.querySelector('.ap-preview');
    // 积木那套色不在 CSS 变量里，得问 scratch-blocks 自己要（它就是照这个画积木的）
    const comp = (n) => {
      const w = window.__tl.ws && window.__tl.ws.ws;
      if (!w) return '';
      const th = w.getTheme();
      if (typeof th.getComponentStyle === 'function') return th.getComponentStyle(n);
      return (th.componentStyles || {})[n] || '';
    };
    const blockStyle = (n) => {
      const w = window.__tl.ws && window.__tl.ws.ws;
      if (!w) return '';
      const th = w.getTheme();
      const bs = th.blockStyles || (typeof th.getBlockStyles === 'function' ? th.getBlockStyles() : {});
      return (bs[n] && bs[n].colourPrimary) || '';
    };
    const snap = () => {
      const rect = document.querySelector('#blockly-host .blocklyMainBackground');
      // 开了网格之后，主背景那块 rect 的 fill 是「指向网格图案的 url()」，
      // 真正的底色写在 <defs> 里那个 pattern 的 rect 上 —— 所以要一路挖到它，
      // 否则拿到的永远是同一个 url(...)，换什么主题都不会变
      // 画布底色不在主背景那块 rect 上 —— 它填的是网格图案 url()；
      // 真正的底色写在 svg 自己的 background-color 里。
      // 工具箱则是另一个 DOM（div），它的背景由 componentStyle 给。
      const host = document.querySelector('#blockly-host');
      const svg = host && host.querySelector('svg.blocklySvg');
      const tb = host && host.querySelector('.blocklyToolbox');
      return {
        state: ap.state.codeTheme,
        codeBg: cs().getPropertyValue('--code-bg').trim(),
        panel: cs().getPropertyValue('--panel').trim(),
        wsSurface: cs().getPropertyValue('--ws-surface').trim(),
        blocksBg: comp('workspaceBackgroundColour'),
        blocksToolbox: comp('toolboxBackgroundColour'),
        blocksFg: comp('toolboxForegroundColour'),
        blocksField: blockStyle('textField'),
        blocksAccent: comp('markerColour'),
        // 真渲染：画布与工具箱的实际背景色
        rectFill: svg ? getComputedStyle(svg).backgroundColor : (rect ? getComputedStyle(rect).fill : ''),
        toolboxCss: tb ? getComputedStyle(tb).backgroundColor : '',
        previewBg: getComputedStyle(preview).backgroundColor,
        previewKw: preview.querySelector('.tok-kw') ? getComputedStyle(preview.querySelector('.tok-kw')).color : '',
      };
    };
    const pick = async (v) => {
      sel.value = v; sel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 260));
    };
    const follow = snap();
    await pick('dracula');
    const dracula = snap();
    await pick('github-light');
    const github = snap();
    await pick('solarized-dark');
    const solar = snap();
    await pick('');
    const back = snap();
    return { err: null, options: [...sel.options].map(o => o.value), follow, dracula, github, solar, back };
  })()`);
  // 断言落在**计算值**上：只看 state.codeTheme 是抓不到「写了 CSS 却被别处盖住」的
  check('设置对话框里有「编辑区主题」下拉（含「跟随界面主题」这个选项）',
    !codeTheme.err && codeTheme.options.includes('') && codeTheme.options.includes('dracula'),
    codeTheme.err || `选项 ${JSON.stringify(codeTheme.options)}`);
  check('默认跟随界面主题：代码底色用的就是界面主题那一套',
    codeTheme.follow && codeTheme.follow.state === null && codeTheme.follow.codeBg === '#ffffff',
    codeTheme.follow ? `state=${codeTheme.follow.state} --code-bg=${codeTheme.follow.codeBg}` : '');
  check('换代码区主题 → --code-bg 真的变了（编译进变量，不是只改状态）',
    codeTheme.dracula && codeTheme.dracula.codeBg === '#282a36',
    codeTheme.dracula ? `--code-bg=${codeTheme.dracula.codeBg}` : '');
  check('代码区换深色，界面主题不被牵连（此时界面还是「晨曦 · 白」）',
    codeTheme.dracula && codeTheme.dracula.panel === '#ffffff' && codeTheme.follow.panel === codeTheme.dracula.panel,
    codeTheme.dracula ? `--panel=${codeTheme.dracula.panel}（换之前 ${codeTheme.follow.panel}）` : '');
  check('对话框里的预览跟着代码区主题变（所见即所得）',
    codeTheme.dracula && codeTheme.dracula.previewBg === 'rgb(40, 42, 54)'
      && codeTheme.follow.previewBg === 'rgb(255, 255, 255)',
    codeTheme.dracula ? `预览底色 ${codeTheme.follow.previewBg} → ${codeTheme.dracula.previewBg}` : '');
  check('切回「跟随界面主题」→ 代码区配色回到界面那一套',
    codeTheme.back && codeTheme.back.state === null && codeTheme.back.codeBg === '#ffffff',
    codeTheme.back ? `state=${codeTheme.back.state} --code-bg=${codeTheme.back.codeBg}` : '');

  /* --- 共享：积木画布必须与代码区同一个底色 --- */
  check('积木画布跟着换底：换 dracula → 直接变成 #282a36，和代码区同一个值',
    !!codeTheme.dracula && codeTheme.dracula.blocksBg === '#282a36'
      && codeTheme.dracula.blocksBg === codeTheme.dracula.codeBg,
    codeTheme.dracula ? `积木=${codeTheme.dracula.blocksBg}｜代码=${codeTheme.dracula.codeBg}` : '');
  check('不是只改了主题对象 —— 画布那块 svg 的实际背景色也跟着变了',
    !!codeTheme.dracula && codeTheme.dracula.rectFill === 'rgb(40, 42, 54)'
      && codeTheme.github.rectFill === 'rgb(255, 255, 255)',
    codeTheme.dracula ? `dracula=${codeTheme.dracula.rectFill}｜github=${codeTheme.github.rectFill}` : '');
  check('工具箱那块 DOM 也一起换了底色（不是只换画布）',
    !!codeTheme.dracula && codeTheme.dracula.toolboxCss !== codeTheme.github.toolboxCss
      && codeTheme.dracula.toolboxCss !== codeTheme.dracula.rectFill,
    codeTheme.dracula ? `dracula 画布=${codeTheme.dracula.rectFill} 工具箱=${codeTheme.dracula.toolboxCss}` : '');
  check('浅色那套反向也成立：GitHub 白 → 积木画布与代码区都是 #ffffff',
    !!codeTheme.github && codeTheme.github.blocksBg === '#ffffff' && codeTheme.github.codeBg === '#ffffff',
    codeTheme.github ? `积木=${codeTheme.github.blocksBg}｜代码=${codeTheme.github.codeBg}` : '');
  check('工具箱比画布深一档（同套里也有层次，不是一整块平色）',
    !!codeTheme.dracula && codeTheme.dracula.blocksToolbox !== codeTheme.dracula.blocksBg,
    codeTheme.dracula ? `工具箱=${codeTheme.dracula.blocksToolbox}｜画布=${codeTheme.dracula.blocksBg}` : '');
  // 工具箱前景用的是 fgDim（比正文淡一档的灰），所以比「谁的亮度更高」，
  // 而不是写死两个十六进制 —— 将来改了那两个色值，这条断言也不会假失败
  const lum = (h) => {
    const m = /^#(..)(..)(..)$/.exec(String(h));
    if (!m) return 0;
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  check('工具箱文字跟着反转：深色套用浅字、浅色套用深字',
    !!codeTheme.dracula && lum(codeTheme.dracula.blocksFg) > lum(codeTheme.github.blocksFg)
      && lum(codeTheme.solar.blocksFg) > lum(codeTheme.github.blocksFg),
    codeTheme.dracula ? `dracula=${codeTheme.dracula.blocksFg}｜solar=${codeTheme.solar.blocksFg}｜github=${codeTheme.github.blocksFg}` : '');
  check('输入槽不再是死白：深色主题下它跟着底色走',
    !!codeTheme.dracula && codeTheme.dracula.blocksField !== '#ffffff'
      && codeTheme.github.blocksField === '#ffffff',
    codeTheme.dracula ? `dracula 槽=${codeTheme.dracula.blocksField}｜github 槽=${codeTheme.github.blocksField}` : '');
  check('每换一套都重算（三套互不相同，没有漏刷新)',
    !!codeTheme.solar && codeTheme.solar.blocksBg === '#002b36' && codeTheme.solar.codeBg === '#002b36'
      && new Set([codeTheme.dracula.blocksBg, codeTheme.github.blocksBg, codeTheme.solar.blocksBg]).size === 3,
    codeTheme.solar ? `solar=${codeTheme.solar.blocksBg}｜dracula=${codeTheme.dracula.blocksBg}｜github=${codeTheme.github.blocksBg}` : '');
  check('切回「跟随界面主题」→ 积木画布也一起回到界面那一套（不会留在上次的颜色）',
    codeTheme.back && codeTheme.back.blocksBg === codeTheme.back.codeBg
      && codeTheme.back.blocksBg === '#ffffff',
    codeTheme.back ? `积木=${codeTheme.back.blocksBg}｜代码=${codeTheme.back.codeBg}` : '');

  /* ============================================================ */
  console.log('\n=== Material You：动态取色（换重点色 = 换一整套皮肤） ===');
  const md3 = await run(`(async () => {
    const ap = window.__tl.appearance;
    const cs = () => getComputedStyle(document.documentElement);
    const v = (n) => cs().getPropertyValue(n).trim();
    const names = [...document.querySelectorAll('.ap-theme .ap-name')].map(e => e.textContent);
    const btns = [...document.querySelectorAll('.ap-theme')];
    const clickTheme = async (kw) => {
      const i = names.findIndex(n => n.includes(kw));
      btns[i].click();
      await new Promise(r => setTimeout(r, 200));
    };
    const snap = () => ({
      theme: ap.state.theme,
      accent: v('--accent'),
      primary: v('--md-primary'),
      onPrimary: v('--md-on-primary'),
      container: v('--md-secondary-container'),
      chrome: v('--chrome'), panel: v('--panel'), text: v('--text'),
      surface: v('--md-surface'), outline: v('--md-outline'),
      snackBg: v('--snack-bg'), hoverLayer: v('--hover-layer'),
      tokKw: v('--tok-kw'),
      rBtn: v('--r-btn'), rDialog: v('--r-dialog'), topbarH: v('--topbar-h'),
      topbarPx: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    });

    await clickTheme('Material You · 暗');
    const dark = snap();
    // 换种子：点预设色里的「品红」（蓝 / 紫 / 品红 … 第 3 个）
    [...document.querySelectorAll('.ap-dot')][2].click();
    await new Promise(r => setTimeout(r, 220));
    const pink = snap();
    // 换回普通主题，确认新变量没污染旧皮肤
    await clickTheme('夜幕 · 蓝');
    const legacy = snap();
    // 复原：主题回「晨曦 · 白」、重点色回前面那颗自定义色（后面还要断言持久化）
    await clickTheme('晨曦 · 白');
    const input = document.querySelector('.ap-custom input[type="color"]');
    input.value = '#1b2a6b';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 200));
    return { names, dark, pink, legacy, restored: { theme: ap.state.theme, accent: ap.state.accent } };
  })()`);

  check('主题表里多了三套 Material You（配色是算出来的，不存色板）',
    (md3.names || []).filter((n) => n.includes('Material You')).length === 3,
    `主题卡共 ${(md3.names || []).length} 张：${(md3.names || []).join(' / ')}`);
  check('换上 Material You → 输出 M3 角色色（主色 / 容器 / 描边都有值）',
    !!md3.dark && !!md3.dark.primary && !!md3.dark.container && !!md3.dark.outline
      && md3.dark.primary === md3.dark.accent,
    md3.dark ? `--md-primary=${md3.dark.primary}  --accent=${md3.dark.accent}  容器=${md3.dark.container}  描边=${md3.dark.outline}` : '');
  check('换重点色 = 换种子：整套界面跟着重新长一遍（不只改了 --accent）',
    !!md3.pink && md3.pink.primary !== md3.dark.primary && md3.pink.chrome !== md3.dark.chrome
      && md3.pink.panel !== md3.dark.panel && md3.pink.tokKw !== md3.dark.tokKw,
    md3.pink ? `主色 ${md3.dark.primary}→${md3.pink.primary}｜底色 ${md3.dark.chrome}→${md3.pink.chrome}｜面板 ${md3.dark.panel}→${md3.pink.panel}｜代码关键字 ${md3.dark.tokKw}→${md3.pink.tokKw}` : '');
  check('主色与「主色上的字」成对（M3 的 on-color，不是一律白字）',
    !!md3.dark && md3.dark.onPrimary && md3.dark.onPrimary !== md3.dark.primary
      && md3.dark.onPrimary !== md3.dark.container,
    md3.dark ? `--md-on-primary=${md3.dark.onPrimary}（主色 ${md3.dark.primary}）` : '');
  check('表面色有层次：底色 / 面板 / 容器各不相同（M3 靠层次不靠描边）',
    !!md3.dark && md3.dark.surface !== md3.dark.panel && md3.dark.container !== md3.dark.panel,
    md3.dark ? `surface=${md3.dark.surface} panel=${md3.dark.panel} container=${md3.dark.container}` : '');
  check('形状跟着换：按钮全圆、对话框 28px、顶栏变高到 52',
    !!md3.dark && md3.dark.rBtn === '999px' && md3.dark.rDialog === '28px'
      && md3.dark.topbarH === '52px' && md3.dark.topbarPx >= 50,
    md3.dark ? `--r-btn=${md3.dark.rBtn} --r-dialog=${md3.dark.rDialog} 顶栏=${md3.dark.topbarH}（实测 ${md3.dark.topbarPx}px）` : '');
  check('提示条用反色块（M3 snackbar：深色模式下它是浅的）',
    !!md3.dark && !!md3.dark.snackBg && md3.dark.snackBg !== md3.dark.panel
      && md3.dark.snackBg !== md3.dark.chrome,
    md3.dark ? `--snack-bg=${md3.dark.snackBg}（面板 ${md3.dark.panel}）` : '');
  check('悬停是「叠一层文字色的 8%」而不是写死的颜色（M3 状态层）',
    !!md3.dark && /color-mix/.test(md3.dark.hoverLayer) && /8%/.test(md3.dark.hoverLayer),
    md3.dark ? `--hover-layer=${md3.dark.hoverLayer}` : '');
  check('切回普通主题 → 形状与配色回到旧皮肤那套（新样式没污染老主题）',
    !!md3.legacy && md3.legacy.rBtn === '5px' && md3.legacy.rDialog === '12px'
      && md3.legacy.panel === '#212734' && md3.legacy.topbarPx <= 48,
    md3.legacy ? `--r-btn=${md3.legacy.rBtn} --r-dialog=${md3.legacy.rDialog} --panel=${md3.legacy.panel} 顶栏=${md3.legacy.topbarPx}px` : '');
  check('探针收尾把主题与重点色复原',
    md3.restored && md3.restored.theme === 'light' && md3.restored.accent === '#1b2a6b',
    `theme=${md3.restored && md3.restored.theme} accent=${md3.restored && md3.restored.accent}`);

  /* ============================================================ */
  console.log('\n=== 关窗退订 ===');
  const unsub = await run(`(async () => {
    const ap = window.__tl.appearance;
    // 注意看的是**相对变化**：app 本身常驻了一条订阅（编辑区主题要推给积木画布），
    // 所以不能拿绝对数 0 / 1 来判 —— 判「开窗 +1、关窗 −1」才是对的
    const before = ap._listeners.size;
    // 用「完成」按钮关窗（第一个 foot 按钮）
    document.querySelector('.modal-back .foot button').click();
    await new Promise(r => setTimeout(r, 120));
    const closed = !document.querySelector('.modal-back');
    const afterClose = ap._listeners.size;
    // 再开一次，确认能重新订阅
    document.querySelector('#btn-settings').click();
    await new Promise(r => setTimeout(r, 220));
    const afterReopen = ap._listeners.size;
    return { before, closed, afterClose, afterReopen };
  })()`);
  check('关窗后退订（不攒失效回调）',
    unsub.closed && unsub.afterClose === unsub.before - 1,
    `开窗时 ${unsub.before} 个监听 → 关窗后 ${unsub.afterClose} 个（应当少 1）`);
  check('重开对话框能重新订阅', unsub.afterReopen === unsub.before,
    `重开后 ${unsub.afterReopen} 个（应当回到 ${unsub.before}）`);

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

  // 这里刻意不用 win.webContents.reload()：在 backgroundThrottling: false 的窗口上，
  // reload() 之后 executeJavaScript 会永久不返回（实测：同一个 builder 用 loadURL 重开就正常）。
  // 换个 query 重新 load，语义同样是「重新载入」，但不踩那个坑。
  await win.loadURL(APP_URL + '?again=1');
  const ready = await waitReady();
  if (!ready) check('重载后页面回到可用状态', false, '等太久也没看到 __tl 就绪');
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
    document.querySelector('#btn-settings').click();
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
    document.querySelector('#btn-settings').click();
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

  // (f) Material You：整套配色由重点色这颗种子长出来（青色种子）
  await run(`(async () => {
    const ap = window.__tl.appearance;
    ap.setUiScale('md');
    ap.setTheme('you-dark'); ap.setAccent('teal');
    await new Promise(r => setTimeout(r, 520));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 3200));
  await shot(path.join(shotDir, '17-material-you-dark.png'));
  console.log('  已保存 tools/shots/17-material-you-dark.png');

  // (g) 同一颗种子换浅色：表面层次、on-color、提示条反色整套反过来
  await run(`(async () => {
    window.__tl.appearance.setTheme('you-light');
    await new Promise(r => setTimeout(r, 520));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 3200));
  await shot(path.join(shotDir, '18-material-you-light.png'));
  console.log('  已保存 tools/shots/18-material-you-light.png');

  /* ============================================================ */
  console.log('\n=== 恢复默认 ===');
  const reset = await run(`(async () => {
    document.querySelector('#mode-tabs button[data-view="blocks"]').click();
    await new Promise(r => setTimeout(r, 260));
    document.querySelector('#btn-settings').click();
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
  check('恢复默认后回到暗色 + 非衬线 + 等宽 + 标准字号（代码区也退回跟随界面主题）',
    reset.state.theme === 'dark' && reset.state.uiFont === 'sans' && reset.state.codeFont === 'mono'
      && reset.state.uiScale === 'md' && reset.state.codeScale === 'md' && reset.state.followSystem === false
      && reset.state.codeTheme === null
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
    document.querySelector('#btn-settings').click();
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

  } catch (err) {
    check('探针自身没崩（前面某段抛了异常）', false, String((err && err.stack) || err));
  } finally {
    /* ============================================================ */
    console.log('\n=== 页面错误 ===');
    const errs = pageErrors.filter((m) => /uncaught|Invalid|violat|TypeError|Cannot read|before initialization/i.test(m));
    if (errs.length) errs.slice(0, 12).forEach((m) => console.log('  ' + m));
    else console.log('  （无）');

    // 总结必须写在 finally 里：中途任何一段抛异常，也照样给出结论，
    // 而不是「日志停在半路、外面只看到进程没了」
    const bad = results.filter((r) => !r.ok);
    console.log(`\n=========== ${results.length - bad.length} 通过 / ${bad.length} 失败 ===========`);
    if (bad.length) bad.forEach((r) => console.log(`  ✖ ${r.name} / ${r.detail}`));
    app.exit(bad.length ? 1 : 0);
  }
});
