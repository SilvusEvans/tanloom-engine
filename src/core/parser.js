/**
 * DualForge — 代码 → IR 反向解析
 * ================================================================
 * 只解析 codegen 生成的「受限 TypeScript 子集」。
 * 关键设计：遇到不认识的语句/表达式时，降级成「代码积木」(CodeBlock)，
 * 原样保留源码 —— 这样任何写法都能无损往返，IR 永远不会丢信息。
 *
 * 注解是双向同步的锚点：
 *   // @on update            → 帽块「当收到 [update]」
 *   // @on key(Space)        → 帽块「当按下 [空格] 键」
 *   // @on event(玩家受伤)     → 帽块「当收到 [玩家受伤]」
 *   // @macro 平方(x) => (x)*(x)  → 合成积木定义
 */

import { E, seq, uid, safeIdent } from './ir.js';

/* ================================================================== */
/* 词法                                                               */
/* ================================================================== */
const MULTI = ['===', '!==', '>>>', '**=', '...', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '=>', '??', '?.', '**'];

function isIdStart(c) {
  if (!c) return false;
  return /[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 0x7f;
}
function isIdPart(c) {
  if (!c) return false;
  return /[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) > 0x7f;
}

export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const s = i; while (i < src.length && src[i] !== '\n') i++;
      out.push({ type: 'comment', value: src.slice(s, i), start: s, end: i });
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const s = i; i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(src.length, i + 2);
      out.push({ type: 'comment', value: src.slice(s, i), start: s, end: i });
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const s = i; const q = c; i++;
      let val = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { val += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
        val += src[i]; i++;
      }
      i++;
      out.push({ type: 'str', value: val, raw: src.slice(s, i), start: s, end: i });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const s = i; while (i < src.length && /[0-9._eExXa-fA-F]/.test(src[i])) i++;
      out.push({ type: 'num', value: parseFloat(src.slice(s, i)), start: s, end: i });
      continue;
    }
    if (isIdStart(c)) {
      const s = i; while (i < src.length && isIdPart(src[i])) i++;
      out.push({ type: 'id', value: src.slice(s, i), start: s, end: i });
      continue;
    }
    let matched = null;
    for (const m of MULTI) if (src.startsWith(m, i)) { matched = m; break; }
    if (matched) {
      out.push({ type: 'punc', value: matched, start: i, end: i + matched.length });
      i += matched.length;
      continue;
    }
    out.push({ type: 'punc', value: c, start: i, end: i + 1 });
    i++;
  }
  out.push({ type: 'eof', value: '<eof>', start: src.length, end: src.length });
  return out;
}

/* ================================================================== */
/* 语法：Pratt 解析器                                                  */
/* ================================================================== */
const BINPREC = {
  '||': 2, '??': 2, '&&': 3,
  '==': 4, '!=': 4, '===': 4, '!==': 4,
  '<': 5, '>': 5, '<=': 5, '>=': 5,
  '+': 6, '-': 6,
  '*': 7, '/': 7, '%': 7
};

class P {
  constructor(src) {
    this.src = src;
    this.toks = tokenize(src);
    this.pos = 0;
    this.diag = [];
  }
  get cur() { return this.toks[this.pos]; }
  peek(k = 0) { return this.toks[this.pos + k] || this.toks[this.toks.length - 1]; }
  isPunc(v, k = 0) { const t = this.peek(k); return t.type === 'punc' && t.value === v; }
  isId(v, k = 0) { const t = this.peek(k); return t.type === 'id' && t.value === v; }
  take() { return this.toks[this.pos++]; }
  skipComments() { while (this.cur.type === 'comment') this.pos++; }
  expectPunc(v) {
    this.skipComments();
    if (this.isPunc(v)) return this.take();
    this.diag.push(`第 ${this.line(this.cur)} 行：期望 "${v}"，实际是 "${this.cur.value}"`);
    return { type: 'punc', value: v, start: this.cur.start, end: this.cur.start };
  }
  line(tok) { return this.src.slice(0, tok.start).split('\n').length; }
  slice(from, to) { return this.src.slice(from, to); }
  atEnd() { return this.cur.type === 'eof'; }
}

function parseExpression(p, minPrec = 0) {
  let left = parseUnary(p);
  for (;;) {
    p.skipComments();
    const t = p.cur;
    if (t.type !== 'punc') break;
    if (t.value === '=' || t.value === '+=' || t.value === '-=' || t.value === '*=' || t.value === '/=') {
      if (minPrec > 0) break;
      p.take();
      const right = parseExpression(p, 0);
      left = { k: 'assign', op: t.value, target: left, value: right, src: p.slice(nodeStart(left), nodeEnd(right)) };
      continue;
    }
    const prec = BINPREC[t.value];
    if (prec === undefined || prec < minPrec) break;
    p.take();
    const right = parseExpression(p, prec + 1);
    left = { k: 'bin', op: t.value, l: left, r: right, src: p.slice(nodeStart(left), nodeEnd(right)) };
  }
  return left;
}

function parseUnary(p) {
  p.skipComments();
  const t = p.cur;
  if (t.type === 'punc' && (t.value === '-' || t.value === '!' || t.value === '+')) {
    p.take();
    const x = parseUnary(p);
    return { k: 'un', op: t.value, x, start: t.start, end: nodeEnd(x) };
  }
  return parsePostfix(p);
}

