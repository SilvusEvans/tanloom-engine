/**
 * Tanloom Engine — IR ↔ Scratch 积木 映射表
 * ================================================================
 * 积木视图现在用的是 Scratch 官方渲染器（scratch-blocks），所以「画积木」这件事
 * 不用我们操心；真正要做的是把 IR 和积木 XML 对上。
 *
 * 这张表是那份契约：一条记录同时驱动
 *   1. Blockly.Blocks 的注册（自定义积木的 message0 / args0 / 形状 / 分类色）
 *   2. IR → XML（正向投影：积木视图）
 *   3. XML → IR（反向投影：用户在积木区改完写回唯一真源）
 *
 * 能用 Scratch 原生积木的地方就用原生（运算、控制、变量、列表、侦测、声音），
 * 只有本引擎特有的概念（帧阶段、实体坐标、物理、广播带参、游戏专用）才注册
 * df_ 前缀的自定义积木。这样积木的形状、配色、手感都和 Scratch 一致。
 *
 * args 的写法：[Blockly 参数名, 种类, IR 字段名, 附加信息]
 *   种类 'field' —— 下拉/字段，值直接是字符串
 *        'value' —— 圆形值插槽（输入框或嵌表达式）
 *        'bool'  —— 六边形布尔插槽
 *        'stmt'  —— C 型块的嘴（子栈）
 */

import { t, opt } from '../../core/i18n.js';
import * as Blockly from '../../vendor/scratch-blocks.js';
import { SUBSCRIBE_OPTIONS } from '../../core/registry.js';

/**
 * 把 `[[简体标签, 值], …]` 的下拉项译成当前语言。
 *
 * 值（'space' / 'x' / 'frame_start'）在三种语言里**不变**，只有标签变 ——
 * 所以积木里存的值、生成的代码、项目文件都不会因为切语言而变化。
 * 标签按「命名空间.值」去 core/i18n-options.js 查（同一个值在不同菜单里
 * 意思可能不同：`all` 在「停止」里是「全部」、在「旋转方式」里是「任意方向」）。
 *
 * 这里在**模块加载时**就译好 —— 语言在 i18n.js 加载时已经定下，
 * 而切换语言是重载整个窗口，所以不需要惰性求值。
 */
const L = (pairs, ns) => pairs.map(([label, value]) => [opt(value, label, ns), value]);

/* ------------------------------------------------------------------ */
/* 按键：Scratch 用 'space' / 'up arrow'，本引擎 IR 用 KeyboardEvent.code  */
/* ------------------------------------------------------------------ */
export const KEY_TO_SCRATCH = {
  Space: 'space', ArrowUp: 'up arrow', ArrowDown: 'down arrow',
  ArrowLeft: 'left arrow', ArrowRight: 'right arrow',
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  KeyJ: 'j', KeyK: 'k', KeyL: 'l', any: 'any',
};
export const SCRATCH_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_SCRATCH).map(([k, v]) => [v, k]),
);

/** 「停止」下拉：Scratch 用 'this script' / 'other scripts in sprite' 这样的长值 */
export const STOP_TO_SCRATCH = {
  all: 'all',
  script: 'this script',
  others: 'other scripts in sprite',
};
export const STOP_IN = {
  all: 'all',
  'this script': 'script',
  'other scripts in sprite': 'others',
};

/** 按键下拉项（Scratch 原生那一套） */
export const KEY_DROPDOWN = L([
  ['空格', 'space'], ['↑', 'up arrow'], ['↓', 'down arrow'], ['←', 'left arrow'], ['→', 'right arrow'],
  ['W', 'w'], ['A', 'a'], ['S', 's'], ['D', 'd'], ['J', 'j'], ['K', 'k'], ['L', 'l'], ['任意', 'any'],
], 'key');

/** 帧阶段（内置广播频道）—— 这些走 df_whenphase 的下拉 */
export const PHASES = L([
  ['帧开始', 'frame_start'],
  ['输入', 'input'],
  ['物理更新', 'physics_update'],
  ['每帧更新', 'update'],
  ['延迟更新', 'late_update'],
  ['渲染', 'render'],
  ['帧结束', 'frame_end'],
], 'phase');
export const PHASE_IDS = PHASES.map((p) => p[1]);

/* ------------------------------------------------------------------ */
/* 运行时上下文（动态下拉的取数口）                                      */
/* ------------------------------------------------------------------ */
export const ctx = {
  getEntityNames: () => [],
  getChannels: () => [],
  getVariables: () => [],
  getLists: () => [],
  getSounds: () => [],
  getAnimations: () => [],
};

export function configure(newCtx) {
  Object.assign(ctx, newCtx);
}

/* ------------------------------------------------------------------ */
/* 下拉项构造                                                          */
/* ------------------------------------------------------------------ */
const SELF_LABEL = '自己';

function entityOptions(includeSelf = true, fallback = '$self') {
  return () => {
    const names = ctx.getEntityNames().filter((n) => n && n !== '$self');
    const list = names.map((n) => [n, n]);
    if (includeSelf) list.unshift([SELF_LABEL, '$self']);
    return list.length ? list : [[fallback === '$self' ? SELF_LABEL : fallback, fallback]];
  };
}

function channelOptions() {
  return () => {
    const list = ctx.getChannels().map((c) => [c.label || c.name || c, c.name || c]);
    return list.length ? list : [['玩家受伤', '玩家受伤']];
  };
}

function variableOptions() {
  return () => {
    const list = ctx.getVariables().map((v) => [v, v]);
    return list.length ? list : [['分数', '分数']];
  };
}

function listOptions() {
  return () => {
    const list = ctx.getLists().map((v) => [v, v]);
    return list.length ? list : [['存档点', '存档点']];
  };
}

