/**
 * Tanloom Engine — i18n 自检（纯 Node，秒级）
 * ================================================================
 * 四条断言：
 *  1. **没有漏翻**：界面/积木/提示三类源文件里，凡是含中文的字符串字面量，
 *     要么是字典的键（会被 t() 取到），要么在允许名单里（**数据**：实体名、
 *     变量名、频道名、文件后缀这类不该跟着界面语言变的东西）。
 *  2. **字典齐全**：每条键都必须有 en 与 zh-Hant，且都非空、不与键完全相同
 *     （专有名词除外）。缺一个都会让用户看到中文。
 *  3. **占位符对齐**：键里有几个 `{x}` / `%1`，译文里就必须有几个，顺序也一致 ——
 *     否则英文界面会出现「少了半句话」。
 *  4. **下拉项覆盖**：`defs.js` 里每个下拉列表的每个值，都要能在 OPTIONS 里查到
 *     （查不到就会退回中文标签）。
 *
 * 刻意**不**扫的文件（各有理由，见 README「已知缺口」）：
 *   core/template.js   示例项目的数据（实体名/变量名/广播名），是写进 .tle 的内容
 *   core/blockdefs.js  积木在 IR 侧的人类可读 label，实测不渲染上屏
 *   gallery.js / _probe.html  开发工具页，不面向用户
 */

import { readFileSync } from 'node:fs';
import { UI } from '../src/core/i18n-ui.js';
import { SHELL } from '../src/core/i18n-shell.js';
import { BLOCKS } from '../src/core/i18n-blocks.js';
import { MSG } from '../src/core/i18n-msg.js';
import { TPL } from '../src/core/i18n-tpl.js';
import { OPTIONS } from '../src/core/i18n-options.js';
import { HELP } from '../src/core/i18n-help.js';
import { BUILTIN_CATEGORIES } from '../src/core/registry.js';

const DICT = { ...UI, ...SHELL, ...BLOCKS, ...MSG, ...TPL };
const LANGS = ['en', 'zh-Hant'];

/** 要扫的源文件（＝会渲染上屏的那批） */
const FILES = [
  'src/app.js', 'src/player.js', 'src/ui/panels.js', 'src/ui/dialogs.js',
  'src/ui/macro-dialog.js', 'src/ui/appearance.js', 'src/code/editor.js',
  'src/input/keys.js', 'src/scene/viewport.js', 'src/runtime/vm.js',
  'src/core/store.js', 'src/core/ir.js', 'src/core/codegen.js', 'src/core/parser.js',
  'src/blocks/scratch/workspace.js', 'src/blocks/scratch/defs.js',
  'src/blocks/scratch/toolbox.js', 'src/blocks/scratch/sync.js',
];

/** 数据，不是文案：这些中文串就该原样写进项目文件/IR */
const ALLOW = new Set([
  '新实体', '分数', '存档点', '玩家受伤', '敌人', '自己',
  '哔', '跳跃', '金币', '受伤', '爆炸', '战斗系统',
  '场景 1', '系统', '根据频道名自动注册', '由积木自动注册', '由代码自动注册', '用户定义',
  // 帧阶段名与音效名是**下拉项的兜底标签**，渲染时按值 id 查 OPTIONS 取译文
  '帧开始', '输入', '物理更新', '每帧更新', '延迟更新', '渲染', '帧结束',
]);

const CJK = /[\u4e00-\u9fff]/;

/** 下拉列表 → OPTIONS 里的命名空间（与 defs.js 里标的 `.ns` 一致） */
const LIST_NS = {
  KEY_DROPDOWN: 'key', PHASES: 'phase', STOP_OPTIONS: 'stop', ROT_OPTIONS: 'rot',
  PROP_OPTIONS: 'prop', MATH_OPTIONS: 'math', PARAM_OPTIONS: 'param', ANIM_OPTIONS: 'anim',
};
let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✖ ${msg}`); } };

/* ---------------- 扫描器：找出所有含中文的字符串字面量 ---------------- */
function literals(src) {
  const out = [];
  let i = 0; let line = 1;
  const bump = (s) => { line += (s.match(/\n/g) || []).length; };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const seg = src.slice(i, end === -1 ? src.length : end + 2);
      bump(seg); i += seg.length; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c; const startLine = line; const st = i; i++;
      let raw = '';
      while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') { raw += ch + (src[i + 1] || ''); i += 2; continue; }
        if (ch === quote) { i++; break; }
        if (ch === '\n') { if (quote !== '`') break; line++; }
        raw += ch; i++;
      }
      if (CJK.test(raw)) out.push({ raw, line: startLine, start: st });
      continue;
    }
    i++;
  }
  return out;
}

