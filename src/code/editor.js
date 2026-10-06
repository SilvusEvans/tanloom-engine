/**
 * Tanloom Engine — 代码编辑器
 * ================================================================
 * 轻量实现：一个 textarea 叠在带高亮的 pre 上。
 * 高亮直接复用解析器的词法分析结果，所以「编辑器看到的」和「解析器理解的」
 * 永远是同一套分词 —— 不会出现高亮和同步对不上的情况。
 *
 * 生产环境把 textarea+pre 换成 Monaco 即可，其余逻辑（注解、同步、冲突）不变。
 */

import { t } from '../core/i18n.js';
import { tokenize } from '../core/parser.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const KEYWORDS = new Set([
  'export', 'async', 'await', 'function', 'const', 'let', 'var', 'if', 'else', 'while', 'for',
  'return', 'true', 'false', 'null', 'undefined', 'new', 'typeof', 'import', 'from', 'type', 'declare', 'void', 'break', 'continue'
]);
const BUILTINS = new Set(['tl', 'vars', 'lists', 'ctx', 'self', 'Math', 'Object', 'console']);

export function highlight(src) {
  const toks = tokenize(src);
  let out = '';
  let pos = 0;
  for (const t of toks) {
    if (t.type === 'eof') break;
    if (t.start > pos) out += esc(src.slice(pos, t.start));
    const raw = src.slice(t.start, t.end);
    if (t.type === 'comment') {
      const isAnn = /@[\w:]+/.test(raw);
      out += `<span class="${isAnn ? 'tok-ann' : 'tok-com'}">${esc(raw)}</span>`;
    } else if (t.type === 'str') out += `<span class="tok-str">${esc(raw)}</span>`;
    else if (t.type === 'num') out += `<span class="tok-num">${esc(raw)}</span>`;
    else if (t.type === 'id') {
      const prev = out.trimEnd().slice(-1);
      if (KEYWORDS.has(t.value)) out += `<span class="tok-kw">${esc(raw)}</span>`;
      else if (BUILTINS.has(t.value) && prev !== '.') out += `<span class="tok-type">${esc(raw)}</span>`;
      else {
        const after = (src.slice(t.end).replace(/^\s*/, '') || ' ')[0];
        if (after === '(') out += `<span class="tok-fn">${esc(raw)}</span>`;
        else out += esc(raw);
      }
    } else out += esc(raw);
    pos = t.end;
  }
  out += esc(src.slice(pos));
  return out;
}

export class CodeEditor {
  constructor(store, els) {
    this.store = store;
    this.highlightEl = els.highlight;
    this.inputEl = els.input;
    this.statusEl = els.status;
    this.bannerEl = els.banner;
    this.filesEl = els.files;
    this.current = null;
    this.dirty = new Map();          // fileName -> text（未保存的编辑）
    this.diagnostics = [];
    this.conflict = false;
    this._bind();
  }

