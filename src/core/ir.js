import { t } from './i18n.js';
/**
 * Tanloom Engine — IR（中间表示）
 * ================================================================
 * 设计原则 1：单一真源。
 *   积木视图、代码视图、场景视图都只是 IR 的渲染层，谁都不持有独立状态。
 *
 * 节点命名与策划案 §5.7 / §7.3 / §8.4 / §12 保持一致：
 *   { type: 'BinaryOp', op: '*', left: {...}, right: {...} }
 */

export const IR_VERSION = 1;

/* ------------------------------------------------------------------ */
/* id                                                                  */
/* ------------------------------------------------------------------ */
let _seq = 0;
export function uid(prefix = 'id') {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* JS 标识符工具（中文名也要能当合法标识符）                              */
/* ------------------------------------------------------------------ */
const JS_RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'let', 'static', 'enum', 'await', 'async', 'self', 'ctx', 'vars', 'lists', 'tl'
]);

export function safeIdent(name) {
  const s = String(name);
  if (/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(s) && !JS_RESERVED.has(s)) return s;
  return null;
}

/** 生成 obj.name 或 obj["name"] */
export function memberAccess(obj, name) {
  const id = safeIdent(name);
  return id ? `${obj}.${id}` : `${obj}[${JSON.stringify(String(name))}]`;
}

/* ------------------------------------------------------------------ */
/* 表达式工厂                                                          */
/* ------------------------------------------------------------------ */
export const E = {
  num: (value = 0) => ({ type: 'Number', value: Number(value) || 0 }),
  str: (value = '') => ({ type: 'String', value: String(value) }),
  bool: (value = false) => ({ type: 'Bool', value: !!value }),
  varRef: (name) => ({ type: 'VarRef', name }),
  listRef: (name) => ({ type: 'ListRef', name }),
  paramRef: (name) => ({ type: 'ParamRef', name }),
  bin: (op, left, right) => ({ type: 'BinaryOp', op, left, right }),
  cmp: (op, left, right) => ({ type: 'Compare', op, left, right }),
  logic: (op, left, right) => ({ type: 'Logic', op, left, right }),
  not: (a) => ({ type: 'Not', a }),
  neg: (a) => ({ type: 'Neg', a }),
  rand: (from, to) => ({ type: 'Random', from, to }),
  math: (op, x) => ({ type: 'MathOp', op, x }),
  join: (a, b) => ({ type: 'Join', a, b }),
  listItem: (list, i) => ({ type: 'ListItem', list, i }),
  listLength: (list) => ({ type: 'ListLength', list }),
  getProp: (entity, prop) => ({ type: 'GetProp', entity, prop }),
  touching: (a, b) => ({ type: 'Touching', a, b }),
  distanceTo: (a, b) => ({ type: 'DistanceTo', a, b }),
  keyDown: (key) => ({ type: 'KeyDown', key }),
  mouseDown: () => ({ type: 'MouseDown' }),
  mouseX: () => ({ type: 'MouseX' }),
  mouseY: () => ({ type: 'MouseY' }),
  timer: () => ({ type: 'Timer' }),
  macro: (macroId, args = []) => ({ type: 'MacroCall', macroId, args }),
  code: (code, returns = true) => ({ type: 'CodeBlock', code, returns })
};

/* ------------------------------------------------------------------ */
/* 语句工厂                                                            */
/* ------------------------------------------------------------------ */
export const seq = (blocks = []) => ({ type: 'BlockSequence', blocks });

