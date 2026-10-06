/**
 * Tanloom Engine — 积木主题
 * ================================================================
 * scratch-blocks 的每一块积木都靠 style 取色（colorPrimary / Secondary /
 * Tertiary），主题里少一个 style 就会在注入时直接抛
 * "Invalid colour: undefined"。所以这里必须把用到的分类一次性配齐。
 *
 * 配色取自 Scratch 3 官方分类色，与本工程 registry.js 的 BUILTIN_CATEGORIES
 * 是同一套值 —— 这样积木视图和分类管理面板的颜色永远一致。
 */

import * as Blockly from '../../vendor/scratch-blocks.js';
import { BUILTIN_CATEGORIES } from '../../core/registry.js';

/** Scratch 官方三档配色（Primary 面 / Secondary 侧面 / Tertiary 描边） */
const SHADES = {
  event: ['#FFBF00', '#E6AC00', '#CC9900'],
  control: ['#FFAB19', '#EC9C13', '#CF8B17'],
  motion: ['#4C97FF', '#4280D7', '#3373CC'],
  looks: ['#9966FF', '#855CD6', '#774DCB'],
  sound: ['#CF63CF', '#C94FC9', '#BD42BD'],
  sensing: ['#5CB1D6', '#47A8BD', '#2E8EB8'],
  operators: ['#59C059', '#46B946', '#389438'],
  variables: ['#FF8C1A', '#FF8000', '#DB6E00'],
  lists: ['#FF661A', '#FF5500', '#E64D00'],
  game: ['#0FBD8C', '#0DA57A', '#0B8E69'],
  myblocks: ['#FF6680', '#FF4D6A', '#FF3355'],
  // Scratch 原生分类名（内置积木用的是这些 style id）
  sounds: ['#CF63CF', '#C94FC9', '#BD42BD'],
  data: ['#FF8C1A', '#FF8000', '#DB6E00'],
  data_lists: ['#FF661A', '#FF5500', '#E64D00'],
  more: ['#FF6680', '#FF4D6A', '#FF3355'],
  textField: ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
};

/** 颜色微调：把 #rrggbb 按比例变亮/变暗 */
function shift(hex, k) {
  const n = parseInt(String(hex).slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * 用项目里的分类（用户可能改过颜色 / 加过自定义分类）生成主题，
 * 缺门的分类回落到 SHADES，再回落到 Scratch 的默认灰。
 */
/**
 * Scratch 原生那套浅底：积木的明暗关系本来就是按浅设计的，给个默认值。
 * area 为 null（比如积木总览图）时用它。
 */
const CLASSIC_COMPONENTS = {
  workspaceBackgroundColour: '#F9F9F9',
  toolboxBackgroundColour: '#FFFFFF',
  toolboxForegroundColour: '#575E75',
  flyoutBackgroundColour: '#F9F9F9',
  flyoutForegroundColour: '#575E75',
  flyoutOpacity: 1,
  scrollbarColour: '#CECDCE',
  scrollbarOpacity: 0.5,
  insertionMarkerColour: '#000000',
  insertionMarkerOpacity: 0.2,
  markerColour: '#4C97FF',
  cursorColour: '#4C97FF',
};

/**
 * 用 project 的分类色 + 编辑区表面色生成主题。
 *
 * @param {object} project 项目（分类可能改过颜色 / 加过自定义分类）
 * @param {?object} area   编辑区表面：{ surface, surfaceAlt, field, border, scroll,
 *                          fg, fgDim, accent } —— 由 appearance 的 editTheme.ws 给，
 *                          和代码编辑区是同一份，所以两块编辑区永远同深同浅。
 */
export function buildTheme(project, area = null) {
  const blockStyles = {};
  const cats = (project && project.categories) || {};

  for (const c of BUILTIN_CATEGORIES) {
    const primary = (cats[c.id] && cats[c.id].color) || c.color;
    const fallback = SHADES[c.id] || [primary, shift(primary, -0.12), shift(primary, -0.24)];
    blockStyles[c.id] = {
      colourPrimary: primary,
      colourSecondary: fallback[1],
      colourTertiary: fallback[2],
    };
  }
  // 用户自建分类：只按主色推导三档
  for (const [id, c] of Object.entries(cats)) {
    if (blockStyles[id]) continue;
    blockStyles[id] = {
      colourPrimary: c.color || '#87909F',
      colourSecondary: shift(c.color || '#87909F', -0.12),
      colourTertiary: shift(c.color || '#87909F', -0.24),
    };
  }
  // 内置 Scratch 积木用到的原生 style id 也要在（否则注入就崩）
  for (const [id, [p, s, t]] of Object.entries(SHADES)) {
    if (!blockStyles[id]) blockStyles[id] = { colourPrimary: p, colourSecondary: s, colourTertiary: t };
  }
  // 变量 / 列表这类动态积木在 Scratch 里用「运行时取色」，
  // scratch-blocks 会往主题里塞 <name>_selected 变体，这里留好基础 style。
  for (const id of ['variable', 'list', 'variable_dynamic', 'list_dynamic']) {
    blockStyles[id] = blockStyles[id] || { colourPrimary: '#FF8C1A', colourSecondary: '#FF8000', colourTertiary: '#DB6E00' };
  }

  // 输入槽（白方块）也属于编辑区表面 —— 深色主题下必须跟着深，
  // 否则一小块纯白贴在一整片深色上会很刺眼
  if (area) {
    blockStyles.textField = {
      colourPrimary: area.field,
      colourSecondary: area.surfaceAlt,
      colourTertiary: area.border,
    };
  }

  return Blockly.Theme.defineTheme('tanloom', {
    name: 'Tanloom Engine',
    blockStyles,
    componentStyles: area ? {
      /*
       * 共享主题：这里的每一条都来自「编辑区那一套」，
       * 用户把代码区换成 Solarized Dark，积木画布就在同一个底色上。
       * 积木本体（分类色）不跟着变 —— 那是 Scratch 官方色，属于语言本身。
       */
      workspaceBackgroundColour: area.surface,
      toolboxBackgroundColour: area.surfaceAlt,
      toolboxForegroundColour: area.fgDim,
      flyoutBackgroundColour: area.surfaceAlt,
      flyoutForegroundColour: area.fgDim,
      flyoutOpacity: 1,
      scrollbarColour: area.scroll,
      scrollbarOpacity: 0.6,
      insertionMarkerColour: area.fg,
      insertionMarkerOpacity: 0.22,
      markerColour: area.accent,
      cursorColour: area.accent,
    } : CLASSIC_COMPONENTS,
  });
}

/** 分类名 → 主题里的 style id（内置分类与 Scratch 原生名对齐） */
export const CATEGORY_STYLE = {
  event: 'event',
  control: 'control',
  motion: 'motion',
  looks: 'looks',
  sound: 'sounds',
  sensing: 'sensing',
  operators: 'operators',
  variables: 'data',
  lists: 'data_lists',
  game: 'game',
  myblocks: 'more',
};

export { SHADES, shift };
