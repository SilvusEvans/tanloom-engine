/**
 * DualForge — 调试面板
 *   广播时间轴 / 订阅列表 / 变量监视 / 性能分析 / 控制台
 *   以及层级树与属性检查器。
 */

import { BUILTIN_CHANNELS } from '../core/registry.js';
import { showMenu, showInlineInput, toast } from './dialogs.js';
import { SHAPE_OPTIONS } from './macro-dialog.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ================================================================== */
/* 广播时间轴：本帧各阶段的耗时 + 最近广播流                             */
/* ================================================================== */
export function renderBroadcast(el, store, rt) {
  const tl = rt.timeline;
  const last = tl[tl.length - 1];
  let html = '<div class="tl-head"><span>阶段</span><span>耗时 ms</span><span>订阅者</span><span>占比</span></div>';
  if (!last) {
    html += '<div class="log-line info">还没运行。按 ▶ 开始，这里会显示每帧的广播时间轴。</div>';
  } else {
    const total = Math.max(0.01, last.ms);
    for (const s of last.stages) {
      const w = Math.max(1, Math.round((s.ms / total) * 100));
      const cls = s.ms > 6 ? 'slower' : (s.ms > 2 ? 'slow' : '');
      html += `<div class="tl-row"><span class="tl-stage">${esc(s.name)}</span>` +
        `<span>${s.ms.toFixed(2)}</span><span>${s.subs}</span>` +
        `<span><div class="tl-bar ${cls}" style="width:${w}%"></div></span></div>`;
    }
    html += `<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>合计</span><span>${last.ms.toFixed(2)}</span><span></span><span></span></div>`;
    html += `<div class="tl-row"><span>帧</span><span>${last.frame}</span><span></span><span>delta ${last.delta} ms</span></div>`;
  }
  html += '<div class="tl-head" style="margin-top:8px"><span colspan="4">最近广播</span></div>';
  const evs = (rt.broadcastLog || []).slice(-24).reverse();
  if (!evs.length) html += '<div class="log-line info">（运行后这里会实时列出广播事件）</div>';
  for (const e of evs) {
    const isPhase = BUILTIN_CHANNELS.some((c) => c.name === e.channel);
    html += `<div class="log-line bus"><span class="f">帧 ${e.frame}</span>` +
      `<span class="ch">${esc(e.channel)}</span>` +
      `<span>${isPhase ? '阶段广播' : `来自 ${esc(e.source)} · 参数 ${e.value} · ${e.count} 个订阅者`}</span></div>`;
  }
  el.innerHTML = html;
}

/* ================================================================== */
/* 订阅列表：每个频道下挂着哪些脚本                                      */
/* ================================================================== */
export function renderSubscribers(el, store, rt, onJump) {
  const rtObj = rt;
  const channels = [];
  for (const c of BUILTIN_CHANNELS) channels.push({ name: c.name, order: c.order, builtin: true, doc: c.doc });
  for (const c of Object.values(store.project.channels || {})) {
    if (!c.builtin) channels.push({ name: c.name, order: c.order || 100, builtin: false, doc: c.doc || '' });
  }
  channels.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  // 运行时可能自动注册了新频道
  for (const n of Object.keys(rtObj._subByChannel || {})) {
    if (n.startsWith('_')) continue;
    if (!channels.find((c) => c.name === n)) channels.push({ name: n, order: 999, builtin: false, doc: '' });
  }

  el.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'subs-grid';
  for (const ch of channels) {
    const subs = rtObj.subscribersOf(ch.name) || [];
    const g = document.createElement('div');
    g.className = 'subs-group';
    const head = document.createElement('div');
    head.className = 'ch';
    const mutedCount = subs.filter((s) => s.muted).length;
    head.innerHTML = `${esc(ch.name)} <span class="badge">${ch.builtin ? '内置' : '自定义'} · ${subs.length} 个订阅者`
      + `${mutedCount ? ` · <b class="muted">${mutedCount} 个已取消订阅</b>` : ''}`
      + `${ch.doc ? ' · ' + esc(ch.doc) : ''}</span>`;
    g.appendChild(head);
    if (!subs.length) {
      const d = document.createElement('div');
      d.className = 'subs-item dim';
      d.textContent = '（没有脚本订阅这个广播）';
      g.appendChild(d);
    }
    for (const s of subs) {
      const it = document.createElement('div');
      // 被「将 XX 广播订阅状态设为 取消订阅」关掉的，灰掉并标出来
      it.className = 'subs-item' + (s.muted ? ' muted' : '');
      const shape = s.hat.type === 'OnCollision' ? `当「${s.a}」碰到「${s.b}」`
        : s.hat.type === 'OnKey' ? `当按下「${s.key}」`
          : s.hat.type === 'OnClick' ? `当「${s.a}」被点击`
            : s.hat.type === 'OnClone' ? '当作为克隆体启动'
              : s.hat.type === 'OnStart' ? '当 ▶ 被点击' : `当收到「${s.channel}」`;
      it.textContent = `${s.entityName} · ${shape} · ${(s.script.body.blocks || []).length} 块积木`
        + (s.muted ? ' · 已取消订阅' : '');
      it.addEventListener('click', () => onJump && onJump(s));
      g.appendChild(it);
    }
    grid.appendChild(g);
  }
  el.appendChild(grid);
}

