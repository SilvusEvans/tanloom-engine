/**
 * Material You（Material Design 3）配色
 * ================================================================
 * Material You 的要点不是「某一套固定色板」，而是**从一颗种子色长出一整套**：
 * 用户挑一个颜色，界面上的主色、容器色、中性灰全部由它派生。
 * 所以我们不存色板，存算法：
 *
 *   1. sRGB ↔ OKLab/OKLCH 互转 —— 感知均匀，拉出来的色阶不会一段灰一段艳
 *   2. 色调色板 tonal palette —— 同一色相 + 同一彩度，按 tone（0=黑 / 100=白）取色
 *   3. 角色配色 scheme —— 把色板上的具体 tone 映射成 M3 的角色
 *      （primary / secondary / tertiary / surface 容器 / outline / inverse …）
 *
 * 超出 sRGB 色域时按彩度递减裁剪：极高、极低的 tone 会自然变灰，
 * 这正是 M3 色板在两端的行为（tone 100 一定是白，tone 0 一定是黑）。
 *
 * tone 用的是 L*（HCT 口径），OKLab 的 L ≈ (L* + 16) / 116。
 * 彩度用 HCT 口径的整数（蓝 36 左右），乘 C2OK 换成 OKLCH 的彩度。
 */

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const byte = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
const toHex = (rgb) => '#' + rgb.map(byte).join('');

/** '#abc' / 'abc' / '#aabbcc' → [r, g, b]（0..1）；认不出来返回 null */
export function parseHex(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s == null ? '' : s).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** 统一成 6 位小写 hex */
export function normHex(s) {
  const c = parseHex(s);
  return c ? toHex(c) : null;
}

/* ------------------------------------------------------------------ */
/* OKLab / OKLCH                                                       */
/* ------------------------------------------------------------------ */
function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

