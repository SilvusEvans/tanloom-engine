/**
 * Tanloom Engine — i18n 引擎
 * ================================================================
 * 三种语言：English / 简体中文 / 繁體中文（`LANGS`）。**英语是默认与兜底** ——
 * 任何缺失的译文都退回英文，而不是退回中文。
 *
 * 三条设计决定，都是有原因的：
 *
 * 1. **以简体原文当 key**。`t('保存')` 里的 `'保存'` 就是键，字典里存
 *    `'保存': { en: 'Save', 'zh-Hant': '儲存' }`。好处是不用另起 300 个键名、
 *    也不会出现「键名和文案对不上」；代价是英文读者看到的中文字面量仍在源码里 ——
 *    换来的是改文案不会漏改字典（测试会发现）。
 * 2. **语言在模块加载时就定下**（`lang`），所以 `defs.js` 那种在模块顶层
 *    建表的文件也能直接用 `t()`，不需要把每张表都改成惰性求值。
 * 3. **切语言 = 存盘 + 重载窗口**，和 Scratch 自己的做法一致。积木的文案来自
 *    三处：本表的自定义积木、scratch-blocks 的原生积木（它内嵌 79 种语言，
 *    走 `Blockly.ScratchMsgs.setLocale`）、以及各个面板的 DOM。与其到处写
 *    「热更新」的补丁，不如一次性全部重建 —— 重载是唯一不会漏掉某一处的做法。
 *
 * 名字对齐：`zh-Hans` → Scratch 的 `zh-cn`，`zh-Hant` → 它的 `zh-tw`。
 */
import { UI } from './i18n-ui.js';
import { SHELL } from './i18n-shell.js';
import { BLOCKS } from './i18n-blocks.js';
import { MSG } from './i18n-msg.js';
import { TPL } from './i18n-tpl.js';
import { OPTIONS } from './i18n-options.js';
import { HELP } from './i18n-help.js';

export const LANGS = [
  { id: 'en', label: 'English', scratch: 'en' },
  { id: 'zh-Hans', label: '简体中文', scratch: 'zh-cn' },
  { id: 'zh-Hant', label: '繁體中文', scratch: 'zh-tw' },
];

/** 英语优先 —— 缺译文一律退到英语，而不是退到中文 */
export const DEFAULT_LANG = 'en';

const STORE_KEY = 'tanloom.lang';
const LANG_IDS = LANGS.map((l) => l.id);

/** 全部「简体原文 → 译文」的字典，五份合起来查 */
const DICT = { ...UI, ...SHELL, ...BLOCKS, ...MSG, ...TPL };

/** 下拉项 / 属性名的译文：`命名空间.值 id` → 译文（见 i18n-options.js） */
export const OPTIONS_DICT = OPTIONS;

function fromStorage() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return LANG_IDS.includes(v) ? v : null;
  } catch { return null; }
}

/**
 * 系统语言 → 我们的语言 id：`zh-TW` 走繁体，其余 `zh-*` 走简体，其他一律英语
 */
export function langFromTag(tag) {
  const s = String(tag || '').toLowerCase();
  if (s.startsWith('zh')) {
    return /hant|tw|hk|mo/.test(s) ? 'zh-Hant' : 'zh-Hans';
  }
  return DEFAULT_LANG;
}

/**
 * 探测语言：手动选择 > 系统语言 > 浏览器语言 > 英语。
 *
 * **不能只看 `navigator.language`**：Electron 不设 `--lang` 时它固定回 `en-US`，
 * 于是中文系统上会误判成英语（实测：`navigator.language` = en-US 而
 * `app.getSystemLocale()` = zh-CN）。所以主进程把系统语言通过 preload 传进来
 * （`window.tanloom.systemLocale`），优先用它；`navigator.languages` 只作后备。
 */
function detect() {
  const saved = fromStorage();
  if (saved) return saved;

  const candidates = [];
  try {
    if (typeof window !== 'undefined' && window.tanloom && window.tanloom.systemLocale) {
      candidates.push(window.tanloom.systemLocale);
    }
  } catch { /* 没有 preload（例如画廊页）就跳过 */ }
  try {
    candidates.push(...(navigator.languages || []), navigator.language);
  } catch { /* 非浏览器环境 */ }

  const clean = candidates.filter(Boolean);
  // 有中文就用中文，没有才退到英语 —— 英语是**缺省**，不是「优先」
  const zh = clean.find((c) => /^zh/i.test(String(c)));
  return zh ? langFromTag(zh) : DEFAULT_LANG;
}

/** 当前语言（模块加载时就定下 —— 见文件头第 2 条） */
export let lang = detect();