  _bind() {
    this.inputEl.addEventListener('input', () => {
      if (!this.current) return;
      this.dirty.set(this.current.name, this.inputEl.value);
      this._paint();
      this._renderFileList();
      this._status(t('未保存 · 按 Ctrl+S 同步回积木视图'));
    });
    this.inputEl.addEventListener('scroll', () => {
      this.highlightEl.scrollTop = this.inputEl.scrollTop;
      this.highlightEl.scrollLeft = this.inputEl.scrollLeft;
    });
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = this.inputEl.selectionStart, en = this.inputEl.selectionEnd;
        const v = this.inputEl.value;
        this.inputEl.value = v.slice(0, s) + '  ' + v.slice(en);
        this.inputEl.selectionStart = this.inputEl.selectionEnd = s + 2;
        this.dirty.set(this.current.name, this.inputEl.value);
        this._paint();
      }
      e.stopPropagation();
    });
  }

  /* ---------------- 文件列表 ---------------- */
  render() {
    const files = this.store.files;
    if (!this.current || !files.find((f) => f.name === this.current.name)) {
      this.current = files[0] || null;
    }
    this._renderFileList();
    this._loadCurrent();
  }

  _renderFileList() {
    this.filesEl.innerHTML = '';
    for (const f of this.store.files) {
      const el = document.createElement('div');
      el.className = 'file-item' + (this.current && f.name === this.current.name ? ' active' : '');
      const icon = document.createElement('span');
      icon.textContent = f.readonly ? '📘' : '📄';
      const nm = document.createElement('span');
      nm.textContent = f.name;
      el.append(icon, nm);
      if (f.readonly) {
        const ro = document.createElement('span');
        ro.className = 'ro';
        ro.textContent = t('只读');
        el.appendChild(ro);
      } else if (this.dirty.has(f.name)) {
        const d = document.createElement('span');
        d.className = 'dirty';
        el.appendChild(d);
      }
      el.addEventListener('click', () => {
        if (this.current && this.current.name === f.name) return;
        this.current = f;
        this._loadCurrent();
        this._renderFileList();
      });
      this.filesEl.appendChild(el);
    }
  }

  _loadCurrent() {
    const f = this.current;
    if (!f) { this.inputEl.value = ''; this.highlightEl.innerHTML = ''; return; }
    const text = this.dirty.has(f.name) ? this.dirty.get(f.name) : f.text;
    this.inputEl.value = text;
    this.inputEl.readOnly = !!f.readonly;
    this.highlightEl.innerHTML = highlight(text);
    this._paint();
    this._status(f.readonly ? t('只读参考文件') : t('已同步 · 编辑后按 Ctrl+S 写回积木'));
  }

  _paint() {
    this.highlightEl.innerHTML = highlight(this.inputEl.value) + '\n';
  }

  _status(text, kind = '') {
    this.statusEl.innerHTML = `<span class="${kind}">${esc(text)}</span>` +
      (this.diagnostics.length ? t('<span class="err">{_1} 条解析提示</span>', { _1: this.diagnostics.length }) : '');
  }

  /* ---------------- 保存：代码 → 积木 ---------------- */
  save() {
    const f = this.current;
    if (!f || f.readonly) return;
    const text = this.inputEl.value;
    const res = this.store.applyCode(f.name, text);
    this.dirty.delete(f.name);
    this.diagnostics = res.diagnostics || [];
    this.conflict = false;
    this._renderBanner();
    this._renderFileList();
    this._status(res.ok ? t('✓ 已同步回积木视图') : t('同步完成，但有提示'), res.ok ? '' : 'err');
    this._loadCurrent();
    return res;
  }

  revert() {
    if (!this.current) return;
    this.dirty.delete(this.current.name);
    this.diagnostics = [];
    this._loadCurrent();
    this._renderFileList();
  }

  /** 积木侧变更后调用：如果没有未保存改动就直接刷新，否则标记冲突 */
  onBlocksChanged() {
    if (this.dirty.size > 0) {
      this.conflict = true;
      this._renderBanner();
      return;
    }
    this._loadCurrent();
    this._renderFileList();
  }

  _renderBanner() {
    if (!this.conflict) { this.bannerEl.classList.add('hidden'); return; }
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.innerHTML = '';
    const t = document.createElement('span');
    t.textContent = t('⚠ 积木视图有新的改动，而这里的代码还没保存 —— 二者已经分叉。');
    const sp = document.createElement('span');
    sp.className = 'spacer';
    const b1 = document.createElement('button');
    b1.className = 'primary';
    b1.textContent = t('以代码为准（覆盖积木）');
    b1.addEventListener('click', () => this.save());
    const b2 = document.createElement('button');
    b2.textContent = t('以积木为准（丢弃代码改动）');
    b2.addEventListener('click', () => this.revert());
    this.bannerEl.append(t, sp, b1, b2);
  }

  hasUnsaved() { return this.dirty.size > 0; }
}
