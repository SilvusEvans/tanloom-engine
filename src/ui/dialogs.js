/**
 * Tanloom Engine — 通用 UI 组件：菜单 / 内联编辑 / 对话框 / 轻提示
 */

const popupLayer = () => document.getElementById('popup-layer');
const ctxLayer = () => document.getElementById('ctx-layer');

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */
let toastHost = null;
export function toast(msg, kind = 'info', ms = 2600) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  toastHost.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; }, ms - 200);
  setTimeout(() => el.remove(), ms);
}

/* ------------------------------------------------------------------ */
/* 弹出菜单                                                            */
/* ------------------------------------------------------------------ */
export function closeAllPopups() {
  popupLayer().innerHTML = '';
  ctxLayer().innerHTML = '';
}

/**
 * @param {{x:number,y:number}} at  屏幕坐标
 * @param {Array<{label,onClick,swatch,sep,title,disabled,checked}>} items
 */
export function showMenu(at, items, opts = {}) {
  closeAllPopups();
  const layer = opts.context ? ctxLayer() : popupLayer();
  const menu = document.createElement('div');
  menu.className = 'menu';
  for (const it of items) {
    if (it.sep) { const s = document.createElement('div'); s.className = 'sep'; menu.appendChild(s); continue; }
    if (it.title) { const t = document.createElement('div'); t.className = 'menu-title'; t.textContent = it.title; menu.appendChild(t); continue; }
    const b = document.createElement('button');
    if (it.swatch) {
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = it.swatch;
      b.appendChild(sw);
    }
    b.appendChild(document.createTextNode((it.checked ? '✓ ' : '') + it.label));
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      if (!it.disabled && it.onClick) it.onClick();
    });
    menu.appendChild(b);
  }
  layer.appendChild(menu);
  positionNear(menu, at);
  return menu;
}

function positionNear(el, at) {
  const r = el.getBoundingClientRect();
  let x = at.x, y = at.y;
  if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
  if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

/* ------------------------------------------------------------------ */
/* 内联文本编辑                                                        */
/* ------------------------------------------------------------------ */
export function showInlineInput(rect, value, onCommit, opts = {}) {
  closeAllPopups();
  const wrap = document.createElement('div');
  wrap.className = 'inline-editor';
  const multiline = !!opts.multiline;
  const field = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) field.type = opts.type || 'text';
  field.value = value ?? '';
  if (multiline) { field.rows = opts.rows || 6; field.style.fontFamily = 'var(--mono)'; field.style.width = (opts.width || 380) + 'px'; }
  else field.style.width = (opts.width || 110) + 'px';
  wrap.appendChild(field);
  popupLayer().appendChild(wrap);

  const w = multiline ? (opts.width || 380) : 0;
  let x = rect.right + 6, y = rect.top;
  if (multiline) { x = Math.max(10, Math.min(rect.left, window.innerWidth - w - 30)); y = rect.bottom + 6; }
  const r = wrap.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = rect.left - r.width - 6;
  if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
  wrap.style.left = Math.max(6, x) + 'px';
  wrap.style.top = Math.max(6, y) + 'px';

  let done = false;
  const commit = (ok) => {
    if (done) return;
    done = true;
    const v = field.value;
    closeAllPopups();
    if (ok && onCommit) onCommit(v);
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    e.stopPropagation();
  });
  field.addEventListener('blur', () => commit(true));
  field.focus();
  field.select();
  return wrap;
}

/* ------------------------------------------------------------------ */
/* 对话框                                                              */
/* ------------------------------------------------------------------ */
/**
 * @param {object} o {title, body(el), okText, cancelText, onOk, width, onMount}
 */
export function showModal(o) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  const modal = document.createElement('div');
  modal.className = 'modal';
  if (o.width) modal.style.minWidth = o.width + 'px';

  const h = document.createElement('h3');
  h.textContent = o.title;
  const body = document.createElement('div');
  body.className = 'modal-body';
  if (o.body) body.appendChild(o.body);
  const foot = document.createElement('div');
  foot.className = 'foot';

  const close = () => {
    document.removeEventListener('keydown', onEsc, true);
    back.remove();
    if (o.onClose) o.onClose();
  };
  // Esc 关掉对话框。用捕获阶段，比应用层的快捷键先拿到事件。
  const onEsc = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    close();
  };
  document.addEventListener('keydown', onEsc, true);
  const cancel = document.createElement('button');
  cancel.textContent = o.cancelText || '取消';
  cancel.addEventListener('click', close);
  const okBtn = document.createElement('button');
  okBtn.className = 'primary';
  okBtn.textContent = o.okText || '保存';
  okBtn.addEventListener('click', async () => {
    const r = o.onOk ? await o.onOk() : true;
    if (r !== false) close();
  });
  foot.appendChild(cancel);
  if (o.okText !== null) foot.appendChild(okBtn);

  modal.appendChild(h);
  modal.appendChild(body);
  modal.appendChild(foot);
  back.appendChild(modal);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  if (o.onMount) o.onMount(modal, close);
  const first = modal.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 60);
  // 没有输入框时把焦点给确认按钮，回车依然能确认。
  // （按钮的鼠标焦点被全局挡掉了 —— 不然游戏里按空格会去「点」还带着焦点的按钮 ——
  //   所以这里必须用编程方式补一次，否则纯键盘操作会断。）
  else if (o.okText !== null) setTimeout(() => okBtn.focus(), 60);
  return { close, modal, body };
}

/* ------------------------------------------------------------------ */
/* 表单小工具                                                          */
/* ------------------------------------------------------------------ */
export function row(label, control) {
  const r = document.createElement('div');
  r.className = 'row';
  const l = document.createElement('label');
  l.textContent = label;
  r.appendChild(l);
  r.appendChild(control);
  return r;
}
export function inputEl(value = '', type = 'text', extra = {}) {
  const i = document.createElement('input');
  i.type = type;
  i.value = value;
  Object.assign(i, extra);
  return i;
}
export function selectEl(options, value) {
  const s = document.createElement('select');
  for (const o of options) {
    const op = document.createElement('option');
    op.value = o.value;
    op.textContent = o.label;
    s.appendChild(op);
  }
  s.value = value;
  return s;
}
export function radioRow(name, options, value) {
  const wrap = document.createElement('div');
  wrap.className = 'radio-row';
  options.forEach((o, idx) => {
    const l = document.createElement('label');
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = name;
    r.value = o.value;
    if (idx === 0) r.checked = true;
    if (o.value === value) r.checked = true;
    l.appendChild(r);
    l.appendChild(document.createTextNode(o.label));
    wrap.appendChild(l);
  });
  return wrap;
}
export function getRadio(wrap) {
  const el = wrap.querySelector('input[type=radio]:checked');
  return el ? el.value : null;
}
export function hint(text) {
  const d = document.createElement('div');
  d.className = 'hint';
  d.innerHTML = text;
  return d;
}

/* 全局：点击空白关闭弹层 */
document.addEventListener('pointerdown', (e) => {
  const t = e.target;
  if (t.closest('.menu') || t.closest('.inline-editor') || t.closest('.modal')) return;
  closeAllPopups();
}, true);