function parsePostfix(p) {
  let node = parsePrimary(p);
  for (;;) {
    p.skipComments();
    if (p.isPunc('.')) {
      p.take();
      p.skipComments();
      const id = p.take();
      node = {
        k: 'member', obj: node, prop: id.value, computed: false,
        start: nodeStart(node), end: id.end
      };
      continue;
    }
    if (p.isPunc('[')) {
      p.take();
      const idx = parseExpression(p, 0);
      const close = p.expectPunc(']');
      node = { k: 'idx', obj: node, index: idx, start: nodeStart(node), end: close.end };
      continue;
    }
    if (p.isPunc('(')) {
      p.take();
      const args = [];
      if (!p.isPunc(')')) {
        for (;;) {
          args.push(parseExpression(p, 0));
          if (p.isPunc(',')) { p.take(); continue; }
          break;
        }
      }
      const close = p.expectPunc(')');
      node = { k: 'call', callee: node, args, start: nodeStart(node), end: close.end };
      continue;
    }
    if (p.isPunc('++') || p.isPunc('--')) {
      // 后缀自增/自减。目前只有 codegen 给「重复 N 次」生成的
      // `for (let i = 0; i < N; i++)` 会用到它 —— 少了这一条，那条 for 会被
      // 解析成代码积木，于是「重复 N 次」在积木视图里就变成「执行代码」。
      const tok = p.take();
      node = { k: 'un', op: tok.value, x: node, post: true, start: nodeStart(node), end: tok.end };
      continue;
    }
    break;
  }
  return node;
}

function parsePrimary(p) {
  p.skipComments();
  const t = p.cur;
  if (t.type === 'num') { p.take(); return { k: 'num', v: t.value, start: t.start, end: t.end }; }
  if (t.type === 'str') { p.take(); return { k: 'str', v: t.value, start: t.start, end: t.end }; }
  if (t.type === 'id') {
    if (t.value === 'true' || t.value === 'false') {
      p.take();
      return { k: 'bool', v: t.value === 'true', start: t.start, end: t.end };
    }
    p.take();
    if (p.isPunc('=>')) {
      // 箭头函数：整体当作不可解析，交给代码积木
      const body = parseArrowBody(p);
      return { k: 'raw', src: p.slice(t.start, nodeEnd(body)), start: t.start, end: nodeEnd(body) };
    }
    return { k: 'id', name: t.value, start: t.start, end: t.end };
  }
  if (t.type === 'punc' && t.value === '(') {
    p.take();
    const x = parseExpression(p, 0);
    const close = p.expectPunc(')');
    return { k: 'paren', x, start: t.start, end: close.end };
  }
  if (t.type === 'punc' && t.value === '{') {
    const start = t.start;
    const body = parseBraceBlock(p);
    return { k: 'raw', src: p.slice(start, body.end), start, end: body.end };
  }
  p.take();
  return { k: 'raw', src: t.type === 'eof' ? '' : String(t.value), start: t.start, end: t.end };
}

function parseArrowBody(p) {
  p.expectPunc('=>');
  p.skipComments();
  if (p.isPunc('{')) return parseBraceBlock(p);
  return parseExpression(p, 0);
}

function nodeStart(n) { return n.start !== undefined ? n.start : 0; }
function nodeEnd(n) { return n.end !== undefined ? n.end : 0; }

/** 解析 { ... }，返回 { stmts, start, end } */
function parseBraceBlock(p) {
  const open = p.expectPunc('{');
  const stmts = [];
  for (;;) {
    p.skipComments();
    if (p.isPunc('}') || p.atEnd()) break;
    const s = parseStatement(p);
    if (s) stmts.push(s);
    else p.take();
  }
  const close = p.expectPunc('}');
  return { stmts, start: open.start, end: close.end };
}

function semi(p) {
  p.skipComments();
  if (p.isPunc(';')) p.take();
}

function parseStatement(p) {
  p.skipComments();
  const t = p.cur;
  const start = t.start;

  if (t.type === 'id' && (t.value === 'let' || t.value === 'const' || t.value === 'var')) {
    p.take();
    p.skipComments();
    const nameTok = p.take();
    let init = null;
    if (p.isPunc('=')) { p.take(); init = parseExpression(p, 0); }
    semi(p);
    return { k: 'decl', kind: t.value, name: nameTok.value, init, start, end: p.cur.start };
  }

  if (t.type === 'id' && t.value === 'return') {
    p.take();
    p.skipComments();
    if (p.isPunc(';')) { p.take(); return { k: 'return', value: null, start, end: p.cur.start }; }
    const v = parseExpression(p, 0);
    semi(p);
    return { k: 'return', value: v, start, end: v.end };
  }

  if (t.type === 'id' && t.value === 'await') {
    p.take();
    const v = parseExpression(p, 0);
    semi(p);
    return { k: 'await', value: v, start, end: v.end };
  }

  if (t.type === 'id' && t.value === 'if') {
    p.take();
    p.expectPunc('(');
    const cond = parseExpression(p, 0);
    p.expectPunc(')');
    p.skipComments();
    let thenB, elseB = null;
    if (p.isPunc('{')) thenB = parseBraceBlock(p);
    else { const s = parseStatement(p); thenB = { stmts: s ? [s] : [], start: s ? s.start : start, end: s ? s.end : start }; }
    p.skipComments();
    if (p.isId('else')) {
      p.take();
      p.skipComments();
      if (p.isId('if')) {
        const s = parseStatement(p);
        elseB = { stmts: s ? [s] : [], start: s ? s.start : start, end: s ? s.end : start };
      } else if (p.isPunc('{')) elseB = parseBraceBlock(p);
      else { const s = parseStatement(p); elseB = { stmts: s ? [s] : [], start: start, end: s ? s.end : start }; }
    }
    return { k: 'if', cond, then: thenB, else: elseB, start, end: elseB ? elseB.end : thenB.end };
  }

  if (t.type === 'id' && t.value === 'while') {
    p.take();
    p.expectPunc('(');
    const cond = parseExpression(p, 0);
    p.expectPunc(')');
    const body = parseBraceBlock(p);
    return { k: 'while', cond, body, start, end: body.end };
  }

  if (t.type === 'id' && t.value === 'for') {
    p.take();
    p.expectPunc('(');
    const init = parseStatement(p);
    const cond = parseExpression(p, 0);
    p.expectPunc(';');
    const upd = parseExpression(p, 0);
    p.expectPunc(')');
    const body = parseBraceBlock(p);
    return { k: 'for', init, cond, update: upd, body, start, end: body.end };
  }

  if (t.type === 'punc' && t.value === '{') {
    const b = parseBraceBlock(p);
    return { k: 'block', body: b, start, end: b.end };
  }

  const expr = parseExpression(p, 0);
  semi(p);
  return { k: 'exprstmt', expr, start, end: expr.end };
}

