#!/usr/bin/env node
/**
 * 对应性审计：每一个积木都必须能「代码 → 积木」原样回来
 * ================================================================
 *   node tools/audit-correspondence.mjs
 *
 * 背景：代码视图只接受能映射成纯积木的写法（`parser.js` 已严格化，认不出的
 * 写法会记诊断并丢弃，不会再降级成「代码积木」）。所以「积木里放得进、代码里
 * 回不来」这种事不该发生 —— 这正是用户之前看到的「有的代码没在积木编辑器里体现」。
 *
 * 这里对每个积木逐个做一次往返：
 *   最小 IR 节点 → codegen → 一段真 .ts → parser → 拿回来的节点
 * 拿回来必须满足三条：
 *   1. 类型相同（若变成 CodeBlock 之类就是对的写法走丢了）
 *   2. 同 op 家族的判别字段（prop / op 之类）没丢 —— 否则「把 vx 设为」会
 *      变成「把 x 设为」，形状看着像、其实换了块积木
 *   3. 语句积木回**一条**语句（1 积木 ≠ 2 语句）
 *
 * 所有积木都参与 —— 已无「代码积木」这类降级容器需要刻意排除。
 *
 * 也导出 `auditAll()` 给 `tools/test-core.mjs` 用，避免两处逻辑各写一遍。
 */
import { pathToFileURL } from 'node:url';
import { createTemplateProject } from '../src/core/template.js';
import { generateFiles } from '../src/core/codegen.js';
import { parseFile } from '../src/core/parser.js';
import { ALL_DEFS, instantiate } from '../src/core/blockdefs.js';

const ENT = '玩家';
const VAR = '分数';          // 模板项目里真实存在的变量

/* ------------------------------------------------------------------ */
/* 降级计数（已无代码积木容器，恒为 0，仅作兜底断言用）              */
/* ------------------------------------------------------------------ */
function countCode(x, seen = 0) {
  if (!x || typeof x !== 'object') return seen;
  if (Array.isArray(x)) { for (const v of x) seen = countCode(v, seen); return seen; }
  for (const [k, v] of Object.entries(x)) { if (k !== 'type' && v && typeof v === 'object') seen = countCode(v, seen); }
  return seen;
}

/**
 * 键序无关的规范化 JSON —— IR 里字段的先后没有语义，
 * 但「字段值变了」必须能被发现。
 */
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/** 把下拉选项统一成 [[label, value], …]（两种写法都见过） */
function optionPairs(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (Array.isArray(o) ? [o[0], o[1]] : (o && typeof o === 'object' ? [o.label, o.value] : null)))
    .filter((p) => p && p[1] !== undefined);
}

/**
 * 一个积木要试的所有取值组合。
 * 只试默认值是不够的：下拉的每个选项、以及「换个实体」这两维上，
 * 都藏着「能生成、回不来」的写法。
 */
function casesOf(d) {
  const list = [{ label: '默认', over: {} }];
  for (const [name, spec] of Object.entries(d.args || {})) {
    if (spec.slot !== 'field') continue;
    const key = name.toLowerCase();
    for (const [lab, val] of optionPairs(spec.options)) {
      list.push({ label: `${key}=${lab}`, over: { [key]: val } });
    }
  }
  if (d.args && d.args.ENTITY) list.push({ label: '换成别的实体', over: { entity: '金币' } });
  return list;
}

/* ------------------------------------------------------------------ */
/* 单个积木的往返                                                       */
/* ------------------------------------------------------------------ */
const empty = () => ({ type: 'BlockSequence', blocks: [] });

function build(d, node) {
  const proj = createTemplateProject();
  const ent = proj.entities.find((e) => e.name === ENT);
  let script;
  if (d.kind === 'hat') {
    script = { id: 'audit_s', hat: node, body: empty() };
  } else if (d.kind === 'statement' || d.kind === 'cblock' || d.kind === 'cap') {
    script = { id: 'audit_s', hat: { type: 'OnStart' }, body: { type: 'BlockSequence', blocks: [node] } };
  } else {
    // 表达式：塞进一条赋值语句里，才能出现在生成代码里
    script = {
      id: 'audit_s', hat: { type: 'OnStart' },
      body: { type: 'BlockSequence', blocks: [{ type: 'SetVar', name: VAR, value: node }] },
    };
  }
  ent.scripts = [script];
  return proj;
}

