/**
 * Tanloom Engine — 应用装配
 * ================================================================
 * 把 IR（唯一真源）、运行时、三个视图（积木 / 代码 / 场景）拼在一起。
 * 任何一处修改都只改 IR，然后由 store 广播变更，各视图重新投影。
 */

import { t, helpHtml, localizeDom, lang, setLang, LANGS } from './core/i18n.js';
import { Store } from './core/store.js';
import { createTemplateProject } from './core/template.js';
import { Runtime, attachDefs } from './runtime/vm.js';
import * as blockdefs from './core/blockdefs.js';
import { ScratchWorkspace } from './blocks/scratch/workspace.js';
import * as scratchDefs from './blocks/scratch/defs.js';
import * as scratchSync from './blocks/scratch/sync.js';
import * as Blockly from './vendor/scratch-blocks.js';
import { StageView } from './scene/viewport.js';
import { CodeEditor } from './code/editor.js';
import { renderBroadcast, renderSubscribers, renderVars, renderPerf, renderConsole, renderHierarchy, renderInspector, renderAssets } from './ui/panels.js';
import { openCategoryDialog } from './ui/macro-dialog.js';
import { showModal, toast, hint, showInlineInput } from './ui/dialogs.js';
import { Appearance, openSettingsDialog } from './ui/appearance.js';
import { installMotion, playAxisY, setMotion, motionEnabled } from './ui/motion.js';
import { generateFiles } from './core/codegen.js';
import { attachKeyboardInput, preventButtonFocus, blurFocus, isTyping, isModalOpen } from './input/keys.js';

attachDefs(blockdefs);

/* 外观（主题色 / 字体）：在这里就应用，而不是等 boot()。
   这时样式表已经加载完，早于任何一帧绘制，所以不会先闪一下默认皮肤再变。 */
const appearance = new Appearance();

/* ================================================================== */
/* 状态                                                                */
/* ================================================================== */
const store = new Store(createTemplateProject());
const $ = (id) => document.getElementById(id);

const rt = new Runtime(store.project, {
  afterFrame: () => { /* 由下面的 draw 循环统一绘制 */ }
});
try { rt.load(store.project); } catch (e) { window.__bootErr = String(e && e.stack || e); console.error(t('rt.load 失败'), e); }

let stageView = null;
let stageViewBig = null;
let stageViewFs = null;
let ws = null;
let editor = null;
let currentView = 'blocks';
let dockPanel = 'broadcast';
let lastFpsTs = performance.now();
let fps = 0;
let savePath = null;
let fullscreen = false;

/* ================================================================== */
/* 视图切换                                                            */
/* ================================================================== */
function switchView(name) {
  currentView = name;
  document.querySelectorAll('#mode-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  for (const v of ['blocks', 'code', 'scene', 'assets']) {
    $('view-' + v).classList.toggle('hidden', v !== name);
  }
  if (name === 'code') editor.render();
  if (name === 'scene' || name === 'blocks') { renderHierarchy($('hierarchy'), store, rt, selectEntity); }
  if (name === 'scene') { renderHierarchy($('scene-hierarchy'), store, rt, selectEntity); renderInspector($('scene-inspector'), store, afterChange); }
  if (name === 'assets') renderAssets($('view-assets'), store, rt);
  requestAnimationFrame(draw);
}

document.querySelectorAll('#mode-tabs button').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

/* ================================================================== */
/* 实体选择                                                            */
/* ================================================================== */
function fillEntitySelect() {
  const sel = $('entity-select');
  sel.innerHTML = '';
  for (const e of store.project.entities) {
    if (e.kind === 'group') continue;
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = `${e.kind === 'stage' ? '🎬 ' : '◆ '}${e.name}`;
    sel.appendChild(o);
  }
  if (store.selectedEntityId) sel.value = store.selectedEntityId;
}

function selectEntity(id) {
  if (!id) return;
  store.selectedEntityId = id;
  const ent = store.entityById(id);
  if (ws && ent) {
    if (id === ws.currentEntityId) ws.refresh(true);
    else ws.showEntity(id);
  }
  fillEntitySelect();
  renderHierarchy($('hierarchy'), store, rt, selectEntity);
  if (currentView === 'scene') { renderHierarchy($('scene-hierarchy'), store, rt, selectEntity); renderInspector($('scene-inspector'), store, afterChange); }
  renderInspector($('inspector'), store, afterChange);
}