export const S = {
  moveBy: (entity, dx, dy) => ({ type: 'MoveBy', entity, dx, dy }),
  setPosition: (entity, x, y) => ({ type: 'SetPosition', entity, x, y }),
  setVelocity: (entity, vx, vy) => ({ type: 'SetVelocity', entity, vx, vy }),
  jump: (entity, power) => ({ type: 'Jump', entity, power }),
  setGravity: (g, entity = '$self') => ({ type: 'SetGravity', entity, g }),
  bounce: (entity) => ({ type: 'BounceOnEdge', entity }),
  show: (entity) => ({ type: 'Show', entity }),
  hide: (entity) => ({ type: 'Hide', entity }),
  setSize: (entity, size) => ({ type: 'SetSize', entity, size }),
  setOpacity: (entity, op) => ({ type: 'SetOpacity', entity, op }),
  playAnimation: (entity, name) => ({ type: 'PlayAnimation', entity, name }),
  say: (entity, text, sec) => ({ type: 'Say', entity, text, sec }),
  playSound: (name) => ({ type: 'PlaySound', name }),
  wait: (sec) => ({ type: 'Wait', sec }),
  repeat: (times, body) => ({ type: 'Repeat', times, body: body || seq() }),
  forever: (body) => ({ type: 'Forever', body: body || seq() }),
  repeatUntil: (cond, body) => ({ type: 'RepeatUntil', cond, body: body || seq() }),
  if: (cond, then) => ({ type: 'If', cond, then: then || seq() }),
  ifElse: (cond, then, otherwise) => ({ type: 'IfElse', cond, then: then || seq(), otherwise: otherwise || seq() }),
  broadcast: (channel, value) => ({ type: 'Broadcast', channel, value: value || E.num(0) }),
  broadcastAndWait: (channel, value) => ({ type: 'BroadcastAndWait', channel, value: value || E.num(0) }),
  setVar: (name, value) => ({ type: 'SetVar', name, value }),
  changeVar: (name, delta) => ({ type: 'ChangeVar', name, delta: delta || E.num(1) }),
  listAdd: (list, value) => ({ type: 'ListAdd', list, value }),
  clone: (entity) => ({ type: 'Clone', entity }),
  macroCall: (macroId, args = []) => ({ type: 'MacroCallStatement', macroId, args }),
  code: (code) => ({ type: 'CodeBlockStatement', code })
};

export function isStatement(n) {
  return n && typeof n.type === 'string' && n.type !== 'Number' && n.type !== 'String' && n.type !== 'Bool';
}

/* ------------------------------------------------------------------ */
/* 项目骨架                                                            */
/* ------------------------------------------------------------------ */
export function createEntity(name, overrides = {}) {
  const id = overrides.id || uid('ent');
  return Object.assign({
    id,
    name,
    kind: 'sprite',            // sprite | stage | group
    parent: null,
    visible: true,
    x: 0,
    y: 0,
    dir: 90,                   // Scratch 约定：90 = 朝右，0 = 朝上
    size: 100,
    opacity: 100,
    rotationStyle: 'all',      // all | left-right | none
    // 渲染：内置矢量形状，无需外部美术资源即可跑起来
    render: {
      shape: 'box',            // box | circle | capsule | triangle | text
      color: '#4C97FF',
      stroke: '#3373CC',
      width: 48,
      height: 48,
      label: ''
    },
    tags: [t('实体')],
    physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 0.85, grounded: false },
    scripts: [],
    clones: [],
    isClone: false
  }, overrides);
}

export function createProject(name = t('未命名项目')) {
  return {
    irVersion: IR_VERSION,
    id: uid('proj'),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      stageWidth: 480,
      stageHeight: 360,
      tickRate: 60,
      fixedDelta: 1 / 60,
      gravity: 980,
      maxBroadcastDepth: 32
    },
    scene: { background: '#0d1017', grid: true, sceneName: t('场景 1') },
    categories: {},   // id -> CategoryDef
    channels: {},     // name -> ChannelDef
    macros: {},       // id -> MacroDef
    entities: [],
    variables: { 分数: 0, 生命: 3, 速度: 240 },
    lists: { 存档点: [] },
    monitors: {}
  };
}

/* ------------------------------------------------------------------ */
/* 校验：让坏 IR 尽早暴露，而不是在运行时炸掉                            */
/* ------------------------------------------------------------------ */
const EXPR_TYPES = new Set([
  'Number', 'String', 'Bool', 'VarRef', 'ListRef', 'ParamRef', 'BinaryOp', 'Compare',
  'Logic', 'Not', 'Neg', 'Random', 'MathOp', 'Join', 'LetterOf', 'LengthOf', 'Contains',
  'ListItem', 'ListLength', 'ListIndex', 'ListContains', 'Touching', 'DistanceTo',
  'KeyDown', 'MouseDown', 'MouseX', 'MouseY', 'Timer', 'GetProp', 'MacroCall', 'CodeBlock'
]);

