/**
 * Tanloom Engine — IR ↔ 积木 XML 双向映射
 * ================================================================
 * 积木视图用 scratch-blocks 之后，「积木」这一侧的数据格式就是它的 workspace XML。
 * 这里是两份表示之间的翻译层，两个方向都要能走：
 *
 *   IR → XML   把唯一真源投影成积木（打开项目、切实体、代码视图改完刷新）
 *   XML → IR   把用户在积木区的改动写回唯一真源（拖动、改字段、从选择区拖新的）
 *
 * 约定：
 *   · 字面量（Number / String）翻成 shadow，其余翻成真正的 block
 *   · 布尔插槽留空 → 还原成 false（Scratch 的空六边形就是这样）
 *   · 认不出的节点降级成「⚠ 未识别」积木，把原始 JSON 存进字段 —— 不丢信息
 */

import { t } from '../../core/i18n.js';
import { E, seq } from '../../core/ir.js';
import { entryForNode, BY_BLOCK, KEY_TO_SCRATCH, SCRATCH_TO_KEY, STOP_TO_SCRATCH, STOP_IN, macroBlockType } from './defs.js';

const XHTML = 'http://www.w3.org/1999/xhtml';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const CLOSE = '</block>';

/* ------------------------------------------------------------------ */
/* 变量 / 列表 / 广播 的稳定 id                                          */
/* ------------------------------------------------------------------ */
export const varId = (name) => 'dfvar_' + encodeURIComponent(String(name));
export const listId = (name) => 'dflist_' + encodeURIComponent(String(name));
export const bcId = (name) => 'dfbc_' + encodeURIComponent(String(name));

/* ------------------------------------------------------------------ */
/* 字面量                                                              */
/* ------------------------------------------------------------------ */
export function isLiteral(v) {
  return v && typeof v === 'object' && (v.type === 'Number' || v.type === 'String' || v.type === 'Bool');
}

/** 字面量 IR → shadow XML；非字面量 → 空串 */
export function literalToShadow(v, preferText = false) {
  if (v && v.type === 'String') {
    return `<shadow type="text"><field name="TEXT">${esc(v.value)}</field></shadow>`;
  }
  if (v && v.type === 'Number') {
    return `<shadow type="math_number"><field name="NUM">${esc(v.value)}</field></shadow>`;
  }
  if (v && v.type === 'Bool') return '';   // Scratch 的布尔插槽没有 shadow
  if (v === undefined || v === null) {
    return preferText
      ? '<shadow type="text"><field name="TEXT"></field></shadow>'
      : '<shadow type="math_number"><field name="NUM">0</field></shadow>';
  }
  return '';
}

/* ------------------------------------------------------------------ */
/* 字段值编解码                                                        */
/* ------------------------------------------------------------------ */
function fieldOut(extra, irValue) {
  const raw = irValue === undefined || irValue === null ? '' : String(irValue);
  if (extra && extra.key) return KEY_TO_SCRATCH[raw] || raw;
  if (extra && extra.codec === 'stop') return STOP_TO_SCRATCH[raw] || 'all';
  return raw;
}

function fieldIn(extra, rawValue) {
  if (extra && extra.key) return SCRATCH_TO_KEY[rawValue] || rawValue;
  if (extra && extra.codec === 'stop') return STOP_IN[rawValue] || 'all';
  return rawValue;
}

/* ------------------------------------------------------------------ */
/* IR → XML                                                            */
/* ------------------------------------------------------------------ */
export function seqToXml(seqNode, project) {
  const blocks = (seqNode && seqNode.blocks) || [];
  return chain(blocks, project);
}

/** 把一串语句块用 <next> 串成一条栈 */
function chain(blocks, project) {
  let acc = '';
  for (let i = blocks.length - 1; i >= 0; i--) {
    const one = nodeToXml(blocks[i], project);
    acc = acc ? one.slice(0, -CLOSE.length) + `<next>${acc}</next>${CLOSE}` : one;
  }
  return acc;
}

/**
 * 单个 IR 节点 → XML。
 * @param withPos 顶层积木的坐标（只有最顶上的那块需要）
 */
