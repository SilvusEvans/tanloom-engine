/**
 * DualForge — 外观：编辑器主题色 / 字体族 / 字号
 * ================================================================
 * 只影响「编辑器界面」，不进项目文件 —— 换台机器打开同一个游戏，
 * 存档还是存档，皮肤各随各的。
 *
 * 做法：把选择结果编译成一份 `:root` 变量覆盖，写进 head 末尾的
 * <style id="df-appearance">。所有视图都读同一组变量，所以一处生效、
 * 全屏跟随，各视图不需要各自响应主题变化。
 *
 * 约定：样式表里不许再写死颜色，也不许再写死字号。
 *   - 颜色要加深/变淡一律用 color-mix(in srgb, var(--accent) 18%, transparent)
 *   - 字号一律 calc(13px * var(--ui-scale))（代码区用 --code-scale），
 *     乘数由外观系统给，样式表只管「设计稿上的基准 px」
 * 否则换主题 / 调字号时会留下一块没跟上的旧样式。
 */

import { showModal, hint, toast } from './dialogs.js';
import { highlight } from '../code/editor.js';

const KEY = 'df.appearance.v1';
const FORMAT = 2;   // 分享码格式版本

/* ------------------------------------------------------------------ */
/* 字体族                                                              */
/* ------------------------------------------------------------------ */
const SANS = '"PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, -apple-system, sans-serif';
const SERIF = 'Georgia, "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif';
const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, "Courier New", monospace';

/** 界面字体（顶栏、面板、对话框） */
export const UI_FONTS = [
  { id: 'sans', name: '非衬线（默认）', stack: SANS },
  { id: 'serif', name: '衬线', stack: SERIF },
  { id: 'mono', name: '等宽', stack: MONO },
];

/** 代码字体（代码编辑器、文件列表、日志 —— 所有走 --mono 的地方） */
export const CODE_FONTS = [
  { id: 'mono', name: '等宽（默认）', stack: MONO },
  { id: 'serif', name: '衬线', stack: SERIF },
  { id: 'sans', name: '非衬线', stack: SANS },
];

/* ------------------------------------------------------------------ */
/* 字号档位                                                            */
/* ------------------------------------------------------------------ */
/**
 * 存的是乘数而不是绝对 px：样式表里写的都是「设计稿基准 px」，
 * 这里只给一个倍率。所以以后加新样式照基准写就行，不用管档位有几档。
 */
export const SCALES = [
  { id: 'sm', name: '小', v: 0.9 },
  { id: 'md', name: '标准', v: 1 },
  { id: 'lg', name: '大', v: 1.12 },
  { id: 'xl', name: '特大', v: 1.26 },
];

/* ------------------------------------------------------------------ */
/* 基础配色：深色族 / 浅色族                                            */
/* （主题表只写差异，避免某套主题漏掉一个变量、屏幕上留一块旧颜色）        */
/* ------------------------------------------------------------------ */
const DARK = {
  chrome: '#12151c', chrome2: '#1a1f29', panel: '#212734', panel2: '#2a3140',
  border: '#333b4d', borderSoft: '#2a3140',
  text: '#e6eaf2', textDim: '#98a2b8', textMute: '#6b7688',
  accent: '#4c97ff', accent2: '#3373cc',
  onAccent: '#ffffff',
  purple: '#855cd6', purpleFg: '#c9b4f5', green: '#59c059', amber: '#ffab19', red: '#ff5a5a',
  info: '#9fd0ff',
  wsBg: '#f9f9f9', wsBg2: '#eceef3', stageBg: '#0d1017',
  topbarA: '#1e2431', topbarB: '#171c25',
  btnHoverBg: '#333c4f', btnHoverBd: '#44506a',
  scroll: '#3b4457', scrollHi: '#4d5872',
  wash: 'rgba(255, 255, 255, .05)',
  scrim: 'rgba(6, 8, 12, .62)',
  tagBg: 'rgba(133, 92, 214, .22)', tagFg: '#c9b4f5', tagBd: 'rgba(133, 92, 214, .38)',
  codeBg: '#171b24', codeCaret: '#ffffff',
  shadow: '0 8px 28px rgba(0, 0, 0, .38)', shadowSm: '0 2px 8px rgba(0, 0, 0, .22)',
  tok: { kw: '#c792ea', str: '#c3e88d', num: '#f78c6c', com: '#5c6773', ann: '#ffcb6b', type: '#82aaff', fn: '#ffcb6b' },
};