$('entity-select').addEventListener('change', (e) => {
  const ent = store.entityById(e.target.value);
  if (!ent) return;
  selectEntity(e.target.value);
  if (ent.kind === 'stage' && currentView === 'blocks') toast(t('这是舞台：它的脚本负责全局逻辑与 HUD'), 'info');
});

function newEntity() {
  const ent = store.addEntity({
    name: '新实体', x: 0, y: 40, render: { shape: 'capsule', color: '#59C059', stroke: '#389438', width: 40, height: 40 }
  });
  selectEntity(ent.id);
  toast(t('已新建「{_1}」', { _1: ent.name }), 'ok');
}
$('btn-add-entity').addEventListener('click', newEntity);
$('btn-add-entity2').addEventListener('click', newEntity);

/* ================================================================== */
/* 变更后的统一刷新                                                     */
/* ================================================================== */
let changeQueued = false;
function afterChange() {
  if (changeQueued) return;
  changeQueued = true;
  requestAnimationFrame(() => {
    changeQueued = false;
    rt.syncProject(store.project);
    if (ws) { ws.registerMacros(); ws.refreshToolbox(); ws.refresh(); }
    if (currentView === 'code') editor.onBlocksChanged();
    else editor.onBlocksChanged();
    renderInspector($('inspector'), store, afterChange);
    if (currentView === 'scene') renderInspector($('scene-inspector'), store, afterChange);
    if (currentView === 'assets') renderAssets($('view-assets'), store, rt);
    renderHierarchy($('hierarchy'), store, rt, selectEntity);
    updateUndoButtons();
    $('stage-scene').textContent = store.project.scene ? store.project.scene.sceneName : '';
    // 运行窗口开着就把改完的项目推过去（热重载）
    pushToPlayer();
  });
}

function updateUndoButtons() {
  $('btn-undo').disabled = !store.canUndo();
  $('btn-redo').disabled = !store.canRedo();
}

store.on('change', (p) => { if (p && p.reason !== 'live') afterChange(); else afterChange(); });
store.on('select', () => afterChange());

/* ================================================================== */
/* 舞台渲染循环                                                        */
/* ================================================================== */
function draw() {
  if (fullscreen && stageViewFs) {
    // 全屏时只画全屏那一张，编辑器里的画布先歇着（省一份绘制开销）
    stageViewFs.resize();
    stageViewFs.draw();
  } else if (currentView === 'blocks' || currentView === 'code' || currentView === 'assets') {
    stageView.resize();
    stageView.draw();
  } else if (currentView === 'scene') {
    stageViewBig.resize();
    stageViewBig.draw();
  }
  // FPS
  const now = performance.now();
  if (now - lastFpsTs > 500) {
    fps = Math.round(1000 / Math.max(1, (now - lastFpsTs) / Math.max(1, rt.frame - (draw._lf || 0))));
    fps = Math.round((rt.frame - (draw._lf || 0)) / ((now - lastFpsTs) / 1000)) || 0;
    draw._lf = rt.frame;
    lastFpsTs = now;
    $('stat-fps').textContent = `${fps} fps`;
    $('stat-frame').textContent = t('帧 {_1}', { _1: rt.frame });
    const ffs = $('fs-fps');
    if (ffs) {
      ffs.textContent = `${fps} fps`;
      $('fs-frame').textContent = t('帧 {_1}', { _1: rt.frame });
    }
  }
  // 停靠面板节流刷新
  if (now - (draw._dp || 0) > 160) {
    draw._dp = now;
    refreshDock();
  }
  setTimeout(draw, 33);
}

/* ================================================================== */
/* 全屏游玩                                                            */
/* ================================================================== */
/**
 * 全屏游玩 = 两层：
 *   1. 把编辑器整个盖住的舞台层（本函数负责）
 *   2. 让窗口真的占满屏幕，连标题栏一起去掉（交给主进程）
 * 进来时如果还没在运行，顺带按一次「运行」—— 全屏就是「开始玩」的意思。
 */
