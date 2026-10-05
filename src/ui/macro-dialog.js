/**
 * Tanloom Engine — 合成积木（宏）与积木分类的对话框
 * ================================================================
 * 「合成新积木」流程（策划案 §7.2）：
 *   1. 选中一段积木
 *   2. 右键 → 合成新积木
 *   3. 自动识别自由变量（这里实现为：把字面量槽位提升为参数）
 *   4. 填名称 / 显示形式 / 类型 / 分类 / 颜色 / 图标
 *   5. 选择作用域与代码生成策略
 *   6. 保存 → 自动注册 → 选择区出现
 */

import { uid, seq, cloneIR, E } from '../core/ir.js';
import { showModal, row, inputEl, selectEl, radioRow, getRadio, hint, toast } from './dialogs.js';
import { defOf, macroDefOf } from '../core/blockdefs.js';
import { BUILTIN_CATEGORIES } from '../core/registry.js';

/* ------------------------------------------------------------------ */
/* 收集子树里的字面量（作为「自由变量」候选）                            */
/* ------------------------------------------------------------------ */
function collectLiterals(root) {
  const found = [];
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Number' || n.type === 'String') {
      const key = n.type + ':' + n.value;
      if (!seen.has(key)) { seen.add(key); found.push(n); }
      return;
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'type' || k === 'op') continue;
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(root);
  return found;
}

function replaceLiterals(root, map) {
  const walk = (n) => {
    if (!n || typeof n !== 'object') return n;
    if ((n.type === 'Number' || n.type === 'String') && map.has(n)) {
      const p = map.get(n);
      return { type: 'ParamRef', name: p };
    }
    if (Array.isArray(n)) return n.map(walk);
    const out = Array.isArray(n) ? [] : { type: n.type };
    if (n.op !== undefined) out.op = n.op;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'type' || k === 'op') continue;
      out[k] = (v && typeof v === 'object') ? walk(v) : v;
    }
    return out;
  };
  return walk(root);
}

const PARAM_NAMES = ['x', 'y', 'z', 'n', 'a', 'b', 'c'];

/** 从零新建时的占位实现：一块可编辑的代码积木，用户就地写 */
function placeholderBody(kind) {
  if (kind === 'expression') {
    return { type: 'CodeBlock', code: '0', returns: true };
  }
  const head = kind === 'event'
    ? '// 这段是事件积木的默认动作，改成你要的'
    : '// 在这里写这个积木做什么';
  return seq([{ type: 'CodeBlockStatement', code: head + '\n// 例：self.x += 10;' }]);
}

/* ================================================================== */
/* 合成新积木 / 编辑积木定义                                            */
/* ================================================================== */
/**
 * @param {object} o
 * @param {Store}  o.store
 * @param {string} [o.macroId]  编辑已有积木定义
 * @param {object} [o.source]   合成模式
 *        node        —— 被选中的 IR 节点（从零新建时为空）
 *        tailSeq     —— 该节点及其下方同层积木（语句型封装用）
 *        fromScratch —— true 表示不封装任何现有积木，直接造一个空壳
 *        category    —— 从零新建时的默认分类（选择区里那个分类的 id）
 *        onCommit    —— (macro) => void，由积木视图负责注册 + 落地
 * @param {Function} [o.onChange]
 */