function soundOptions() {
  return () => {
    const list = ctx.getSounds().map((s) => [s.label || s, s.value || s]);
    return list.length ? list : [['哔', 'beep']];
  };
}

const ANIM_OPTIONS = L([['待机', 'idle'], ['奔跑', 'run'], ['跳跃', 'jump'], ['受伤', 'hurt']], 'anim');

/** 把 [label,value] 数组套成 Blockly 的 field_dropdown 选项（支持动态函数） */
function dropdown(name, options, def) {
  return { type: 'field_dropdown', name, options, default: def };
}

/* ------------------------------------------------------------------ */
/* 自定义积木注册用的 shape → 扩展名                                    */
/* ------------------------------------------------------------------ */
const SHAPE_EXT = {
  statement: 'shape_statement',
  hat: 'shape_hat',
  cap: 'shape_end',
  cblock: 'shape_statement',
  reporter: 'output_number',
  boolean: 'output_boolean',
};

const registeredColours = new Set();
function colourExtension(styleId) {
  const name = 'dfcolours_' + styleId;
  if (registeredColours.has(name)) return name;
  Blockly.Extensions.register(name, function () { this.setStyle(styleId); });
  registeredColours.add(name);
  return name;
}

import { CATEGORY_STYLE } from './theme.js';

/* ------------------------------------------------------------------ */
/* 参数种类 → jsonInit 的 args0                                        */
/* ------------------------------------------------------------------ */
function jsonArg(kind, name, extra) {
  if (kind === 'field') {
    if (extra && extra.select) {
      return { type: 'field_dropdown', name, options: extra.select };
    }
    if (extra && extra.entity) return { type: 'field_dropdown', name, options: entityOptions(extra.self !== false, extra.self !== false ? '$self' : (extra.fallback || '')) };
    if (extra && extra.channel) return { type: 'field_dropdown', name, options: channelOptions() };
    if (extra && extra.phase) return { type: 'field_dropdown', name, options: PHASES };
    if (extra && extra.key) return { type: 'field_dropdown', name, options: () => KEY_DROPDOWN };
    if (extra && extra.variable) return { type: 'field_dropdown', name, options: variableOptions() };
    if (extra && extra.list) return { type: 'field_dropdown', name, options: listOptions() };
    if (extra && extra.sound) return { type: 'field_dropdown', name, options: soundOptions() };
    if (extra && extra.animation) return { type: 'field_dropdown', name, options: () => ANIM_OPTIONS };
    // scratch-blocks 没有内置取色字段（@blockly/field-colour 是独立插件，
    // 且只出 CJS、要外挂一份 blockly），所以颜色就用文本框填 #rrggbb
    if (extra && extra.color) return { type: 'field_input', name, text: extra.color };
    return { type: 'field_dropdown', name, options: extra && extra.options ? extra.options : [['—', '']] };
  }
  if (kind === 'stmt') return { type: 'input_statement', name };
  if (kind === 'bool') return { type: 'input_value', name, check: 'Boolean' };
  return { type: 'input_value', name, check: extra && extra.text ? 'String' : null };
}

/* ------------------------------------------------------------------ */
/* 表                                                                */
/* ------------------------------------------------------------------ */
/* 常用下拉常量 */
const STOP_OPTIONS = L([['全部', 'all'], ['这个脚本', 'script'], ['其他脚本', 'others']], 'stop');
const ROT_OPTIONS = L([['任意方向', 'all'], ['左右翻转', 'left-right'], ['不旋转', 'none']], 'rot');
const PROP_OPTIONS = L([
  ['x 坐标', 'x'], ['y 坐标', 'y'], [t('方向'), 'dir'], ['大小', 'size'],
  ['透明度', 'opacity'], ['x 速度', 'vx'], ['y 速度', 'vy'], ['是否显示', 'visible'],
], 'prop');
/** 「把属性设为」只提供没有专门积木的那几个 —— 方向和 core/registry.js 的
 *  SETPROP_OPTIONS 保持一致；读取属性仍然用完整的 PROP_OPTIONS */
const SETPROP_OPTIONS = PROP_OPTIONS.filter(([, v]) => !['dir', 'size', 'opacity', 'visible'].includes(v));
const MATH_OPTIONS = L([
  ['绝对值', 'abs'], ['向下取整', 'floor'], ['向上取整', 'ceil'], ['四舍五入', 'round'],
  ['平方根', 'sqrt'], ['10 ^', 'log10'], ['自然对数', 'ln'], ['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'],
], 'math');
const PARAM_OPTIONS = L([
  ['帧号 frame', 'frame'], ['时间差 delta', 'delta'],
  ['固定步长 fixedDelta', 'fixedDelta'], ['广播参数 value', 'value'],
], 'param');

/** 每条定义：
 *  block   —— scratch-blocks 的积木类型名
 *  cat     —— 分类（决定颜色 style）
 *  shape   —— statement / hat / cap / cblock / reporter / boolean
 *  message —— 自定义积木的 message0（原生积木留空，用 Scratch 自己的文案）
 *  args    —— [Blockly 名, 种类, IR 字段, 附加]
 *  match   —— 正向识别：IR 节点 → 是否用这条
 *  make    —— 反向构造：IR 节点 → 用 f.<Blockly 名> 组装
 */
export const TABLE = [];
const def = (o) => { TABLE.push(o); return o; };

/* ---------------- 事件（帽块） ---------------- */
def({
  block: 'event_whenflagclicked', cat: 'event', shape: 'hat', message: null, args: [],
  match: (n) => n.type === 'OnStart',
  make: () => ({ type: 'OnStart' }),
});