/* ================================================================== */
/* 变量 / 列表监视                                                      */
/* ================================================================== */
export function renderVars(el, store, rt) {
  const vars = rt.isRunning() ? rt.state.vars : store.project.variables;
  const lists = rt.isRunning() ? rt.state.lists : store.project.lists;
  let html = '<div class="vars-grid">';
  for (const [k, v] of Object.entries(vars || {})) {
    html += `<div class="var-card"><div class="k">变量 ${esc(k)}</div><div class="v">${esc(fmt(v))}</div></div>`;
  }
  for (const [k, v] of Object.entries(lists || {})) {
    const arr = Array.isArray(v) ? v : [];
    html += `<div class="var-card"><div class="k">列表 ${esc(k)} · ${arr.length} 项</div><div class="v">${esc(arr.slice(0, 8).map(fmt).join(', '))}${arr.length > 8 ? ' …' : ''}</div></div>`;
  }
  const ents = rt.isRunning() ? rt.state.order.map((n) => rt.state.entities[n]) : [];
  if (ents.length) {
    html += '</div><div class="vars-grid">';
    for (const e of ents.slice(0, 24)) {
      html += `<div class="var-card"><div class="k">${esc(e.name)}${e.isClone ? ' · 克隆体' : ''}</div>` +
        `<div class="v">x ${Math.round(e.x)} y ${Math.round(e.y)}<br>vx ${Math.round(e.vx || 0)} vy ${Math.round(e.vy || 0)}</div></div>`;
    }
  }
  html += '</div>';
  el.innerHTML = html;
}

function fmt(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return String(v);
}