function toggleFullscreen(on) {
  const want = typeof on === 'boolean' ? on : !fullscreen;
  if (want === fullscreen) return fullscreen;
  fullscreen = want;

  const layer = $('fullscreen-layer');
  layer.classList.toggle('hidden', !want);

  if (want) {
    if (!rt.isRunning()) {
      try { rt.load(store.project); } catch (e) { console.error(t('rt.load 失败'), e); }
      rt.start();
      updateRunButtons();
    }
    // 让键盘立刻归游戏：焦点还留在「全屏」按钮上的话，空格会把它再点一次
    blurFocus();
    // 原生全屏（浏览器里打开时没有这层能力，忽略即可）
    if (window.tanloom && window.tanloom.setFullScreen) {
      window.tanloom.setFullScreen(true).then((v) => setNativeButton(v), () => {});
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    showFsHint(t('Esc / 「退出」返回编辑器'));
  } else {
    if (window.tanloom && window.tanloom.setFullScreen) {
      window.tanloom.setFullScreen(false).then(setNativeButton).catch(() => {});
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setNativeButton(false);
    blurFocus();
  }
  stageViewFs.resize();
  stageViewFs.draw();
  return fullscreen;
}

function setNativeButton(isNative) {
  const b = $('btn-fs-native');
  if (!b) return;
  b.classList.toggle('on', !!isNative);
  b.textContent = isNative ? t('⤡ 退出窗口全屏') : t('⛶ 窗口全屏');
}

/** 底部提示：亮几秒后淡出，别一直挡着画面 */
function showFsHint(text, ms = 4200) {
  const el = $('fs-hint');
  if (!el) return;
  el.innerHTML = text;
  el.classList.remove('out');
  clearTimeout(showFsHint._t);
  showFsHint._t = setTimeout(() => el.classList.add('out'), ms);
}

function refreshDock() {
  const body = $('dock-body');
  if (dockPanel === 'broadcast') renderBroadcast(body, store, rt);
  else if (dockPanel === 'subs') renderSubscribers(body, store, rt, (s) => {
    const ent = store.entityByName(s.entityName);
    if (ent) { selectEntity(ent.id); switchView('blocks'); }
  });
  else if (dockPanel === 'vars') renderVars(body, store, rt);
  else if (dockPanel === 'perf') renderPerf(body, store, rt);
  else if (dockPanel === 'console') renderConsole(body, rt);
}

/* ================================================================== */
/* 停靠坞                                                             */
/* ================================================================== */
document.querySelectorAll('#dock-tabs button[data-panel]').forEach((b) => {
  b.addEventListener('click', () => {
    dockPanel = b.dataset.panel;
    document.querySelectorAll('#dock-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    refreshDock();
  });
});
$('dock-toggle').addEventListener('click', () => {
  const d = document.querySelector('.dock');
  d.classList.toggle('collapsed');
  $('dock-toggle').textContent = d.classList.contains('collapsed') ? '▴' : '▾';
});

/* ================================================================== */
/* 运行控制                                                            */
/* ================================================================== */
function updateRunButtons() {
  // ▶ 的职责是「打开独立运行窗口」：窗口开着的时候，这一下的意思是关掉它。
  // ⏸ / ⏭ / ⏹ 管的还是编辑器里那份运行时（逐帧调试用的）。
  const b = $('btn-run');
  b.textContent = playerOpen ? t('⏹ 停止') : t('▶ 运行');
  b.classList.toggle('on', playerOpen);
}
/** 编辑器里启动。点积木执行时用它（脚本需要帧循环活着才跑得动） */
function startRun() {
  try { rt.load(store.project); } catch (e) { window.__bootErr = String(e && e.stack || e); console.error(t('rt.load 失败'), e); }
  rt.start();
  blurFocus();
  updateRunButtons();
}
$('btn-run').addEventListener('click', () => {
  // 运行默认是「在独立窗口里玩」；再点一下就是把它关掉
  if (playerOpen) closePlayerWindow();
  else openPlayerWindow();
});
$('btn-pause').addEventListener('click', () => {
  if (!rt.running) return;
  if (rt.paused) rt.resume(); else rt.pause();
});
$('btn-step').addEventListener('click', () => {
  if (!rt.running) { try { rt.load(store.project); } catch (e) { window.__bootErr = String(e && e.stack || e); console.error(t('rt.load 失败'), e); } rt.running = true; rt.paused = true; rt.start(); rt.pause(); }
  rt.stepOnce();
  updateRunButtons();
});
$('btn-stop').addEventListener('click', () => {
  rt.stop();
  // 停止＝全都停下：独立运行窗口也一起关掉
  if (playerOpen) closePlayerWindow();
  try { rt.load(store.project); } catch (e) { window.__bootErr = String(e && e.stack || e); console.error(t('rt.load 失败'), e); }
  updateRunButtons(); refreshDock();
});

/* ================================================================== */
/* 独立运行窗口                                                        */
/* ================================================================== */
let playerOpen = false;
let playerPushTimer = 0;

/** 把当前项目推给运行窗口（热重载） */
function pushToPlayer(delay = 380) {
  if (!playerOpen || !window.tanloom || !window.tanloom.updatePlayer) return;
  clearTimeout(playerPushTimer);
  playerPushTimer = setTimeout(() => {
    window.tanloom.updatePlayer({ text: store.toJSON() }).catch(() => {});
  }, delay);
}

async function openPlayerWindow() {
  if (!window.tanloom || !window.tanloom.openPlayer) {
    toast(t('当前环境不支持独立窗口（要用 Electron 打开）'), 'warn');
    return;
  }
  // 那边是另一份运行时。编辑器这边先停下，免得同一个项目跑出两份各自演化的状态。
  if (rt.isRunning()) { rt.stop(); updateRunButtons(); }
  const ok = await window.tanloom.openPlayer({
    text: store.toJSON(),
    name: store.project.name,
    stageWidth: store.project.settings.stageWidth,
    stageHeight: store.project.settings.stageHeight,
  }).catch(() => false);
  if (!ok) { toast(t('没能打开运行窗口'), 'warn'); return; }
  playerOpen = true;
  updateRunButtons();
  toast(t('已在独立窗口里运行 · 编辑器这边的预览已停下；改了积木那边会热重载'), 'ok', 4200);
}

/** 关掉运行窗口。这里乐观地先更新按钮，不等 IPC 回执 —— 点了就该立刻有反应 */
function closePlayerWindow() {
  if (window.tanloom && window.tanloom.closePlayer) window.tanloom.closePlayer().catch(() => {});
}

function markPlayerClosed() {
  playerOpen = false;
  updateRunButtons();
}

/* ================================================================== */
/* 全屏游玩                                                            */
/* 顶栏已经没有「全屏」按钮了 —— 运行默认走独立窗口，全屏归那边的窗口自己管。
   这一层还在（可以用 __tl.toggleFullscreen 进去），所以也别忘了退出时复位的入口。 */
/* ================================================================== */
$('btn-fs-exit').addEventListener('click', () => toggleFullscreen(false));
$('btn-fs-native').addEventListener('click', async () => {
  if (!window.tanloom || !window.tanloom.setFullScreen) {
    toast(t('当前环境不支持切换窗口全屏'), 'warn');
    return;
  }
  const now = await window.tanloom.isFullScreen();
  setNativeButton(await window.tanloom.setFullScreen(!now));
});
// 主进程那边被系统快捷键（F11 / Win+方向键）改掉时同步一下按钮状态
if (window.tanloom && window.tanloom.isFullScreen) {
  window.tanloom.isFullScreen().then(setNativeButton).catch(() => {});
  window.addEventListener('resize', () => {
    window.tanloom.isFullScreen().then(setNativeButton).catch(() => {});
  });
}

/* ================================================================== */
/* 撤销 / 保存 / 打开 / 导出                                            */
/* ================================================================== */
$('btn-undo').addEventListener('click', () => { store.undo(); if (ws) ws.refresh(true); });
$('btn-redo').addEventListener('click', () => { store.redo(); if (ws) ws.refresh(true); });

$('btn-save').addEventListener('click', saveProject);
$('btn-open').addEventListener('click', openProject);
$('btn-export').addEventListener('click', exportCode);

async function saveProject() {
  const text = store.toJSON();
  if (window.tanloom && window.tanloom.isElectron) {
    const r = await window.tanloom.saveProject({ filePath: savePath, text, suggestedName: store.project.name });
    if (r && r.path) { savePath = r.path; toast(t('已保存到 ') + r.path, 'ok'); }
  } else {
    download(`${store.project.name}.tle`, text);
    toast(t('已下载项目文件'), 'ok');
  }
}

async function openProject() {
  let text = null, path = null;
  if (window.tanloom && window.tanloom.isElectron) {
    const r = await window.tanloom.openProject();
    if (r) { text = r.text; path = r.path; }
  } else {
    text = await pickFile();
  }
  if (!text) return;
  try {
    store.loadFromJSON(text);
    savePath = path;
    if (ws) { ws.registerMacros(); ws.refreshToolbox(true); }
    try { rt.load(store.project); } catch (e) { window.__bootErr = String(e && e.stack || e); console.error(t('rt.load 失败'), e); }
    selectEntity(store.selectedEntityId);
    toast(t('项目已载入'), 'ok');
  } catch (e) {
    toast(t('项目文件解析失败：') + e.message, 'err', 5000);
  }
}

async function exportCode() {
  const files = generateFiles(store.project).filter((f) => !f.readonly);
  if (window.tanloom && window.tanloom.isElectron) {
    const r = await window.tanloom.exportCode({ suggestedName: store.project.name, files });
    if (r) toast(t('代码已导出到 ') + r.path, 'ok');
  } else {
    for (const f of files) download(f.name, f.text);
    toast(t('已下载 {_1} 个文件', { _1: files.length }), 'ok');
  }
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function pickFile() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.tle,.json';
    i.addEventListener('change', () => {
      const f = i.files[0];
      if (!f) return resolve(null);
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.readAsText(f);
    });
    i.click();
  });
}

/* ================================================================== */
/* 设置（外观：主题 / 重点色 / 字体 / 语言 / 代码区）                    */
/* ================================================================== */
/** 「设置」对话框：顶栏按钮和 Ctrl+, 都走这里 */
function openSettings() { openSettingsDialog(appearance); }

/* ================================================================== */
/* 帮助                                                                */
/* ================================================================== */
$('btn-help').addEventListener('click', () => {
  const body = document.createElement('div');
  body.innerHTML = helpHtml();
  showModal({ title: t('帮助 · Tanloom Engine'), body, okText: t('知道了'), cancelText: t('关闭') });
});

document.addEventListener('keydown', (e) => {
  // 在输入框里打字时完全不介入（含 Blockly 的字段编辑框、对话框里的输入）
  if (isTyping(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  // 已经没有顶栏全屏按钮了；Esc 归对话框自己处理
  if (e.key === 'Escape') return;
  if (e.key === 'F5') { e.preventDefault(); $('btn-run').click(); }
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); store.undo(); if (ws) ws.refresh(true); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); if (ws) ws.refresh(true); }
  else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); exportCode(); }
  else if (mod && e.key === ',') { e.preventDefault(); openSettings(); }
  else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (currentView === 'code' && editor.hasUnsaved()) editor.save();
    else saveProject();
  }
});