/* ================================================================== */
/* AST → IR                                                            */
/* ================================================================== */
function memberName(n) {
  if (n.k === 'member' && !n.computed) return n.prop;
  if (n.k === 'idx' && n.index.k === 'str') return n.index.v;
  return null;
}

function calleeName(n) {
  if (n.k === 'member') {
    const obj = n.obj;
    if (obj.k === 'id') return `${obj.name}.${n.prop}`;
  }
  if (n.k === 'id') return n.name;
  return null;
}

/* ---- 列表：`lists.名` / `lists["名"]` 这一层单独认 ---- */
/** 从一个表达式里取出列表名（`lists.存档点` → '存档点'），不是列表就返回 null */
function listNameOf(n) {
  if (!n) return null;
  if (n.k === 'member' && n.obj.k === 'id' && n.obj.name === 'lists') return n.prop;
  if (n.k === 'idx' && n.obj.k === 'id' && n.obj.name === 'lists' && n.index.k === 'str') return n.index.v;
  return null;
}
/**
 * 积木里的下标从 1 开始，生成的代码是 `[i - 1]`。
 * 反解时要把这层 `- 1` 剥掉，否则「第 (1) 项」会变成「第 (1 - 1) 项」。
 */
function oneBased(idx) {
  if (idx && idx.k === 'bin' && idx.op === '-' && idx.r.k === 'num' && idx.r.v === 1) return idx.l;
  return idx;
}
const isNumLit = (n, v) => !!n && n.k === 'num' && n.v === v;
/** 取字符串字面量的裸值。颜色 / 动画名这类「字段」在 IR 里存的就是字符串本身，
 *  不是表达式节点 —— 给个节点进去，积木那个色块/下拉会显示不出来。 */
function strLitOf(ast) { return ast && ast.k === 'str' ? ast.v : null; }

function entityRefFromAst(n, P) {
  if (!n) return null;
  if (n.k === 'id' && (n.name === 'self' || n.name === 'ctx.self')) return '$self';
  if (n.k === 'member' && n.obj.k === 'id' && n.obj.name === 'ctx' && n.prop === 'self') return '$self';
  const cn = n.k === 'call' ? calleeName(n.callee) : calleeName(n);
  if (cn === 'df.entity' && n.args && n.args[0] && n.args[0].k === 'str') return n.args[0].v;
  if (cn === 'df.entity' && n.args && n.args[0] && n.args[0].k === 'id') return n.args[0].name;
  return null;
}

const MATH_MAP = {
  'Math.abs': 'abs', 'Math.floor': 'floor', 'Math.ceil': 'ceil', 'Math.round': 'round',
  'Math.sqrt': 'sqrt', 'Math.log10': 'log10', 'Math.log': 'ln',
  'Math.sin': 'sin', 'Math.cos': 'cos', 'Math.tan': 'tan'
};

const CMP_OPS = new Set(['>', '<', '==', '===', '!=', '!==', '>=', '<=']);
function normCmp(op) {
  if (op === '===') return '==';
  if (op === '!==') return '!=';
  return op;
}

function makeCtx(project) {
  return { project, macroByFn: buildMacroFnIndex(project) };
}

function buildMacroFnIndex(project) {
  const map = new Map();
  for (const m of Object.values((project && project.macros) || {})) {
    const fn = safeIdent(m.name || '') || ('macro_' + String(m.id).replace(/[^\w]/g, ''));
    map.set(fn, m);
    map.set(m.name, m);
  }
  return map;
}

function astToIR(n, P, ctx) {
  if (!n) return E.num(0);
  switch (n.k) {
    case 'num': return { type: 'Number', value: n.v };
    case 'str': return { type: 'String', value: n.v };
    case 'bool': return { type: 'Bool', value: n.v };
    case 'paren': return astToIR(n.x, P, ctx);
    case 'un':
      if (n.op === '-') return { type: 'Neg', a: astToIR(n.x, P, ctx) };
      if (n.op === '!') return { type: 'Not', a: astToIR(n.x, P, ctx) };
      return code(n, P);
    case 'bin': {
      const l = astToIR(n.l, P, ctx), r = astToIR(n.r, P, ctx);
      if (n.op === '&&') return { type: 'Logic', op: 'and', left: l, right: r };
      if (n.op === '||') return { type: 'Logic', op: 'or', left: l, right: r };
      if (CMP_OPS.has(n.op)) return { type: 'Compare', op: normCmp(n.op), left: l, right: r };
      if (['+', '-', '*', '/', '%'].includes(n.op)) return { type: 'BinaryOp', op: n.op === '%' ? '%' : n.op, left: l, right: r };
      return code(n, P);
    }
    case 'member': case 'idx': return memberToIR(n, P, ctx);
    case 'call': return callToIR(n, P, ctx);
    case 'raw': return code(n, P);
    case 'id': return code(n, P);
    default: return code(n, P);
  }
}

function code(n, P) { return { type: 'CodeBlock', code: srcOf(n, P), returns: true }; }
function codeStmt(n, P) { return { type: 'CodeBlockStatement', code: srcOf(n, P) }; }
function srcOf(n, P) {
  if (n && n.src !== undefined) return n.src;
  if (!n || !P) return '';
  return P.slice(n.start || 0, n.end || 0).trim();
}