const LIGHT = {
  chrome: '#e9edf3', chrome2: '#e2e7ef', panel: '#ffffff', panel2: '#f1f4f9',
  border: '#ccd4e1', borderSoft: '#dee4ee',
  text: '#1d2534', textDim: '#57617a', textMute: '#8a93a6',
  accent: '#2f6fd0', accent2: '#2456a8',
  onAccent: '#ffffff',
  purple: '#6d45c0', purpleFg: '#5a3aa6', green: '#2f9e44', amber: '#b5730a', red: '#d64545',
  info: '#1d6fbf',
  wsBg: '#ffffff', wsBg2: '#f2f4f8', stageBg: '#0d1017',
  topbarA: '#ffffff', topbarB: '#e9edf3',
  btnHoverBg: '#e3e9f3', btnHoverBd: '#b7c2d3',
  scroll: '#c3ccdb', scrollHi: '#a7b3c6',
  wash: 'rgba(0, 0, 0, .05)',
  scrim: 'rgba(20, 28, 42, .34)',
  tagBg: 'rgba(109, 69, 192, .12)', tagFg: '#5a3aa6', tagBd: 'rgba(109, 69, 192, .28)',
  codeBg: '#ffffff', codeCaret: '#1d2534',
  shadow: '0 10px 30px rgba(23, 32, 48, .14)', shadowSm: '0 2px 8px rgba(23, 32, 48, .10)',
  tok: { kw: '#cf222e', str: '#0a3069', num: '#0550ae', com: '#6e7781', ann: '#953800', type: '#0550ae', fn: '#8250df' },
};

