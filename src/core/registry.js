/**
 * Tanloom Engine — 注册表：内置分类 + 内置广播频道
 * 对应策划案 §5.7（广播注册表）与 §8.1/§8.4（分类体系与分类 IR）
 */

import { opt } from './i18n.js';

/** Scratch 3 官方分类配色，保证积木观感与 Scratch 一致 */
export const BUILTIN_CATEGORIES = [
  { id: 'event',     name: '事件',   color: '#FFBF00', icon: '⚑', order: 10, builtin: true, dark: '#CC9900' },
  { id: 'control',   name: '控制',   color: '#FFAB19', icon: '⟳', order: 20, builtin: true, dark: '#CF8B17' },
  { id: 'motion',    name: '运动',   color: '#4C97FF', icon: '🏃', order: 30, builtin: true, dark: '#3373CC' },
  { id: 'looks',     name: '外观',   color: '#9966FF', icon: '👀', order: 40, builtin: true, dark: '#774DCB' },
  { id: 'sound',     name: '声音',   color: '#CF63CF', icon: '🔊', order: 50, builtin: true, dark: '#A63FA6' },
  { id: 'sensing',   name: '侦测',   color: '#5CB1D6', icon: '🔍', order: 60, builtin: true, dark: '#2E8EB8' },
  { id: 'operators', name: '运算',   color: '#59C059', icon: '∑', order: 70, builtin: true, dark: '#389438' },
  { id: 'variables', name: '变量',   color: '#FF8C1A', icon: '📦', order: 80, builtin: true, dark: '#DB6E00' },
  { id: 'lists',     name: '列表',   color: '#FF661A', icon: '📋', order: 90, builtin: true, dark: '#E64D00' },
  { id: 'game',      name: '游戏专用', color: '#0FBD8C', icon: '🎮', order: 100, builtin: true, dark: '#0B8E69' },
  { id: 'myblocks',  name: '我的积木', color: '#FF6680', icon: '🧩', order: 110, builtin: true, dark: '#FF3355' }
];

export const CATEGORY_COLORS = Object.fromEntries(
  BUILTIN_CATEGORIES.map((c) => [c.id, c])
);

/** 内置分类的**出厂名**（用来判断用户有没有改过名） */
const BUILTIN_NAME = Object.fromEntries(BUILTIN_CATEGORIES.map((c) => [c.id, c.name]));

/**
 * 分类的**显示名**。
 *
 * 分类名是项目数据（用户能改名，存进 .tle），所以不能直接翻译它 —— 会把人家的
 * 改名覆盖掉。这里的规则是：
 *   · 内置分类、且名字还是出厂名 → 按界面语言显示（英/简/繁）
 *   · 用户改过名的内置分类、以及用户自建的分类 → 原样显示他自己写的
 */
export function categoryLabel(cat) {
  if (!cat) return '';
  const base = BUILTIN_NAME[cat.id];
  if (cat.builtin && base && cat.name === base) return opt(cat.id, base, 'cat');
  return cat.name;
}

/** 帧循环阶段广播 —— 借鉴 Godot 的 _process / _physics_process 阶段划分 */
export const BUILTIN_CHANNELS = [
  { name: 'frame_start',    order: 0, repeat: 'once',  doc: '帧开始，早于一切输入与逻辑' },
  { name: 'input',          order: 1, repeat: 'once',  doc: '收集输入后广播' },
  { name: 'physics_update', order: 2, repeat: 'fixed', doc: '固定步长物理更新（一帧可能多次）' },
  { name: 'update',         order: 3, repeat: 'once',  doc: '主逻辑 / 动画 / AI' },
  { name: 'late_update',    order: 4, repeat: 'once',  doc: '相机跟随等依赖最终位置的逻辑' },
  { name: 'render',         order: 5, repeat: 'once',  doc: '绘制提交' },
  { name: 'frame_end',      order: 6, repeat: 'once',  doc: '帧结束，收尾与统计' }
];

/** Scratch 风格按键下拉项 → KeyboardEvent.code */
export const KEY_OPTIONS = [
  { label: '空格', value: 'Space' },
  { label: '↑ 上', value: 'ArrowUp' },
  { label: '↓ 下', value: 'ArrowDown' },
  { label: '← 左', value: 'ArrowLeft' },
  { label: '→ 右', value: 'ArrowRight' },
  { label: 'W', value: 'KeyW' },
  { label: 'A', value: 'KeyA' },
  { label: 'S', value: 'KeyS' },
  { label: 'D', value: 'KeyD' },
  { label: 'J', value: 'KeyJ' },
  { label: 'K', value: 'KeyK' },
  { label: 'L', value: 'KeyL' },
  { label: '任意', value: 'any' }
];

/** 「订阅状态」下拉（配合广播使用） */
export const SUBSCRIBE_OPTIONS = [['订阅', 'subscribe'], ['取消订阅', 'unsubscribe']];

export const MATH_OPTIONS = [
  { label: '绝对值', value: 'abs' }, { label: '向下取整', value: 'floor' },
  { label: '向上取整', value: 'ceil' }, { label: '四舍五入', value: 'round' },
  { label: '平方根', value: 'sqrt' }, { label: '10 ^', value: 'log10' },
  { label: '自然对数', value: 'ln' }, { label: 'sin', value: 'sin' },
  { label: 'cos', value: 'cos' }, { label: 'tan', value: 'tan' }
];

export const OP_OPTIONS = [
  { label: '+', value: '+' }, { label: '-', value: '-' },
  { label: '×', value: '*' }, { label: '÷', value: '/' }, { label: 'mod', value: '%' }
];

export const CMP_OPTIONS = [
  { label: '>', value: '>' }, { label: '=', value: '==' },
  { label: '<', value: '<' }, { label: '≠', value: '!=' },
  { label: '≤', value: '<=' }, { label: '≥', value: '>=' }
];

export const PROP_OPTIONS = [
  { label: 'x 坐标', value: 'x' }, { label: 'y 坐标', value: 'y' },
  { label: '方向', value: 'dir' }, { label: '大小', value: 'size' },
  { label: '透明度', value: 'opacity' }, { label: 'x 速度', value: 'vx' },
  { label: 'y 速度', value: 'vy' }, { label: '是否显示', value: 'visible' }
];

/**
 * 「把 [实体] 的属性 [x] 设为 (v)」能选的属性。
 *
 * 只留**没有专门积木**的那几个。方向 / 大小 / 透明度 / 是否显示各自都有
 * 专门的积木（面朝方向设为 / 大小设为 / 透明度设为 / 显示·隐藏），
 * 而且生成出来的代码形状一模一样（都是 `self.size = v` 这种属性赋值），
 * 反解时只能落回那块专门积木 —— 于是「把属性[大小]设为」写进代码再回来
 * 就变成了「把大小设为」，形状对不上。
 *
 * 与其留一条对不回来的路，不如出口上就不提供。读取属性（GetProp）不受影响，
 * 还是用完整的 PROP_OPTIONS（读方向、读大小都是有意义且无歧义的）。
 */
export const SETPROP_OPTIONS = PROP_OPTIONS.filter(
  (o) => !['dir', 'size', 'opacity', 'visible'].includes(o.value)
);