function memberToIR(n, P, ctx) {
  const prop = memberName(n);
  if (n.k === 'member' && n.obj.k === 'id') {
    const o = n.obj.name;
    if (o === 'self' && prop) return { type: 'GetProp', entity: '$self', prop };
    if (o === 'vars' && prop) return { type: 'VarRef', name: prop };
    if (o === 'lists' && prop) return { type: 'ListRef', name: prop };
    if (o === 'ctx' && prop) {
      const map = { delta: 'delta', frame: 'frame', fixedDelta: 'fixedDelta', value: 'value' };
      if (map[prop]) return { type: 'ParamRef', name: map[prop] };
    }
  }
  if (n.k === 'idx' && n.obj.k === 'id') {
    const o = n.obj.name;
    if (o === 'vars' && n.index.k === 'str') return { type: 'VarRef', name: n.index.v };
    if (o === 'lists' && n.index.k === 'str') return { type: 'ListRef', name: n.index.v };
  }
  // df.entity("名").x
  if (n.k === 'member' && n.obj.k === 'call') {
    const cn = calleeName(n.obj.callee || n.obj);
    if (cn === 'df.entity' && n.obj.args[0] && n.obj.args[0].k === 'str') {
      return { type: 'GetProp', entity: n.obj.args[0].v, prop: n.prop };
    }
  }
  // 列表表达式：lists.存档点[2 - 1] → 第 (2) 项；lists.存档点.length → 长度
  // （这两条对应 codegen 里 ListItem / ListLength 的写法，缺了它们这两块积木
  //   一进代码视图再回来就变成代码积木）
  if (n.k === 'idx') {
    const list = listNameOf(n.obj);
    if (list) return { type: 'ListItem', list, i: astToIR(oneBased(n.index), P, ctx) };
  }
  if (n.k === 'member' && n.prop === 'length') {
    const list = listNameOf(n.obj);
    if (list) return { type: 'ListLength', list };
  }
  return code(n, P);
}

function callToIR(n, P, ctx) {
  const cn = calleeName(n.callee);
  const A = (i) => (n.args[i] ? astToIR(n.args[i], P, ctx) : E.num(0));
  const S = (i) => (n.args[i] && n.args[i].k === 'str' ? n.args[i].v : null);

  if (MATH_MAP[cn]) return { type: 'MathOp', op: MATH_MAP[cn], x: A(0) };

  switch (cn) {
    case 'df.random': return { type: 'Random', from: A(0), to: A(1) };
    case 'df.math': return { type: 'MathOp', op: S(0) || 'abs', x: A(1) };
    case 'df.join': return { type: 'Join', a: A(0), b: A(1) };
    case 'df.letterOf': return { type: 'LetterOf', a: A(0), i: A(1) };
    case 'df.lengthOf': return { type: 'LengthOf', a: A(0) };
    case 'df.contains': return { type: 'Contains', a: A(0), b: A(1) };
    case 'df.touching': {
      const off = n.args.length >= 3 && n.args[0].k === 'id' && n.args[0].name === 'ctx' ? 1 : 0;
      const a = entityRefFromAst(n.args[off], P) || '$self';
      const b = entityRefFromAst(n.args[off + 1], P) || '$self';
      return { type: 'Touching', a, b };
    }
    case 'df.distanceTo': {
      const a = entityRefFromAst(n.args[0], P) || '$self';
      const b = entityRefFromAst(n.args[1], P) || '$self';
      return { type: 'DistanceTo', a, b };
    }
    case 'df.keyDown': return { type: 'KeyDown', key: S(0) || 'Space' };
    case 'df.mouseDown': return { type: 'MouseDown' };
    case 'df.mouseX': return { type: 'MouseX' };
    case 'df.mouseY': return { type: 'MouseY' };
    case 'df.timer': return { type: 'Timer' };
    case 'df.sceneName': return { type: 'CurrentScene' };
    case 'df.cloneCount': return { type: 'CloneCount' };
    case 'df.listIndex': return { type: 'ListIndex', list: S(0) || '存档点', v: A(1) };
    case 'df.listContains': return { type: 'ListContains', list: S(0) || '存档点', v: A(1) };
    case 'df.var': return { type: 'VarRef', name: S(0) || '' };
    default: break;
  }

  // 用户定义的合成积木（函数形式）
  const simple = n.callee.k === 'id' ? n.callee.name : null;
  if (simple && ctx.macroByFn.has(simple)) {
    const m = ctx.macroByFn.get(simple);
    return { type: 'MacroCall', macroId: m.id, args: n.args.map((a) => astToIR(a, P, ctx)) };
  }
  return code(n, P);
}