export function validateProject(project, knownStatements = null) {
  const errors = [];
  const warned = [];

  if (!project || typeof project !== 'object') return { ok: false, errors: [t('项目为空')], warnings: [] };
  if (!Array.isArray(project.entities)) errors.push(t('entities 必须是数组'));
  if (!project.channels || typeof project.channels !== 'object') errors.push(t('channels 缺失'));

  const stmtTypes = knownStatements || null;

  const walkExpr = (n, where) => {
    if (n == null) { errors.push(t('{where}: 表达式为空', { where })); return; }
    if (typeof n !== 'object') { errors.push(t('{where}: 表达式必须是对象', { where })); return; }
    if (!EXPR_TYPES.has(n.type)) { errors.push(t('{_1}: 未知表达式类型 {_2}', { _1: where, _2: n.type })); return; }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'type' || typeof v !== 'object' || v === null) continue;
      if (Array.isArray(v)) v.forEach((c, i) => walkExpr(c, `${where}.${k}[${i}]`));
      else walkExpr(v, `${where}.${k}`);
    }
  };

  const walkSeq = (s, where) => {
    if (!s) return;
    if (s.type !== 'BlockSequence') { errors.push(t('{_1}: 期望 BlockSequence，实际 {_2}', { _1: where, _2: s.type })); return; }
    (s.blocks || []).forEach((b, i) => {
      const w = `${where}[${i}]`;
      if (!b || !b.type) { errors.push(t('{w}: 语句缺少 type', { w })); return; }
      if (stmtTypes && !stmtTypes.has(b.type)) { errors.push(t('{_1}: 未知语句类型 {_2}', { _1: w, _2: b.type })); return; }
      for (const [k, v] of Object.entries(b)) {
        if (typeof v !== 'object' || v === null) continue;
        if (v.type === 'BlockSequence') walkSeq(v, `${w}.${k}`);
        else if (Array.isArray(v)) v.forEach((x, j) => walkExpr(x, `${w}.${k}[${j}]`));
        else if (EXPR_TYPES.has(v.type)) walkExpr(v, `${w}.${k}`);
      }
      if (b.type === 'MacroCallStatement' && !project.macros[b.macroId]) {
        warned.push(t('{_1}: 引用不存在的宏 {_2}', { _1: w, _2: b.macroId }));
      }
      if ((b.type === 'Broadcast' || b.type === 'BroadcastAndWait') && b.channel && !project.channels[b.channel]) {
        warned.push(t('{_1}: 广播频道「{_2}」未注册，将自动注册', { _1: w, _2: b.channel }));
      }
    });
  };

  for (const ent of project.entities || []) {
    for (const sc of ent.scripts || []) {
      if (!sc.hat) errors.push(t('实体 {_1} 的脚本缺少 hat', { _1: ent.name }));
      walkSeq(sc.body, `${ent.name}/${sc.id}`);
    }
  }
  for (const [id, macro] of Object.entries(project.macros || {})) {
    if (!macro.params) warned.push(t('宏 {id} 缺少 params', { id }));
    if (macro.kind === 'statement' || macro.kind === 'event') {
      walkSeq(macro.body, `macro:${macro.name}`);
    } else {
      walkExpr(macro.body, `macro:${macro.name}`);
    }
  }
  return { ok: errors.length === 0, errors, warnings: warned };
}

/* ------------------------------------------------------------------ */
/* 序列化                                                              */
/* ------------------------------------------------------------------ */
export function serializeProject(project) {
  project.updatedAt = new Date().toISOString();
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(text) {
  const p = JSON.parse(text);
  if (!p.irVersion) p.irVersion = IR_VERSION;
  return p;
}

/* ------------------------------------------------------------------ */
/* 遍历与变换工具                                                       */
/* ------------------------------------------------------------------ */
export function walkScriptStatements(script, visit) {
  const walk = (s) => {
    if (!s || s.type !== 'BlockSequence') return;
    (s.blocks || []).forEach((b, i) => {
      visit(b, s, i);
      for (const v of Object.values(b)) {
        if (v && typeof v === 'object' && v.type === 'BlockSequence') walk(v);
      }
    });
  };
  walk(script.body);
}

export function walkAllExpressions(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (EXPR_TYPES.has(node.type)) visit(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((c) => walkAllExpressions(c, visit));
    else if (v && typeof v === 'object') walkAllExpressions(v, visit);
  }
}

/** 深拷贝（IR 是纯数据，structuredClone 足够）。 */
export function cloneIR(node) {
  return JSON.parse(JSON.stringify(node));
}

/**
 * 把 IR 中的 ParamRef 替换成给定的节点 —— 宏「内联展开」的核心。
 * 运行时会先把实参求值成字面量再替换（按值捕获），
 * codegen 则直接替换成实参的 IR（保持表达式结构可读）。
 */
export function substituteParams(node, values) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => substituteParams(n, values));
  if (node.type === 'ParamRef') {
    const v = values[node.name];
    return v === undefined ? E.num(0) : cloneIR(v);
  }
  const out = { type: node.type };
  if (node.op !== undefined) out.op = node.op;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' || k === 'op') continue;
    out[k] = (v && typeof v === 'object') ? substituteParams(v, values) : v;
  }
  return out;
}