/* ================================================================== */
/* 性能分析                                                            */
/* ================================================================== */
export function renderPerf(el, store, rt) {
  const stats = Object.entries(rt.channelStats || {})
    .map(([name, s]) => ({ name, ms: s.ms, calls: s.calls, subs: s.subs }))
    .sort((a, b) => b.ms - a.ms);
  const max = Math.max(1, ...stats.map((s) => s.ms));
  let html = '<div class="perf-grid">';
  html += `<div class="perf-row"><b>帧号</b><span>${rt.frame}</span><span>运行 ${rt.time.toFixed(1)}s · delta ${(rt.delta * 1000).toFixed(1)}ms</span></div>`;
  html += `<div class="perf-row"><b>克隆体</b><span>${rt.state.clones.filter((n) => rt.state.entities[n]).length}</span><span>粒子 ${rt.state.particles.length}</span></div>`;
  html += `<div class="perf-row"><b>活跃脚本线程</b><span>${Object.keys(rt._subscriptions || {}).length}</span><span></span></div>`;
  for (const s of stats) {
    const w = Math.max(1, Math.round((s.ms / max) * 100));
    html += `<div class="perf-row"><span>${esc(s.name)}</span><span>${s.ms.toFixed(2)}ms</span>` +
      `<span><div class="bar" style="width:${w}%"></div> <span class="dim">${s.calls} 次派发 · ${s.subs} 订阅</span></span></div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

/* ================================================================== */
/* 控制台                                                              */
/* ================================================================== */
export function renderConsole(el, rt) {
  const logs = rt.logs.slice(-140);
  el.innerHTML = logs.map((l) =>
    `<div class="log-line ${l.level}"><span class="f">${l.frame}</span><span>${esc(l.msg)}</span></div>`
  ).join('') || '<div class="log-line info">（空）</div>';
  el.scrollTop = el.scrollHeight;
}

/* ================================================================== */
/* 层级树                                                              */
/* ================================================================== */
export function renderHierarchy(el, store, rt, onSelect) {
  el.innerHTML = '';
  const sel = store.selectedEntityId;
  const groups = [
    { title: '舞台', items: (store.project.entities || []).filter((e) => e.kind === 'stage') },
    { title: '实体', items: (store.project.entities || []).filter((e) => e.kind === 'sprite' && !e.parent) }
  ];
  for (const g of groups) {
    if (!g.items.length) continue;
    const t = document.createElement('div');
    t.className = 'palette-sec';
    t.textContent = g.title;
    el.appendChild(t);
    for (const e of g.items) {
      const row = document.createElement('div');
      row.className = 'hier-row' + (e.id === sel ? ' active' : '');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = (e.render && e.render.color) || '#888';
      const nm = document.createElement('span');
      nm.className = 'n';
      nm.textContent = `${e.kind === 'stage' ? '🎬 ' : (e.solid ? '🧱 ' : '◆ ')}${e.name}`;
      const sc = document.createElement('span');
      sc.className = 'sc';
      sc.textContent = `${(e.scripts || []).length}`;
      row.append(sw, nm, sc);
      row.addEventListener('click', () => onSelect(e.id));
      el.appendChild(row);
    }
  }
  // 克隆体
  if (rt.isRunning()) {
    const clones = rt.state.order.map((n) => rt.state.entities[n]).filter((e) => e && e.isClone);
    if (clones.length) {
      const t = document.createElement('div');
      t.className = 'palette-sec';
      t.textContent = `克隆体（${clones.length}）`;
      el.appendChild(t);
    }
  }
}

/* ================================================================== */
/* 属性检查器                                                          */
/* ================================================================== */
export function renderInspector(el, store, onChange) {
  el.innerHTML = '';
  const e = store.selectedEntity;
  if (!e) {
    el.innerHTML = '<div class="dim" style="padding:8px">选中一个实体</div>';
    return;
  }
  const p = store.project;
  const upd = (fn, label) => store.commit(label || '修改属性', fn);
  const after = () => { if (onChange) onChange(); };

  const mk = (label, ctrl) => {
    const r = document.createElement('div');
    r.className = 'insp-row';
    const l = document.createElement('label');
    l.textContent = label;
    r.append(l, ctrl);
    return r;
  };
  const numInput = (v, on) => {
    const i = document.createElement('input');
    i.type = 'number';
    i.value = v;
    i.addEventListener('change', () => { on(parseFloat(i.value) || 0); after(); });
    return i;
  };
  const textInput = (v, on) => {
    const i = document.createElement('input');
    i.type = 'text';
    i.value = v;
    i.addEventListener('change', () => { on(i.value); after(); });
    return i;
  };
  const check = (v, label, on) => {
    const w = document.createElement('label');
    w.className = 'insp-check';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = !!v;
    c.addEventListener('change', () => { on(c.checked); after(); });
    w.append(c, document.createTextNode(label));
    return w;
  };

  el.appendChild(mk('名称', textInput(e.name, (v) => store.renameEntity(e.id, v.trim()))));
  el.appendChild(mk('x', numInput(e.x, (v) => upd(() => { e.x = v; }))));
  el.appendChild(mk('y', numInput(e.y, (v) => upd(() => { e.y = v; }))));
  el.appendChild(mk('方向', numInput(e.dir, (v) => upd(() => { e.dir = v; }))));
  el.appendChild(mk('大小 %', numInput(e.size, (v) => upd(() => { e.size = v; }))));

  const shapeSel = document.createElement('select');
  for (const o of SHAPE_OPTIONS) {
    const op = document.createElement('option');
    op.value = o.value; op.textContent = o.label;
    shapeSel.appendChild(op);
  }
  shapeSel.value = (e.render && e.render.shape) || 'box';
  shapeSel.addEventListener('change', () => { upd(() => { e.render.shape = shapeSel.value; }); after(); });
  el.appendChild(mk('形状', shapeSel));

  el.appendChild(mk('宽 / 高', (() => {
    const d = document.createElement('div');
    d.style.display = 'grid';
    d.style.gridTemplateColumns = '1fr 1fr';
    d.style.gap = '5px';
    d.append(
      numInput((e.render && e.render.width) || 40, (v) => { e.render.width = Math.max(2, v); }),
      numInput((e.render && e.render.height) || 40, (v) => { e.render.height = Math.max(2, v); })
    );
    return d;
  })()));

  el.appendChild(mk('颜色', (() => {
    const i = document.createElement('input');
    i.type = 'color';
    i.value = (e.render && e.render.color) || '#4C97FF';
    i.addEventListener('change', () => { upd(() => { e.render.color = i.value; e.render.stroke = shade(i.value); }); after(); });
    return i;
  })()));

  const grp = document.createElement('div');
  grp.className = 'insp-group';
  grp.textContent = '物理 / 碰撞';
  el.appendChild(grp);
  el.appendChild(mk('重力', numInput((e.physics && e.physics.gravity) || 0, (v) => upd(() => { e.physics.gravity = v; }))));
  el.appendChild(mk('弹性', numInput((e.physics && e.physics.bounce) || 0, (v) => upd(() => { e.physics.bounce = v; }))));
  el.appendChild(mk('', check(e.solid, '实心（角色可站立）', (v) => upd(() => { e.solid = v; }))));
  el.appendChild(mk('', check(e.visible, '初始可见', (v) => upd(() => { e.visible = v; }))));
  el.appendChild(mk('', check(e.kind === 'stage', '标记为舞台', (v) => upd(() => { e.kind = v ? 'stage' : 'sprite'; }))));

  const del = document.createElement('button');
  del.textContent = '删除这个实体';
  del.style.marginTop = '8px';
  if (e.kind === 'stage') del.disabled = true;
  del.addEventListener('click', () => store.removeEntity(e.id));
  el.appendChild(del);
  return el;
}

function shade(hex) {
  const s = String(hex).replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * 0.76))).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/* ================================================================== */
/* 资源视图                                                            */
/* ================================================================== */
export function renderAssets(el, store, rt) {
  const p = store.project;
  const vars = el.querySelector('#assets-vars');
  const lists = el.querySelector('#assets-lists');
  const chans = el.querySelector('#assets-channels');
  const cats = el.querySelector('#assets-categories');
  const macros = el.querySelector('#assets-macros');

  if (vars) {
    vars.innerHTML = '';
    for (const [k, v] of Object.entries(p.variables || {})) {
      vars.appendChild(listRow(k, String(v), [
        { label: '初始化值', onClick: (r) => showInlineInput(r.getBoundingClientRect(), String(p.variables[k]), (nv) => store.commit('修改变量', () => { p.variables[k] = parseFloat(nv) || 0; }), { width: 90 }) },
        { label: '重命名', onClick: (r) => renameVar(store, k, 'var') },
        { label: '删除', onClick: () => store.commit('删除变量', () => { delete p.variables[k]; }) }
      ]));
    }
  }
  if (lists) {
    lists.innerHTML = '';
    for (const [k, v] of Object.entries(p.lists || {})) {
      lists.appendChild(listRow(k, `${Array.isArray(v) ? v.length : 0} 项`, [
        { label: '清空', onClick: () => store.commit('清空列表', () => { p.lists[k] = []; }) },
        { label: '重命名', onClick: () => renameVar(store, k, 'list') },
        { label: '删除', onClick: () => store.commit('删除列表', () => { delete p.lists[k]; }) }
      ]));
    }
  }
  if (chans) {
    chans.innerHTML = '';
    for (const c of Object.values(p.channels || {}).sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const subs = rt.subscribersOf(c.name) || [];
      chans.appendChild(listRow((c.builtin ? '内置 · ' : '') + c.name, `${subs.length} 订阅`, [
        { label: '查看订阅者', onClick: () => { document.querySelector('[data-panel="subs"]').click(); } }
      ]));
    }
  }
  if (cats) {
    cats.innerHTML = '';
    for (const c of Object.values(p.categories || {}).sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const items = [];
      if (!c.builtin) items.push({
        label: '改颜色', onClick: (r) => showInlineInput(r.getBoundingClientRect(), c.color, (v) => store.updateCategory(c.id, { color: v }), { type: 'color', width: 90 })
      });
      items.push({ label: '重命名', onClick: () => showInlineInput(document.body.getBoundingClientRect(), c.name, (v) => store.updateCategory(c.id, { name: v }), { width: 130 }) });
      if (!c.builtin) items.push({ label: '删除', onClick: () => store.removeCategory(c.id) });
      cats.appendChild(listRow(`${c.icon || ''} ${c.name}`, c.builtin ? '内置' : `${c.id}`, items, c.color));
    }
  }
  if (macros) {
    macros.innerHTML = '';
    for (const m of Object.values(p.macros || {})) {
      const uses = countMacroUses(p, m.id);
      macros.appendChild(listRow(`${m.icon || '🧩'} ${m.name}`, `${m.display} · ${m.kind} · ${m.codegen} · 被调用 ${uses} 次`, [
        { label: '编辑定义…', onClick: () => import('./macro-dialog.js').then(({ openMacroDialog }) => openMacroDialog({ store, macroId: m.id, onChange: () => renderAssets(el, store, rt) })) },
        { label: '删除', onClick: () => store.removeMacro(m.id) }
      ], m.color));
    }
    if (!Object.keys(p.macros || {}).length) {
      macros.innerHTML = '<div class="list-row dim">还没有合成积木。在积木视图里右键一段积木 → 合成新积木。</div>';
    }
  }
}

function renameVar(store, oldName, kind) {
  showInlineInput(document.body.getBoundingClientRect(), oldName, (nv) => {
    if (!nv || nv === oldName) return;
    store.commit('重命名', () => {
      const bag = kind === 'var' ? store.project.variables : store.project.lists;
      bag[nv] = bag[oldName];
      delete bag[oldName];
      const fix = (n) => {
        if (!n || typeof n !== 'object') return;
        if (kind === 'var' && n.type === 'VarRef' && n.name === oldName) n.name = nv;
        if (kind === 'var' && (n.type === 'SetVar' || n.type === 'ChangeVar' || n.type === 'ShowVar' || n.type === 'HideVar') && n.name === oldName) n.name = nv;
        if (kind === 'list' && n.type === 'ListRef' && n.name === oldName) n.name = nv;
        if (kind === 'list' && n.list === oldName) n.list = nv;
        for (const v of Object.values(n)) {
          if (Array.isArray(v)) v.forEach(fix);
          else if (v && typeof v === 'object') fix(v);
        }
      };
      for (const e of store.project.entities) fix(e);
      for (const m of Object.values(store.project.macros)) fix(m.body);
    });
  }, { width: 130 });
}

function countMacroUses(project, id) {
  let n = 0;
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if ((x.type === 'MacroCall' || x.type === 'MacroCallStatement') && x.macroId === id) n++;
    for (const v of Object.values(x)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  for (const e of project.entities || []) walk(e);
  return n;
}

function listRow(name, value, actions, color) {
  const r = document.createElement('div');
  r.className = 'list-row';
  if (color) {
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.cssText = `width:9px;height:9px;border-radius:3px;background:${color}`;
    r.appendChild(sw);
  }
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = name;
  const v = document.createElement('span');
  v.className = 'v';
  v.textContent = value;
  const btn = document.createElement('button');
  btn.textContent = '⋯';
  btn.addEventListener('click', (ev) => {
    showMenu({ x: ev.clientX, y: ev.clientY }, actions.map((a) => ({
      label: a.label, onClick: () => a.onClick(r)
    })), { context: true });
  });
  r.append(n, v, btn);
  return r;
}

export { toast };