function stmtToIR(s, P, ctx) {
  switch (s.k) {
    case 'decl':
      if (s.name === 'self' && s.init && s.init.k === 'member' && s.init.obj.k === 'id' && s.init.obj.name === 'ctx') return null;
      return null; // 其他局部变量：不映射，视为辅助变量
    case 'return':
      return null;
    case 'block':
      return { __group: s.body.stmts };
    case 'await': {
      const v = s.value;
      const cn = v.k === 'call' ? calleeName(v.callee) : null;
      if (cn === 'df.wait') return { type: 'Wait', sec: astToIR(v.args[0], P, ctx) };
      if (cn === 'df.tick') return { __skip: true };
      if (cn === 'df.broadcastAndWait') {
        return {
          type: 'BroadcastAndWait', channel: (v.args[0] && v.args[0].k === 'str') ? v.args[0].v : 'update',
          value: astToIR(v.args[1], P, ctx), body: seq()
        };
      }
      if (v.k === 'call' && v.callee.k === 'id' && ctx.macroByFn.has(v.callee.name)) {
        const m = ctx.macroByFn.get(v.callee.name);
        return { type: 'MacroCallStatement', macroId: m.id, args: macroArgs(v, m, P, ctx) };
      }
      return codeStmt(s, P);
    }
    case 'if': {
      const cond = astToIR(s.cond, P, ctx);
      const then = seq(blockToIR(s.then, P, ctx));
      if (s.else) return { type: 'IfElse', cond, then, otherwise: seq(blockToIR(s.else, P, ctx)) };
      return { type: 'If', cond, then };
    }
    case 'while': {
      const isTrue = s.cond.k === 'bool' && s.cond.v === true;
      if (isTrue) return { type: 'Forever', body: seq(blockToIR(s.body, P, ctx)) };
      let cond = s.cond;
      if (cond.k === 'un' && cond.op === '!' && cond.x.k === 'paren') cond = cond.x.x;
      return { type: 'RepeatUntil', cond: astToIR(cond, P, ctx), body: seq(blockToIR(s.body, P, ctx)) };
    }
    case 'for': {
      const d = s.init;
      if (d && d.k === 'decl' && d.init && d.init.k === 'num' && d.init.v === 0 &&
        s.cond && s.cond.k === 'bin' && s.cond.op === '<' && s.update && s.update.k === 'un' && s.update.op === '++') {
        return { type: 'Repeat', times: astToIR(s.cond.r, P, ctx), body: seq(blockToIR(s.body, P, ctx)) };
      }
      return codeStmt(s, P);
    }
    case 'exprstmt': {
      const e = s.expr;
      if (e.k === 'assign') return assignToIR(e, P, ctx);
      if (e.k === 'call') return callStmtToIR(e, s, P, ctx);
      return codeStmt(s, P);
    }
    default: return codeStmt(s, P);
  }
}

function macroArgs(v, m, P, ctx) {
  const all = v.args.map((a) => astToIR(a, P, ctx));
  if (m.kind === 'statement' && all.length && isSelfExpr(v.args[0])) return all.slice(1);
  return all;
}
function isSelfExpr(a) {
  return a && a.k === 'id' && a.name === 'self';
}

function blockToIR(block, P, ctx) {
  const out = [];
  const push = (ir) => {
    if (!ir) return;
    if (ir.__skip) return;
    if (ir.__group) { for (const g of ir.__group) { const r = stmtToIR(g, P, ctx); if (r && !r.__skip) { if (r.__group) out.push(...r.__group.map((x) => stmtToIR(x, P, ctx)).filter((y) => y && !y.__skip)); else out.push(r); } } return; }
    out.push(ir);
  };
  for (const s of block.stmts || []) push(stmtToIR(s, P, ctx));
  return out;
}

const PROP_SET_BLOCKS = {
  x: 'SetProp', y: 'SetProp', vx: 'SetProp', vy: 'SetProp', gravity: 'SetProp'
};
const PROP_CANON = {
  dir: 'FaceDirection', size: 'SetSize', opacity: 'SetOpacity', color: 'SetColor'
};