/* ------------------------------------------------------------------ */
/* 主题表                                                              */
/* ------------------------------------------------------------------ */
export const THEMES = [
  {
    id: 'dark', name: '夜幕 · 蓝', dark: true,
    vars: { ...DARK },
  },
  {
    id: 'midnight', name: '午夜 · 墨', dark: true,
    vars: {
      ...DARK,
      chrome: '#0a0d12', chrome2: '#10141b', panel: '#151a23', panel2: '#1c2330',
      border: '#242e3e', borderSoft: '#1b2330',
      text: '#e3e8f0', textDim: '#8d99ad', textMute: '#5f6b7e',
      topbarA: '#131a25', topbarB: '#0c1016',
      btnHoverBg: '#212a39', btnHoverBd: '#33405a',
      scroll: '#2b3546', scrollHi: '#3c4a62',
      codeBg: '#0d1117', info: '#8ec5f5',
      tok: { kw: '#b79bff', str: '#a8d98a', num: '#e8927c', com: '#4d5866', ann: '#e5b567', type: '#7aa9e8', fn: '#e5b567' },
    },
  },
  {
    id: 'monokai', name: 'Monokai', dark: true,
    vars: {
      ...DARK,
      chrome: '#232420', chrome2: '#272822', panel: '#2d2e28', panel2: '#393a31',
      border: '#4a4b40', borderSoft: '#3a3b32',
      text: '#f8f8f2', textDim: '#b8b9a9', textMute: '#82837a',
      accent: '#f92672', accent2: '#c9185b',
      purple: '#ae81ff', purpleFg: '#d7c4ff', green: '#a6e22e', amber: '#fd971f', red: '#f92672',
      info: '#66d9ef',
      topbarA: '#2b2c25', topbarB: '#232420',
      btnHoverBg: '#3d3e35', btnHoverBd: '#55564a',
      scroll: '#4a4b40', scrollHi: '#5d5e51',
      tagBg: 'rgba(174, 129, 255, .2)', tagFg: '#d7c4ff', tagBd: 'rgba(174, 129, 255, .4)',
      codeBg: '#23241f', shadow: '0 8px 28px rgba(0, 0, 0, .5)', shadowSm: '0 2px 8px rgba(0, 0, 0, .34)',
      tok: { kw: '#f92672', str: '#e6db74', num: '#ae81ff', com: '#75715e', ann: '#fd971f', type: '#66d9ef', fn: '#a6e22e' },
    },
  },
  {
    id: 'nord', name: 'Nord · 极地', dark: true,
    vars: {
      ...DARK,
      chrome: '#262b36', chrome2: '#2e3440', panel: '#3b4252', panel2: '#434c5e',
      border: '#4c566a', borderSoft: '#3b4252',
      text: '#eceff4', textDim: '#d8dee9', textMute: '#8f9aad',
      accent: '#88c0d0', accent2: '#6ba3b3', onAccent: '#16202c',
      purple: '#b48ead', purpleFg: '#dcc0d8', green: '#a3be8c', amber: '#ebcb8b', red: '#bf616a',
      info: '#8fbcbb',
      topbarA: '#2e3440', topbarB: '#262b36',
      btnHoverBg: '#434c5e', btnHoverBd: '#4c566a',
      scroll: '#4c566a', scrollHi: '#5e6b84',
      tagBg: 'rgba(180, 142, 173, .22)', tagFg: '#dcc0d8', tagBd: 'rgba(180, 142, 173, .42)',
      codeBg: '#2e3440',
      tok: { kw: '#81a1c1', str: '#a3be8c', num: '#b48ead', com: '#616e88', ann: '#ebcb8b', type: '#88c0d0', fn: '#8fbcbb' },
    },
  },
  {
    id: 'light', name: '晨曦 · 白', dark: false,
    vars: { ...LIGHT },
  },
  {
    id: 'solarized', name: 'Solarized · 纸', dark: false,
    vars: {
      ...LIGHT,
      chrome: '#eee8d5', chrome2: '#e7e0cb', panel: '#fdf6e3', panel2: '#f3ecd7',
      border: '#d6ceb6', borderSoft: '#e2dbc6',
      text: '#073642', textDim: '#586e75', textMute: '#93a1a1',
      accent: '#268bd2', accent2: '#1f6fa8',
      purple: '#6c71c4', purpleFg: '#5158a6', green: '#859900', amber: '#b58900', red: '#dc322f',
      info: '#1f6fa8',
      topbarA: '#fdf6e3', topbarB: '#eee8d5',
      btnHoverBg: '#e9e2cd', btnHoverBd: '#cfc7ae',
      scroll: '#d3cbb3', scrollHi: '#bcb49c',
      tagBg: 'rgba(108, 113, 196, .14)', tagFg: '#5158a6', tagBd: 'rgba(108, 113, 196, .32)',
      codeBg: '#fdf6e3', codeCaret: '#073642',
      shadow: '0 10px 30px rgba(88, 110, 117, .18)', shadowSm: '0 2px 8px rgba(88, 110, 117, .14)',
      tok: { kw: '#859900', str: '#2aa198', num: '#d33682', com: '#93a1a1', ann: '#b58900', type: '#268bd2', fn: '#cb4b16' },
    },
  },
];

/* ------------------------------------------------------------------ */
/* 小工具：颜色                                                        */
/* ------------------------------------------------------------------ */
const parseHex = (s) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(typeof s === 'string' ? s.trim() : '');
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** 统一成 6 位小写（`#abc` → `#aabbcc`），认不出来返回 null */
export const normHex = (s) => { const c = parseHex(s); return c ? toHex(c) : null; };
/** 按比例调暗，给自定义重点色配一个「侧边 / 按下」色 */
const shade = (hex, f) => { const c = parseHex(hex); return c ? toHex(c.map((v) => v * f)) : hex; };
/**
 * 这个底色上该写深字还是浅字（BT.601 亮度）。
 * 重点色是可以随便挑的 —— 挑到浅黄、浅绿时白字会看不见，
 * 所以不能像内置色那样一律白字。
 */
