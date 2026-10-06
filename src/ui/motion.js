/**
 * Tanloom Engine — 动效控制器
 * ================================================================
 * 纯增量：只往现有 DOM 上加一个动效类名，不改结构的层级，也不碰业务状态。
 *
 * 为什么需要它 —— 停靠面板那一格必须靠 JS 触发：
 *   #dock-body 的内容是每 160ms 重建一次的（app.js 的 draw 里做了节流刷新），
 *   所以「子节点插入就播动画」的写法会让它不停地抖。
 *   真正值得动效跟随的是「用户点了哪个页签」这一下 —— 那是一个明确事件，
 *   这里用 MutationObserver 盯着 #dock-tabs 的 active 变化来捕捉它。
 *
 * 降级两条路：
 *   1. 系统级 prefers-reduced-motion（motion.css 里 --motion 置 0）
 *   2. 手动 localStorage 'tl.motion' = 'off'（给探针和「我就是不要动画」的人）
 */

const KEY = 'tl.motion';

/** 该不该动：系统偏好说不要、或者手动关了，就不动 */
export function motionEnabled() {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'off') return false;
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;   // 拿不到媒体查询就不用管它，按「要动」处理
  }
}

/** 手动开关：给「我就是不要动画」留一个显式出口（系统级偏好请改系统设置） */
export function setMotion(on) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch { /* 隐私模式，忽略 */ }
}

/**
 * 让元素重播一次动画。
 * 必须拿掉类名 → 强读一次布局 → 再加回去：浏览器把「同一次样式变化」里的
 * remove+add 合并掉了，不插这个 offsetWidth 读操作，第二次就不会重播。
 */
function replay(el, cls) {
  if (!el) return false;
  // 关掉动效时要**把残留的类名摘掉**：类是「上次动的那个」留下的，
  // 不清的话「关了动画」这件事在 DOM 上看不出来（也让断言没法判断到底动没动）
  if (!motionEnabled()) { el.classList.remove(cls); return false; }
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  return true;
}

/** 共享轴 Y：让某个容器重播一次「顺着 Y 轴推进来」的动画 */
export function playAxisY(el) { return replay(el, 'mo-axis-y'); }

/**
 * 装动效钩子。幂等：重复调用只会多走一次查DOM，不会叠加新的监听器。
 * @param {{tabs?: string, body?: string}} sel 选择器（给测试留的调整口）
 */
export function installMotion(sel = {}) {
  const tabsSel = sel.tabs || '#dock-tabs';
  const bodySel = sel.body || '#dock-body';
  const tabs = document.querySelector(tabsSel);
  const body = document.querySelector(bodySel);
  if (!tabs || !body) return { ok: false };
  if (tabs.dataset.moInstalled === '1') return { ok: true, reused: true };
  tabs.dataset.moInstalled = '1';

  const activeOf = () => {
    const b = tabs.querySelector('button.active');
    return b ? (b.dataset.panel || '') : '';
  };
  let last = activeOf();
  const obs = new MutationObserver(() => {
    const now = activeOf();
    if (now === last) return;       // 刷新面板引起的重建不算「切页签」
    last = now;
    playAxisY(body);
  });
  // 只看 class 属性就够了 —— active 是通过 class 切换的，不用听所有变更
  obs.observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] });
  return { ok: true, observer: obs, playAxisY };
}