function assignToIR(e, P, ctx) {
  const target = e.target;
  const prop = memberName(target);
  const isSelf = target.k === 'member' && target.obj.k === 'id' && target.obj.name === 'self';

  /* ---- 列表的两种「赋值形态」 ---- */
  // lists.存档点[i - 1] = v   → 替换第 i 项
  if (target.k === 'idx') {
    const list = listNameOf(target.obj);
    if (list && e.op === '=') {
      return { type: 'ListReplace', list, index: astToIR(oneBased(target.index), P, ctx), value: astToIR(e.value, P, ctx) };
    }
  }
  // lists.存档点.length = 0    → 清空
  if (target.k === 'member' && prop === 'length' && listNameOf(target.obj) && isNumLit(e.value, 0)) {
    return { type: 'ListClear', list: listNameOf(target.obj) };
  }

  // vars.x = ...
  if (target.k === 'member' && target.obj.k === 'id' && target.obj.name === 'vars' && prop) {
    if (e.op === '=') return { type: 'SetVar', name: prop, value: astToIR(e.value, P, ctx) };
    if (e.op === '+=') return { type: 'ChangeVar', name: prop, delta: astToIR(e.value, P, ctx) };
    if (e.op === '-=') return { type: 'ChangeVar', name: prop, delta: E.neg(astToIR(e.value, P, ctx)) };
  }
  if (target.k === 'idx' && target.obj.k === 'id' && target.obj.name === 'vars' && target.index.k === 'str') {
    if (e.op === '=') return { type: 'SetVar', name: target.index.v, value: astToIR(e.value, P, ctx) };
    if (e.op === '+=') return { type: 'ChangeVar', name: target.index.v, delta: astToIR(e.value, P, ctx) };
  }

  if (isSelf && prop) {
    const v = astToIR(e.value, P, ctx);
    if (e.op === '+=') {
      if (prop === 'x') return { type: 'ChangeX', entity: '$self', dx: v };
      if (prop === 'y') return { type: 'ChangeY', entity: '$self', dy: v };
      if (prop === 'dir') return { type: 'Rotate', entity: '$self', deg: v };
      // self.size += n 只可能是「把大小增加 n」—— codegen 就是这么写的
      if (prop === 'size') return { type: 'ChangeSize', entity: '$self', d: v };
      return { type: 'SetProp', entity: '$self', prop, value: v };
    }
    if (e.op === '-=') {
      const nv = { type: 'Neg', a: v };
      if (prop === 'x') return { type: 'ChangeX', entity: '$self', dx: nv };
      if (prop === 'y') return { type: 'ChangeY', entity: '$self', dy: nv };
      if (prop === 'size') return { type: 'ChangeSize', entity: '$self', d: nv };
      return { type: 'SetProp', entity: '$self', prop, value: nv };
    }
    if (e.op === '=') {
      if (prop === 'x') return { type: 'SetProp', entity: '$self', prop: 'x', value: v };
      if (prop === 'y') return { type: 'SetProp', entity: '$self', prop: 'y', value: v };
      if (prop === 'dir') return { type: 'FaceDirection', entity: '$self', dir: v };
      if (prop === 'size') return { type: 'SetSize', entity: '$self', size: v };
      if (prop === 'opacity') return { type: 'SetOpacity', entity: '$self', op: v };
      // 颜色 / 动画名在 IR 里是裸字符串字段，这里必须取字面量本身。
      // 以前直接把表达式节点塞进 color，积木回来时那个色块就废了
      // （`fieldOut` 拿到对象 → "[object Object]"）。
      if (prop === 'color') {
        const c = strLitOf(e.value);
        if (c === null) return codeStmt(e, P);
        return { type: 'SetColor', entity: '$self', color: c };
      }
      if (prop === 'vx' || prop === 'vy') return { type: 'SetProp', entity: '$self', prop, value: v };
      if (prop === 'visible') {
        if (e.value.k === 'bool') return e.value.v ? { type: 'Show', entity: '$self' } : { type: 'Hide', entity: '$self' };
        return { type: 'SetProp', entity: '$self', prop, value: v };
      }
      if (prop === 'anim') {
        const nm = strLitOf(e.value);
        if (nm === null) return codeStmt(e, P);   // 不是字面量就别瞎猜成 idle，原样留成代码积木
        return { type: 'PlayAnimation', entity: '$self', name: nm };
      }
      if (prop === 'gravity') return { type: 'SetGravity', entity: '$self', g: v };
      return { type: 'SetProp', entity: '$self', prop, value: v };
    }
  }

  // 其他实体的属性赋值：df.entity("x").y = ...
  // 这一支以前只认 dir / size / opacity / visible，于是「别的实体」上的
  // 增加坐标、旋转、换动画、换颜色都会变成通用的「把属性设为」——
  // 类型都不一样，积木形状自然也对不上。下面把这几条补齐。
  if (target.k === 'member' && prop) {
    const ref = entityRefFromAst(target.obj, P);
    if (ref) {
      const v = astToIR(e.value, P, ctx);
      if (e.op === '+=') {
        if (prop === 'x') return { type: 'ChangeX', entity: ref, dx: v };
        if (prop === 'y') return { type: 'ChangeY', entity: ref, dy: v };
        if (prop === 'dir') return { type: 'Rotate', entity: ref, deg: v };
        if (prop === 'size') return { type: 'ChangeSize', entity: ref, d: v };
        return { type: 'SetProp', entity: ref, prop, value: { type: 'BinaryOp', op: '+', left: { type: 'GetProp', entity: ref, prop }, right: v } };
      }
      if (prop === 'dir') return { type: 'FaceDirection', entity: ref, dir: v };
      if (prop === 'size') return { type: 'SetSize', entity: ref, size: v };
      if (prop === 'opacity') return { type: 'SetOpacity', entity: ref, op: v };
      if (prop === 'color') {
        const c = strLitOf(e.value);
        if (c === null) return codeStmt(e, P);      // 颜色字段要的是裸字符串，不是表达式
        return { type: 'SetColor', entity: ref, color: c };
      }
      if (prop === 'anim') {
        const nm = strLitOf(e.value);
        if (nm === null) return codeStmt(e, P);
        return { type: 'PlayAnimation', entity: ref, name: nm };
      }
      if (prop === 'gravity') return { type: 'SetGravity', entity: ref, g: v };
      if (prop === 'visible') return e.value.k === 'bool' && e.value.v ? { type: 'Show', entity: ref } : { type: 'Hide', entity: ref };
      return { type: 'SetProp', entity: ref, prop, value: v };
    }
  }
  return codeStmt(e, P);
}

