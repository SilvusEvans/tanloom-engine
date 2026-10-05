/**
 * Tanloom Engine — 独立运行窗口
 * ================================================================
 * 只做一件事：把项目跑起来画在一个窗口里。
 *
 * · 跨进程没法共享「运行中的状态」，所以这里跑的是**另一份 Runtime**，
 *   项目数据由主进程转交（编辑器改了会推过来，改完即热重载）。
 * · 画家和编辑器复用同一个 `StageView`，只是关掉了网格 / 边框 / 变量监视 / 「未运行」角标。
 * · 键盘直接接进运行时（和编辑器同一个输入层），所以窗口开着就能玩。
 */

import { Runtime, attachDefs } from './runtime/vm.js';
import * as blockdefs from './core/blockdefs.js';
import { StageView } from './scene/viewport.js';
import { attachKeyboardInput, preventButtonFocus, blurFocus } from './input/keys.js';

attachDefs(blockdefs);

const $ = (id) => document.getElementById(id);
const canvas = $('player-canvas');

let project = null;
let rt = null;
let stage = null;
let paused = false;
let frameCount = 0;
let lastFpsTs = performance.now();

// StageView 只用到 store.project（舞台尺寸 / 背景 / 网格），给个最小壳即可
const store = { project: null };

/* ------------------------------------------------------------------ */
/* 运行                                                                */
/* ------------------------------------------------------------------ */
function ensureRuntime(nextProject) {
  const wasRunning = rt ? rt.isRunning() : true;   // 首次进来就是要跑
  if (rt) {
    try { rt.stop(); } catch { /* ignore */ }
  }
  project = nextProject;
  store.project = project;
  rt = new Runtime(project, {
    onLog: (entry) => { if (entry && entry.level === 'error') showHint('⚠ ' + entry.msg, 6000); },
  });
  window.__tl = { rt, store, project };

  if (!stage) {
    stage = new StageView(canvas, store, () => rt, { showChrome: false, showMonitors: false });
    stage.onPick = () => {};
  }
  // 舞台尺寸可能变了（项目设置里能改），重新算比例
  stage.resize();

  try { rt.load(project); } catch (err) {
    showHint('⚠ 项目加载失败：' + (err && err.message), 8000);
    console.error(err);
    return;
  }
  paused = false;
  updatePauseButton();
  if (wasRunning) rt.start();

  const name = (project && project.name) || 'Tanloom Engine';
  $('player-name').textContent = name;
  document.title = name + ' · 运行';
}

/* ------------------------------------------------------------------ */
/* 绘制                                                                */
/* ------------------------------------------------------------------ */
function draw() {
  if (stage && rt) {
    stage.resize();
    stage.draw();
  }
  const now = performance.now();
  if (now - lastFpsTs > 500 && rt) {
    const fps = Math.round((rt.frame - frameCount) / ((now - lastFpsTs) / 1000)) || 0;
    frameCount = rt.frame;
    lastFpsTs = now;
    $('player-fps').textContent = `${fps} fps`;
    $('player-frame').textContent = `帧 ${rt.frame}`;
  }
  requestAnimationFrame(draw);
}

/** 底部提示：亮几秒后淡出，别一直挡着画面 */
let hintTimer = 0;
function showHint(text, ms = 4000) {
  const el = $('player-hint');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('out');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.add('out'), ms);
}

function updatePauseButton() {
  const b = $('btn-player-pause');
  if (b) b.textContent = paused ? '▶ 继续' : '⏸ 暂停';
}

/* ------------------------------------------------------------------ */
/* 工具条                                                              */
/* ------------------------------------------------------------------ */
$('btn-player-restart').addEventListener('click', () => {
  ensureRuntime(project);
  showHint('已从头重新运行');
  blurFocus();
});
$('btn-player-pause').addEventListener('click', () => {
  if (!rt) return;
  if (paused) { rt.resume(); paused = false; } else { rt.pause(); paused = true; }
  updatePauseButton();
  blurFocus();
});
$('btn-player-fullscreen').addEventListener('click', async () => {
  if (window.tanloom && window.tanloom.setFullScreen) {
    const now = await window.tanloom.isFullScreen();
    const on = await window.tanloom.setFullScreen(!now);
    syncFullscreenButton(on);
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  blurFocus();
});
$('btn-player-close').addEventListener('click', () => {
  if (window.tanloom && window.tanloom.closePlayer) window.tanloom.closePlayer();
  else window.close();
});
function syncFullscreenButton(on) {
  const b = $('btn-player-fullscreen');
  if (b) b.textContent = on ? '⤡ 退出全屏' : '⛶ 全屏';
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  preventButtonFocus(document);

  // Esc 退出全屏（窗口全屏不像 HTML5 全屏那样自带 Esc 处理）
  attachKeyboardInput(rtProxy(), {
    onEscape: async () => {
      if (window.tanloom && window.tanloom.isFullScreen) {
        if (await window.tanloom.isFullScreen()) {
          const on = await window.tanloom.setFullScreen(false);
          syncFullscreenButton(on);
        }
      }
    },
  });

  if (window.tanloom && window.tanloom.isFullScreen) {
    window.tanloom.isFullScreen().then(syncFullscreenButton).catch(() => {});
    window.addEventListener('resize', () => {
      window.tanloom.isFullScreen().then(syncFullscreenButton).catch(() => {});
    });
  }

  // 编辑器改完项目 → 热重载（保持运行）
  if (window.tanloom && window.tanloom.onPlayerProject) {
    window.tanloom.onPlayerProject((text) => {
      try {
        ensureRuntime(JSON.parse(text));
        showHint('已热重载项目');
      } catch (err) {
        showHint('⚠ 热重载失败：' + (err && err.message), 6000);
      }
    });
  }

  // 取初始项目
  if (window.tanloom && window.tanloom.playerGetProject) {
    window.tanloom.playerGetProject().then((text) => {
      if (text) {
        try { ensureRuntime(JSON.parse(text)); } catch (err) {
          showHint('⚠ 项目加载失败：' + (err && err.message), 8000);
          console.error(err);
        }
      } else {
        showHint('等待编辑器发送项目…', 600000);
      }
      requestAnimationFrame(draw);
    }).catch((err) => {
      showHint('⚠ 取项目失败：' + (err && err.message), 8000);
      requestAnimationFrame(draw);
    });
  } else {
    requestAnimationFrame(draw);
  }
}

/**
 * 键盘输入层要的是「一个能 setKey 的对象」，而 Runtime 是加载项目时才建出来的。
 * 给个转发壳：真实实例就绪后自动接上，没就绪时按键丢掉即可。
 */
function rtProxy() {
  return {
    setKey(code, down) { if (rt) rt.setKey(code, down); },
    clearKeys() { if (rt) rt.clearKeys(); },
    get input() { return rt ? rt.input : { keys: new Set(), pressed: new Set() }; },
  };
}

boot();