/** hex → [L, C, h]：L 0..1、C 是 OKLCH 彩度、h 是角度 0..360 */
export function hexToOklch(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return [0.6, 0, 258.5];
  const [L, a, b] = rgbToOklab(rgb);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

const toneL = (t) => clamp((clamp(t, 0, 100) + 16) / 116, 0, 1);

/** HCT 彩度（整数口径）→ OKLCH 彩度 */
const C2OK = 0.0042;

/** OKLCH → hex；超出 sRGB 就按彩度递减裁剪（最多 48 次，够收敛） */
export function oklchToHex(L, C, h) {
  const rad = (h * Math.PI) / 180;
  let c = C;
  let rgb = oklabToRgb([L, c * Math.cos(rad), c * Math.sin(rad)]);
  const out = (v) => v < -0.001 || v > 1.001;
  for (let i = 0; i < 48 && rgb.some(out); i++) {
    c *= 0.94;
    rgb = oklabToRgb([L, c * Math.cos(rad), c * Math.sin(rad)]);
  }
  return toHex(rgb);
}

/* ------------------------------------------------------------------ */
/* 色调色板                                                            */
/* ------------------------------------------------------------------ */
/**
 * 一条色板 = 固定色相 + 固定彩度，只按 tone 取色。
 * tone 0 是黑、100 是白，中间是这条色相上「同等鲜艳度」的一串颜色。
 *
 * @param {number} hue    色相（度）
 * @param {number} chroma 彩度（HCT 口径：中性 6、普通 36、鲜艳 48）
 */
export function tonalPalette(hue, chroma) {
  const cache = new Map();
  return {
    hue,
    chroma,
    tone(t) {
      const k = Math.round(clamp(t, 0, 100));
      if (!cache.has(k)) cache.set(k, oklchToHex(toneL(k), chroma * C2OK, hue));
      return cache.get(k);
    },
  };
}

/* ------------------------------------------------------------------ */
/* 方案变体                                                            */
/* ------------------------------------------------------------------ */
/**
 * 同一颗种子可以长出几种性格：
 *   tonalSpot  M3 默认 —— 主色固定 36 彩度，稳
 *   vibrant    更艳（48），副色也跟着提
 *   expressive 主色偏移 15°、第三色拉开 90°，对比更强
 *   fidelity   尊重种子本身的彩度（挑了灰就是灰）
 *   neutral    几乎无彩，只剩一点点色相
 */
export const MD3_VARIANTS = ['tonalSpot', 'vibrant', 'expressive', 'fidelity', 'neutral'];

/** M3 的错误色色相固定在 25°（红），不跟着种子走 —— 报错永远是红的 */
const HUE_ERROR = 25;
const HUE_GREEN = 145;
const HUE_AMBER = 75;
/** 灰种子（彩度太低）时色相不可靠，用 M3 的兜底色相 */
const HUE_FALLBACK = 258.5;

/* ------------------------------------------------------------------ */
/* 角色配色                                                            */
/* ------------------------------------------------------------------ */
/**
 * 生成一套 M3 角色色。
 *
 * 深浅不是「把颜色调亮调暗」，而是**换一组 tone**：
 * 浅色模式主色取 tone 40（深、压得住白底），深色模式取 tone 80（浅、浮得起黑底）。
 * 容器色同理：浅色用 tone 90 的淡色块，深色用 tone 30 的重色块。
 *
 * @param {string} seedHex 种子色（通常就是用户挑的重点色）
 * @param {boolean} dark   深色模式
 * @param {string} variant 变体，见 MD3_VARIANTS
 */
export function md3Scheme(seedHex, dark, variant = 'tonalSpot') {
  const [, cs, hs] = hexToOklch(seedHex);
  const seedC = cs / C2OK;
  const grey = seedC < 8;                       // 灰种子：色相算出来不可信
  const hue = grey ? HUE_FALLBACK : hs;

  let pC = 36, sC = 16, tC = 24, tShift = 60, pShift = 0, nC = 6, nvC = 8;
  if (variant === 'vibrant') { pC = 48; sC = 24; tC = 32; nC = 8; nvC = 12; }
  else if (variant === 'expressive') { pC = 40; sC = 24; tC = 40; tShift = 90; pShift = 15; nC = 8; nvC = 12; }
  else if (variant === 'fidelity') { pC = grey ? 36 : clamp(seedC, 24, 96); sC = pC * 0.45; tC = pC * 0.7; }
  else if (variant === 'neutral') { pC = 12; sC = 8; tC = 14; nC = 6; nvC = 8; }

  const P = tonalPalette(hue + pShift, pC);
  const S = tonalPalette(hue + pShift, sC);
  const T = tonalPalette(hue + pShift + tShift, tC);
  const N = tonalPalette(hue, nC);
  const NV = tonalPalette(hue, nvC);
  // 语义色不跟种子走：报错永远红、通过永远绿，不然换个种子就认不出来了
  const E = tonalPalette(HUE_ERROR, 50);
  const G = tonalPalette(HUE_GREEN, 42);
  const A = tonalPalette(HUE_AMBER, 52);

  const t = dark ? TONE.dark : TONE.light;
  const sem = t.sem, semDim = t.semDim;

  return {
    seed: normHex(seedHex) || '#4c97ff',
    variant,
    dark: !!dark,
    /* 主色族 */
    primary: P.tone(t.p), onPrimary: P.tone(t.onP),
    primaryContainer: P.tone(t.pc), onPrimaryContainer: P.tone(t.onPc),
    /** 主色描边：比主色稍重一档，给实心按钮压边用 */
    primaryEdge: P.tone(t.pEdge),
    /* 副色族 */
    secondary: S.tone(t.s), onSecondary: S.tone(t.onS),
    secondaryContainer: S.tone(t.sc), onSecondaryContainer: S.tone(t.onSc),
    /* 第三色族 */
    tertiary: T.tone(t.tt), onTertiary: T.tone(t.onT),
    tertiaryContainer: T.tone(t.tc), onTertiaryContainer: T.tone(t.onTc),
    /* 错误色族 */
    error: E.tone(t.e), onError: E.tone(t.onE),
    errorContainer: E.tone(t.ec), onErrorContainer: E.tone(t.onEc),
    /* 表面与文字 */
    background: N.tone(t.bg), onBackground: N.tone(t.onBg),
    surface: N.tone(t.sf), onSurface: N.tone(t.onSf),
    surfaceVariant: NV.tone(t.sv), onSurfaceVariant: NV.tone(t.onSv),
    /* 表面容器：M3 用「一层层变亮的灰」表达层次，而不是描边 */
    surfaceContainerLowest: N.tone(t.c1),
    surfaceContainerLow: N.tone(t.c2),
    surfaceContainer: N.tone(t.c3),
    surfaceContainerHigh: N.tone(t.c4),
    surfaceContainerHighest: N.tone(t.c5),
    surfaceDim: N.tone(t.dim),
    surfaceBright: N.tone(t.bright),
    /* 描边 */
    outline: NV.tone(t.ol),
    outlineVariant: NV.tone(t.olv),
    /* 反色（提示条用：深色模式里它是浅块，浅色模式里它是深块） */
    inverseSurface: N.tone(t.inv), inverseOnSurface: N.tone(t.onInv), inversePrimary: P.tone(t.invP),
    surfaceTint: P.tone(t.p),
    /* 语义色（日志、状态条） */
    green: G.tone(sem), amber: A.tone(sem), red: E.tone(sem),
    purple: T.tone(sem), info: P.tone(sem),
    purpleFg: T.tone(semDim),
    /**
     * 提示条（snackbar）用的是**反色块**：深色模式里它是浅块、浅色模式里它是深块。
     * 所以这三个语义色要按反色块取 tone，不能复用上面那组（否则深色模式下
     * 浅绿字压在浅块上，等于看不见）。
     */
    inverseSem: {
      ok: G.tone(dark ? 40 : 80),
      warn: A.tone(dark ? 40 : 80),
      err: E.tone(dark ? 40 : 80),
    },
    /* 代码高亮：也从这颗种子长出来，所以代码区和界面是一家人 */
    tok: {
      kw: P.tone(dark ? 80 : 30),
      str: G.tone(dark ? 78 : 36),
      num: A.tone(dark ? 82 : 38),
      com: N.tone(dark ? 52 : 58),
      ann: T.tone(dark ? 82 : 40),
      type: S.tone(dark ? 86 : 34),
      fn: P.tone(dark ? 92 : 44),
    },
  };
}

/** M3 规定的 tone 取值（深浅两套） */
const TONE = {
  light: {
    p: 40, onP: 100, pc: 90, onPc: 10, pEdge: 30,
    s: 40, onS: 100, sc: 90, onSc: 10,
    tt: 40, onT: 100, tc: 90, onTc: 10,
    e: 40, onE: 100, ec: 90, onEc: 10,
    bg: 98, onBg: 10, sf: 98, onSf: 10, sv: 90, onSv: 30,
    ol: 50, olv: 80,
    c1: 100, c2: 96, c3: 94, c4: 92, c5: 90, dim: 87, bright: 98,
    inv: 20, onInv: 95, invP: 80,
    sem: 40, semDim: 30,
  },
  dark: {
    p: 80, onP: 20, pc: 30, onPc: 90, pEdge: 68,
    s: 80, onS: 20, sc: 30, onSc: 90,
    tt: 80, onT: 20, tc: 30, onTc: 90,
    e: 80, onE: 20, ec: 30, onEc: 90,
    bg: 6, onBg: 90, sf: 6, onSf: 90, sv: 30, onSv: 80,
    ol: 60, olv: 30,
    c1: 4, c2: 10, c3: 12, c4: 17, c5: 22, dim: 6, bright: 24,
    inv: 90, onInv: 20, invP: 40,
    sem: 80, semDim: 90,
  },
};

/* ------------------------------------------------------------------ */
/* 映射成本工程的主题变量                                               */
/* ------------------------------------------------------------------ */
/**
 * 把 M3 角色色翻译成 appearance.js 认得的那套变量名
 * （chrome / panel / border / text … —— 样式表读的还是这些）。
 * 这样「换上 Material You」不需要改任何一条 CSS 规则，只是变量换了来源。
 *
 * @param {object} scheme md3Scheme() 的产物
 * @param {object} base   该主题继承的底色（工作区背景、舞台背景这些跟皮肤无关的）
 */
export function md3Vars(scheme, base) {
  const m = scheme;
  const dark = m.dark;
  return {
    chrome: m.background,
    chrome2: m.surfaceContainerLow,
    panel: m.surfaceContainerHigh,
    panel2: m.surfaceContainerHighest,
    // M3 用层次代替描边，所以边框只留很淡的一档
    border: m.outlineVariant,
    borderSoft: m.outlineVariant,
    text: m.onSurface,
    textDim: m.onSurfaceVariant,
    textMute: m.outline,
    accent: m.primary,
    accent2: m.primaryEdge,
    onAccent: m.onPrimary,
    purple: m.purple,
    purpleFg: m.purpleFg,
    green: m.green,
    amber: m.amber,
    red: m.red,
    info: m.info,
    // 工作区（积木画布）和舞台是内容区，保持原有的浅底 / 深底不跟着染
    wsBg: base.wsBg,
    wsBg2: base.wsBg2,
    stageBg: base.stageBg,
    // 顶栏是 M3 的 top app bar：一整块平色，不要渐变
    topbarA: m.surfaceContainer,
    topbarB: m.surfaceContainer,
    btnHoverBg: `color-mix(in srgb, ${m.onSurface} 8%, ${m.surfaceContainerHighest})`,
    btnHoverBd: m.outline,
    scroll: `color-mix(in srgb, ${m.onSurface} 22%, transparent)`,
    scrollHi: `color-mix(in srgb, ${m.onSurface} 36%, transparent)`,
    wash: `color-mix(in srgb, ${m.onSurface} 8%, transparent)`,
    // 遮罩要压暗：深色模式用黑，浅色模式用「文字色」的淡版（文字色在浅色下是深色）
    scrim: dark ? 'rgba(0, 0, 0, .58)' : `color-mix(in srgb, ${m.onSurface} 34%, transparent)`,
    tagBg: m.secondaryContainer,
    tagFg: m.onSecondaryContainer,
    tagBd: 'transparent',
    codeBg: m.surfaceContainerLowest,
    codeCaret: m.onSurface,
    shadow: dark
      ? '0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15)'
      : '0 1px 2px rgba(31,41,55,.18), 0 2px 6px 2px rgba(31,41,55,.10)',
    shadowSm: dark
      ? '0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)'
      : '0 1px 2px rgba(31,41,55,.16), 0 1px 3px rgba(31,41,55,.10)',
    tok: { ...m.tok },
  };
}

/** M3 的 elevation：三层，越往上阴影越「飘」 */
export const MD3_ELEVATION = {
  1: '0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)',
  2: '0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15)',
  3: '0 1px 3px rgba(0,0,0,.30), 0 4px 8px 3px rgba(0,0,0,.15)',
};

/** M3 的标准动效曲线（emphasized decelerate）：起步快、收尾软 */
export const MD3_EASING = 'cubic-bezier(.2, 0, 0, 1)';