/* ------------------------------------------------------------------ */
/* 翻译                                                                */
/* ------------------------------------------------------------------ */

/**
 * 取译文。
 * @param {string} s 简体原文，同时是键
 * @param {object} [params] `{n}` 形式的占位符取值
 */
export function t(s, params) {
  if (typeof s !== 'string') return s;
  let out = s;
  if (lang !== 'zh-Hans') {
    const hit = DICT[s];
    // 英语是兜底：查不到英文时宁愿显示原文（能被测试抓到），也不要静默变成空串
    out = (hit && (hit[lang] || hit[DEFAULT_LANG])) || s;
  }
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  return out;
}

/**
 * 下拉项 / 属性名的译文。值 id 是稳定标识（'Space' / 'abs' / 'x'），
 * 在三种语言里不变 —— 只有显示名变。
 * @param {string} value 值 id
 * @param {string} [fallback] 查不到时用的原文（简体）
 * @param {string} [ns] 命名空间（'key' / 'stop' / 'prop' …，见 i18n-options.js）
 */
export function opt(value, fallback, ns) {
  const key = ns ? `${ns}.${value}` : value;
  const hit = OPTIONS_DICT[key];
  if (!hit) return fallback != null ? fallback : value;
  if (lang === 'zh-Hans') return hit['zh-Hans'] || fallback || value;
  return hit[lang] || hit[DEFAULT_LANG] || fallback || value;
}

/**
 * 把 `[[原文, 值], …]` 的下拉选项整批本地化 —— 给 scratch-blocks 的
 * `field_dropdown` 用（它在建积木定义时才读这些，所以每次 `defineBlocks()`
 * 都会重新算一遍）。
 *
 * 命名空间优先取参数，其次取数组自己的 `.ns` 属性（选项表就是这么标的）。
 */
export function localizePairs(pairs, ns) {
  const space = ns || (pairs && pairs.ns) || '';
  return (pairs || []).map(([label, value]) => [opt(value, label, space), value]);
}

/** `[{label, value}, …]` 形式的选项整批本地化 */
export function localizeObjects(list, ns) {
  const space = ns || (list && list.ns) || '';
  return (list || []).map((o) => ({ ...o, label: opt(o.value, o.label, space) }));
}

/** 当前语言对应的 scratch-blocks 语言名 */
export function scratchLocale() {
  const hit = LANGS.find((l) => l.id === lang);
  return (hit && hit.scratch) || 'en';
}

/** 帮助对话框正文（按语言直接取，不走「原文当键」那套，见 i18n-help.js） */
export function helpHtml() {
  return HELP[lang] || HELP[DEFAULT_LANG];
}

/* ------------------------------------------------------------------ */
/* 切换                                                                */
/* ------------------------------------------------------------------ */

/**
 * 切语言。默认**存盘后重载窗口**（原因见文件头第 3 条）。
 * @param {string} next
 * @param {{reload?:boolean}} [opts]
 * @returns {boolean} 是否真的变了
 */
export function setLang(next, opts = {}) {
  if (!LANG_IDS.includes(next) || next === lang) return false;
  lang = next;
  try { localStorage.setItem(STORE_KEY, next); } catch { /* 隐私模式等，忽略 */ }
  if (opts.reload !== false && typeof location !== 'undefined' && location.reload) {
    location.reload();
  }
  return true;
}

/** 语言选项（给外观对话框的「语言」一行用） */
export function langChoices() {
  return LANGS.map((l) => ({ value: l.id, label: l.label }));
}

/* ------------------------------------------------------------------ */
/* DOM 静态文案                                                        */
/* ------------------------------------------------------------------ */

/**
 * 把 HTML 里标了 `data-i18n` 的静态文案本地化：
 *   data-i18n="原文"        → textContent
 *   data-i18n-title="原文"  → title 属性
 *   data-i18n-ph="原文"     → placeholder 属性
 * 这样 index.html / player.html 不必在启动脚本里写一堆赋值。
 */
export function localizeDom(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  for (const el of scope.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of scope.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of scope.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}

/* ------------------------------------------------------------------ */
/* 自检用                                                              */
/* ------------------------------------------------------------------ */

/** 所有字典键（完整性测试用） */
export function allKeys() {
  return Object.keys(DICT);
}

/** 每个键缺哪些语言的译文（空数组 = 齐了） */
export function missingLangs() {
  const need = LANG_IDS.filter((l) => l !== 'zh-Hans');
  const out = {};
  for (const [key, entry] of Object.entries(DICT)) {
    const miss = need.filter((l) => !entry || !String(entry[l] || '').trim());
    if (miss.length) out[key] = miss;
  }
  return out;
}
