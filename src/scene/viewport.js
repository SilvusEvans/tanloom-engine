import { t } from '../core/i18n.js';
/**
 * Tanloom Engine — 舞台视口
 * 用 Canvas 2D 直接画运行时状态。不依赖任何第三方渲染库：
 * 内置矢量形状（box / circle / capsule / triangle / diamond）足够让项目跑起来。
 */

const SHAPES = ['box', 'circle', 'capsule', 'triangle', 'diamond'];

export class StageView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Store} store
   * @param {Function} getRuntime
   * @param {object} [opts]
   * @param {boolean} [opts.showChrome=true] 画不画舞台边框 / 网格 / 「未运行」角标。
   *        全屏游玩时关掉，只留画面本身。
   * @param {boolean} [opts.showMonitors=true] 画不画变量监视
   */
  constructor(canvas, store, getRuntime, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.getRuntime = getRuntime;
    this.opts = opts;
    this.showChrome = opts.showChrome !== false;
    this.k = 1;
    this.camX = 0;
    this.camY = 0;
    this._bind();
    this.resize();
  }

  _bind() {
    const rt = () => this.getRuntime();
    this.canvas.addEventListener('pointermove', (e) => {
      const p = this.toStage(e);
      const r = rt();
      if (r) { r.input.mouseX = p.x; r.input.mouseY = p.y; }
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      const r = rt();
      if (!r) return;
      const p = this.toStage(e);
      r.input.mouseDown = true;
      r.input.mouseX = p.x; r.input.mouseY = p.y;
      if (r.isRunning()) r.clickAt(p.x, p.y);
      else {
        const hit = this.pickFromProject(p.x, p.y);
        if (hit && this.onPick) this.onPick(hit.id);
      }
    });
    window.addEventListener('pointerup', () => { const r = rt(); if (r) r.input.mouseDown = false; });
  }

  toStage(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) / rect.width * this.canvas.width / (window.devicePixelRatio || 1);
    const py = (ev.clientY - rect.top) / rect.height * this.canvas.height / (window.devicePixelRatio || 1);
    const W = this.store.project.settings.stageWidth;
    const H = this.store.project.settings.stageHeight;
    return {
      x: (px - this.originX) / this.k + this.camX,
      y: -(py - this.originY) / this.k + this.camY,
      _stageW: W, _stageH: H
    };
  }

  pickFromProject(x, y) {
    const r = this.getRuntime();
    const list = r ? r.state.order.map((n) => r.state.entities[n]) : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e || e.kind === 'stage' || !e.visible) continue;
      const w = e.w * (e.size || 100) / 100 / 2;
      const h = e.h * (e.size || 100) / 100 / 2;
      if (x >= e.x - w && x <= e.x + w && y >= e.y - h && y <= e.y + h) return e;
    }
    return null;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    let cw = Math.round(rect.width);
    let ch = Math.round(rect.height);
    // 视图隐藏时 rect 会是 0：退回到父容器的尺寸，别把画布锁死在一个小尺寸上
    if (cw < 24 || ch < 24) {
      const par = this.canvas.parentElement;
      cw = par ? par.clientWidth - 20 : 480;
      ch = par ? par.clientHeight - 20 : 360;
    }
    cw = Math.max(80, cw); ch = Math.max(60, ch);
    if (this.canvas.width !== cw * dpr || this.canvas.height !== ch * dpr) {
      this.canvas.width = cw * dpr;
      this.canvas.height = ch * dpr;
    }
    const W = this.store.project.settings.stageWidth;
    const H = this.store.project.settings.stageHeight;
    this.k = Math.min(cw / W, ch / H);
    this.originX = cw / 2;
    this.originY = ch / 2;
    this._cw = cw; this._ch = ch; this._dpr = dpr;
  }

  draw() {
    const ctx = this.ctx;
    const rt = this.getRuntime();
    const p = this.store.project;
    const W = p.settings.stageWidth, H = p.settings.stageHeight;
    const cw = this._cw, ch = this._ch, dpr = this._dpr || 1;

    // 舞台坐标 → CSS px（以画布中心为原点，y 轴向上）
    const sx = (x, camX) => this.originX + (x - camX) * this.k;
    const sy = (y, camY) => this.originY - (y - camY) * this.k;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // 背景
    ctx.fillStyle = (p.scene && p.scene.background) || '#0d1017';
    ctx.fillRect(0, 0, cw, ch);

    // 抖动
    let shX = 0, shY = 0;
    if (rt && rt.state.shake > 0) {
      shX = (Math.random() - 0.5) * rt.state.shake * 2;
      shY = (Math.random() - 0.5) * rt.state.shake * 2;
    }

    // 舞台边框 + 网格
    const left = sx(-W / 2, this.camX) + shX;
    const top = sy(H / 2, this.camY) + shY;
    const wpx = W * this.k, hpx = H * this.k;
    if (this.showChrome && p.scene && p.scene.grid) {
      ctx.save();
      ctx.beginPath(); ctx.rect(left, top, wpx, hpx); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.055)';
      ctx.lineWidth = 1;
      const step = 40 * this.k;
      for (let x = left + ((0 - this.camX) % 40) * this.k; x < left + wpx; x += step) {
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + hpx); ctx.stroke();
      }
      for (let y = top + hpx - ((0 - this.camY) % 40) * this.k; y > top; y -= step) {
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + wpx, y); ctx.stroke();
      }
      ctx.restore();
    }
    if (this.showChrome) {
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.strokeRect(left + .5, top + .5, wpx - 1, hpx - 1);
    }

    if (!rt) return;

    // 实体（后加入的在上层）
    ctx.save();
    ctx.beginPath(); ctx.rect(left, top, wpx, hpx); ctx.clip();
    for (const name of rt.state.order) {
      const e = rt.state.entities[name];
      if (!e || !e.visible || e.kind === 'stage' || e.alive === false) continue;
      this._drawEntity(ctx, e, sx(e.x, this.camX) + shX, sy(e.y, this.camY) + shY);
      if (e.bubble) this._drawBubble(ctx, e, sx(e.x, this.camX) + shX, sy(e.y, this.camY) + shY);
    }
    // 粒子
    for (const q of rt.state.particles) {
      const a = Math.max(0, Math.min(1, q.life / q.max));
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(sx(q.x, this.camX) + shX, sy(q.y, this.camY) + shY, q.size * this.k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // HUD（游戏自己的计分板 / 生命值等）。全屏时按画布高度放大，
    // 否则 15px 的字在整屏上会小到看不见。
    if (rt.state.hud) {
      const s = this.showChrome ? 1 : Math.max(1, Math.min(2.4, ch / 480));
      ctx.font = `bold ${Math.round(15 * s)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      const tw = ctx.measureText(rt.state.hud).width;
      const pad = 10 * s;
      const boxH = 26 * s;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(6 * s, 6 * s, Math.min(wpx - 12 * s, tw + pad * 2), boxH);
      ctx.fillStyle = '#e6eaf2';
      ctx.fillText(rt.state.hud, 6 * s + pad, 6 * s + 18 * s);
    }

    // 变量监视（调试用，全屏游玩时默认不画）
    let my = 40;
    const monitors = (this.opts.showMonitors ?? this.showChrome) ? (rt.state.monitors || {}) : {};
    for (const [k, on] of Object.entries(monitors)) {
      if (!on) continue;
      const isList = k.startsWith('list:');
      const name = isList ? k.slice(5) : k;
      const val = isList ? (rt.state.lists[name] || []).join(', ') : String(rt.state.vars[name] ?? '');
      const text = `${name}: ${val}`;
      ctx.font = 'bold 12px "PingFang SC", monospace';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(8, my - 13, tw + 14, 19);
      ctx.fillStyle = '#2a3140';
      ctx.fillText(text, 15, my);
      my += 22;
    }

    // 未运行标记
    if (this.showChrome && !rt.isRunning()) {
      ctx.font = 'bold 11px "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillText(t('未运行 · 按 ▶ 开始'), 12, ch - 10);
    }
  }

  _drawEntity(ctx, e, x, y) {
    const s = (e.size || 100) / 100;
    const w = Math.max(1, e.w * s * this.k);
    const h = Math.max(1, e.h * s * this.k);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (e.opacity ?? 100) / 100));
    ctx.translate(x, y);
    if (e.rotationStyle === 'all') {
      ctx.rotate(-((e.dir - 90) * Math.PI) / 180);
    } else if (e.rotationStyle === 'left-right' && e.dir < 0) {
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = e.color || '#4C97FF';
    ctx.strokeStyle = e.stroke || 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1.5;

    const rx = w / 2, ry = h / 2;
    switch (e.shape) {
      case 'circle':
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'capsule': {
        // 胶囊 = 圆角矩形，圆角取短边的一半（用 roundRect 才不会在宽高接近时退化成圆）
        const r = Math.min(rx, ry, 0.5 * Math.min(w, h));
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-rx, -ry, w, h, r);
        else { ctx.rect(-rx, -ry, w, h); }
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -ry); ctx.lineTo(rx, ry); ctx.lineTo(-rx, ry);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(0, -ry); ctx.lineTo(rx, 0); ctx.lineTo(0, ry); ctx.lineTo(-rx, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      default:
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-rx, -ry, w, h, Math.min(4, Math.min(rx, ry)));
        else ctx.rect(-rx, -ry, w, h);
        ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  _drawBubble(ctx, e, x, y) {
    const text = e.bubble.text;
    ctx.save();
    ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 18, bh = 24;
    const bx = x + 14, by = y - bh - 16;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#c3c9d6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8); else ctx.rect(bx, by, bw, bh);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + 8, by + bh); ctx.lineTo(bx + 2, by + bh + 8); ctx.lineTo(bx + 18, by + bh);
    ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#2a3140';
    ctx.fillText(text, bx + 9, by + 16);
    ctx.restore();
  }
}

export { SHAPES };