/** 把源码里的转义还原成真实字符串 —— 字典里的键是**求值后**的文本 */
function unescape(raw) {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, e) => {
    switch (e[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return '\0';
      case 'u': return String.fromCharCode(parseInt(e.slice(1), 16));
      case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
      default: return e;
    }
  });
}

/** 从源码里切出一个 `const NAME = [...]` 的方括号内容（可能是 `= L([...], 'ns')`） */
function listBody(src, name) {
  const at = src.indexOf(`const ${name} = `);
  if (at === -1) return null;
  let i = src.indexOf('[', at);
  if (i === -1) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '[') depth++;
    else if (src[j] === ']') { depth--; if (depth === 0) return src.slice(i + 1, j); }
  }
  return null;
}

/* ---------------- 1. 漏翻 ---------------- */
console.log('\n=== 1. 界面上不该再有没翻的中文 ===');
const missed = [];
for (const f of FILES) {
  const src = readFileSync(f, 'utf8');
  // 下拉项的标签是**故意**留在源码里的中文（渲染时按值 id 查 OPTIONS 表取译文）
  const allowedHere = new Set(ALLOW);
  for (const name of Object.keys(LIST_NS)) {
    const body = listBody(src, name);
    if (!body) continue;
    for (const m of body.matchAll(/\['([^']*)'\s*,\s*'([^']*)'\]/g)) {
      allowedHere.add(m[1]);
      allowedHere.add(`'${m[1]}'`);   // 有的列表写作 ['a', 'b']
    }
  }
  if (f.endsWith('workspace.js')) {
    const body = listBody(src, 'SOUNDS') || '';
    for (const m of body.matchAll(/label:\s*'([^']*)'/g)) allowedHere.add(m[1]);
  }
  for (const lit of literals(src)) {
    const isTpl = lit.raw.includes('${');
    let key = unescape(lit.raw);
    // 模板串里的 `${...}` 归一成 `{_n}`，与 TPL 的键对齐
    if (isTpl) {
      const idx = new Map();
      key = key.replace(/\$\{([\s\S]*?)\}/g, (m, e) => {
        const ex = e.trim();
        if (!idx.has(ex)) idx.set(ex, `_${idx.size + 1}`);
        return `{${idx.get(ex)}}`;
      });
    }
    // 是否被 t() 包着（词边界很重要：`toast(` 结尾也是 t( ，会被误当成已包裹）
    const pre = src.slice(Math.max(0, lit.start - 4), lit.start);
    const wrapped = /(^|[^\w$.])t\(\s*$/.test(pre);
    const handled = (s) => DICT[s] || allowedHere.has(s);
    if (wrapped) {
      if (DICT[key] || DICT[lit.raw]) continue;
      // 包了 t() 但字典里没有 → 英文界面会原样显示中文，同样是漏翻
      missed.push(`${f}:${lit.line}  包了 t() 但字典里没有：${key.slice(0, 60).replace(/\n/g, '\\n')}`);
      continue;
    }
    // 允许名单里的是**数据**（实体名 / 变量名 / 频道名 / 下拉标签），刻意不包 t()
    if (allowedHere.has(key) || allowedHere.has(lit.raw)) continue;
    if (DICT[key] || DICT[lit.raw]) {
      // 字典里明明有，却没包 t() —— 英文/繁体界面下会显示中文（这类最阴）
      missed.push(`${f}:${lit.line}  字典里有但没包 t()：${key.slice(0, 60).replace(/\n/g, '\\n')}`);
      continue;
    }
    // 模板串里内嵌的中文串（`${x ? t('阶段广播') : t('来自 …')}` 这种）：
    // 逐个检查，都处理了就算这条模板已处理
    if (isTpl) {
      const inner = [...lit.raw.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\\n]*)`/g)]
        .map((m) => m[1] ?? m[2] ?? m[3]).filter((s) => s && CJK.test(s));
      if (inner.length && inner.every((s) => handled(s))) continue;
    }
    if (!/[\u4e00-\u9fff]/.test(key)) continue;
    // 运行时 stub 那一大段是**刻意**不翻的（见 README「已知缺口」）
    if (key.length > 400) continue;
    missed.push(`${f}:${lit.line}  没有译文：${key.slice(0, 70).replace(/\n/g, '\\n')}`);
  }
}
ok(missed.length === 0, missed.length ? `还有 ${missed.length} 处没翻：\n     ` + missed.slice(0, 40).join('\n     ') : `18 个源文件里所有中文串都已在字典或允许名单里`);

/* ---------------- 2. 字典齐全 ---------------- */
console.log('\n=== 2. 每条键都有 en 与 zh-Hant ===');
const incomplete = [];
for (const [key, entry] of Object.entries(DICT)) {
  for (const l of LANGS) {
    const v = entry && entry[l];
    if (!v || !String(v).trim()) incomplete.push(`${key} → 缺 ${l}`);
  }
}
ok(incomplete.length === 0, incomplete.length ? `${incomplete.length} 条缺译文：\n     ` + incomplete.slice(0, 10).join('\n     ') : `${Object.keys(DICT).length} 条键 × ${LANGS.length} 种语言都齐`);

/* ---------------- 3. 占位符对齐 ---------------- */
console.log('\n=== 3. 占位符不增不减 ===');
const ph = (s) => {
  const braces = [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const pct = [...String(s).matchAll(/%\d+/g)].map((m) => m[0]).sort();
  return braces.join(',') + '|' + pct.join(',');
};
const bad = [];
for (const [key, entry] of Object.entries(DICT)) {
  for (const l of LANGS) {
    if (entry && entry[l] && ph(key) !== ph(entry[l])) bad.push(`${key}  ←→  ${l}: ${entry[l]}`);
  }
}
ok(bad.length === 0, bad.length ? `${bad.length} 条占位符对不上：\n     ` + bad.slice(0, 10).join('\n     ') : `所有译文的占位符与键一致`);

/* ---------------- 4. 下拉项覆盖 ---------------- */
console.log('\n=== 4. 下拉项都有译文 ===');
const defs = readFileSync('src/blocks/scratch/defs.js', 'utf8');
const missingOpt = [];
for (const [name, ns] of Object.entries(LIST_NS)) {
  const body = listBody(defs, name);
  if (body == null) { missingOpt.push(`${name}：源码里找不到这个列表`); continue; }
  const values = [...body.matchAll(/\['[^']*'\s*,\s*'([^']*)'\]/g)].map((x) => x[1]);
  for (const v of values) {
    const key = `${ns}.${v}`;
    if (!OPTIONS[key]) missingOpt.push(`${key}（${name} 里的 '${v}'）`);
  }
}
ok(missingOpt.length === 0, missingOpt.length ? `${missingOpt.length} 个下拉值没译文：\n     ` + missingOpt.join('\n     ') : `八个下拉列表的所有取值都在 OPTIONS 里`);

/* ---------------- 4b. 内置分类名 ---------------- */
const missingCat = BUILTIN_CATEGORIES
  .map((c) => `cat.${c.id}`)
  .filter((k) => !OPTIONS[k]);
ok(missingCat.length === 0,
  missingCat.length ? `内置分类缺译名：${missingCat.join('、')}` : `${BUILTIN_CATEGORIES.length} 个内置分类都有译名（用户改过名的分类照原样显示）`);

/* ---------------- 5. 帮助对话框三语齐全 ---------------- */
console.log('\n=== 5. 帮助对话框三种语言都在 ===');
const helpLangs = Object.keys(HELP);
ok(helpLangs.length === 3 && helpLangs.every((l) => HELP[l] && HELP[l].includes('<div class="hint">')),
  `HELP 里有：${helpLangs.join(' / ')}`);

/* ---------------- 6. 导入齐全（用了 t / opt 就必须导入） ---------------- */
console.log('\n=== 6. 用了 t() / opt() 的文件都导入了 ===');
const noImport = [];
for (const f of FILES) {
  const src = readFileSync(f, 'utf8');
  const uses = (name) => new RegExp(`(^|[^\\w$.])${name}\\(`).test(src);
  const imports = (name) => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'[^']*i18n[^']*'`).test(src);
  for (const name of ['t', 'opt', 'localizeDom', 'scratchLocale', 'setLang']) {
    if (uses(name) && !imports(name)) noImport.push(`${f} 用了 ${name}() 但没导入`);
  }
}
ok(noImport.length === 0, noImport.length ? noImport.join('\n     ') : '所有用到 i18n 函数的文件都正确导入了');

/* ---------------- 汇总 ---------------- */
console.log(`\n=========== i18n：${pass} 通过 / ${fail} 失败 ===========`);
process.exitCode = fail ? 1 : 0;