const readableOn = (hex) => {
  const c = parseHex(hex);
  if (!c) return '#ffffff';
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 > 150 ? '#11161f' : '#ffffff';
};

/* ------------------------------------------------------------------ */
/* 重点色（覆盖主题自带的 accent）                                      */
/* ------------------------------------------------------------------ */
export const ACCENTS = [
  { id: 'blue', name: '蓝', c: '#4c97ff', c2: '#3373cc' },
  { id: 'violet', name: '紫', c: '#855cd6', c2: '#6a45b3' },
  { id: 'pink', name: '品红', c: '#e05e9b', c2: '#bd3f7c' },
  { id: 'red', name: '红', c: '#ef5350', c2: '#c62828' },
  { id: 'orange', name: '橙', c: '#ff9f43', c2: '#d97f22' },
  { id: 'green', name: '绿', c: '#3fa96a', c2: '#2f8352' },
  { id: 'teal', name: '青', c: '#26b5ad', c2: '#1a8f89' },
  { id: 'slate', name: '石墨', c: '#7b8794', c2: '#5e6873' },
].map((a) => ({ ...a, on: readableOn(a.c) }));

/* ------------------------------------------------------------------ */
/* 变量名映射                                                          */
/* ------------------------------------------------------------------ */
const VAR_MAP = {
  chrome: '--chrome', chrome2: '--chrome-2', panel: '--panel', panel2: '--panel-2',
  border: '--border', borderSoft: '--border-soft',
  text: '--text', textDim: '--text-dim', textMute: '--text-mute',
  accent: '--accent', accent2: '--accent-2', onAccent: '--on-accent',
  purple: '--purple', purpleFg: '--purple-fg', green: '--green', amber: '--amber', red: '--red',
  info: '--info',
  wsBg: '--ws-bg', wsBg2: '--ws-bg-2', stageBg: '--stage-bg',
  topbarA: '--topbar-a', topbarB: '--topbar-b',
  btnHoverBg: '--btn-hover-bg', btnHoverBd: '--btn-hover-bd',
  scroll: '--scroll', scrollHi: '--scroll-hi',
  wash: '--wash', scrim: '--scrim',
  tagBg: '--tag-bg', tagFg: '--tag-fg', tagBd: '--tag-bd',
  codeBg: '--code-bg', codeCaret: '--code-caret',
  shadow: '--shadow', shadowSm: '--shadow-sm',
};
const TOK_MAP = {
  kw: '--tok-kw', str: '--tok-str', num: '--tok-num', com: '--tok-com',
  ann: '--tok-ann', type: '--tok-type', fn: '--tok-fn',
};

export const DEFAULT_APPEARANCE = {
  theme: 'dark', accent: null, followSystem: false,
  uiFont: 'sans', codeFont: 'mono', uiScale: 'md', codeScale: 'md',
};

/** 认得的字段名（分享码校验用：一个都不认识就当它不是分享码） */
const KNOWN_KEYS = new Set(['v', 'format', ...Object.keys(DEFAULT_APPEARANCE)]);

const find = (list, id, fallback) => list.find((x) => x.id === id) || list.find((x) => x.id === fallback);
const scaleVal = (id) => find(SCALES, id, 'md').v;

/**
 * 把任意对象收拾成一份合法外观。localStorage 里可能留着旧版本的值，
 * 分享码更是别人给的 —— 逐项校验比整体信任便宜，坏值退回默认而不是整份丢掉。
 */