export function nodeToXml(node, project, withPos) {
  const pos = withPos ? ` x="${Math.round(withPos.x)}" y="${Math.round(withPos.y)}"` : '';

  /* ---- 宏（合成积木）调用 ---- */
  if (node.type === 'MacroCall' || node.type === 'MacroCallStatement') {
    const macro = project.macros && project.macros[node.macroId];
    if (!macro) {
      return `<block type="df_unknown"${pos}><field name="TEXT">${esc(t('⚠ 缺失的合成积木 {_1}', { _1: node.macroId }))}</field></block>`;
    }
    const args = (macro.params || []).map((p, i) => {
      const v = (node.args || [])[i];
      if (v && !isLiteral(v)) return `<value name="P_${esc(p.name)}">${nodeToXml(v, project)}</value>`;
      return `<value name="P_${esc(p.name)}">${literalToShadow(v)}</value>`;
    }).join('');
    return `<block type="${macroBlockType(macro.id)}"${pos}>${args}</block>`;
  }

  const entry = entryForNode(node);
  if (!entry) {
    return `<block type="df_unknown"${pos}><field name="TEXT">${esc(JSON.stringify(node))}</field></block>`;
  }

  const parts = [];
  for (const [bName, kind, irKey, extra] of entry.args) {
    const v = node[irKey];
    if (kind === 'stmt') {
      parts.push(`<statement name="${bName}">${seqToXml(v, project)}</statement>`);
    } else if (kind === 'field') {
      if (extra && extra.entity) {
        parts.push(`<field name="${bName}">${esc(v === undefined || v === null ? '$self' : String(v))}</field>`);
      } else if (extra && (extra.variable || extra.list)) {
        const name = v === undefined || v === null ? '' : String(v);
        const id = extra.variable ? varId(name) : listId(name);
        const vt = extra.list ? ' variabletype="list"' : '';
        parts.push(`<field id="${esc(id)}" name="${bName}"${vt}>${esc(name)}</field>`);
      } else if (extra && extra.channel) {
        const name = v === undefined || v === null ? '' : String(v);
        parts.push(`<field id="${esc(bcId(name))}" name="${bName}" variabletype="broadcast_msg">${esc(name)}</field>`);
      } else {
        parts.push(`<field name="${bName}">${esc(fieldOut(extra, v))}</field>`);
      }
    } else if (kind === 'bool') {
      // 空六边形 = 没有 shadow、也没有 block
      if (v && !isLiteral(v)) parts.push(`<value name="${bName}">${nodeToXml(v, project)}</value>`);
      else parts.push(`<value name="${bName}"></value>`);
    } else {
      const text = !!(extra && extra.text);
      if (v && !isLiteral(v)) parts.push(`<value name="${bName}">${nodeToXml(v, project)}</value>`);
      else parts.push(`<value name="${bName}">${literalToShadow(v, text)}</value>`);
    }
  }

  return `<block type="${entry.block}"${pos}>${parts.join('')}</block>`;
}

/** 整条脚本 → XML（帽块 + body 串在其 next 上） */
export function scriptToXml(script, project, pos) {
  const blocks = (script.body && script.body.blocks) || [];
  if (!script.hat) {
    // 没有帽块的裸语句：直接当顶层积木摆出来
    return blocks.map((b, i) => nodeToXml(b, project, i === 0 ? (pos || { x: 40, y: 40 }) : undefined)).join('');
  }
  const hat = nodeToXml(script.hat, project, pos);
  const body = chain(blocks, project);
  if (!body) return hat;
  return hat.slice(0, -CLOSE.length) + `<next>${body}</next>${CLOSE}`;
}

/** 整个实体 → 完整 workspace XML（含变量 / 列表 / 广播声明） */
export function entityToWorkspaceXml(ent, project) {
  const vars = [];
  for (const name of Object.keys(project.variables || {})) {
    vars.push(`<variable type="" id="${esc(varId(name))}">${esc(name)}</variable>`);
  }
  for (const name of Object.keys(project.lists || {})) {
    vars.push(`<variable type="list" id="${esc(listId(name))}">${esc(name)}</variable>`);
  }
  for (const ch of Object.keys(project.channels || {})) {
    vars.push(`<variable type="broadcast_msg" id="${esc(bcId(ch))}">${esc(ch)}</variable>`);
  }

  const scripts = (ent && ent.scripts) || [];
  const blocks = scripts.map((s, i) => {
    const manual = ent && ent.scriptPos && ent.scriptPos[s.id];
    const p = manual || { x: 40, y: 40 + i * 280 };
    return scriptToXml(s, project, p);
  }).join('');

  return `<xml xmlns="${XHTML}"><variables>${vars.join('')}</variables>${blocks}</xml>`;
}

/* ------------------------------------------------------------------ */
/* XML → IR                                                            */
/* ------------------------------------------------------------------ */
function childBlocks(el) {
  return Array.from(el.children).filter((c) => c.tagName === 'block');
}