function callStmtToIR(e, s, P, ctx) {
  const cn = calleeName(e.callee);
  const A = (i) => (e.args[i] ? astToIR(e.args[i], P, ctx) : E.num(0));
  const S = (i) => (e.args[i] && e.args[i].k === 'str' ? e.args[i].v : null);
  const entAt = (i) => entityRefFromAst(e.args[i], P) || '$self';

  switch (cn) {
    case 'df.setPosition': return { type: 'SetPosition', entity: entAt(0), x: A(1), y: A(2) };
    case 'df.moveBy': return { type: 'MoveBy', entity: entAt(0), dx: A(1), dy: A(2) };
    case 'df.setVelocity': return { type: 'SetVelocity', entity: entAt(0), vx: A(1), vy: A(2) };
    case 'df.jump': return { type: 'Jump', entity: entAt(0), power: A(1) };
    case 'df.setGravity': return { type: 'SetGravity', entity: entAt(0), g: A(1) };
    case 'df.bounce': return { type: 'BounceOnEdge', entity: entAt(0) };
    case 'df.clone': return { type: 'Clone', entity: entAt(0) };
    case 'df.deleteClone': return { type: 'DeleteClone' };
    case 'df.spawn': return { type: 'SpawnEntity', entity: S(0) || '', x: A(1), y: A(2) };
    case 'df.destroy': return { type: 'DestroyEntity', entity: entAt(0) };
    case 'df.broadcast': return { type: 'Broadcast', channel: S(0) || 'update', value: A(1) };
    case 'df.playSound': return { type: 'PlaySound', name: S(0) || 'beep' };
    case 'df.stopAllSounds': return { type: 'StopAllSounds' };
    case 'df.volume': {
      const a = e.args[0];
      if (a && a.k === 'bin' && a.op === '/' && a.r.k === 'num' && a.r.v === 100) return { type: 'SetVolume', v: astToIR(a.l, P, ctx) };
      return { type: 'SetVolume', v: { type: 'BinaryOp', op: '*', left: A(0), right: E.num(100) } };
    }
    case 'df.resetTimer': return { type: 'ResetTimer' };
    case 'df.monitor': return S(0) && S(0).startsWith('list:')
      ? { type: (e.args[1].k === 'bool' && e.args[1].v) ? 'ListShow' : 'ListHide', list: S(0).slice(5) }
      : { type: (e.args[1] && e.args[1].k === 'bool' && e.args[1].v) ? 'ShowVar' : 'HideVar', name: S(0) || '' };
    case 'df.say': return { type: 'Say', entity: entAt(0), text: A(1), sec: A(2) };
    case 'df.hud': return { type: 'UISetText', text: A(0) };
    case 'df.shake': return { type: 'ShakeScreen', n: A(0) };
    case 'df.particles': return { type: 'EmitParticles', entity: entAt(0), n: A(1), color: S(2) || '#FFD500' };
    case 'df.cameraFollow': return { type: 'CameraFollow', entity: entAt(0), k: A(1) };
    case 'df.switchScene': return { type: 'SwitchScene', name: A(0) };
    case 'df.save': return { type: 'SaveGame', slot: A(0) };
    case 'df.load': return { type: 'LoadGame', slot: A(0) };
    case 'df.stop': return { type: 'StopScripts', target: S(0) || 'all' };
    case 'df.setSubscribed': {
      // 第二个参数生成的是 true / false 字面量。写成别的（变量、表达式）就映射不回来，
      // 那就降级成代码积木原样保留 —— 不丢信息是硬规矩。
      const flag = e.args[1];
      if (!flag || flag.k !== 'bool') return codeStmt(e, P);
      return { type: 'SetSubscribed', channel: S(0) || 'update', state: flag.v ? 'subscribe' : 'unsubscribe' };
    }
    case 'df.setProp': return { type: 'SetProp', entity: entAt(0), prop: S(1) || 'x', value: A(2) };
    default: break;
  }

  // 列表的调用形态：lists.存档点.push(v) / .splice(i - 1, 1) / .splice(i - 1, 0, v)
  // 这三种是 codegen 给 ListAdd / ListDelete / ListInsert 生成的写法。
  // 认不出来就落到 codeStmt 降级 —— 但由积木生成的代码不该走到那一步。
  if (e.callee.k === 'member') {
    const list = listNameOf(e.callee.obj);
    if (list) {
      const m = e.callee.prop;
      if (m === 'push' && e.args.length === 1) {
        return { type: 'ListAdd', list, value: astToIR(e.args[0], P, ctx) };
      }
      if (m === 'splice' && e.args.length >= 2) {
        const [at, del] = e.args;
        if (isNumLit(del, 1) && e.args.length === 2) {
          return { type: 'ListDelete', list, index: astToIR(oneBased(at), P, ctx) };
        }
        if (isNumLit(del, 0) && e.args.length === 3) {
          return { type: 'ListInsert', list, index: astToIR(oneBased(at), P, ctx), value: astToIR(e.args[2], P, ctx) };
        }
      }
    }
  }

  if (e.callee.k === 'id' && ctx.macroByFn.has(e.callee.name)) {
    const m = ctx.macroByFn.get(e.callee.name);
    return { type: 'MacroCallStatement', macroId: m.id, args: macroArgs(e, m, P, ctx) };
  }
  return codeStmt(e, P);
}

function exprToIRStrict(ast, P, ctx) {
  const ir = astToIR(ast, P, ctx);
  return ir;
}

/* ================================================================== */
/* 注解与文件级解析                                                     */
/* ================================================================== */
const HAT_FROM_TAG = {
  start: () => ({ type: 'OnStart' }),
  clone: () => ({ type: 'OnClone' }),
  update: () => ({ type: 'OnBroadcast', channel: 'update' }),
  frame_start: () => ({ type: 'OnBroadcast', channel: 'frame_start' }),
  input: () => ({ type: 'OnBroadcast', channel: 'input' }),
  physics_update: () => ({ type: 'OnBroadcast', channel: 'physics_update' }),
  late_update: () => ({ type: 'OnBroadcast', channel: 'late_update' }),
  render: () => ({ type: 'OnBroadcast', channel: 'render' }),
  frame_end: () => ({ type: 'OnBroadcast', channel: 'frame_end' })
};

function parseAnnotations(commentBlock) {
  const a = { tags: [], raw: commentBlock };
  for (const line of commentBlock.split('\n')) {
    const m = line.match(/^\s*\/\/\s*@([\w:]+)\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rest = m[2].trim();
    if (key === 'on') {
      const mm = rest.match(/^([\w]+)\s*(?:\((.*)\))?$/);
      if (mm) {
        const tag = mm[1];
        const args = {};
        if (mm[2]) {
          for (const pair of mm[2].split(',')) {
            const kv = pair.split('=');
            if (kv.length === 2) args[kv[0].trim()] = kv[1].trim();
            else if (kv[0].trim()) args.__pos = (args.__pos ? args.__pos + ',' : '') + kv[0].trim();
          }
        }
        a.tags.push({ tag, args, rest });
      }
    } else if (key === 'macro') {
      const mm = rest.match(/^(.+?)\(([^)]*)\)\s*(?:=>\s*(.*))?$/);
      if (mm) a.macro = { name: mm[1].trim(), params: mm[2].split(',').map((s) => s.trim()).filter(Boolean), inline: mm[3] ? mm[3].trim() : null };
    } else if (key === 'df:script') {
      a.scriptId = rest;
    } else if (key === 'df:macro') {
      a.macroId = rest;
    } else if (['display', 'category', 'color', 'icon', 'scope', 'codegen', 'native', 'name', 'kind'].includes(key)) {
      a[key] = rest;
    }
  }
  return a;
}

