/**
 * Tanloom Engine — 积木工作区
 * ================================================================
 * 用 scratch-blocks 的 Blockly 工作区替掉原来手写的 SVG 工作区。
 * 拖拽、吸附、插入标记、缩放、右键菜单、撤销、变量/消息的自动建模型
 * 全部由 Scratch 自己的实现负责 —— 这些正是手写版本最容易出问题的地方。
 *
 * 本文件只做四件事：
 *   1. 注入工作区（主题 / 选择区 / 媒体）
 *   2. 每个实体一份工作区状态，切实体时存取
 *   3. IR → 工作区（外部改了就重投影）
 *   4. 工作区 → IR（用户改了就写回唯一真源）
 *
 * 关键点：程序化载入期间必须屏蔽 change 事件，否则「写回 IR → store 变更 →
 * 重新投影 → 又触发 change」会打转。
 */

import { t, opt, scratchLocale } from '../../core/i18n.js';
import * as Blockly from '../../vendor/scratch-blocks.js';
import { MEDIA_URL } from '../../vendor/scratch-blocks.js';
import { uid } from '../../core/ir.js';
import { buildTheme } from './theme.js';
import { defineBlocks, defineMacroBlocks, configure, ctx } from './defs.js';
import { buildToolboxJson, buildToolboxXml, buttonCategoryIds } from './toolbox.js';
import { entityToWorkspaceXml, xmlToNode, xmlToSeq, nodeToXml, countHats, HAT_TYPES } from './sync.js';
import { openMacroDialog } from '../../ui/macro-dialog.js';
import { toast } from '../../ui/dialogs.js';

/** 只关心「真的改了模型」的事件，其余（选中、视口、主题…）不触发写回 */
const IGNORED_EVENTS = new Set([
  // 「点击积木执行」不走这里的 CLICK 事件 —— 那个事件依赖 Blockly 的手势栈，
  // 见 _installClickToRun()，我们自己判指针按下/抬起。
  Blockly.Events.CLICK, Blockly.Events.SELECTED, Blockly.Events.VIEWPORT_CHANGE,
  Blockly.Events.THEME_CHANGE, Blockly.Events.BUBBLE_OPEN, Blockly.Events.TOOLBOX_ITEM_SELECT,
  Blockly.Events.FINISHED_LOADING,
].filter(Boolean));

export class ScratchWorkspace {
  /**
   * @param {HTMLElement} host    放 Blockly 的容器
   * @param {Store} store
   * @param {object} opts  { onChange(), rt, onAutoRun(), area() }
   *        rt        —— 运行时（点击积木要真的执行它）
   *        onAutoRun —— 没在运行时，点积木要先按一次「运行」，由应用层负责
   *        area      —— 取当前编辑区表面色的函数（见 applyEditTheme）。
   *                     不给就是 Scratch 原生浅色；给了，积木画布就和代码区同源。
   */
  constructor(host, store, opts = {}) {
    this.host = host;
    this.store = store;
    this.opts = opts;
    this.rt = opts.rt || null;
    this.suppress = false;
    this.currentEntityId = null;
    this.states = new Map();
    this.pending = false;
    this.area = null;      // 当前生效的编辑区表面色（applyEditTheme 写入）

    Blockly.ScratchMsgs.setLocale(scratchLocale());
    defineBlocks();
    // 宏（合成积木）也要先注册成积木类型，否则选择区和项目里的调用都认不出来
    defineMacroBlocks(store.project.macros || {});
    this._macroSignatures = new Map(
      Object.values(store.project.macros || {}).map((m) => [m.id, macroSignature(m)]),
    );
    this._syncContext();
    if (typeof opts.area === 'function') this.area = opts.area();
    this.ws = Blockly.inject(host, {
      toolbox: buildToolboxJson(store.project),
      theme: buildTheme(store.project, this.area),
      scratchTheme: Blockly.ScratchBlocksTheme.CLASSIC,
      media: MEDIA_URL,
      pathToMedia: MEDIA_URL,
      zoom: { controls: true, wheel: true, startScale: 0.78, maxScale: 2.2, minScale: 0.3, scaleSpeed: 1.15 },
      trashcan: true,
      sounds: false,
      // 网格是主体 Luna 之外唯一自带的深色/浅色线索 —— 深色画布上用深格点
      grid: { spacing: 24, length: 1, colour: (this.area && this.area.grid) || '#d8dbe3', snap: false },
    });

    this.ws.addChangeListener((e) => this._onChange(e));
    this._installContextMenu();
    this._installClickToRun();
    // 注入时给的是现成的 toolbox，按钮回调得补注册一次，否则「＋ 新建积木」是死的
    this._wireToolboxButtons();
    // 工具箱里的分类折叠状态在重建时想保留，这里记一下
    this._lastToolboxXml = '';
  }