export function openMacroDialog({ store, macroId, source, onChange }) {
  const p = store.project;
  const editing = !!macroId;
  const macro = editing ? p.macros[macroId] : null;
  const node = source && source.node;

  // 待封装的积木体
  let bodyIR = null;
  let kindHint = 'expression';
  if (editing) {
    bodyIR = cloneIR(macro.body);
    kindHint = macro.kind;
  } else if (node) {
    const def = defOf(node, p);
    const sk = def && def.kind;
    if (sk === 'reporter' || sk === 'boolean') { bodyIR = cloneIR(node); kindHint = 'expression'; }
    else {
      // 语句型：把该积木及其下方同层积木一起封装
      bodyIR = cloneIR(source.tailSeq || seq([node]));
      kindHint = 'statement';
    }
  } else if (source && source.fromScratch) {
    // 从零新建：给一块可编辑的「代码积木」当实现，用户直接在积木上写
    kindHint = source.kind || 'statement';
    bodyIR = placeholderBody(kindHint);
  } else {
    bodyIR = seq([]);
  }
  // 占位体还没被用户改过时，切换「类型」要跟着换（表达式返回 CodeBlock，语句用 CodeBlockStatement）
  let placeholder = !!(source && source.fromScratch);
  const isExprBody = kindHint === 'expression';

  const wrap = document.createElement('div');

  const nameI = inputEl(editing ? macro.name : '');
  const displayI = inputEl(editing ? macro.display : (isExprBody ? '(x)^2' : '新积木 (x)'));
  const kind = radioRow('kind', [
    { value: 'expression', label: '表达式（返回值）' },
    { value: 'statement', label: '语句（执行动作）' },
    { value: 'event', label: '事件（组合帽块）' }
  ], kindHint);
  kind.addEventListener('change', () => {
    if (!placeholder) return;
    const k = getRadio(kind);
    if ((k === 'expression') === isExprBody) return;
    bodyIR = placeholderBody(k);
    toast('实现已经换成对应的占位代码积木，保存后在积木上直接改', 'info', 3200);
  });

  const catOpts = Object.values(p.categories).sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((c) => ({ label: `${c.icon || ''} ${c.name}`, value: c.id }));
  const defaultCat = editing
    ? macro.category
    : ((source && source.category) || (isExprBody ? 'operators' : 'myblocks'));
  const catSel = selectEl(catOpts, defaultCat);

  const colorI = inputEl(editing ? (macro.color || '#FF6680') : '#FF6680', 'color');
  const iconI = inputEl(editing ? (macro.icon || '🧩') : '🧩');
  const scope = radioRow('scope', [
    { value: 'entity', label: '仅本角色' },
    { value: 'project', label: '项目' },
    { value: 'global', label: '全局' }
  ], editing ? macro.scope : 'project');
  const cg = radioRow('codegen', [
    { value: 'inline', label: '内联展开' },
    { value: 'function', label: '函数调用' },
    { value: 'native', label: '原生映射' }
  ], editing ? macro.codegen : (isExprBody ? 'inline' : 'function'));

  // 自由变量（字面量提升为参数）
  const lits = collectLiterals(bodyIR);
  const paramWrap = document.createElement('div');
  paramWrap.className = 'param-list';
  const paramRows = [];

  // 注意：updatePreview 必须在下面的 forEach **之前**定义。
  // 之前写成 const 声明在循环之后，循环里 `nm.addEventListener('input', updatePreview)`
  // 一求值就撞上 TDZ（Cannot access 'updatePreview' before initialization），
  // 只要待封装的积木里有一个字面量，对话框就整个崩掉。
  const preview = document.createElement('div');
  preview.className = 'hint';
  const updatePreview = () => {
    const chosen = paramRows.filter((r) => r.cb.checked);
    preview.innerHTML = chosen.length
      ? `参数：<code>${chosen.map((r) => r.nm.value).join(', ')}</code> —— 调用这个积木时，这些槽位会变成可填的输入口。`
      : '没有提升任何参数：这个积木会把当前的字面量固化下来。';
  };

  lits.forEach((lit, i) => {
    const r = document.createElement('div');
    r.className = 'param';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isExprBody && lits.length === 1;
    const code = document.createElement('code');
    code.textContent = `(${lit.value})  →  出现 ${countOccurrences(bodyIR, lit)} 次`;
    const nm = inputEl(PARAM_NAMES[i] || ('p' + i));
    nm.style.width = '80px';
    nm.disabled = true;
    cb.addEventListener('change', () => { nm.disabled = !cb.checked; updatePreview(); });
    nm.addEventListener('input', updatePreview);
    r.appendChild(cb); r.appendChild(code); r.appendChild(nm);
    paramWrap.appendChild(r);
    paramRows.push({ cb, nm, lit });
  });
  updatePreview();

  wrap.appendChild(row('名称', nameI));
  wrap.appendChild(row('显示形式', displayI));
  wrap.appendChild(row('类型', kind));
  wrap.appendChild(row('分类', catSel));
  wrap.appendChild(row('颜色', colorI));
  wrap.appendChild(row('图标', iconI));
  wrap.appendChild(row('作用域', scope));
  wrap.appendChild(row('代码生成', cg));
  wrap.appendChild(hint('<b>自由变量</b>：勾选要提升为参数的槽位（策划案 §7.2 第 3 步）。'));
  wrap.appendChild(paramWrap);
  wrap.appendChild(preview);
  wrap.appendChild(hint('保存后会立刻注册到选择区对应分类下；调用点可以随时右键「展开」还原成基础积木。'));

  showModal({
    title: editing ? `编辑积木「${macro.name}」` : '合成新积木',
    body: wrap,
    okText: editing ? '保存修改' : '合成',
    onOk: () => {
      const name = nameI.value.trim();
      if (!name) { toast('请填写名称', 'warn'); return false; }
      const chosen = paramRows.filter((r) => r.cb.checked);
      const map = new Map();
      chosen.forEach((r) => map.set(r.lit, r.nm.value.trim() || 'p'));
      const newBody = map.size ? replaceLiterals(bodyIR, map) : bodyIR;

      const newMacro = {
        type: 'MacroDef',
        id: editing ? macro.id : uid('macro'),
        name,
        display: displayI.value.trim() || name,
        kind: getRadio(kind),
        category: catSel.value,
        color: colorI.value,
        icon: iconI.value,
        scope: getRadio(scope),
        codegen: getRadio(cg),
        params: chosen.map((r) => ({ name: r.nm.value.trim() || 'p', type: 'number' })),
        body: newBody,
        version: editing ? (macro.version || 1) + 1 : 1,
        callCount: 0
      };

      if (editing) {
        store.commit(`修改积木「${name}」`, () => { store.project.macros[newMacro.id] = newMacro; });
      } else {
        store.commit(`合成新积木「${name}」`, () => {
          store.project.macros[newMacro.id] = newMacro;
          if (!store.project.categories[newMacro.category]) {
            store.project.categories[newMacro.category] = {
              id: newMacro.category, name: newMacro.category, color: newMacro.color,
              icon: newMacro.icon, order: 120, builtin: false, createdBy: 'user'
            };
          }
        });
        // 注册新积木类型 + 把调用点替换成新积木，这两件事只有积木视图会做
        if (source && source.onCommit) source.onCommit(newMacro);
      }
      if (onChange) onChange();
      toast(editing ? '积木定义已更新' : `已合成「${name}」，去选择区看看`, 'ok');
      return true;
    }
  });
}