function coerce(o) {
  const s = { ...DEFAULT_APPEARANCE };
  if (!o || typeof o !== 'object') return s;
  if (THEMES.some((t) => t.id === o.theme)) s.theme = o.theme;
  s.followSystem = o.followSystem === true;
  if (typeof o.accent === 'string') {
    if (ACCENTS.some((a) => a.id === o.accent)) s.accent = o.accent;
    else { const h = normHex(o.accent); if (h) s.accent = h; }
  }
  if (UI_FONTS.some((f) => f.id === o.uiFont)) s.uiFont = o.uiFont;
  if (CODE_FONTS.some((f) => f.id === o.codeFont)) s.codeFont = o.codeFont;
  if (SCALES.some((x) => x.id === o.uiScale)) s.uiScale = o.uiScale;
  if (SCALES.some((x) => x.id === o.codeScale)) s.codeScale = o.codeScale;
  return s;
}

/* ------------------------------------------------------------------ */
/* 状态 + 应用                                                          */
/* ------------------------------------------------------------------ */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...DEFAULT_APPEARANCE };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

export class Appearance {
  constructor() {
    this.state = load();
    this._listeners = new Set();
    // 系统深浅色：开着「跟随系统」时它是唯一的主题来源，而且是实时的
    // （系统在日落时切了深色，编辑器不用重启就跟着切）
    try {
      this._mq = window.matchMedia('(prefers-color-scheme: dark)');
      this._mq.addEventListener('change', () => { if (this.state.followSystem) this._emit(); });
    } catch { this._mq = null; }
    this.apply();
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { this.apply(); for (const fn of this._listeners) fn(this.state); }

  /** 系统当前是不是深色（拿不到就按深色算 —— 本工程默认皮肤就是深色） */
  get systemDark() { try { return this._mq ? !!this._mq.matches : true; } catch { return true; } }

  /**
   * 实际生效的主题。开着「跟随系统」时由系统决定；
   * 用户之前选的那套先放着不丢，关掉跟随就回去。
   */
  get theme() {
    if (this.state.followSystem) return find(THEMES, this.systemDark ? 'dark' : 'light', 'dark');
    return find(THEMES, this.state.theme, 'dark');
  }

  /** 当前生效的变量表（主题 + 重点色覆盖） */
  vars() {
    const v = { ...this.theme.vars, tok: { ...this.theme.vars.tok } };
    const a = this.state.accent;
    if (typeof a === 'string' && a.startsWith('#')) {
      // 自定义色：侧边色按比例调暗，字色按亮度自动选
      const h = normHex(a);
      if (h) { v.accent = h; v.accent2 = shade(h, 0.78); v.onAccent = readableOn(h); }
    } else if (a) {
      const p = find(ACCENTS, a, null);
      if (p) { v.accent = p.c; v.accent2 = p.c2; v.onAccent = p.on; }
    }
    return v;
  }

  /**
   * @param {object} patch 要改的字段
   * @param {{persist?:boolean}} [opts] 取色器拖动的中间态传 persist:false，
   *        免得每移动一像素就往 localStorage 写一次
   */
  set(patch, opts = {}) {
    const next = { ...this.state, ...patch };
    const changed = Object.keys(patch).some((k) => this.state[k] !== next[k]);
    if (!changed) {
      // 值没变也可能正是「拖动收尾」那一拍：input 阶段改完值、change 阶段值就没变了。
      // 这里不补一次落盘的话，只调过取色器就收手的人，颜色下次打开会丢。
      if (opts.persist !== false) this.persist();
      return;
    }
    this.state = next;
    this.apply();
    if (opts.persist !== false) this.persist();
    for (const fn of this._listeners) fn(this.state);
  }

  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* 隐私模式等，忽略 */ } }

  setTheme(id) { this.set({ theme: id, followSystem: false }); }
  setAccent(id, opts) { this.set({ accent: id }, opts); }
  setUiFont(id) { this.set({ uiFont: id }); }
  setCodeFont(id) { this.set({ codeFont: id }); }
  setUiScale(id) { this.set({ uiScale: id }); }
  setCodeScale(id) { this.set({ codeScale: id }); }
  setFollowSystem(on) { this.set({ followSystem: !!on }); }

  reset() { this.state = { ...DEFAULT_APPEARANCE }; this.apply(); this.persist(); for (const fn of this._listeners) fn(this.state); }

  /* ---------------- 分享码 ---------------- */
  /** 导出成一份可粘贴的 JSON（皮肤可以发给别人） */
  exportCode() { return { v: FORMAT, ...this.state }; }

  /** 导入分享码；不是分享码就返回 false，不碰现有外观。返回 true ＝ 套用成功 */
  importCode(text) {
    let o;
    try { o = JSON.parse(String(text).trim()); } catch { return false; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (!Object.keys(o).some((k) => KNOWN_KEYS.has(k))) return false;
    this.state = coerce(o);
    this.apply();
    this.persist();
    for (const fn of this._listeners) fn(this.state);
    return true;
  }

  /** 编译出变量覆盖的 CSS 文本（探针直接断言它） */
  css() {
    const v = this.vars();
    const lines = [];
    for (const [k, name] of Object.entries(VAR_MAP)) {
      if (v[k] != null) lines.push(`  ${name}: ${v[k]};`);
    }
    for (const [k, name] of Object.entries(TOK_MAP)) {
      if (v.tok[k] != null) lines.push(`  ${name}: ${v.tok[k]};`);
    }
    lines.push(`  --ui: ${find(UI_FONTS, this.state.uiFont, 'sans').stack};`);
    lines.push(`  --mono: ${find(CODE_FONTS, this.state.codeFont, 'mono').stack};`);
    lines.push(`  --ui-scale: ${scaleVal(this.state.uiScale)};`);
    lines.push(`  --code-scale: ${scaleVal(this.state.codeScale)};`);
    return `:root {\n${lines.join('\n')}\n}\n`;
  }

  apply() {
    let el = document.getElementById('df-appearance');
    if (!el) {
      el = document.createElement('style');
      el.id = 'df-appearance';
      // 追加在 head 末尾：和 base.css 的 :root 同特异性，靠后者胜出
      document.head.appendChild(el);
    }
    el.textContent = this.css();
    // 深浅色交给宿主，将来系统级细节（滚动条、原生控件）才好跟随
    document.documentElement.dataset.themeDark = this.theme.dark ? '1' : '0';
    document.documentElement.dataset.themeFollowing = this.state.followSystem ? '1' : '0';
  }
}

