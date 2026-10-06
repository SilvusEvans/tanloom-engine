/**
 * Tanloom Engine — 积木选择区（Blockly 的 toolbox + flyout）
 * ================================================================
 * 选择区的内容不是手写的：它从 core/blockdefs.js 遍历每个积木定义，
 * instantiate 出一个带默认值的节点，再走同一条 IR → XML 的投影。
 * 好处是「默认值」只存在一个地方（blockdefs 里那份），
 * 选择区显示什么、拖出来是什么，天然一致。
 *
 * 分类的组织规则（对应策划案 §8.1 / §9.1）：
 *   · 一个分类一行，**空的分类也要出现**（否则用户新建完分类会以为没生效）
 *   · 合成积木（宏）并进它自己的分类里，不另开一行
 *   · 用户分类和「我的积木」里多一个「新建积木」按钮 + 一句引导
 */

import { t } from '../../core/i18n.js';
import * as Blockly from '../../vendor/scratch-blocks.js';
import { ALL_DEFS, instantiate } from '../../core/blockdefs.js';
import { categoryLabel } from '../../core/registry.js';
import { entryForNode } from './defs.js';
import { nodeToXml } from './sync.js';
import { SHADES } from './theme.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 选择区里不出现的积木 */
const HIDDEN = new Set(['df_unknown']);

/** 每个分类下要摆哪些内置积木：靠 blockdefs 的定义顺序，不另写一份清单 */
function nativeItemsByCategory(project) {
  const byCat = new Map();
  const seenPerCat = new Map();
  for (const d of ALL_DEFS) {
    const node = instantiate(d);
    const entry = entryForNode(node);
    if (!entry || HIDDEN.has(entry.block)) continue;
    const cat = d.category || 'myblocks';
    if (!byCat.has(cat)) { byCat.set(cat, []); seenPerCat.set(cat, new Set()); }
    const seen = seenPerCat.get(cat);
    if (seen.has(entry.block)) continue;   // 同一分类里同一种积木只摆一次
    seen.add(entry.block);
    byCat.get(cat).push({
      block: entry.block,
      xml: nodeToXml(node, project).replace(/\s+x="-?\d+"\s+y="-?\d+"/, ''),
    });
  }
  return byCat;
}

/** 每个分类下的合成积木 */
function macroItemsByCategory(project) {
  const byCat = new Map();
  for (const m of Object.values(project.macros || {})) {
    const cat = project.categories[m.category] ? m.category : 'myblocks';
    const isExpr = m.kind === 'expression';
    const node = {
      type: isExpr ? 'MacroCall' : 'MacroCallStatement',
      macroId: m.id,
      args: (m.params || []).map(() => ({ type: 'Number', value: 1 })),
    };
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push({ block: 'macro:' + m.id, xml: nodeToXml(node, project) });
  }
  return byCat;
}

/** 内置广播的接收帽块：默认值给个更直观的自定义频道（内置阶段走 df_whenphase） */
function customBroadcastHat(project) {
  const node = { type: 'OnBroadcast', channel: '玩家受伤' };
  const entry = entryForNode(node);
  if (!entry) return null;
  return { block: entry.block + ':custom', xml: nodeToXml(node, project) };
}

/**
 * 组装 toolbox XML。
 * 分类与配色取自项目里的 categories —— 用户改过颜色、加过分类都会跟着变。
 */
export function buildToolboxXml(project) {
  const cats = Object.values(project.categories || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const native = nativeItemsByCategory(project);
  const macros = macroItemsByCategory(project);

  const parts = [];
  for (const c of cats) {
    const primary = c.color || (SHADES[c.id] && SHADES[c.id][0]) || '#87909F';
    const secondary = (SHADES[c.id] && SHADES[c.id][1]) || primary;
    const body = [];

    // 事件分类里额外摆一个「自定义广播」帽块
    if (c.id === 'event') {
      const hat = customBroadcastHat(project);
      if (hat) body.push(hat.xml);
    }

    for (const it of native.get(c.id) || []) body.push(it.xml);
    for (const it of macros.get(c.id) || []) body.push(it.xml);

    // 「我的积木」和用户自建分类里给一个新建入口 + 引导
    if (c.id === 'myblocks' || !c.builtin) {
      if (!body.length) {
        body.push(`<label text="${esc(t('这个分类还是空的'))}"></label>`);
        body.push(`<label text="${esc(t('在画布上搭一段积木 → 右键「合成新积木」→ 归到这里'))}"></label>`);
      }
      body.unshift(`<button text="${esc(t('＋ 新建积木'))}" callbackKey="df_new_macro_${esc(c.id)}"></button>`);
    }

    parts.push(
      `<category name="${esc(categoryLabel(c))}" id="${esc(c.id)}"` +
      ` colour="${esc(primary)}" secondaryColour="${esc(secondary)}">${body.join('')}</category>`,
    );
  }

  return `<xml id="toolbox" style="display:none">${parts.join('')}</xml>`;
}

/** XML → Blockly 认识的 toolbox JSON（顺便把 secondaryColour 带过去） */
export function buildToolboxJson(project) {
  const dom = Blockly.utils.xml.textToDom(buildToolboxXml(project));
  const json = Blockly.utils.toolbox.convertToolboxDefToJson(dom);
  const secondaryById = new Map();
  for (const el of dom.querySelectorAll('category')) {
    const id = el.getAttribute('id');
    if (id) secondaryById.set(id, el.getAttribute('secondaryColour'));
  }
  // 注意：转换出来的是大写 kind（'CATEGORY'），按小写比会一条都匹配不上
  const walk = (list) => {
    for (const c of list || []) {
      if (String(c.kind).toUpperCase() === 'CATEGORY' && secondaryById.has(c.id)) {
        c.secondaryColour = secondaryById.get(c.id);
      }
      if (c.contents) walk(c.contents);
    }
  };
  walk(json.contents);
  return json;
}

/** 选择区里会出现「新建积木」按钮的分类 id（工作区要给它们注册回调） */
export function buttonCategoryIds(project) {
  return Object.values(project.categories || {})
    .filter((c) => c.id === 'myblocks' || !c.builtin)
    .map((c) => c.id);
}

/** 选择区里一共有多少块积木（自检用） */
export function toolboxBlockCount(project) {
  let n = 0;
  for (const list of nativeItemsByCategory(project).values()) n += list.length;
  for (const list of macroItemsByCategory(project).values()) n += list.length;
  if (customBroadcastHat(project)) n += 1;
  return n;
}