function countOccurrences(root, lit) {
  let n = 0;
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x === lit) { n++; return; }
    for (const v of Object.values(x)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(root);
  return Math.max(1, n);
}

/* ================================================================== */
/* 新建分类                                                            */
/* ================================================================== */
export function openCategoryDialog(store, onChange) {
  const wrap = document.createElement('div');
  const nameI = inputEl('战斗系统');
  const colorI = inputEl('#E53935', 'color');
  const iconI = inputEl('⚔');
  const orderI = inputEl('120', 'number');
  const scope = radioRow('cscope', [
    { value: 'project', label: '项目内可见' },
    { value: 'entity', label: '仅本角色' },
    { value: 'global', label: '全局' }
  ], 'project');
  wrap.appendChild(row('分类名称', nameI));
  wrap.appendChild(row('颜色', colorI));
  wrap.appendChild(row('图标', iconI));
  wrap.appendChild(row('排序值', orderI));
  wrap.appendChild(row('可见性', scope));
  wrap.appendChild(hint('分类决定积木的默认颜色、图标与在选择区里的位置。内置分类不可以删除。'));

  showModal({
    title: '新建积木分类',
    body: wrap,
    okText: '创建',
    onOk: () => {
      const name = nameI.value.trim();
      if (!name) { toast('请填写分类名称', 'warn'); return false; }
      store.addCategory({
        name, color: colorI.value, icon: iconI.value,
        order: parseInt(orderI.value, 10) || 120, scope: getRadio(scope)
      });
      if (onChange) onChange();
      toast(`已创建分类「${name}」`, 'ok');
      return true;
    }
  });
}

/* ================================================================== */
/* 实体属性编辑（场景视图里也用）                                        */
/* ================================================================== */
export const SHAPE_OPTIONS = [
  { value: 'box', label: '方块' }, { value: 'capsule', label: '胶囊' },
  { value: 'circle', label: '圆形' }, { value: 'triangle', label: '三角' },
  { value: 'diamond', label: '菱形' }
];

export { BUILTIN_CATEGORIES, macroDefOf };
