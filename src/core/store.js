/**
 * DualForge — 项目状态中心
 * ================================================================
 * IR 是唯一真源，store 负责：
 *   · 持有 project\n *   · 生成代码视图（IR → 代码）
 *   · 接收代码视图改动（代码 → IR）
 *   · 撤销 / 重做
 *   · 变更广播（UI 各处订阅）
 */

import { cloneIR, createProject, uid } from './ir.js';
import { generateFiles } from './codegen.js';
import { parseFile } from './parser.js';
import { BUILTIN_CATEGORIES, BUILTIN_CHANNELS } from './registry.js';

export class Store {
  constructor(project) {
    this.project = project || createProject();
    this.handlers = new Map();
    this.history = [];
    this.future = [];
    this.files = [];
    this.codeDirty = false;
    this.blocksStale = false;
    this.selectedEntityId = null;
    this.selectedScriptId = null;
    this.ensureBuiltins();
    const first = this.project.entities.find((e) => e.kind !== 'stage' && e.kind !== 'group');
    this.selectedEntityId = (first || this.project.entities[0] || {}).id || null;
    this.regenerate(false);
  }

  /* ---------------- 事件 ---------------- */
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, payload) {
    for (const fn of this.handlers.get(evt) || []) {
      try { fn(payload); } catch (e) { console.error('[store]', evt, e); }
    }
  }

  /* ---------------- 内置注册 ---------------- */
  ensureBuiltins() {
    const p = this.project;
    p.categories = p.categories || {};
    for (const c of BUILTIN_CATEGORIES) {
      if (!p.categories[c.id]) p.categories[c.id] = { id: c.id, name: c.name, color: c.color, icon: c.icon, order: c.order, builtin: true };
    }
    p.channels = p.channels || {};
    for (const c of BUILTIN_CHANNELS) {
      if (!p.channels[c.name]) p.channels[c.name] = { name: c.name, builtin: true, order: c.order, repeat: c.repeat, doc: c.doc };
    }
    p.macros = p.macros || {};
    p.variables = p.variables || {};
    p.lists = p.lists || {};
  }

  /* ---------------- 快照 / 撤销 ---------------- */
  snapshot(label) {
    this.history.push({ label, data: cloneIR(this.project) });
    if (this.history.length > 80) this.history.shift();
    this.future.length = 0;
  }
  undo() {
    if (!this.history.length) return;
    const cur = { label: 'redo', data: cloneIR(this.project) };
    const prev = this.history.pop();
    this.future.push(cur);
    this.project = prev.data;
    this.ensureBuiltins();
    this.regenerate(false);
    this.emit('change', { reason: 'undo' });
  }
  redo() {
    if (!this.future.length) return;
    this.history.push({ label: 'undo', data: cloneIR(this.project) });
    const next = this.future.pop();
    this.project = next.data;
    this.ensureBuiltins();
    this.regenerate(false);
    this.emit('change', { reason: 'redo' });
  }
  canUndo() { return this.history.length > 0; }
  canRedo() { return this.future.length > 0; }
  /** 撤销一次「预埋」的快照（拖动取消时用） */
  discardLastSnapshot() { this.history.pop(); }

  /* ---------------- 变更 ---------------- */
  /** 提交一次 IR 变更；label 用于撤销提示 */
  commit(label, mutator, opts = {}) {
    this.snapshot(label);
    if (mutator) mutator(this.project);
    this.ensureBuiltins();
    this.regenerate(true);
    this.emit('change', { reason: opts.reason || 'blocks', label });
    return true;
  }

  /** 只改不记录历史（用于拖动过程中的临时状态） */
  touch(reason = 'live') {
    this.ensureBuiltins();
    this.regenerate(false);
    this.emit('change', { reason });
  }

  regenerate(markStale) {
    this.files = generateFiles(this.project);
    if (markStale) this.codeDirty = false;
  }

  /* ---------------- 代码 → IR ---------------- */
  applyCode(fileName, text) {
    const file = this.files.find((f) => f.name === fileName);
    if (!file || file.readonly) return { ok: false, diagnostics: [{ msg: '该文件只读' }] };
    this.snapshot('代码同步回积木');
    const res = parseFile(text, { project: this.project });
    // 文件丢失的宏 id 需要保留原有 body 之外的元信息
    for (const m of res.macros) {
      const old = this.project.macros[m.id];
      if (old) m.version = (old.version || 1) + 1;
      this.project.macros[m.id] = m;
    }
    if (file.entityId) {
      const ent = this.project.entities.find((e) => e.id === file.entityId);
      if (ent) {
        const byId = new Map((ent.scripts || []).map((s) => [s.id, s]));
        ent.scripts = res.scripts.map((s) => {
          const old = byId.get(s.id);
          if (old) { old.hat = s.hat; old.body = s.body; old.name = s.name; return old; }
          return s;
        });
        // 自动登记新用到的广播频道
        for (const s of res.scripts) this.registerScriptChannels(s);
      }
    }
    this.ensureBuiltins();
    this.regenerate(false);
    this.codeDirty = false;
    this.emit('change', { reason: 'code', file: fileName });
    return { ok: res.diagnostics.length === 0, diagnostics: res.diagnostics, parsed: res };
  }

  registerScriptChannels(script) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if ((node.type === 'Broadcast' || node.type === 'BroadcastAndWait') && node.channel) {
        if (!this.project.channels[node.channel]) {
          this.project.channels[node.channel] = { name: node.channel, builtin: false, order: 100, doc: '由代码自动注册' };
        }
      }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') visit(v);
      }
    };
    visit(script.body);
  }

  /* ---------------- 实体 / 分类 / 频道 / 宏 ---------------- */
  entityById(id) { return this.project.entities.find((e) => e.id === id); }
  entityByName(name) { return this.project.entities.find((e) => e.name === name); }
  get selectedEntity() { return this.entityById(this.selectedEntityId); }
  get sprites() { return this.project.entities.filter((e) => e.kind !== 'group' && e.kind !== 'stage'); }

  addEntity(partial = {}) {
    let name = partial.name || '新实体';
    let i = 1;
    while (this.entityByName(name)) name = `${partial.name || '新实体'}${++i}`;
    const ent = {
      id: uid('ent'), name, kind: 'sprite', parent: null,
      visible: true, x: 0, y: 0, dir: 90, size: 100, opacity: 100, rotationStyle: 'all',
      render: { shape: 'box', color: '#4C97FF', stroke: '#3373CC', width: 48, height: 48, label: '' },
      tags: ['实体'], solid: false,
      physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1, grounded: false },
      scripts: []
    };
    Object.assign(ent, partial);
    this.commit(`新建实体 ${ent.name}`, (p) => { p.entities.push(ent); });
    this.selectedEntityId = ent.id;
    this.emit('select', { entityId: ent.id });
    return ent;
  }

  removeEntity(id) {
    const ent = this.entityById(id);
    if (!ent) return;
    this.commit(`删除实体 ${ent.name}`, (p) => {
      p.entities = p.entities.filter((e) => e.id !== id);
    });
    if (this.selectedEntityId === id) {
      this.selectedEntityId = (this.sprites[0] || {}).id || null;
      this.emit('select', { entityId: this.selectedEntityId });
    }
  }

  renameEntity(id, newName) {
    const ent = this.entityById(id);
    if (!ent || !newName || ent.name === newName) return;
    if (this.entityByName(newName)) return;
    const old = ent.name;
    this.commit(`重命名 ${old} → ${newName}`, (p) => {
      // 引用是按名字存的，重命名要连带改写
      const fix = (node) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.entity === 'string' && node.entity === old) node.entity = newName;
        if (typeof node.a === 'string' && node.a === old) node.a = newName;
        if (typeof node.b === 'string' && node.b === old) node.b = newName;
        for (const v of Object.values(node)) {
          if (Array.isArray(v)) v.forEach(fix);
          else if (v && typeof v === 'object') fix(v);
        }
      };
      ent.name = newName;
      for (const e of p.entities) { fix(e); }
      const first = p.entities.find((x) => x.id === id);
      if (first) first.name = newName;
    });
  }

  addCategory({ id, name, color, icon, order, scope = 'project' }) {
    const cid = id || uid('cat');
    this.commit(`新建分类 ${name}`, (p) => {
      p.categories[cid] = {
        id: cid, name, color, icon, order: order != null ? order : 120,
        scope, builtin: false, createdBy: 'user', collapsed: false
      };
    });
    return cid;
  }

  updateCategory(id, patch) {
    this.commit('修改分类', (p) => { Object.assign(p.categories[id], patch); });
  }

  removeCategory(id) {
    const cat = this.project.categories[id];
    if (!cat || cat.builtin) return;
    this.commit(`删除分类 ${cat.name}`, (p) => {
      for (const m of Object.values(p.macros)) if (m.category === id) m.category = 'myblocks';
      delete p.categories[id];
    });
  }

  addMacro(macro) {
    this.commit(`合成新积木「${macro.name}」`, (p) => {
      p.macros[macro.id] = macro;
      if (macro.category && !p.categories[macro.category]) {
        p.categories[macro.category] = { id: macro.category, name: macro.category, color: macro.color || '#FF6680', icon: macro.icon || '🧩', order: 120, builtin: false, createdBy: 'user' };
      }
    });
    return macro;
  }

  removeMacro(id) {
    const m = this.project.macros[id];
    if (!m) return;
    this.commit(`删除积木「${m.name}」`, (p) => { delete p.macros[id]; });
  }

  addChannel(name) {
    if (this.project.channels[name]) return;
    this.commit(`注册广播「${name}」`, (p) => {
      p.channels[name] = { name, builtin: false, order: 100, doc: '用户定义' };
    });
  }

  addVariable(name, value = 0) {
    this.commit(`新建变量 ${name}`, (p) => { p.variables[name] = value; });
  }
  addList(name) {
    this.commit(`新建列表 ${name}`, (p) => { p.lists[name] = []; });
  }

  /* ---------------- 脚本操作 ---------------- */
  addScript(entityId, hat, body) {
    const ent = this.entityById(entityId);
    if (!ent) return null;
    const script = { id: uid('script'), hat, body: body || { type: 'BlockSequence', blocks: [] } };
    this.commit('新建脚本', () => { (ent.scripts = ent.scripts || []).push(script); });
    return script;
  }

  removeScript(entityId, scriptId) {
    const ent = this.entityById(entityId);
    if (!ent) return;
    this.commit('删除脚本', () => { ent.scripts = ent.scripts.filter((s) => s.id !== scriptId); });
  }

  /* ---------------- 序列化 ---------------- */
  toJSON() { return JSON.stringify(this.project, null, 2); }
  loadFromJSON(text) {
    const p = JSON.parse(text);
    this.project = p;
    this.history.length = 0; this.future.length = 0;
    this.ensureBuiltins();
    this.selectedEntityId = ((p.entities || [])[0] || {}).id || null;
    this.regenerate(false);
    this.emit('change', { reason: 'load' });
    this.emit('select', { entityId: this.selectedEntityId });
  }
}