/* ------------------------------------------------------------------ */
/* 设置对话框                                                          */
/* ------------------------------------------------------------------ */
function swatchStrip(v) {
  const strip = document.createElement('span');
  strip.className = 'ap-strip';
  for (const c of [v.chrome, v.panel, v.accent, v.text]) {
    const i = document.createElement('i');
    i.style.background = c;
    strip.appendChild(i);
  }
  return strip;
}

export function openAppearanceDialog(app) {
  const body = document.createElement('div');
  body.className = 'ap-body';

  /* --- 主题 --- */
  const tSec = document.createElement('div');
  tSec.className = 'ap-section';
  tSec.appendChild(sectionLabel('主题'));
  const grid = document.createElement('div');
  grid.className = 'ap-themes';

  // 第一张是「跟随系统」：它不是一套配色，而是一个模式 —— 系统变它跟着变
  const sysBtn = document.createElement('button');
  sysBtn.className = 'ap-theme';
  const sysStrip = document.createElement('span');
  sysStrip.className = 'ap-strip';
  for (let i = 0; i < 4; i++) sysStrip.appendChild(document.createElement('i'));
  sysBtn.appendChild(sysStrip);
  const sysName = document.createElement('span');
  sysName.className = 'ap-name';
  sysName.textContent = '跟随系统';
  sysBtn.appendChild(sysName);
  sysBtn.addEventListener('click', () => app.setFollowSystem(true));
  grid.appendChild(sysBtn);

  const themeBtns = new Map();
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'ap-theme';
    b.appendChild(swatchStrip(t.vars));
    const nm = document.createElement('span');
    nm.className = 'ap-name';
    nm.textContent = t.name;
    b.appendChild(nm);
    b.addEventListener('click', () => app.setTheme(t.id));
    themeBtns.set(t.id, b);
    grid.appendChild(b);
  }
  tSec.appendChild(grid);
  body.appendChild(tSec);

  /* --- 重点色 --- */
  const aSec = document.createElement('div');
  aSec.className = 'ap-section';
  aSec.appendChild(sectionLabel('重点色'));
  const dots = document.createElement('div');
  dots.className = 'ap-accents';
  const autoBtn = document.createElement('button');
  autoBtn.className = 'ap-auto';
  autoBtn.textContent = '跟随主题';
  autoBtn.addEventListener('click', () => app.setAccent(null));
  dots.appendChild(autoBtn);
  const dotEls = new Map();
  for (const a of ACCENTS) {
    const d = document.createElement('button');
    d.className = 'ap-dot';
    d.title = a.name;
    d.style.background = a.c;
    d.addEventListener('click', () => app.setAccent(a.id));
    dotEls.set(a.id, d);
    dots.appendChild(d);
  }
  // 任意色：8 个预设之外还能自己挑。取色器是原生控件，拖动时事件很密 ——
  // 中间态不落盘（persist:false），松手（change）才存。
  const customLabel = document.createElement('label');
  customLabel.className = 'ap-dot ap-custom';
  customLabel.title = '自定义颜色';
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.value = '#4c97ff';
  customLabel.appendChild(customInput);
  const customPlus = document.createElement('span');
  customPlus.className = 'ap-plus';
  customPlus.textContent = '＋';
  customLabel.appendChild(customPlus);
  customInput.addEventListener('input', () => app.setAccent(customInput.value, { persist: false }));
  customInput.addEventListener('change', () => app.setAccent(customInput.value));
  dots.appendChild(customLabel);
  const customHex = document.createElement('span');
  customHex.className = 'ap-hex';
  dots.appendChild(customHex);
  aSec.appendChild(dots);
  body.appendChild(aSec);

  /* --- 字体与字号 --- */
  const fSec = document.createElement('div');
  fSec.className = 'ap-section';
  fSec.appendChild(sectionLabel('字体与字号'));
  const uiSel = selectOf(UI_FONTS, 'ap-sel-ui-font');
  const codeSel = selectOf(CODE_FONTS, 'ap-sel-code-font');
  const uiScaleSel = selectOf(SCALES, 'ap-sel-ui-scale');
  const codeScaleSel = selectOf(SCALES, 'ap-sel-code-scale');
  fSec.appendChild(fieldRow('界面字体', uiSel));
  fSec.appendChild(fieldRow('界面字号', uiScaleSel));
  fSec.appendChild(fieldRow('代码字体', codeSel));
  fSec.appendChild(fieldRow('代码字号', codeScaleSel));
  body.appendChild(fSec);

  /* --- 实时预览：用的就是编辑器自己的高亮函数和 class --- */
  const pSec = document.createElement('div');
  pSec.className = 'ap-section';
  pSec.appendChild(sectionLabel('预览'));
  const pre = document.createElement('pre');
  pre.className = 'ap-preview';
  pre.innerHTML = highlight([
    '// @on update',
    'const speed = 3.5;',
    'df.move(speed, 0);   // 注释',
    "if (vars.hp <= 0) df.broadcast('game over');",
  ].join('\n'));
  pSec.appendChild(pre);
  body.appendChild(pSec);

  /* --- 分享码 --- */
  const sSec = document.createElement('div');
  sSec.className = 'ap-section';
  sSec.appendChild(sectionLabel('分享码'));
  const share = document.createElement('div');
  share.className = 'ap-share';
  const shareBox = document.createElement('textarea');
  shareBox.className = 'ap-share-code';
  shareBox.spellcheck = false;
  shareBox.placeholder = '把一套外观发给别人：点「生成分享码」复制走；拿到别人的就粘到这里点「应用分享码」';
  share.appendChild(shareBox);
  const shareBtns = document.createElement('div');
  shareBtns.className = 'ap-share-btns';
  const genBtn = document.createElement('button');
  genBtn.textContent = '生成分享码';
  genBtn.addEventListener('click', () => {
    shareBox.value = JSON.stringify(app.exportCode());
    shareBox.focus();
    shareBox.select();
    toast('已生成，Ctrl+C 复制走', 'info');
  });
  const useBtn = document.createElement('button');
  useBtn.textContent = '应用分享码';
  useBtn.addEventListener('click', () => {
    if (!shareBox.value.trim()) { toast('先粘一份分享码进来', 'warn'); return; }
    if (app.importCode(shareBox.value)) toast('外观已套用', 'ok');
    else toast('这个分享码认不出来（一个字段都不认识）', 'err');
  });
  shareBtns.append(genBtn, useBtn);
  share.appendChild(shareBtns);
  sSec.appendChild(share);
  body.appendChild(sSec);

  body.appendChild(hint(
    '外观只影响编辑器界面，不会写进项目文件 —— 换台机器打开同一个游戏，样式各自保留。<br>' +
    '积木颜色是 Scratch 官方分类色，不跟着换；独立运行窗口和全屏游玩也保持深色，那是游戏画面。'
  ));

  const sync = () => {
    // 「跟随系统」高亮时，同时生效的那套主题再给个虚线框 ——
    // 让「我选的是哪套」和「现在用的是哪套」能同时看见
    // （关掉跟随系统会回到你选的那套，所以这个信息不能丢）
    const effective = app.theme.id;
    sysBtn.classList.toggle('on', app.state.followSystem);
    for (const [id, b] of themeBtns) {
      b.classList.toggle('on', !app.state.followSystem && id === app.state.theme);
      b.classList.toggle('eff', app.state.followSystem && id === effective);
    }
    const eff = app.theme.vars;
    [...sysStrip.children].forEach((i, idx) => {
      i.style.background = [eff.chrome, eff.panel, eff.accent, eff.text][idx];
    });
    for (const [id, d] of dotEls) d.classList.toggle('on', id === app.state.accent);
    const custom = typeof app.state.accent === 'string' && app.state.accent.startsWith('#');
    customLabel.classList.toggle('on', custom);
    autoBtn.classList.toggle('on', app.state.accent === null);
    if (custom) customInput.value = normHex(app.state.accent) || customInput.value;
    customLabel.style.background = custom && normHex(app.state.accent) ? normHex(app.state.accent) : '';
    customHex.textContent = custom ? normHex(app.state.accent) : '';
    uiSel.value = app.state.uiFont;
    codeSel.value = app.state.codeFont;
    uiScaleSel.value = app.state.uiScale;
    codeScaleSel.value = app.state.codeScale;
  };
  uiSel.addEventListener('change', () => app.setUiFont(uiSel.value));
  codeSel.addEventListener('change', () => app.setCodeFont(codeSel.value));
  uiScaleSel.addEventListener('change', () => app.setUiScale(uiScaleSel.value));
  codeScaleSel.addEventListener('change', () => app.setCodeScale(codeScaleSel.value));

  let off = null;
  return showModal({
    title: '外观 · 编辑器',
    body,
    width: 600,
    cancelText: '完成',
    okText: '恢复默认',
    // 返回 false ＝ 不关窗，改完继续调
    onOk: () => { app.reset(); return false; },
    onMount: () => { off = app.onChange(sync); sync(); },
    // 关窗就退订，不然重开几次会攒下一堆失效的同步回调
    onClose: () => { if (off) off(); },
  });
}

function sectionLabel(text) {
  const d = document.createElement('div');
  d.className = 'ap-label';
  d.textContent = text;
  return d;
}

function fieldRow(label, control) {
  const r = document.createElement('div');
  r.className = 'ap-row';
  const l = document.createElement('label');
  l.textContent = label;
  r.append(l, control);
  return r;
}

function selectOf(list, cls) {
  const s = document.createElement('select');
  if (cls) s.className = cls;   // 探针按类名找控件，不靠「第几个 select」这种脆弱下标
  for (const x of list) {
    const o = document.createElement('option');
    o.value = x.id;
    o.textContent = x.name;
    s.appendChild(o);
  }
  return s;
}