def({
  block: 'df_whenphase', cat: 'game', shape: 'hat',
  message: t('当收到 %1 广播'),
  args: [['PHASE', 'field', 'channel', { phase: true }]],
  match: (n) => n.type === 'OnBroadcast' && PHASE_IDS.includes(n.channel),
  make: (f) => ({ type: 'OnBroadcast', channel: f.PHASE }),
});

def({
  block: 'event_whenbroadcastreceived', cat: 'event', shape: 'hat', message: null,
  args: [['BROADCAST_OPTION', 'field', 'channel', { channel: true }]],
  match: (n) => n.type === 'OnBroadcast' && !PHASE_IDS.includes(n.channel),
  make: (f) => ({ type: 'OnBroadcast', channel: f.BROADCAST_OPTION }),
});

def({
  block: 'event_whenkeypressed', cat: 'event', shape: 'hat', message: null,
  args: [['KEY_OPTION', 'field', 'key', { key: true }]],
  match: (n) => n.type === 'OnKey',
  make: (f) => ({ type: 'OnKey', key: SCRATCH_TO_KEY[f.KEY_OPTION] || f.KEY_OPTION }),
});

def({
  block: 'df_whenclick', cat: 'event', shape: 'hat',
  message: t('当 %1 被点击'),
  args: [['ENTITY', 'field', 'entity', { entity: true }]],
  match: (n) => n.type === 'OnClick',
  make: (f) => ({ type: 'OnClick', entity: f.ENTITY }),
});

def({
  block: 'df_whencollision', cat: 'event', shape: 'hat',
  message: t('当 %1 碰到 %2'),
  args: [['A', 'field', 'a', { entity: true }], ['B', 'field', 'b', { entity: true }]],
  match: (n) => n.type === 'OnCollision',
  make: (f) => ({ type: 'OnCollision', a: f.A, b: f.B }),
});

def({
  block: 'control_start_as_clone', cat: 'control', shape: 'hat', message: null, args: [],
  match: (n) => n.type === 'OnClone',
  make: () => ({ type: 'OnClone' }),
});

/* ---------------- 控制 ---------------- */
def({
  block: 'control_wait', cat: 'control', shape: 'statement', message: null,
  args: [['DURATION', 'value', 'sec']],
  match: (n) => n.type === 'Wait',
  make: (f) => ({ type: 'Wait', sec: f.DURATION }),
});

def({
  block: 'control_repeat', cat: 'control', shape: 'cblock', message: null,
  args: [['TIMES', 'value', 'times'], ['SUBSTACK', 'stmt', 'body']],
  match: (n) => n.type === 'Repeat',
  make: (f) => ({ type: 'Repeat', times: f.TIMES, body: f.SUBSTACK }),
});

def({
  block: 'control_forever', cat: 'control', shape: 'cblock', message: null,
  args: [['SUBSTACK', 'stmt', 'body']],
  match: (n) => n.type === 'Forever',
  make: (f) => ({ type: 'Forever', body: f.SUBSTACK }),
});

def({
  block: 'control_repeat_until', cat: 'control', shape: 'cblock', message: null,
  args: [['CONDITION', 'bool', 'cond'], ['SUBSTACK', 'stmt', 'body']],
  match: (n) => n.type === 'RepeatUntil',
  make: (f) => ({ type: 'RepeatUntil', cond: f.CONDITION, body: f.SUBSTACK }),
});

def({
  block: 'control_if', cat: 'control', shape: 'cblock', message: null,
  args: [['CONDITION', 'bool', 'cond'], ['SUBSTACK', 'stmt', 'then']],
  match: (n) => n.type === 'If',
  make: (f) => ({ type: 'If', cond: f.CONDITION, then: f.SUBSTACK }),
});

def({
  block: 'control_if_else', cat: 'control', shape: 'cblock', message: null,
  args: [['CONDITION', 'bool', 'cond'], ['SUBSTACK', 'stmt', 'then'], ['SUBSTACK2', 'stmt', 'otherwise']],
  match: (n) => n.type === 'IfElse',
  make: (f) => ({ type: 'IfElse', cond: f.CONDITION, then: f.SUBSTACK, otherwise: f.SUBSTACK2 }),
});

def({
  block: 'control_stop', cat: 'control', shape: 'cap', message: null,
  args: [['STOP_OPTION', 'field', 'target', { select: STOP_OPTIONS, codec: 'stop' }]],
  match: (n) => n.type === 'StopScripts',
  make: (f) => ({ type: 'StopScripts', target: STOP_IN[f.STOP_OPTION] || 'all' }),
});

def({
  block: 'df_clone', cat: 'control', shape: 'statement',
  message: t('克隆 %1'),
  args: [['ENTITY', 'field', 'entity', { entity: true }]],
  match: (n) => n.type === 'Clone',
  make: (f) => ({ type: 'Clone', entity: f.ENTITY }),
});

def({
  block: 'control_delete_this_clone', cat: 'control', shape: 'cap', message: null, args: [],
  match: (n) => n.type === 'DeleteClone',
  make: () => ({ type: 'DeleteClone' }),
});

def({
  block: 'df_broadcast', cat: 'control', shape: 'statement',
  message: t('广播 %1 参数 %2'),
  args: [['CHANNEL', 'field', 'channel', { channel: true }], ['VALUE', 'value', 'value']],
  match: (n) => n.type === 'Broadcast',
  make: (f) => ({ type: 'Broadcast', channel: f.CHANNEL, value: f.VALUE }),
});

def({
  block: 'df_set_subscribed', cat: 'control', shape: 'statement',
  message: t('将 %1 广播订阅状态设为 %2'),
  args: [
    ['CHANNEL', 'field', 'channel', { channel: true }],
    ['STATE', 'field', 'state', { select: SUBSCRIBE_OPTIONS }],
  ],
  match: (n) => n.type === 'SetSubscribed',
  make: (f) => ({ type: 'SetSubscribed', channel: f.CHANNEL, state: f.STATE }),
});