/* ================================================================== */
/* 上下文菜单（分类 / 频道 / 变量 的新建入口）                          */
/* ================================================================== */
$('btn-new-category').addEventListener('click', () => openCategoryDialog(store, () => {
  if (ws) ws.refreshToolbox(true);
  afterChange();
}));

$('view-assets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-add]');
  if (!b) return;
  const kind = b.dataset.add;
  const rect = b.getBoundingClientRect();
  if (kind === 'var') showInlineInput(rect, '分数', (v) => { store.addVariable(v, 0); }, { width: 130 });
  if (kind === 'list') showInlineInput(rect, '存档点', (v) => { store.addList(v); }, { width: 130 });
  if (kind === 'channel') showInlineInput(rect, '玩家受伤', (v) => { store.addChannel(v); }, { width: 150 });
  if (kind === 'category') openCategoryDialog(store, () => { if (ws) ws.refreshToolbox(true); afterChange(); });
});

/* ================================================================== */
/* 初始化                                                             */
/* ================================================================== */
function boot() {
  // 动效钩子：先把切停靠面板那一路挂上（只会监听 class 变化，不参与业务）
  installMotion();
  // HTML 里的静态文案（index.html 上标了 data-i18n 的那些）
  localizeDom();
  // 按钮点完不留焦点：点过「运行」之后按空格会把它再点一次（＝暂停），游戏就没法玩了
  preventButtonFocus(document);
  // 真实键盘 → 运行时的 input.keys。之前根本没有这条绑定，
  // 所以真机上按什么键都不会进到运行时（测试里是直接改 input.keys，看不出来）。
  attachKeyboardInput(rt, {
    onEscape: () => { if (fullscreen && !isModalOpen()) toggleFullscreen(false); },
  });

  ws = new ScratchWorkspace($('blockly-host'), store, {
    onChange: afterChange,
    rt,
    // 积木画布与代码编辑区共用一份「编辑区主题」：这里只给取值函数，
    // 主题换了由 appearance.onChange 推下来，两者永远同深同浅
    area: () => appearance.editTheme.ws,
    // 没在运行时点积木：先按一次「运行」再执行它（脚本是帧循环驱动的，
    // 「等待」「一直重复」都需要循环活着才成立）
    onAutoRun: startRun,
  });
  // 外观一变就把新表面色推进积木画布（换主题 / 换重点色 / 切深浅都会到这里），
  // 这一处是全捉 —— 不用在每个 setXxx 底下补一句
  appearance.onChange(() => { if (ws) ws.applyEditTheme(appearance.editTheme.ws); });
  stageView = new StageView($('stage-canvas'), store, () => rt);
  stageView.onPick = (id) => selectEntity(id);
  stageViewBig = new StageView($('stage-canvas-big'), store, () => rt);
  stageViewBig.onPick = (id) => selectEntity(id);
  // 全屏画布：不画网格 / 边框 / 变量监视 / 「未运行」角标，只留画面
  stageViewFs = new StageView($('fullscreen-canvas'), store, () => rt,
    { showChrome: false, showMonitors: false });
  stageViewFs.onPick = () => {};
  editor = new CodeEditor(store, {
    highlight: $('code-highlight'), input: $('code-input'),
    status: $('code-status'), banner: $('code-banner'), files: $('code-files')
  });

  $('btn-code-sync').addEventListener('click', () => editor.save());
  $('btn-code-revert').addEventListener('click', () => editor.revert());
  $('btn-ws-fit').addEventListener('click', () => ws.zoomToFit());
  $('btn-settings').addEventListener('click', openSettings);

  rt.log(t('Tanloom Engine 已就绪 · 点 ▶ 运行示例项目'), 'ok');
  fillEntitySelect();
  ws.showEntity(store.selectedEntityId);
  selectEntity(store.selectedEntityId);
  editor.render();
  switchView('blocks');
  refreshDock();
  updateUndoButtons();
  updateRunButtons();
  setNativeButton(false);
  requestAnimationFrame(draw);

  // 运行窗口的状态：关掉时把按钮的高亮还回来
  if (window.tanloom && window.tanloom.onPlayerClosed) {
    window.tanloom.onPlayerClosed(() => {
      if (!playerOpen) return;
      markPlayerClosed();
      toast(t('运行窗口已关闭'), 'info');
    });
  }
  if (window.tanloom && window.tanloom.playerStatus) {
    window.tanloom.playerStatus().then((open) => {
      if (open) { playerOpen = true; updateRunButtons(); }
    }).catch(() => {});
  }

  // 调试出口（开发者工具里可直接摸到内部状态）
  // blockdefs / scratchDefs / scratchSync 也挂出来：冒烟测试里的「每个积木都能
  // 渲染成真积木（不是 ⚠ 未识别）」要在真渲染器环境里跑，而这条链路
  // （IR 节点 → nodeToXml）在纯 Node 里 import 不了（scratch-blocks 走 tanloom:// 协议）。
  window.__tl = {
    store, rt, ws, editor, stageView, stageViewBig, stageViewFs, appearance,
    blockdefs, scratchDefs, scratchSync,
    generateFiles, Blockly, toggleFullscreen, openPlayerWindow, closePlayerWindow,
    // 编辑器里那份运行时的启动入口：点积木执行、单步调试走这条路
    // （顶栏 ▶ 已经是「开独立窗口」了）
    startRun, openSettings,
    i18n: { lang, setLang, LANGS, t },
    openAppearanceDialog: () => openSettings(),
    // 动效：installMotion 已经跑过了（见 boot 里那一行）；这里把手柄留给探针，
    // 方便单独验证「关掉动画后确实不动」
    motion: { installMotion, playAxisY, setMotion, enabled: motionEnabled },
    get playerOpen() { return playerOpen; },
    get fullscreen() { return fullscreen; },
  };

  // 示例提示
  setTimeout(() => toast(t('示例项目已载入：按 ▶ 或 F5 会开一个窗口来玩；也可以直接点积木执行它'), 'info', 5200), 500);
}

boot();
