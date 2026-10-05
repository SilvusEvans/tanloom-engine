/**
 * Tanloom Engine — 积木总览
 * ================================================================
 * 把 core/blockdefs.js 里定义的每一块积木，用 scratch-blocks 真实渲染一遍，
 * 按分类排成一张大图。用途：
 *   · 一眼看清「积木长什么样」，形状是否和 Scratch 一致
 *   · 新增积木后立刻能看出形状/配色有没有跑偏
 *   · 只要某个定义在 IR ↔ XML 这一层出问题，这里就会看到「⚠ 未识别」的降级块
 *
 * tools/gallery.cjs 会把它截图到 tools/shots/blocks-gallery.png
 */

import * as Blockly from './vendor/scratch-blocks.js';
import { MEDIA_URL } from './vendor/scratch-blocks.js';
import { ALL_DEFS, instantiate } from './core/blockdefs.js';
import { buildTheme } from './blocks/scratch/theme.js';
import { defineBlocks, configure, entryForNode } from './blocks/scratch/defs.js';
import { nodeToXml } from './blocks/scratch/sync.js';
import { BUILTIN_CATEGORIES } from './core/registry.js';

const XHTML = 'http://www.w3.org/1999/xhtml';

/* 一个够用的「假项目」：下拉项要从这里取值 */
const PROJECT = {
  categories: Object.fromEntries(BUILTIN_CATEGORIES.map((c) => [c.id, c])),
  variables: { 分数: 0, 生命: 3 },
  lists: { 存档点: [] },
  channels: {
    frame_start: { name: 'frame_start', builtin: true, order: 0 },
    input: { name: 'input', builtin: true, order: 1 },
    physics_update: { name: 'physics_update', builtin: true, order: 2 },
    update: { name: 'update', builtin: true, order: 3 },
    late_update: { name: 'late_update', builtin: true, order: 4 },
    render: { name: 'render', builtin: true, order: 5 },
    frame_end: { name: 'frame_end', builtin: true, order: 6 },
    玩家受伤: { name: '玩家受伤', builtin: false, order: 100 },
  },
  macros: {
    macro_pow2: {
      id: 'macro_pow2', name: '平方', display: '(x)^2', kind: 'expression',
      category: 'operators', params: [{ name: 'x', type: 'number' }], body: null,
    },
  },
  entities: [],
};

configure({
  getEntityNames: () => ['玩家', '敌人', '地面'],
  getChannels: () => Object.values(PROJECT.channels).map((c) => ({ name: c.name, label: c.name })),
  getVariables: () => Object.keys(PROJECT.variables),
  getLists: () => Object.keys(PROJECT.lists),
  getSounds: () => [
    { label: '哔', value: 'beep' }, { label: '跳跃', value: 'jump' },
    { label: '金币', value: 'coin' }, { label: '受伤', value: 'hurt' },
  ],
  getAnimations: () => [],
});

defineBlocks();

window.__gallery = (async () => {
  Blockly.ScratchMsgs.setLocale('zh-cn');
  const host = document.getElementById('board');
  const ws = Blockly.inject(host, {
    theme: buildTheme(PROJECT),
    scratchTheme: Blockly.ScratchBlocksTheme.CLASSIC,
    media: MEDIA_URL,
    zoom: { controls: false, wheel: false, startScale: 1 },
    trashcan: false,
    sounds: false,
    move: { scrollbars: false, drag: false, wheel: false },
  });

  // 按分类分列摆放
  const byCat = new Map();
  for (const d of ALL_DEFS) {
    const cat = d.category || 'myblocks';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(d);
  }

  const order = BUILTIN_CATEGORIES.map((c) => c.id).filter((id) => byCat.has(id));
  const COL = 420;
  let contentBottom = 0;
  const xmls = [];
  const report = { categories: [], total: 0, degraded: [], oversized: [], boxes: {} };

  order.forEach((catId, col) => {
    const x = 24 + col * COL;
    let y = 84;
    const defs = byCat.get(catId);
    const cat = PROJECT.categories[catId];
    // 分类小标题（用一块只读文本代替，截图时看得清）
    const title = document.createElement('div');
    title.textContent = `${cat.icon || ''} ${cat.name}`;
    title.style.cssText = `position:absolute;left:${x}px;top:24px;font:700 13px var(--ui);color:#575e75`;
    host.appendChild(title);

    contentBottom = Math.max(contentBottom, y);
    for (const d of defs) {
      const node = instantiate(d);
      const entry = entryForNode(node);
      const xml = entry ? nodeToXml(node, PROJECT) : '';
      if (!entry || xml.includes('df_unknown')) {
        report.degraded.push(d.id);
        continue;
      }
      xmls.push(xml.replace('<block ', `<block x="${x}" y="${y}" `));
      const h = (d.kind === 'cblock') ? 150 : 96;
      // 记下落点：截图工具可以据此把某一块单独裁出来核对
      report.boxes[d.op] = { x, y, w: COL - 60, h: h - 12, cat: catId, id: d.id };
      y += h;
      contentBottom = Math.max(contentBottom, y);
      report.total++;
    }
    report.categories.push({ id: catId, name: cat.name, count: defs.length });
  });

  const full = `<xml xmlns="${XHTML}"><variables>` +
    Object.keys(PROJECT.variables).map((n) => `<variable type="" id="dfvar_${encodeURIComponent(n)}">${n}</variable>`).join('') +
    Object.keys(PROJECT.lists).map((n) => `<variable type="list" id="dflist_${encodeURIComponent(n)}">${n}</variable>`).join('') +
    Object.keys(PROJECT.channels).map((n) => `<variable type="broadcast_msg" id="dfbc_${encodeURIComponent(n)}">${n}</variable>`).join('') +
    `</variables>${xmls.join('')}</xml>`;

  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(full), ws);

  // 内容尺寸：列数（分类数）× 列宽，行数由最长的分类决定
  const boardW = 24 + order.length * COL + 40;
  const boardH = Math.round(contentBottom + 80);
  document.body.style.width = boardW + 'px';
  document.body.style.height = boardH + 'px';
  host.style.width = boardW + 'px';
  host.style.height = boardH + 'px';

  // 截图工具会在拿到尺寸后把窗口调大，这里提供重新适配的入口
  window.__gallerySize = { w: boardW, h: boardH };
  window.__galleryResize = (w, h) => {
    document.body.style.width = w + 'px';
    document.body.style.height = h + 'px';
    host.style.width = w + 'px';
    host.style.height = h + 'px';
    const svg = host.querySelector('svg.blocklySvg');
    if (svg) { svg.setAttribute('width', w); svg.setAttribute('height', h); }
    try { Blockly.svgResize(ws); } catch { /* ignore */ }
    ws.scroll(0, 0);
    return { w, h };
  };
  window.__galleryResize(boardW, boardH);

  const meta = document.getElementById('meta');
  meta.textContent = `${report.total} 块积木 · ${order.length} 个分类 · 降级 ${report.degraded.length} 个`;
  window.__galleryReady = report;
  return report;
})();