def({
  block: 'df_broadcast_wait', cat: 'control', shape: 'statement',
  message: t('广播 %1 参数 %2 并等待'),
  args: [['CHANNEL', 'field', 'channel', { channel: true }], ['VALUE', 'value', 'value']],
  match: (n) => n.type === 'BroadcastAndWait',
  make: (f) => ({ type: 'BroadcastAndWait', channel: f.CHANNEL, value: f.VALUE }),
});

/* ---------------- 运动 ---------------- */
def({
  block: 'df_move_by', cat: 'motion', shape: 'statement',
  message: t('移动 %1 水平 %2 垂直 %3'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['DX', 'value', 'dx'], ['DY', 'value', 'dy']],
  match: (n) => n.type === 'MoveBy',
  make: (f) => ({ type: 'MoveBy', entity: f.ENTITY, dx: f.DX, dy: f.DY }),
});

def({
  block: 'df_set_pos', cat: 'motion', shape: 'statement',
  message: t('把 %1 移到 x: %2 y: %3'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['X', 'value', 'x'], ['Y', 'value', 'y']],
  match: (n) => n.type === 'SetPosition',
  make: (f) => ({ type: 'SetPosition', entity: f.ENTITY, x: f.X, y: f.Y }),
});

def({
  block: 'df_change_x', cat: 'motion', shape: 'statement',
  message: t('把 %1 的 x 坐标增加 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['DX', 'value', 'dx']],
  match: (n) => n.type === 'ChangeX',
  make: (f) => ({ type: 'ChangeX', entity: f.ENTITY, dx: f.DX }),
});

def({
  block: 'df_change_y', cat: 'motion', shape: 'statement',
  message: t('把 %1 的 y 坐标增加 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['DY', 'value', 'dy']],
  match: (n) => n.type === 'ChangeY',
  make: (f) => ({ type: 'ChangeY', entity: f.ENTITY, dy: f.DY }),
});

def({
  block: 'df_set_prop', cat: 'motion', shape: 'statement',
  message: t('把 %1 的 %2 设为 %3'),
  args: [
    ['ENTITY', 'field', 'entity', { entity: true }],
    ['PROP', 'field', 'prop', { select: SETPROP_OPTIONS }],
    ['VALUE', 'value', 'value'],
  ],
  match: (n) => n.type === 'SetProp',
  make: (f) => ({ type: 'SetProp', entity: f.ENTITY, prop: f.PROP, value: f.VALUE }),
});

def({
  block: 'df_face', cat: 'motion', shape: 'statement',
  message: t('让 %1 面向 %2 度'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['DIR', 'value', 'dir']],
  match: (n) => n.type === 'FaceDirection',
  make: (f) => ({ type: 'FaceDirection', entity: f.ENTITY, dir: f.DIR }),
});

def({
  block: 'df_rotate', cat: 'motion', shape: 'statement',
  message: t('让 %1 旋转 %2 度'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['DEG', 'value', 'deg']],
  match: (n) => n.type === 'Rotate',
  make: (f) => ({ type: 'Rotate', entity: f.ENTITY, deg: f.DEG }),
});

def({
  block: 'df_set_velocity', cat: 'motion', shape: 'statement',
  message: t('设置 %1 的速度 vx: %2 vy: %3'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['VX', 'value', 'vx'], ['VY', 'value', 'vy']],
  match: (n) => n.type === 'SetVelocity',
  make: (f) => ({ type: 'SetVelocity', entity: f.ENTITY, vx: f.VX, vy: f.VY }),
});

def({
  block: 'df_jump', cat: 'motion', shape: 'statement',
  message: t('让 %1 跳跃 力度 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['POWER', 'value', 'power']],
  match: (n) => n.type === 'Jump',
  make: (f) => ({ type: 'Jump', entity: f.ENTITY, power: f.POWER }),
});

def({
  block: 'df_set_gravity', cat: 'motion', shape: 'statement',
  message: t('设置 %1 的重力为 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['G', 'value', 'g']],
  match: (n) => n.type === 'SetGravity',
  make: (f) => ({ type: 'SetGravity', entity: f.ENTITY, g: f.G }),
});

def({
  block: 'df_bounce', cat: 'motion', shape: 'statement',
  message: t('%1 碰到边缘就反弹'),
  args: [['ENTITY', 'field', 'entity', { entity: true }]],
  match: (n) => n.type === 'BounceOnEdge',
  make: (f) => ({ type: 'BounceOnEdge', entity: f.ENTITY }),
});

/* ---------------- 外观 ---------------- */
def({
  block: 'df_show', cat: 'looks', shape: 'statement',
  message: t('显示 %1'),
  args: [['ENTITY', 'field', 'entity', { entity: true }]],
  match: (n) => n.type === 'Show',
  make: (f) => ({ type: 'Show', entity: f.ENTITY }),
});

def({
  block: 'df_hide', cat: 'looks', shape: 'statement',
  message: t('隐藏 %1'),
  args: [['ENTITY', 'field', 'entity', { entity: true }]],
  match: (n) => n.type === 'Hide',
  make: (f) => ({ type: 'Hide', entity: f.ENTITY }),
});

def({
  block: 'df_set_size', cat: 'looks', shape: 'statement',
  message: t('把 %1 的大小设为 %2 %%'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['SIZE', 'value', 'size']],
  match: (n) => n.type === 'SetSize',
  make: (f) => ({ type: 'SetSize', entity: f.ENTITY, size: f.SIZE }),
});

def({
  block: 'df_change_size', cat: 'looks', shape: 'statement',
  message: t('把 %1 的大小增加 %2 %%'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['D', 'value', 'd']],
  match: (n) => n.type === 'ChangeSize',
  make: (f) => ({ type: 'ChangeSize', entity: f.ENTITY, d: f.D }),
});

def({
  block: 'df_set_opacity', cat: 'looks', shape: 'statement',
  message: t('把 %1 的透明度设为 %2 %%'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['OP', 'value', 'op']],
  match: (n) => n.type === 'SetOpacity',
  make: (f) => ({ type: 'SetOpacity', entity: f.ENTITY, op: f.OP }),
});

def({
  block: 'df_anim', cat: 'looks', shape: 'statement',
  message: t('播放 %1 的动画 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['NAME', 'field', 'name', { animation: true }]],
  match: (n) => n.type === 'PlayAnimation',
  make: (f) => ({ type: 'PlayAnimation', entity: f.ENTITY, name: f.NAME }),
});

def({
  block: 'df_say', cat: 'looks', shape: 'statement',
  message: t('让 %1 说 %2 %3 秒'),
  args: [
    ['ENTITY', 'field', 'entity', { entity: true }],
    ['TEXT', 'value', 'text', { text: true }],
    ['SEC', 'value', 'sec'],
  ],
  match: (n) => n.type === 'Say',
  make: (f) => ({ type: 'Say', entity: f.ENTITY, text: f.TEXT, sec: f.SEC }),
});

def({
  block: 'df_set_color', cat: 'looks', shape: 'statement',
  message: t('把 %1 的颜色设为 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['COLOR', 'field', 'color', { color: '#FFD500' }]],
  match: (n) => n.type === 'SetColor',
  make: (f) => ({ type: 'SetColor', entity: f.ENTITY, color: f.COLOR }),
});

/* ---------------- 声音 ---------------- */
def({
  block: 'df_play_sound', cat: 'sound', shape: 'statement',
  message: t('播放声音 %1'),
  args: [['SOUND_MENU', 'field', 'name', { sound: true }]],
  match: (n) => n.type === 'PlaySound',
  make: (f) => ({ type: 'PlaySound', name: f.SOUND_MENU }),
});

def({
  block: 'sound_stopallsounds', cat: 'sound', shape: 'statement', message: null, args: [],
  match: (n) => n.type === 'StopAllSounds',
  make: () => ({ type: 'StopAllSounds' }),
});

def({
  block: 'sound_setvolumeto', cat: 'sound', shape: 'statement', message: null,
  args: [['VOLUME', 'value', 'v']],
  match: (n) => n.type === 'SetVolume',
  make: (f) => ({ type: 'SetVolume', v: f.VOLUME }),
});

/* ---------------- 侦测 ---------------- */
def({
  block: 'sensing_resettimer', cat: 'sensing', shape: 'statement', message: null, args: [],
  match: (n) => n.type === 'ResetTimer',
  make: () => ({ type: 'ResetTimer' }),
});

def({
  block: 'df_touching', cat: 'sensing', shape: 'boolean',
  message: t('%1 碰到 %2 ?'),
  args: [['A', 'field', 'a', { entity: true }], ['B', 'field', 'b', { entity: true }]],
  match: (n) => n.type === 'Touching',
  make: (f) => ({ type: 'Touching', a: f.A, b: f.B }),
});

def({
  block: 'df_distance', cat: 'sensing', shape: 'reporter',
  message: t('%1 到 %2 的距离'),
  args: [['A', 'field', 'a', { entity: true }], ['B', 'field', 'b', { entity: true }]],
  match: (n) => n.type === 'DistanceTo',
  make: (f) => ({ type: 'DistanceTo', a: f.A, b: f.B }),
});

def({
  block: 'df_key_down', cat: 'sensing', shape: 'boolean',
  message: t('按下 %1 键?'),
  args: [['KEY', 'field', 'key', { key: true }]],
  match: (n) => n.type === 'KeyDown',
  make: (f) => ({ type: 'KeyDown', key: SCRATCH_TO_KEY[f.KEY] || f.KEY }),
});

def({
  block: 'sensing_mousedown', cat: 'sensing', shape: 'boolean', message: null, args: [],
  match: (n) => n.type === 'MouseDown',
  make: () => ({ type: 'MouseDown' }),
});

def({
  block: 'sensing_mousex', cat: 'sensing', shape: 'reporter', message: null, args: [],
  match: (n) => n.type === 'MouseX',
  make: () => ({ type: 'MouseX' }),
});

def({
  block: 'sensing_mousey', cat: 'sensing', shape: 'reporter', message: null, args: [],
  match: (n) => n.type === 'MouseY',
  make: () => ({ type: 'MouseY' }),
});

def({
  block: 'sensing_timer', cat: 'sensing', shape: 'reporter', message: null, args: [],
  match: (n) => n.type === 'Timer',
  make: () => ({ type: 'Timer' }),
});

def({
  block: 'df_get_prop', cat: 'sensing', shape: 'reporter',
  message: t('%1 的 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['PROP', 'field', 'prop', { select: PROP_OPTIONS }]],
  match: (n) => n.type === 'GetProp',
  make: (f) => ({ type: 'GetProp', entity: f.ENTITY, prop: f.PROP }),
});

def({
  block: 'df_param', cat: 'game', shape: 'reporter',
  message: '%1',
  args: [['NAME', 'field', 'name', { select: PARAM_OPTIONS }]],
  match: (n) => n.type === 'ParamRef',
  make: (f) => ({ type: 'ParamRef', name: f.NAME }),
});

/* ---------------- 变量 ---------------- */
def({
  block: 'data_setvariableto', cat: 'variables', shape: 'statement', message: null,
  args: [['VARIABLE', 'field', 'name', { variable: true }], ['VALUE', 'value', 'value']],
  match: (n) => n.type === 'SetVar',
  make: (f) => ({ type: 'SetVar', name: f.VARIABLE, value: f.VALUE }),
});

def({
  block: 'data_changevariableby', cat: 'variables', shape: 'statement', message: null,
  args: [['VARIABLE', 'field', 'name', { variable: true }], ['VALUE', 'value', 'delta']],
  match: (n) => n.type === 'ChangeVar',
  make: (f) => ({ type: 'ChangeVar', name: f.VARIABLE, delta: f.VALUE }),
});

def({
  block: 'data_showvariable', cat: 'variables', shape: 'statement', message: null,
  args: [['VARIABLE', 'field', 'name', { variable: true }]],
  match: (n) => n.type === 'ShowVar',
  make: (f) => ({ type: 'ShowVar', name: f.VARIABLE }),
});

def({
  block: 'data_hidevariable', cat: 'variables', shape: 'statement', message: null,
  args: [['VARIABLE', 'field', 'name', { variable: true }]],
  match: (n) => n.type === 'HideVar',
  make: (f) => ({ type: 'HideVar', name: f.VARIABLE }),
});

def({
  block: 'data_variable', cat: 'variables', shape: 'reporter', message: null,
  args: [['VARIABLE', 'field', 'name', { variable: true }]],
  match: (n) => n.type === 'VarRef',
  make: (f) => ({ type: 'VarRef', name: f.VARIABLE }),
});

/* ---------------- 列表 ---------------- */
def({
  block: 'data_addtolist', cat: 'lists', shape: 'statement', message: null,
  args: [['ITEM', 'value', 'value'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListAdd',
  make: (f) => ({ type: 'ListAdd', value: f.ITEM, list: f.LIST }),
});

def({
  block: 'data_deleteoflist', cat: 'lists', shape: 'statement', message: null,
  args: [['INDEX', 'value', 'index'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListDelete',
  make: (f) => ({ type: 'ListDelete', list: f.LIST, index: f.INDEX }),
});

def({
  block: 'data_insertatlist', cat: 'lists', shape: 'statement', message: null,
  args: [['ITEM', 'value', 'value'], ['INDEX', 'value', 'index'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListInsert',
  make: (f) => ({ type: 'ListInsert', list: f.LIST, index: f.INDEX, value: f.ITEM }),
});

def({
  block: 'data_replaceitemoflist', cat: 'lists', shape: 'statement', message: null,
  args: [['INDEX', 'value', 'index'], ['ITEM', 'value', 'value'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListReplace',
  make: (f) => ({ type: 'ListReplace', list: f.LIST, index: f.INDEX, value: f.ITEM }),
});

def({
  block: 'data_deletealloflist', cat: 'lists', shape: 'statement', message: null,
  args: [['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListClear',
  make: (f) => ({ type: 'ListClear', list: f.LIST }),
});

def({
  block: 'data_showlist', cat: 'lists', shape: 'statement', message: null,
  args: [['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListShow',
  make: (f) => ({ type: 'ListShow', list: f.LIST }),
});

def({
  block: 'data_hidelist', cat: 'lists', shape: 'statement', message: null,
  args: [['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListHide',
  make: (f) => ({ type: 'ListHide', list: f.LIST }),
});

def({
  block: 'data_itemoflist', cat: 'lists', shape: 'reporter', message: null,
  args: [['INDEX', 'value', 'i'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListItem',
  make: (f) => ({ type: 'ListItem', list: f.LIST, i: f.INDEX }),
});

def({
  block: 'data_lengthoflist', cat: 'lists', shape: 'reporter', message: null,
  args: [['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListLength',
  make: (f) => ({ type: 'ListLength', list: f.LIST }),
});

def({
  block: 'data_itemnumoflist', cat: 'lists', shape: 'reporter', message: null,
  args: [['ITEM', 'value', 'v'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListIndex',
  make: (f) => ({ type: 'ListIndex', list: f.LIST, v: f.ITEM }),
});

def({
  block: 'data_listcontainsitem', cat: 'lists', shape: 'boolean', message: null,
  args: [['ITEM', 'value', 'v'], ['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListContains',
  make: (f) => ({ type: 'ListContains', list: f.LIST, v: f.ITEM }),
});

def({
  block: 'data_listcontents', cat: 'lists', shape: 'reporter', message: null,
  args: [['LIST', 'field', 'list', { list: true }]],
  match: (n) => n.type === 'ListRef',
  make: (f) => ({ type: 'ListRef', list: f.LIST }),
});

/* ---------------- 运算 ---------------- */
const binOp = (op, block, sym) => def({
  block, cat: 'operators', shape: 'reporter', message: null,
  args: [['NUM1', 'value', 'left'], ['NUM2', 'value', 'right']],
  match: (n) => n.type === 'BinaryOp' && n.op === op,
  make: (f) => ({ type: 'BinaryOp', op, left: f.NUM1, right: f.NUM2 }),
  sym,
});
binOp('+', 'operator_add', '+');
binOp('-', 'operator_subtract', '−');
binOp('*', 'operator_multiply', '×');
binOp('/', 'operator_divide', '÷');
binOp('%', 'operator_mod', 'mod');

const cmpOp = (op, block) => def({
  block, cat: 'operators', shape: 'boolean', message: null,
  args: [['OPERAND1', 'value', 'left'], ['OPERAND2', 'value', 'right']],
  match: (n) => n.type === 'Compare' && n.op === op,
  make: (f) => ({ type: 'Compare', op, left: f.OPERAND1, right: f.OPERAND2 }),
});
cmpOp('>', 'operator_gt');
cmpOp('<', 'operator_lt');
cmpOp('==', 'operator_equals');

def({
  block: 'df_ne', cat: 'operators', shape: 'boolean',
  message: '%1 ≠ %2',
  args: [['LEFT', 'value', 'left'], ['RIGHT', 'value', 'right']],
  match: (n) => n.type === 'Compare' && n.op === '!=',
  make: (f) => ({ type: 'Compare', op: '!=', left: f.LEFT, right: f.RIGHT }),
});

def({
  block: 'operator_and', cat: 'operators', shape: 'boolean', message: null,
  args: [['OPERAND1', 'bool', 'left'], ['OPERAND2', 'bool', 'right']],
  match: (n) => n.type === 'Logic' && n.op === 'and',
  make: (f) => ({ type: 'Logic', op: 'and', left: f.OPERAND1, right: f.OPERAND2 }),
});

def({
  block: 'operator_or', cat: 'operators', shape: 'boolean', message: null,
  args: [['OPERAND1', 'bool', 'left'], ['OPERAND2', 'bool', 'right']],
  match: (n) => n.type === 'Logic' && n.op === 'or',
  make: (f) => ({ type: 'Logic', op: 'or', left: f.OPERAND1, right: f.OPERAND2 }),
});

def({
  block: 'operator_not', cat: 'operators', shape: 'boolean', message: null,
  args: [['OPERAND', 'bool', 'a']],
  match: (n) => n.type === 'Not',
  make: (f) => ({ type: 'Not', a: f.OPERAND }),
});

def({
  block: 'df_neg', cat: 'operators', shape: 'reporter',
  message: '− %1',
  args: [['A', 'value', 'a']],
  match: (n) => n.type === 'Neg',
  make: (f) => ({ type: 'Neg', a: f.A }),
});

def({
  block: 'operator_random', cat: 'operators', shape: 'reporter', message: null,
  args: [['FROM', 'value', 'from'], ['TO', 'value', 'to']],
  match: (n) => n.type === 'Random',
  make: (f) => ({ type: 'Random', from: f.FROM, to: f.TO }),
});

def({
  block: 'operator_mathop', cat: 'operators', shape: 'reporter', message: null,
  args: [['OPERATOR', 'field', 'op', { select: MATH_OPTIONS }], ['NUM', 'value', 'x']],
  match: (n) => n.type === 'MathOp',
  make: (f) => ({ type: 'MathOp', op: f.OPERATOR, x: f.NUM }),
});

def({
  block: 'operator_join', cat: 'operators', shape: 'reporter', message: null,
  args: [['STRING1', 'value', 'a', { text: true }], ['STRING2', 'value', 'b', { text: true }]],
  match: (n) => n.type === 'Join',
  make: (f) => ({ type: 'Join', a: f.STRING1, b: f.STRING2 }),
});

def({
  block: 'operator_letter_of', cat: 'operators', shape: 'reporter', message: null,
  args: [['LETTER', 'value', 'i'], ['STRING', 'value', 'a', { text: true }]],
  match: (n) => n.type === 'LetterOf',
  make: (f) => ({ type: 'LetterOf', i: f.LETTER, a: f.STRING }),
});

def({
  block: 'operator_length', cat: 'operators', shape: 'reporter', message: null,
  args: [['STRING', 'value', 'a', { text: true }]],
  match: (n) => n.type === 'LengthOf',
  make: (f) => ({ type: 'LengthOf', a: f.STRING }),
});

def({
  block: 'operator_contains', cat: 'operators', shape: 'boolean', message: null,
  args: [['STRING1', 'value', 'a', { text: true }], ['STRING2', 'value', 'b', { text: true }]],
  match: (n) => n.type === 'Contains',
  make: (f) => ({ type: 'Contains', a: f.STRING1, b: f.STRING2 }),
});

/* ---------------- 游戏专用 ---------------- */
const gameDef = (o) => def({ cat: 'game', ...o });

gameDef({
  block: 'df_switch_scene', shape: 'statement', message: t('切换到场景 %1'),
  args: [['NAME', 'value', 'name', { text: true }]],
  match: (n) => n.type === 'SwitchScene',
  make: (f) => ({ type: 'SwitchScene', name: f.NAME }),
});
gameDef({
  block: 'df_save', shape: 'statement', message: t('存档到 %1'),
  args: [['SLOT', 'value', 'slot', { text: true }]],
  match: (n) => n.type === 'SaveGame',
  make: (f) => ({ type: 'SaveGame', slot: f.SLOT }),
});
gameDef({
  block: 'df_load', shape: 'statement', message: t('读取存档 %1'),
  args: [['SLOT', 'value', 'slot', { text: true }]],
  match: (n) => n.type === 'LoadGame',
  make: (f) => ({ type: 'LoadGame', slot: f.SLOT }),
});
gameDef({
  block: 'df_camera', shape: 'statement', message: t('让相机跟随 %1 平滑 %2'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['K', 'value', 'k']],
  match: (n) => n.type === 'CameraFollow',
  make: (f) => ({ type: 'CameraFollow', entity: f.ENTITY, k: f.K }),
});
gameDef({
  block: 'df_particles', shape: 'statement', message: t('在 %1 处播放 %2 个粒子 颜色 %3'),
  args: [
    ['ENTITY', 'field', 'entity', { entity: true }],
    ['N', 'value', 'n'],
    ['COLOR', 'field', 'color', { color: '#FFD500' }],
  ],
  match: (n) => n.type === 'EmitParticles',
  make: (f) => ({ type: 'EmitParticles', entity: f.ENTITY, n: f.N, color: f.COLOR }),
});
gameDef({
  block: 'df_ui_text', shape: 'statement', message: t('把 HUD 文字设为 %1'),
  args: [['TEXT', 'value', 'text', { text: true }]],
  match: (n) => n.type === 'UISetText',
  make: (f) => ({ type: 'UISetText', text: f.TEXT }),
});
gameDef({
  block: 'df_shake', shape: 'statement', message: t('屏幕震动 强度 %1'),
  args: [['N', 'value', 'n']],
  match: (n) => n.type === 'ShakeScreen',
  make: (f) => ({ type: 'ShakeScreen', n: f.N }),
});
gameDef({
  block: 'df_spawn', shape: 'statement', message: t('生成 %1 于 x: %2 y: %3'),
  args: [['ENTITY', 'field', 'entity', { entity: true }], ['X', 'value', 'x'], ['Y', 'value', 'y']],
  match: (n) => n.type === 'SpawnEntity',
  make: (f) => ({ type: 'SpawnEntity', entity: f.ENTITY, x: f.X, y: f.Y }),
});
gameDef({
  block: 'df_destroy', shape: 'statement', message: t('销毁 %1'),
  args: [['ENTITY', 'field', 'entity', { entity: true }]],
  match: (n) => n.type === 'DestroyEntity',
  make: (f) => ({ type: 'DestroyEntity', entity: f.ENTITY }),
});
gameDef({
  block: 'df_scene_name', shape: 'reporter', message: t('当前场景名'), args: [],
  match: (n) => n.type === 'CurrentScene',
  make: () => ({ type: 'CurrentScene' }),
});
gameDef({
  block: 'df_clone_count', shape: 'reporter', message: t('克隆体数量'), args: [],
  match: (n) => n.type === 'CloneCount',
  make: () => ({ type: 'CloneCount' }),
});

/* ---------------- 代码积木 ---------------- */
def({
  block: 'df_code_stmt', cat: 'myblocks', shape: 'statement',
  message: t('⚙ 执行代码 %1'),
  args: [['CODE', 'field', 'code', { text: true, multiline: true }]],
  match: (n) => n.type === 'CodeBlockStatement',
  make: (f) => ({ type: 'CodeBlockStatement', code: f.CODE }),
});
def({
  block: 'df_code_expr', cat: 'myblocks', shape: 'reporter',
  message: t('⚙ 代码 %1'),
  args: [['CODE', 'field', 'code', { text: true, multiline: true }]],
  match: (n) => n.type === 'CodeBlock',
  make: (f) => ({ type: 'CodeBlock', code: f.CODE }),
});

/* ------------------------------------------------------------------ */
/* 索引                                                                */
/* ------------------------------------------------------------------ */
export const BY_BLOCK = Object.fromEntries(TABLE.map((e) => [e.block, e]));

/** IR 节点 → 表记录 */
export function entryForNode(node) {
  if (!node || !node.type) return null;
  if (node.type === 'MacroCall' || node.type === 'MacroCallStatement') return null; // 宏单独处理
  return TABLE.find((e) => e.match(node)) || null;
}

/* ------------------------------------------------------------------ */
/* 注册自定义积木                                                       */
/* ------------------------------------------------------------------ */
export function defineBlocks() {
  for (const e of TABLE) {
    if (!e.message) continue; // 原生积木已在 scratch-blocks 里定义
    if (Blockly.Blocks[e.block]) continue;
    const style = CATEGORY_STYLE[e.cat] || e.cat;
    Blockly.Blocks[e.block] = {
      init() {
        const args0 = e.args.map(([name, kind, , extra]) => jsonArg(kind, name, extra));
        this.jsonInit({
          message0: e.message,
          args0,
          extensions: [colourExtension(style), SHAPE_EXT[e.shape] || 'shape_statement'],
        });
        if (e.tooltip) this.setTooltip(e.tooltip);
      },
    };
  }

  // 兜底积木：IR 里认不出的节点会降级成它，把原始 JSON 存在字段里 —— 不丢信息
  if (!Blockly.Blocks.df_unknown) {
    Blockly.Blocks.df_unknown = {
      init() {
        this.jsonInit({
          message0: t('⚠ 未识别 %1'),
          args0: [{ type: 'field_input', name: 'TEXT', text: '' }],
          extensions: [colourExtension('more'), 'shape_statement'],
        });
        this.setTooltip(t('这个积木在当前版本的引擎里没有对应实现，原样保留以免丢数据'));
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* 宏（合成积木）的动态积木                                              */
/* ------------------------------------------------------------------ */
/** 给每个宏注册一个专属积木类型，形状 / 参数和它的 IR 定义一一对应 */
export function defineMacroBlocks(macros, onlyIds) {
  const wanted = onlyIds ? new Set(onlyIds) : null;
  for (const macro of Object.values(macros || {})) {
    if (wanted && !wanted.has(macro.id)) continue;
    const type = macroBlockType(macro.id);
    if (Blockly.Blocks[type]) delete Blockly.Blocks[type];
    const styleId = macro.category && CATEGORY_STYLE[macro.category] ? CATEGORY_STYLE[macro.category] : 'more';
    const params = macro.params || [];
    const message = params.length
      ? `${macro.name} ${params.map((_, i) => `%${i + 1}`).join(' ')}`
      : macro.name;
    Blockly.Blocks[type] = {
      init() {
        this.jsonInit({
          message0: message,
          args0: params.map((p) => ({ type: 'input_value', name: 'P_' + p.name, check: 'Number' })),
          extensions: [colourExtension(styleId),
            macro.kind === 'expression' ? 'output_number' : 'shape_statement'],
        });
        this.setTooltip(t('合成积木 · {_1}', { _1: macro.name }));
      },
    };
  }
}

export const macroBlockType = (id) => 'df_macro_' + String(id).replace(/[^\w]/g, '_');