export function auditOne(d, over = {}) {
  const node = instantiate(d, over);
  const proj = build(d, node);
  const file = generateFiles(proj).find((f) => f.name === ENT + '.ts');
  if (!file) return { ok: false, why: '没生成 ' + ENT + '.ts' };
  const code = file.text;
  let res;
  try { res = parseFile(code, { project: proj }); }
  catch (e) { return { ok: false, why: 'parser 抛异常：' + (e && e.message), code }; }

  const sc = res.scripts[0];
  if (!sc) return { ok: false, why: '没解析出脚本', code, diags: res.diagnostics };
  const blocks = (sc.body && sc.body.blocks) || [];

  let got;
  if (d.kind === 'hat') {
    got = sc.hat;
  } else if (d.kind === 'reporter' || d.kind === 'boolean') {
    const first = blocks[0];
    if (!first || first.type !== 'SetVar') return { ok: false, why: '第一条不是赋值：' + (first && first.type), code, diags: res.diagnostics };
    if (blocks.length !== 1) return { ok: false, why: `回成 ${blocks.length} 条语句（应 1 条）`, code, diags: res.diagnostics };
    got = first.value;
  } else {
    if (blocks.length !== 1) return { ok: false, why: `1 积木回成 ${blocks.length} 条语句`, code, diags: res.diagnostics };
    got = blocks[0];
  }
  if (!got) return { ok: false, why: '没拿到节点', code, diags: res.diagnostics };
  if (got.type !== node.type) {
    return { ok: false, code, diags: res.diagnostics, why: `${node.type} → ${got.type}` };
  }
  // 整节点深比较（键序无关）：字段值 / 子表达式 / 家族判别字段一次全覆盖。
  // 只比类型是不够的 —— 「把 vx 设为」变成「把 x 设为」类型也一样。
  if (canon(got) !== canon(node)) {
    return { ok: false, code, diags: res.diagnostics, why: '字段对不上', diff: diffFields(node, got) };
  }
  return { ok: true, code, node, got };
}

/** 找出两个节点里对不上的字段，给报告用 */
function diffFields(want, got, path = '') {
  const out = [];
  const keys = new Set([...Object.keys(want || {}), ...Object.keys(got || {})]);
  for (const k of keys) {
    if (k === 'type' && want[k] === got[k]) continue;
    const a = want ? want[k] : undefined, b = got ? got[k] : undefined;
    if (canon(a) === canon(b)) continue;
    const p = path ? `${path}.${k}` : k;
    const nested = a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b);
    if (nested) out.push(...diffFields(a, b, p));
    else out.push(`${p}: ${canon(a)} → ${canon(b)}`);
  }
  return out;
}

/** 跑全部积木 × 全部取值组合 */
export function auditAll() {
  const rows = [];
  for (const d of ALL_DEFS) {
    for (const c of casesOf(d)) rows.push({ d, c, r: auditOne(d, c.over) });
  }
  const gaps = rows.filter((x) => !x.r.ok);
  return { rows, gaps, total: ALL_DEFS.length, blocks: rows.length ? new Set(rows.map((x) => x.d.id)).size : 0 };
}

/** 模板项目整体：示例项目生成出来的代码，往返后不该有任何降级 */
export function auditTemplate() {
  const proj = createTemplateProject();
  let scripts = 0, codes = 0;
  const detail = [];
  for (const f of generateFiles(proj)) {
    if (f.readonly) continue;
    const res = parseFile(f.text, { project: proj });
    const c = countCode(res.scripts.map((s) => s.body));
    scripts += res.scripts.length;
    codes += c;
    if (c) detail.push(`${f.name}: ${c} 处`);
  }
  return { scripts, codes, detail };
}

/* ------------------------------------------------------------------ */
/* 直接运行时打印清单                                                    */
/* ------------------------------------------------------------------ */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { rows, gaps, total, blocks } = auditAll();
  const cls = (pat) => gaps.filter((x) => pat.test(x.r.why || ''));
  const shape = cls(/条语句/);
  const field = cls(/字段对不上/);
  const other = gaps.filter((x) => !shape.includes(x) && !field.includes(x));

  console.log(`\n=== 逐个积木 × 逐个取值（${blocks} 块积木 / ${rows.length} 组取值）===`);
  console.log(`  通过 ${rows.length - gaps.length} / 失败 ${gaps.length}`);
  const show = (list, title) => {
    if (!list.length) return;
    console.log(`\n--- ${title} ---`);
    for (const { d, c, r } of list) {
      console.log(`  ✖ ${d.id.padEnd(22)} ${String(d.kind).padEnd(10)} ${c.label.padEnd(18)} ${r.why}`);
      if (r.diff) r.diff.slice(0, 4).forEach((x) => console.log(`      · ${x}`));
      if (r.diags && r.diags.length) r.diags.slice(0, 2).forEach((x) => console.log(`      · ${x.msg}`));
    }
  };
  show(field, '字段对不上（形状看着像、其实换了块积木）');
  show(shape, '语句条数不对（1 积木 ≠ 1 语句）');
  show(other, '其它');

  if (gaps.length) {
    const { d, c, r } = gaps[0];
    console.log(`\n--- 复现样例：${d.id}（${d.op}，${d.kind}，${c.label}）---`);
    console.log((r.code || '').split('\n').filter((l) => !l.startsWith('//')).slice(0, 12).map((l) => '  ' + l).join('\n'));
  }

  console.log('\n=== 模板项目整体往返 ===');
  const t = auditTemplate();
  console.log(`  示例项目生成的文件：${t.scripts} 段脚本，降级 ${t.codes} 处${t.detail.length ? '（' + t.detail.join('，') + '）' : ''}`);

  const bad = gaps.length || t.codes;
  console.log(bad ? `\n=========== 有 ${gaps.length} 组取值做不到「代码 ↔ 积木」完全对应 ===========`
    : `\n=========== ${blocks} 块积木、${rows.length} 组取值全部能代码 ↔ 积木往返 ===========`);
  process.exitCode = bad ? 1 : 0;
}