  /* ---------------------------------------------------------------- */
  /* 上下文：动态下拉的取数口                                           */
  /* ---------------------------------------------------------------- */
  _syncContext() {
    const p = this.store.project;
    configure({
      getEntityNames: () => p.entities.filter((e) => e.kind !== 'group').map((e) => e.name),
      getChannels: () => Object.values(p.channels || {})
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((c) => ({ name: c.name, label: c.builtin ? PHASE_LABEL(c.name) : c.name })),
      getVariables: () => Object.keys(p.variables || {}),
      getLists: () => Object.keys(p.lists || {}),
      getSounds: () => SOUNDS,
      getAnimations: () => [],
    });
  }

  /* ---------------------------------------------------------------- */
  /* 编辑区主题：积木画布与代码区共用一套，这里负责跟上                */
  /* ---------------------------------------------------------------- */
  _buildTheme() { return buildTheme(this.store.project, this.area); }

  /**
   * 编辑区主题变了就把 Blockly 的主题整个换掉（会重绘所有积木，所以要幂等）。
   * @param {?object} area  appearance.editTheme.ws；null 表示回落到 Scratch 原生浅色
   */
  applyEditTheme(area = null) {
    const sig = area ? JSON.stringify(area) : '';
    if (sig === this._areaSig) return false;
    this._areaSig = sig;
    this.area = area;
    // 主体的 setTheme 不重画网格实例 —— 它的色值是 inject 时读走的，得单独推一次
    try {
      if (this.ws.options && this.ws.options.grid && area) this.ws.options.grid.colour = area.grid;
      if (this.ws.grid_ && typeof this.ws.grid_.update === 'function') this.ws.grid_.update(this.ws);
    } catch { /* 网格不影响视觉正确性，拿不到就算了 */ }
    try { this.ws.setTheme(this._buildTheme()); } catch { /* ignore */ }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* 实体切换                                                          */
  /* ---------------------------------------------------------------- */
  showEntity(entityId) {
    if (this.currentEntityId === entityId) return;
    this.hideValueBox();
    this._saveState();
    this.currentEntityId = entityId;
    const ent = this.store.entityById(entityId);
    this._loadEntity(ent);
  }

  _saveState() {
    if (!this.currentEntityId) return;
    try {
      this.states.set(this.currentEntityId, Blockly.Xml.workspaceToDom(this.ws));
    } catch { /* 工作区还没准备好 */ }
  }

  _loadEntity(ent) {
    const xml = ent ? entityToWorkspaceXml(ent, this.store.project) : '<xml xmlns="http://www.w3.org/1999/xhtml"></xml>';
    this._loadXml(xml, (ent && ent.scripts) || []);
  }

  _loadXml(xmlText, scripts) {
    this.suppress = true;
    try {
      const dom = Blockly.utils.xml.textToDom(xmlText);
      if (typeof Blockly.clearWorkspaceAndLoadFromXml === 'function') {
        Blockly.clearWorkspaceAndLoadFromXml(dom, this.ws);
      } else {
        this.ws.clear();
        Blockly.Xml.domToWorkspace(dom, this.ws);
      }
      this.ws.clearUndo();
      // 把脚本 id 挂回顶层积木，写回 IR 时才能对上
      const tops = this.ws.getTopBlocks(true);
      tops.forEach((b, i) => { if (scripts && scripts[i]) b.__tlScriptId = scripts[i].id; });
    } catch (err) {
      console.error(t('[积木] 载入失败'), err);
    } finally {
      this.suppress = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* IR → 工作区                                                       */
  /* ---------------------------------------------------------------- */
  /** 外部（代码视图 / 撤销 / 换项目）改了 IR 之后重新投影 */
  refresh(force = false) {
    const ent = this.store.entityById(this.currentEntityId);
    if (!ent) return;
    // 只在自己不是「脏」的时候重建，避免把用户正在拖的积木洗掉
    if (!force && this._lastSignature === this._signature(ent)) return;
    this._loadEntity(ent);
    this._lastSignature = this._signature(ent);
  }

  _signature(ent) {
    try { return JSON.stringify(ent.scripts) + '|' + JSON.stringify(ent.scriptPos || {}); }
    catch { return String(Math.random()); }
  }

  resetView() {
    this.ws.setScale(0.78);
    this.ws.scrollCenter();
    const tops = this.ws.getTopBlocks(true);
    if (tops.length && Blockly.svgResize) Blockly.svgResize(this.ws);
  }

  zoomToFit() {
    if (this.ws.zoomToFit) { try { this.ws.zoomToFit(); return; } catch { /* 空工作区会抛 */ } }
    this.resetView();
  }

  /* ---------------------------------------------------------------- */
  /* 工作区 → IR                                                       */
  /* ---------------------------------------------------------------- */
  _onChange(e) {
    if (this.suppress || !e) return;
    if (IGNORED_EVENTS.has(e.type)) return;
    if (e.type === Blockly.Events.BLOCK_MOVE && e.isUiEvent) return;
    this._scheduleWrite();
  }

  /* ---------------------------------------------------------------- */
  /* 点击积木执行                                                      */
  /* ---------------------------------------------------------------- */
  /**
   * 自己判「点击」而不是用 Blockly 的 CLICK 事件。
   * 原因：那个事件依赖 Blockly 的手势栈，只对特定来源的指针事件有反应，
   * 自动化测试里用合成事件点它完全不触发，等于这条功能没法验证。
   * 自己按「同一块积木 + 几乎没移动」判定，行为可预期、可测。
   */
  _installClickToRun() {
    const host = this.host;
    const blockIdAt = (target) => {
      const g = target && target.closest ? target.closest('.blocklyDraggable') : null;
      return g ? g.getAttribute('data-id') : null;
    };
    /**
     * 指针对是不是落在「可编辑字段」上（下拉 / 数字输入 / 文本输入）——只有那种才该让路。
     *
     * 这里踩过坑，把 scratch-blocks 2.1.27 实测出来的真实结构记一下：
     *   <g class="blocklyField blocklyDropdownField blocklyEditableField">
     *     <rect class="blocklyFieldRect blocklyDropdownRect"/>          ← 真正能点的区域
     *     <text class="blocklyText blocklyFieldText blocklyDropdownText">自己</text>
     *   <g class="blocklyLabelField"><text class="blocklyText blocklyFieldText">让</text></g>
     * 两个反面教材：
     *   · `.blocklyEditableText` 在这个版本里**压根不存在**（那是别的 Blockly 分支的叫法），
     *     拿它做判断等于永远不匹配；
     *   · `.blocklyFieldText` 连纯标签（「让」「说」「秒」）都有，拿它判「点在字段上」
     *     会把整块积木的绝大部分面积都算成字段交互 —— 于是点圆形 / 六边形积木
     *     「有时有反应、有时没反应」，全看那一下落在文字上还是落在积木边角上。
     * 所以判据只看「可编辑字段的那个 rect / 输入框」，标签一律让路（原版行为：
     * 点圆形积木上的文字就是取值）。
     */
    const isFieldAt = (target) => {
      if (!target || !target.closest) return false;
      return !!target.closest('.blocklyEditableField, .blocklyFieldRect, .blocklyHtmlInput, .blocklyDropDownDiv');
    };

    host.addEventListener('pointerdown', (e) => {
      // 原版（scratch-gui）就是在这块区域上挂 pointerdown 收气泡：
      // 点任何地方都先把上一个值气泡收掉，然后 pointerup 再决定要不要弹新的
      this.hideValueBox();
      if (e.button !== 0) { this._press = null; return; }
      this._press = {
        x: e.clientX, y: e.clientY,
        id: blockIdAt(e.target),
        field: isFieldAt(e.target),
      };
    }, true);

    host.addEventListener('pointerup', (e) => {
      const press = this._press;
      this._press = null;
      if (!press || e.button !== 0 || press.field || !press.id) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) return;   // 拖拽
      if (blockIdAt(e.target) !== press.id) return;
      if (this.ws.isDragging && this.ws.isDragging()) return;
      this._runClickedBlock(press.id);
    }, false);
  }

  _runClickedBlock(blockId) {
    const block = this._findBlock(blockId);
    if (!block || block.disposed) return;
    const ent = this.store.entityById(this.currentEntityId);
    if (!ent || !this.rt) return;

    /* ---- 圆形 / 六边形：交给 scratch-blocks 官方的取值气泡 ----
     * 原版（Scratch 编辑器）就是这么做的：`Blockly.reportValue()` 把内容塞进
     * DropDownDiv 里的 `.valueReportBox`，再用 `showPositionedByBlock()` 贴着积木定位。
     * 自己画 div 的话，位置、箭头方向、贴边翻转、配色、长文本换行都得重新实现一遍，
     * 而且怎么调都不像 —— 用官方这套就天然一致。
     * 选择区（飞出面板）里的圆形积木也照样出值，这也是原版行为。
     */
    if (block.outputConnection) {
      this._reportValue(block, ent);
      return;
    }

    /* ---- 语句块：和 Scratch 一样，从这一栈的最顶上那块开始跑 ---- */
    // 选择区里的语句块只是「待拖的模板」，点了不执行
    if (block.isInFlyout) return;
    const top = block.getRootBlock();
    if (top.isInFlyout) return;
    const project = this.store.project;
    let hat = null;
    let body = null;
    try {
      const el = Blockly.Xml.blockToDom(top);
      if (HAT_TYPES.has(top.type)) {
        hat = xmlToNode(el, project);
        body = xmlToSeq(Array.from(el.children).find((c) => c.tagName === 'next'), project);
      } else {
        body = xmlToSeq(wrapChain(el), project);
      }
    } catch (err) {
      console.error(t('[积木] 读取要执行的脚本失败'), err);
      return;
    }
    if (!body || !body.blocks.length) return;

    // 引擎的脚本是帧循环驱动的：「等待」和「一直重复」都需要循环活着才成立，
    // 所以没在跑的时候先按一次「运行」（＝绿旗）再执行这段。
    if (!this.rt.isRunning()) {
      if (this.opts.onAutoRun) this.opts.onAutoRun();
      toast(t('已自动开始运行 —— 点积木就是立刻执行它'), 'info', 2800);
    }
    const r = this.rt.runStack(ent.name, hat, body);
    if (!r.ok) toast(t('没能执行：') + r.reason, 'warn');
  }

  /** 找积木：先主工作区，再退到选择区的飞出面板（它是另一个 workspace） */
  _findBlock(id) {
    const main = this.ws.getBlockById(id);
    if (main) return main;
    const fly = this.ws.getFlyout && this.ws.getFlyout();
    const fws = fly && fly.getWorkspace ? fly.getWorkspace() : null;
    return fws && fws.getBlockById ? fws.getBlockById(id) : null;
  }

  /**
   * 算出这块积木当前的值并弹官方气泡。
   * 值统一走运行时的 `toStr`（数字去掉浮点噪声、布尔输出 true/false），
   * 和 say / 连接 这些积木的取值口径一致 —— 也就是原版的口径。
   * 求值失败时把错误显示在气泡里，不打断点击。
   */
  _reportValue(block, ent) {
    let text;
    try {
      const node = xmlToNode(Blockly.Xml.blockToDom(block), this.store.project);
      text = this.rt.toStr(this.rt.evalManual(node, ent ? ent.name : undefined));
    } catch (err) {
      text = '⚠ ' + ((err && err.message) || err);
    }

    // 先收掉上一个气泡再来。
    // Blockly 的 DropDownDiv 占用的是一个**全局独占**的「临时焦点」，
    // 上一个气泡没归还就再弹会直接抛错 —— 界面上看着没事，只在控制台留一行，
    // 属于「不报也不知道，报了又难查」的那种。所以每次弹之前先自己收干净。
    this.hideValueBox();
    try {
      Blockly.reportValue(block.id, text);
    } catch (err) {
      // 兜底：清掉可能已经塞进内容区的东西再试一次，避免叠出两个值
      try {
        const content = Blockly.DropDownDiv && Blockly.DropDownDiv.getContentDiv
          ? Blockly.DropDownDiv.getContentDiv() : null;
        if (content) content.textContent = '';
        this.hideValueBox();
        Blockly.reportValue(block.id, text);
      } catch (err2) {
        console.warn(t('[积木] 取值气泡失败'), err2);
      }
    }
    return text;
  }

  /** 收起取值气泡（原版行为：点工作区任何地方都会先收掉） */
  hideValueBox() {
    const dd = Blockly.DropDownDiv;
    if (!dd) return;
    // 这里刻意**不用 isVisible() 做前置判断**：它的「可见」状态和「临时焦点有没有归还」
    // 不是一回事，只顾可见性就可能漏掉一次释放。hideWithoutAnimation 自己是幂等的。
    try {
      (dd.hideWithoutAnimation || dd.hide).call(dd);
    } catch { /* ignore */ }
  }

  _scheduleWrite() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this._writeBack();
    });
  }

  _writeBack() {
    const ent = this.store.entityById(this.currentEntityId);
    if (!ent) return;
    const { scripts, scriptPos } = this.collectScripts();
    const same = JSON.stringify({ s: ent.scripts, p: ent.scriptPos }) === JSON.stringify({ s: scripts, p: scriptPos });
    if (same) return;

    ent.scripts = scripts;
    ent.scriptPos = scriptPos;
    this._lastSignature = this._signature(ent);
    this.store.commit(t('编辑积木'), null, { reason: 'blocks-ui' });
    // 撤销统一由 store 负责：Blockly 自己的栈留着只会和 Ctrl+Z 打架
    try { this.ws.clearUndo(); } catch { /* ignore */ }
    if (this.opts.onChange) this.opts.onChange();
  }

  /** 从当前工作区读出脚本 IR（纯读取，不改任何状态） */
  collectScripts() {
    const project = this.store.project;
    const scripts = [];
    const scriptPos = {};
    for (const b of this.ws.getTopBlocks(true)) {
      let id = b.__tlScriptId;
      if (!id) { id = uid('script'); b.__tlScriptId = id; }
      let el;
      try { el = Blockly.Xml.blockToDom(b); } catch { continue; }
      const pos = b.getRelativeToSurfaceXY();
      scriptPos[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };

      if (HAT_TYPES.has(b.type)) {
        const hat = xmlToNode(el, project);
        const nextHolder = Array.from(el.children).find((c) => c.tagName === 'next');
        scripts.push({ id, hat, body: xmlToSeq(nextHolder, project) });
      } else {
        // 选择区里也允许拖出「没有帽块」的裸语句：自动包一层「当 ▶ 被点击」，
        // 否则运行时收不到任何订阅，脚本会静默不执行。
        const body = xmlToSeq(wrapChain(el), project);
        if (body.blocks.length) scripts.push({ id, hat: { type: 'OnStart' }, body });
      }
    }
    return { scripts, scriptPos };
  }

  /**
   * 往返自检：把当前实体的 IR 投影成积木、再读回来，比对是否一致。
   * 这是防「字段静默丢失」的那道闸 —— 类型对但字段是 undefined 的话，
   * 肉眼看不出来，只有比对能抓到。
   * @returns {{ok:boolean, diffs:Array, checked:number}}
   */
  roundTrip(entityId) {
    const ids = entityId ? [entityId] : this.store.project.entities.map((e) => e.id);
    const diffs = [];
    let checked = 0;
    for (const id of ids) {
      const ent = this.store.entityById(id);
      if (!ent) continue;
      const before = JSON.parse(JSON.stringify(ent.scripts || []));
      this._loadEntity(ent);
      const { scripts: after } = this.collectScripts();
      checked++;
      const a = JSON.stringify(stripUnstable(before));
      const b = JSON.stringify(stripUnstable(after));
      if (a !== b) diffs.push({ entity: ent.name, before: before, after: after });
    }
    // 复原当前选中的实体
    this._loadEntity(this.store.entityById(this.currentEntityId));
    this._lastSignature = this._signature(this.store.entityById(this.currentEntityId) || {});
    return { ok: diffs.length === 0, diffs, checked };
  }

  /* ---------------------------------------------------------------- */
  /* 合成积木：接到 Blockly 的右键菜单上                                 */
  /* ---------------------------------------------------------------- */
  _installContextMenu() {
    const registry = Blockly.ContextMenuRegistry && Blockly.ContextMenuRegistry.registry;
    if (!registry || this._menuInstalled) return;
    this._menuInstalled = true;
    const BLOCK = Blockly.ContextMenuRegistry.ScopeType.BLOCK;

    registry.register({
      id: 'df_make_macro',
      scopeType: BLOCK,
      displayText: () => t('合成新积木…'),
      // 帽块没有「上一块」，被替换掉会连事件入口一起丢，所以不给这个选项
      preconditionFn: (scope) => (scope.block.previousConnection ? 'enabled' : 'disabled'),
      weight: 10,
      callback: (scope) => this.openMacroDialogFor(scope.block),
    });

    registry.register({
      id: 'df_edit_macro',
      scopeType: BLOCK,
      displayText: () => t('编辑积木定义…'),
      preconditionFn: (scope) => {
        const id = macroIdOfType(scope.block.type);
        return id && this.store.project.macros[id] ? 'enabled' : 'hidden';
      },
      weight: 11,
      callback: (scope) => {
        const id = macroIdOfType(scope.block.type);
        if (id) this.editMacro(id);
      },
    });
  }

  /** 某个 Blockly 积木及其下方同层积木，读成 IR 序列 */
  tailSequenceOf(block) {
    let el;
    try { el = Blockly.Xml.blockToDom(block); } catch { return { type: 'BlockSequence', blocks: [] }; }
    return xmlToSeq(wrapChain(el), this.store.project);
  }

  openMacroDialogFor(block) {
    const irNode = xmlToNode(Blockly.Xml.blockToDom(block), this.store.project);
    openMacroDialog({
      store: this.store,
      source: {
        node: irNode,
        tailSeq: this.tailSequenceOf(block),
        onCommit: (macro) => this.replaceWithMacro(block, macro),
      },
      onChange: () => { if (this.opts.onChange) this.opts.onChange(); },
    });
  }

  /** 编辑已有的合成积木定义（方法名刻意不叫 openMacroDialog，别和导入的同名） */
  editMacro(macroId) {
    openMacroDialog({
      store: this.store,
      macroId,
      onChange: () => {
        this.registerMacros();
        this.refreshToolbox(true);
        this.refresh(true);
        if (this.opts.onChange) this.opts.onChange();
      },
    });
  }

  /**
   * 把选中的积木原地换成对新积木的调用。
   * 用 Blockly 自己的连接模型做插入 —— 比自己找 IR 数组下标可靠得多。
   */
  replaceWithMacro(block, macro) {
    this.registerMacros();
    const project = this.store.project;
    const isExpr = !!block.outputConnection;
    const callNode = {
      type: isExpr ? 'MacroCall' : 'MacroCallStatement',
      macroId: macro.id,
      args: (macro.params || []).map(() => ({ type: 'Number', value: 1 })),
    };
    const dom = Blockly.utils.xml.textToDom(nodeToXml(callNode, project));
    const group = Blockly.utils.idGenerator ? Blockly.utils.idGenerator.genUid() : `g${Date.now()}`;
    Blockly.Events.setGroup(group);
    let nb = null;
    try {
      nb = Blockly.Xml.domToBlock(dom, this.ws);
      if (isExpr) {
        const target = block.outputConnection.targetConnection;
        if (target) target.disconnect();
        block.dispose(false);
        if (target) target.connect(nb.outputConnection);
        else nb.moveBy(block.getRelativeToSurfaceXY().x + 40, block.getRelativeToSurfaceXY().y);
      } else {
        const prev = block.previousConnection && block.previousConnection.targetConnection;
        const next = block.nextConnection && block.nextConnection.targetConnection;
        if (prev) prev.disconnect();
        if (next) next.disconnect();
        block.dispose(false);
        if (prev) prev.connect(nb.previousConnection);
        if (next) nb.nextConnection.connect(next);
      }
    } catch (err) {
      console.error(t('[积木] 替换为合成积木失败'), err);
    } finally {
      Blockly.Events.setGroup(false);
    }
    this.refreshToolbox(true);
    this._scheduleWrite();
    if (this.opts.onChange) this.opts.onChange();
  }

  /** 从零新建一个积木（选择区里那个「＋ 新建积木」按钮走的路径） */
  createMacroIn(categoryId) {
    const cat = this.store.project.categories[categoryId];
    openMacroDialog({
      store: this.store,
      source: {
        fromScratch: true,
        category: categoryId,
        onCommit: (macro) => {
          this.registerMacros();
          this.refreshToolbox(true);
          // 顺手把新积木放到画布上，用户立刻能看见它长什么样
          this._dropMacroCall(macro);
          // 立刻写回 IR。只靠 rAF 的话，紧接着的 afterChange 有可能先跑，
          // 把刚放上去、还没写回 IR 的积木一起清掉。
          this._writeBack();
          if (this.opts.onChange) this.opts.onChange();
        },
      },
      // 注意：这里**不能** refresh(true)。那是「从 IR 重建工作区」，
      // 会把用户刚放上去的新积木抹掉。
      onChange: () => {
        this.registerMacros();
        this.refreshToolbox(true);
        if (this.opts.onChange) this.opts.onChange();
      },
    });
    if (cat) toast(t('新积木会归到「{_1}」', { _1: cat.name }), 'info', 2600);
  }

  /** 把一块新积木的调用摆到画布右下角（找一块空位） */
  _dropMacroCall(macro) {
    const isExpr = macro.kind === 'expression';
    const node = {
      type: isExpr ? 'MacroCall' : 'MacroCallStatement',
      macroId: macro.id,
      args: (macro.params || []).map(() => ({ type: 'Number', value: 1 })),
    };
    try {
      const dom = Blockly.utils.xml.textToDom(nodeToXml(node, this.store.project));
      const nb = Blockly.Xml.domToBlock(dom, this.ws);
      const metrics = this.ws.getMetrics();
      const xy = this.ws.getTopBlocks(true).reduce((acc, b) => {
        const p = b.getRelativeToSurfaceXY();
        return { x: Math.max(acc.x, p.x), y: Math.max(acc.y, p.y + b.height) };
      }, { x: 40, y: 40 });
      nb.moveBy(xy.x + 24, xy.y + 24);
      this._scheduleWrite();
    } catch (err) {
      console.error(t('[积木] 放置新积木失败'), err);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 选择区                                                            */
  /* ---------------------------------------------------------------- */
  refreshToolbox(force = false) {
    this._syncContext();
    const xml = buildToolboxXml(this.store.project);
    if (!force && xml === this._lastToolboxXml) return;
    this._lastToolboxXml = xml;
    // 新建的分类要能取到颜色：主题得跟着项目的分类一起重建，
    // 否则自建分类的积木 setStyle 会拿不到 style 而抛 Invalid colour。
    //   就算是重刷选择区，主题也要带上当前编辑区表面色，否则会退回 Scratch 原生浅色
    try { this.ws.setTheme(this._buildTheme()); } catch { /* ignore */ }
    this._wireToolboxButtons();
    try {
      this.ws.updateToolbox(buildToolboxJson(this.store.project));
      // scratch-blocks 用的是「连续工具箱」：所有分类共用一个飞出面板。
      // 它把 refreshSelection() 覆写成了空操作（"Scratch manually manages
      // refreshing the toolbox via forceRerender()"），所以 updateToolbox 之后
      // 面板内容并不会自己更新 —— 不显式 forceRerender 的话，
      // 新建的分类/积木在面板里根本不会出现。
      const tb = this.ws.getToolbox && this.ws.getToolbox();
      if (tb && typeof tb.forceRerender === 'function') tb.forceRerender();
    } catch (err) {
      console.error(t('[积木] 刷新选择区失败'), err);
    }
  }

  /** 「＋ 新建积木」按钮的回调：按分类 id 一条一条注册（Blockly 按 key 覆盖，不会堆积） */
  _wireToolboxButtons() {
    for (const catId of buttonCategoryIds(this.store.project)) {
      try {
        this.ws.registerButtonCallback(`df_new_macro_${catId}`, () => this.createMacroIn(catId));
      } catch { /* 工作区没就绪时忽略 */ }
    }
  }

  /** 新建 / 改过的宏需要（重新）注册成积木类型，然后才能进选择区 */
  registerMacros() {
    const macros = this.store.project.macros || {};
    const changed = Object.values(macros).filter((m) => this._macroSignatures.get(m.id) !== macroSignature(m));
    if (!changed.length) return false;
    defineMacroBlocks(macros, changed.map((m) => m.id));
    for (const m of changed) this._macroSignatures.set(m.id, macroSignature(m));
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* 自检 / 视角辅助                                                   */
  /* ---------------------------------------------------------------- */
  stats() {
    const xmlText = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(this.ws));
    return {
      topBlocks: this.ws.getTopBlocks(false).map((b) => b.type),
      hats: countHats(xmlText),
      flyout: this._flyoutCount(),
    };
  }

  _flyoutCount() {
    const f = this.ws.getFlyout && this.ws.getFlyout();
    return f && f.getWorkspace ? f.getWorkspace().getAllBlocks(false).length : 0;
  }

  /** 把某个分类的选择区打开（截图 / 自检用） */
  showCategory(id) {
    try { this.ws.getToolbox().setSelectedItem(this.ws.getToolbox().getToolboxItemById(id)); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */
const PHASE_LABEL = (name) => opt(name, {
  frame_start: '帧开始', input: '输入', physics_update: '物理更新',
  update: '每帧更新', late_update: '延迟更新', render: '渲染', frame_end: '帧结束',
}[name] || name, 'phase');

const SOUNDS = [
  { label: opt('beep', '哔', 'sound'), value: 'beep' },
  { label: opt('jump', '跳跃', 'sound'), value: 'jump' },
  { label: opt('coin', '金币', 'sound'), value: 'coin' },
  { label: opt('hurt', '受伤', 'sound'), value: 'hurt' },
  { label: opt('boom', '爆炸', 'sound'), value: 'boom' },
];

/** 把 <block> 包一层临时容器，好让链式解析器把它当作栈头读 */
function wrapChain(el) {
  const doc = el.ownerDocument;
  const holder = doc.createElement('dfholder');
  holder.appendChild(el.cloneNode(true));
  return holder;
}

/** 宏的「形状签名」：参数或种类变了就得重新注册积木类型 */
function macroSignature(m) {
  return `${m.name}|${m.kind}|${m.category}|${(m.params || []).map((p) => p.name).join(',')}`;
}

/** 从 df_macro_xxx 还原宏 id */
const macroIdOfType = (type) => (type && type.startsWith('df_macro_')) ? type.slice('df_macro_'.length) : null;

/** 往返比对时把不参与语义的字段剔掉（脚本 id 与摆放位置） */
function stripUnstable(scripts) {
  return (scripts || []).map((s) => ({ hat: s.hat, body: s.body }));
}
