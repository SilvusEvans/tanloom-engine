/**
 * Tanloom Engine — 键盘输入层
 * ================================================================
 * 运行时靠 `input.keys`（键名用 `KeyboardEvent.code`，如 Space / ArrowRight / KeyW）。
 * 这一层负责两件事：
 *
 *  1. 把真实键盘送进运行时 —— 之前根本没有这个绑定，
 *     也就是说不论什么积木，真机上都收不到按键（测试里是直接改 input.keys，
 *     所以一直没暴露）。
 *
 *  2. 挡掉会毁掉游玩的默认行为：
 *     · **空格 / 回车会「激活」当前聚焦的按钮** —— 点过「运行」之后焦点留在那个
 *       按钮上，按空格就等于又点了一次，运行 → 停止 → 运行……游戏直接没法玩。
 *     · 空格 / 方向键会**滚动页面**。
 *
 * 正在输入的时候完全不介入（包括 Blockly 的字段编辑框），否则就成了抢键。
 */

/**
 * 这些键的默认行为必须挡掉：
 * 空格（滚动 + 激活按钮）、方向键（滚动）、翻页键（滚动）。
 * Enter 不挡 —— 对话框里还要靠它确认，而积木游戏不会用 Enter 当下蹲键。
 */
const SWALLOW = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End',
]);

/** 现在是不是在「输入中」——是的话键盘该给输入框，不该给游戏 */
export function isTyping(el) {
  const node = el || document.activeElement;
  if (!node) return false;
  const tag = node.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (node.isContentEditable) return true;
  return false;
}

/**
 * 取键名。
 * 运行时认的是 `KeyboardEvent.code`（Space / ArrowRight / KeyW）。
 * 但 code 不一定有值 —— 有些内嵌 webview、某些输入法状态、以及自动化的
 * 合成事件都可能只给 `key`。这时按 key 兜一份，别让按键静默丢掉。
 */
const KEY_TO_CODE = {
  ' ': 'Space', Spacebar: 'Space',
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
};

export function keyCodeOf(e) {
  if (e.code) return e.code;
  const k = e.key;
  if (!k) return '';
  if (KEY_TO_CODE[k]) return KEY_TO_CODE[k];
  // ArrowUp / ArrowRight 这类本身就和 code 同名，直接用
  if (/^(Arrow|Page|Home|End|Shift|Control|Alt|Meta|Caps)/.test(k)) return k;
  if (k === 'Esc') return 'Escape';
  if (k.length === 1) {
    if (/[a-zA-Z]/.test(k)) return 'Key' + k.toUpperCase();
    if (/[0-9]/.test(k)) return 'Digit' + k;
  }
  return k;
}

/** 元素是不是真的显示在屏幕上 */
function isVisible(el) {
  if (!el) return false;
  if (el.hidden) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  return true;
}

/** 有没有打开的对话框（同样要看显示状态，`.`modal-back` 关掉后不一定及时摘掉） */
export function isModalOpen() {
  return isVisible(document.querySelector('.modal-back'));
}

/**
 * 现在这一下按键该不该给游戏。
 * 除了输入框，还有两种「用户正在跟界面打交道」的情况要放过：
 * Blockly 的下拉字段（方向键在选项间移动）、以及任何打开的对话框。
 *
 * 注意这两个层都是**常驻 DOM**（关掉时只是 display:none），
 * 所以必须判断「是不是真的显示着」——只判断「存不存在」的话，
 * 游戏永远拿不到键盘（这个坑真踩过）。
 */
export function shouldIgnoreKey(el) {
  if (isTyping(el)) return true;
  if (isVisible(document.querySelector('.blocklyDropDownDiv'))) return true;
  if (isVisible(document.querySelector('.modal-back'))) return true;
  return false;
}

/**
 * 挂上键盘 → 运行时。
 * @param {Runtime} rt
 * @param {object} [opts]
 * @param {Function} [opts.onEscape]  Esc 时回调（退出全屏用），会先于默认处理
 * @returns {{ detach: Function }}
 */
export function attachKeyboardInput(rt, opts = {}) {
  const target = opts.target || window;

  // 松开所有键：窗口失焦、焦点进输入框、停止运行时都要做，
  // 否则「按住方向键时切走窗口」会让角色一直往那边跑。
  const releaseAll = () => {
    if (typeof rt.clearKeys === 'function') rt.clearKeys();
    else if (rt.input && rt.input.keys) { rt.input.keys.clear(); rt.input.pressed.clear(); }
  };

  const codesDown = (e) => {
    if (e.key === 'Escape' && opts.onEscape) opts.onEscape();
    if (shouldIgnoreKey(e.target)) return;
    // 组合键（Ctrl/Alt/Meta）留给编辑器快捷键，不当成游戏按键
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SWALLOW.has(e.code) || SWALLOW.has(e.key)) e.preventDefault();
    const code = keyCodeOf(e);
    if (code) rt.setKey(code, true);
  };

  const onKeyUp = (e) => {
    if (shouldIgnoreKey(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SWALLOW.has(e.code) || SWALLOW.has(e.key)) e.preventDefault();
    const code = keyCodeOf(e);
    if (code) rt.setKey(code, false);
  };

  // 焦点跑到输入框时，把游戏手上的键松开 —— 不然「按着方向键切去输入」会留下卡住的键
  const onFocusIn = (e) => { if (isTyping(e.target)) releaseAll(); };

  target.addEventListener('keydown', codesDown);
  target.addEventListener('keyup', onKeyUp);
  document.addEventListener('focusin', onFocusIn);
  window.addEventListener('blur', releaseAll);

  return {
    detach() {
      target.removeEventListener('keydown', codesDown);
      target.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('blur', releaseAll);
    },
  };
}

/** 挡掉「按钮抢焦点」——鼠标按下时不聚焦，点击依然照常触发 */
export function preventButtonFocus(root = document) {
  const onDown = (e) => {
    const el = e.target;
    if (!el || typeof el.closest !== 'function') return;
    const btn = el.closest('button');
    if (btn && !btn.hasAttribute('data-keep-focus')) e.preventDefault();
  };
  root.addEventListener('mousedown', onDown, true);
  return { detach: () => root.removeEventListener('mousedown', onDown, true) };
}

/** 让当前焦点回到「不占按键」的地方（开始游玩时调用） */
export function blurFocus() {
  const el = document.activeElement;
  if (el && typeof el.blur === 'function' && el !== document.body) el.blur();
}