/** <statement>/<next> 里的积木链 → BlockSequence */
export function xmlToSeq(holder, project) {
  if (!holder) return seq([]);
  const out = [];
  let cur = childBlocks(holder)[0];
  let guard = 0;
  while (cur && guard++ < 5000) {
    const node = xmlToNode(cur, project);
    if (node) out.push(node);
    const nextHolder = Array.from(cur.children).find((c) => c.tagName === 'next');
    cur = nextHolder ? childBlocks(nextHolder)[0] : null;
  }
  return seq(out);
}

/** 值插槽 → IR 表达式 */
function valueToIr(holder, project, fallback) {
  if (!holder) return fallback;
  const block = childBlocks(holder)[0];
  if (block) {
    const node = xmlToNode(block, project);
    if (node) return node;
  }
  const shadow = Array.from(holder.children).find((c) => c.tagName === 'shadow');
  if (shadow) return shadowToIr(shadow);
  return fallback;
}

function shadowToIr(shadow) {
  const type = shadow.getAttribute('type');
  const f = (name) => {
    const el = Array.from(shadow.children).find((c) => c.tagName === 'field' && c.getAttribute('name') === name);
    return el ? el.textContent : '';
  };
  if (type === 'text') return E.str(f('TEXT'));
  if (type && type.startsWith('math_')) {
    const v = Number(f('NUM'));
    return E.num(Number.isFinite(v) ? v : 0);
  }
  if (type === 'logic_boolean') return E.bool(f('BOOL') === 'TRUE');
  return E.num(0);
}

/** 单个 <block> → IR 节点 */
export function xmlToNode(el, project) {
  const type = el.getAttribute('type');

  /* ---- 未识别积木：把存的原始 JSON 还原 ---- */
  if (type === 'df_unknown') {
    const f = Array.from(el.children).find((c) => c.tagName === 'field' && c.getAttribute('name') === 'TEXT');
    const raw = f ? f.textContent : '';
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.type) return parsed;
    } catch { /* 不是 JSON：旧版未知积木，已无代码积木可承载，丢弃 */ }
    return null;
  }

  /* ---- 宏调用 ---- */
  if (type && type.startsWith('df_macro_')) {
    const id = type.slice('df_macro_'.length);
    const macro = (project && project.macros && project.macros[id]) || null;
    const args = [];
    for (const v of Array.from(el.children).filter((c) => c.tagName === 'value')) {
      args.push(valueToIr(v, project, E.num(0)));
    }
    const isExpr = macro ? macro.kind === 'expression' : false;
    return isExpr
      ? { type: 'MacroCall', macroId: id, args }
      : { type: 'MacroCallStatement', macroId: id, args };
  }

  const entry = BY_BLOCK[type];
  if (!entry) return null;   // 没有对应实现的积木：丢弃（不再降级成代码积木）

  // 注意：这里按 **Blockly 参数名** 收集（不是 IR 字段名），
  // 因为 entry.make 是按 block 定义写的（f.ENTITY / f.SUBSTACK …）。
  // 用 IR 字段名收集会让每个积木「类型对、字段全 undefined」，静默失效。
  const gathered = {};
  for (const [bName, kind, , extra] of entry.args) {
    if (kind === 'stmt') {
      const holder = Array.from(el.children).find((c) => c.tagName === 'statement' && c.getAttribute('name') === bName);
      gathered[bName] = xmlToSeq(holder, project);
    } else if (kind === 'field') {
      const f = Array.from(el.children).find((c) => c.tagName === 'field' && c.getAttribute('name') === bName);
      gathered[bName] = f ? fieldIn(extra, f.textContent) : '';
    } else if (kind === 'bool') {
      const v = Array.from(el.children).find((c) => c.tagName === 'value' && c.getAttribute('name') === bName);
      gathered[bName] = v ? valueToIr(v, project, E.bool(false)) : E.bool(false);
    } else {
      const text = !!(extra && extra.text);
      const v = Array.from(el.children).find((c) => c.tagName === 'value' && c.getAttribute('name') === bName);
      gathered[bName] = v ? valueToIr(v, project, text ? E.str('') : E.num(0)) : (text ? E.str('') : E.num(0));
    }
  }

  const built = entry.make(gathered);
  return built || null;   // 还原失败时丢弃，不再降级成代码积木
}

/* ------------------------------------------------------------------ */
/* 校验辅助                                                            */
/* ------------------------------------------------------------------ */
export const HAT_TYPES = new Set([
  'event_whenflagclicked', 'df_whenphase', 'event_whenbroadcastreceived',
  'event_whenkeypressed', 'df_whenclick', 'df_whencollision', 'control_start_as_clone',
]);

/** 数一数 XML 里有多少个帽块（验证脚本数没丢） */
export function countHats(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    return Array.from(doc.querySelectorAll('block')).filter((b) => HAT_TYPES.has(b.getAttribute('type'))).length;
  } catch { return 0; }
}