function hatFromAnnotation(tag, args) {
  if (HAT_FROM_TAG[tag]) return HAT_FROM_TAG[tag]();
  if (tag === 'key') return { type: 'OnKey', key: args.key || args.__pos || 'Space' };
  if (tag === 'click') return { type: 'OnClick', entity: args.target || args.__pos || '$self' };
  if (tag === 'collision') {
    const parts = (args.__pos ? args.__pos.split(',') : []).map((s) => s.trim());
    return { type: 'OnCollision', a: args.a || parts[0] || '$self', b: args.b || parts[1] || '敌人' };
  }
  if (tag === 'event') return { type: 'OnBroadcast', channel: args.channel || args.__pos || '玩家受伤' };
  return { type: 'OnBroadcast', channel: tag };
}

/**
 * 解析一个代码文件
 * @returns {{ ok, scripts, macros, diagnostics, entityName }}
 */
export function parseFile(text, opts = {}) {
  const ctx = makeCtx(opts.project || { macros: {} });
  const p = new P(text);
  const scripts = [];
  const macros = [];
  const diagnostics = [];

  for (;;) {
    // 1) 收集紧邻的注释块（注解锚点）
    const comments = [];
    while (p.cur.type === 'comment') { comments.push(p.cur.value); p.take(); }
    if (p.atEnd()) break;
    const ann = parseAnnotations(comments.join('\n'));

    // 2) import / export 声明直接跳过
    if (p.isId('import')) {
      while (!p.atEnd() && !p.isPunc(';')) p.take();
      if (p.isPunc(';')) p.take();
      continue;
    }

    // 3) 修饰符
    if (p.isId('export')) { p.take(); if (p.isId('default')) p.take(); if (p.isId('declare')) p.take(); }
    if (p.isId('async')) { p.take(); }
    if (!p.isId('function')) {
      const s = parseStatement(p);
      if (!s) p.take();
      continue;
    }
    p.take(); // function
    p.skipComments();
    const nameTok = p.take();
    const fnName = nameTok.value;
    p.expectPunc('(');
    const params = [];
    if (!p.isPunc(')')) {
      for (;;) {
        p.skipComments();
        const pt = p.take();
        if (pt.type === 'punc' && pt.value === ':') { p.take(); continue; }
        if (pt.type === 'id') params.push(pt.value);
        p.skipComments();
        if (p.isPunc(':')) {
          p.take();
          let depth = 0;
          while (!p.atEnd()) {
            if (p.isPunc('<') || p.isPunc('(') || p.isPunc('[')) depth++;
            if (p.isPunc('>') || p.isPunc(')') || p.isPunc(']')) { if (depth === 0) break; depth--; }
            if (depth === 0 && (p.isPunc(',') || p.isPunc(')'))) break;
            p.take();
          }
        }
        p.skipComments();
        if (p.isPunc(',')) { p.take(); continue; }
        break;
      }
    }
    p.expectPunc(')');
    p.skipComments();
    if (p.isPunc(':')) {
      p.take();
      while (!p.atEnd() && !p.isPunc('{')) p.take();
    }
    p.skipComments();
    if (!p.isPunc('{')) {
      diagnostics.push({ line: p.line(p.cur), msg: `函数 ${fnName} 缺少函数体` });
      continue;
    }
    const body = parseBraceBlock(p);

    // ---- 宏定义 ----
    if (ann.macro) {
      const macro = {
        id: ann.macroId || uid('macro'),
        name: ann.name || ann.macro.name,
        display: ann.display || ann.macro.name,
        kind: ann.kind || (params[0] === 'self' ? 'statement' : 'expression'),
        category: ann.category || 'myblocks',
        color: ann.color || null,
        icon: ann.icon || null,
        scope: ann.scope || 'project',
        codegen: ann.codegen || 'inline',
        native: ann.native || null,
        params: (ann.macro.params.length ? ann.macro.params : params.filter((x) => x !== 'self'))
          .map((n) => ({ name: n, type: 'number' })),
        version: 1,
        callCount: 0,
        body: null
      };
      if (macro.kind === 'expression') {
        const ret = findReturn(body.stmts);
        if (ret && ret.value && !(ret.value.k === 'num' && ret.value.v === 0 && !ann.macro.inline)) {
          macro.body = astToIR(ret.value, p, ctx);
        } else if (ann.macro.inline) {
          macro.body = parseInlineMacroExpr(ann.macro.inline, ctx);
        } else {
          macro.body = E.num(0);
        }
      } else {
        const stmts = blockToIR(body, p, ctx);
        macro.body = seq(stmts);
      }
      macros.push(macro);
      continue;
    }

    // ---- 脚本 ----
    const onTag = ann.tags.find((t) => t.tag);
    if (onTag) {
      const hat = hatFromAnnotation(onTag.tag, onTag.args || {});
      const stmts = blockToIR(body, p, ctx);
      scripts.push({ id: ann.scriptId || uid('script'), name: fnName, hat, body: seq(stmts) });
      continue;
    }
    // 没有注解的函数：忽略（可能是用户自己的工具函数）
  }

  return { ok: true, scripts, macros, diagnostics };
}

function findReturn(stmts) {
  for (const s of stmts || []) {
    if (s.k === 'return') return s;
    if (s.k === 'if') {
      const a = s.then ? findReturn(s.then.stmts) : null;
      if (a) return a;
      const b = s.else ? findReturn(s.else.stmts) : null;
      if (b) return b;
    }
  }
  return null;
}

/** 解析 @macro 注解里的内联表达式（仅在函数体没有可识别 return 时使用） */
function parseInlineMacroExpr(text, ctx) {
  try {
    const p = new P('return ' + text + ';');
    const st = parseStatement(p);
    if (st && st.k === 'return' && st.value) return astToIR(st.value, p, ctx);
  } catch { /* ignore */ }
  return E.num(0);
}

