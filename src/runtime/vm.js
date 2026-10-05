/**
 * DualForge — 运行时
 * ================================================================
 * 策划案 §5：每帧按固定阶段推进，每个阶段广播一次，脚本订阅自己关心的广播。
 * 引擎不主动调用脚本，脚本自己「等广播」。
 *
 *   FrameStart → Input → PhysicsUpdate(可多次) → Update → LateUpdate → Render → FrameEnd
 *
 * 这套阶段划分借鉴 Godot 的 _process / _physics_process，但把两者统一成广播订阅：
 * 内置阶段、自定义事件、按键、碰撞、计时器，全部走同一条广播总线。
 */

import { BUILTIN_CHANNELS } from '../core/registry.js';

export class ScriptStop extends Error {
  constructor(reason) { super('script-stop:' + reason); this.reason = reason; }
}

const PHASE_CHANNELS = new Set(BUILTIN_CHANNELS.map((c) => c.name));
const DEFAULT_KEYS_OK = true;

/* ================================================================== */
/* 上下文：每次脚本执行一份，暴露给积木的 run() 和代码积木                  */
/* ================================================================== */
class Ctx {
  constructor(rt, thread) {
    this.rt = rt;
    this.thread = thread;
  }
  get self() { return this.thread.self; }
  get frame() { return this.rt.frame; }
  get delta() { return this.rt.delta; }
  get fixedDelta() { return this.rt.settings.fixedDelta; }
  get value() { return this.thread.value; }
  get input() { return this.rt.input; }
  get vars() { return this.rt.state.vars; }
  get lists() { return this.rt.state.lists; }

  num(e) { return this.rt.toNum(this.rt.evalExpr(e, this)); }
  str(e) { return this.rt.toStr(this.rt.evalExpr(e, this)); }
  bool(e) { return !!this.rt.toNum(this.rt.evalExpr(e, this)); }

  ent(ref) { return this.rt.entity(ref, this.thread.self); }
  getVar(name) { const v = this.rt.state.vars[name]; return v === undefined ? 0 : v; }
  setVar(name, v) { this.rt.state.vars[name] = v; }
  getList(name) {
    if (!this.rt.state.lists[name]) this.rt.state.lists[name] = [];
    return this.rt.state.lists[name];
  }
  runSeq(seqNode) { return this.rt.runSeq(seqNode, this); }
  frameYield() { this.thread.suspended = true; return this.rt.frameYield(this.thread); }
  wait(sec) { this.thread.suspended = true; return this.rt.wait(sec, this.thread); }
  log(msg, level) { this.rt.log(msg, level); }
}

/* ================================================================== */
/* 运行时                                                              */
/* ================================================================== */
export class Runtime {
  constructor(project, hooks = {}) {
    this.project = project;
    this.hooks = hooks;
    this.settings = project.settings;
    this.running = false;
    this.paused = false;
    this.frame = 0;
    this.time = 0;
    this.delta = 1 / 60;
    this.fixedAcc = 0;
    this.budget = Runtime.BUDGET;
    this.logs = [];
    this.timeline = [];
    this.broadcastLog = [];
    this.channelStats = {};
    this._yieldWaiters = [];
    this._raf = 0;
    this._lastTs = 0;
    this._stopped = false;

    this.state = {
      entities: Object.create(null),   // name -> runtime entity
      order: [],
      vars: {},
      lists: {},
      clones: [],
      particles: [],
      camera: { x: 0, y: 0, target: null, k: 0.12 },
      shake: 0,
      hud: '',
      scene: project.scene ? project.scene.sceneName : '场景 1',
      monitors: {},
      saves: {}
    };

    this.input = {
      keys: new Set(),
      pressed: new Set(),
      mouseX: 0, mouseY: 0, mouseDown: false, clicked: false
    };

    this.audio = null;
    this.volume = 0.6;
    this._timerBase = 0;
    this._collisionPairs = new Set();
    this._manualThreads = new Map();   // 实体名 → 手动执行的线程（点击积木触发）
    this._subscriptions = Object.create(null);   // channel -> [sub]
    this._subByChannel = Object.create(null);
  }

  /* ---------------------------------------------------------------- */
  /* 生命周期                                                          */
  /* ---------------------------------------------------------------- */
  load(project) {
    this.project = project;
    this.settings = project.settings;
    this.reset();
    return this;
  }

  reset() {
    this.stop();
    const p = this.project;
    this.frame = 0; this.time = 0; this.delta = 1 / 60; this.fixedAcc = 0;
    this.logs = []; this.timeline = []; this.channelStats = {}; this.broadcastLog = [];
    this.state.entities = Object.create(null);
    this.state.order = [];
    this.state.clones = [];
    this.state.particles = [];
    this.state.vars = JSON.parse(JSON.stringify(p.variables || {}));
    this.state.lists = JSON.parse(JSON.stringify(p.lists || {}));
    this.state.monitors = {};
    this.state.camera = { x: 0, y: 0, target: null, k: 0.12 };
    this.state.shake = 0;
    this.state.hud = '';
    this.state.scene = p.scene ? p.scene.sceneName : '场景 1';
    this._timerBase = 0;
    this.input.keys.clear(); this.input.pressed.clear();
    this._collisionPairs.clear();

    this.__diag = { reset: (this.__diag ? this.__diag.reset : 0) + 1, spawn: 0, remove: 0 };
    for (const def of p.entities || []) {
      if (def.kind === 'group') continue;
      this.spawnFromDef(def, false);
      this.__diag.spawn++;
    }
    this.buildSubscriptions();
    this.log(`已加载项目「${p.name}」，实体 ${this.state.order.length} 个`, 'info');
  }

  spawnFromDef(def, isClone, over) {
    const ent = {
      phyOn: !!(def.physics && def.physics.enabled),
      name: isClone ? `${def.name}#${Math.floor(Math.random() * 900 + 100)}` : def.name,
      protoName: def.name,
      irId: def.id,
      kind: def.kind,
      x: def.x, y: def.y,
      dir: def.dir, size: def.size, opacity: def.opacity,
      visible: def.visible,
      rotationStyle: def.rotationStyle,
      color: def.render ? def.render.color : '#4C97FF',
      stroke: def.render ? def.render.stroke : '#3373CC',
      shape: def.render ? def.render.shape : 'box',
      w: def.render ? def.render.width : 48,
      h: def.render ? def.render.height : 48,
      label: def.render ? def.render.label : '',
      tags: def.tags || [],
      solid: def.solid === true || (def.tags || []).includes('solid'),
      vx: 0, vy: 0,
      gravity: (def.physics && def.physics.gravity) || 0,
      bounce: (def.physics && def.physics.bounce) || 0,
      drag: (def.physics && def.physics.drag) != null ? def.physics.drag : 1,
      grounded: false,
      anim: 'idle',
      bubble: null,
      alive: true,
      isClone: !!isClone,
      cloneOf: isClone ? def.name : null,
      scripts: def.scripts || [],
      irDef: def
    };
    if (over) Object.assign(ent, over);
    this.state.entities[ent.name] = ent;
    this.state.order.push(ent.name);
    return ent;
  }

  /* ---------------------------------------------------------------- */
  /* 订阅表：hat → 频道                                                 */
  /* ---------------------------------------------------------------- */
  buildSubscriptions() {
    this._subByChannel = Object.create(null);
    const add = (channel, sub) => {
      (this._subByChannel[channel] = this._subByChannel[channel] || []).push(sub);
    };
    let reg = 0;
    for (const def of this.project.entities || []) {
      if (def.kind === 'group') continue;
      for (const script of def.scripts || []) {
        const hat = script.hat || { type: 'OnStart' };
        const sub = {
          entityName: def.name, script, hat, order: reg++, thread: null,
          channel: null, key: null, a: null, b: null
        };
        switch (hat.type) {
          case 'OnStart': sub.channel = '_start'; break;
          case 'OnBroadcast': sub.channel = hat.channel; break;
          case 'OnKey': sub.channel = '_key'; sub.key = hat.key || 'any'; break;
          case 'OnClick': sub.channel = '_click'; sub.a = hat.entity || '$self'; break;
          case 'OnCollision': sub.channel = '_collision'; sub.a = hat.a; sub.b = hat.b; break;
          case 'OnClone': sub.channel = '_clone'; break;
          default: sub.channel = hat.channel || 'update'; break;
        }
        add(sub.channel, sub);
      }
    }
    // 自定义频道即使没有订阅者也要存在于注册表里（可视化用）
    for (const name of Object.keys(this.project.channels || {})) {
      if (!this._subByChannel[name]) this._subByChannel[name] = [];
    }
  }

  subscribersOf(channel) { return this._subByChannel[channel] || []; }

  /* ---------------------------------------------------------------- */
  /* 订阅开关（「将 XX 广播订阅状态设为 订阅/取消订阅」积木）            */
  /* ---------------------------------------------------------------- */
  /**
   * 设置「某个实体」在一个广播频道上的订阅状态。
   *
   * 「取消订阅」不是把订阅项从表里删掉，而是给它挂一个 muted 开关 ——
   * 理由有两条：
   *   1. 这样**还能再订阅回来**（删掉就回不来了）；重新订阅后下一次广播就会触发，
   *      以前的广播不会补发。
   *   2. 状态挂在订阅项上，`buildSubscriptions()` 只在 load 时重建，
   *      所以「重新点运行」会回到初始状态，而改积木（热重载）不会把它弄丢。
   *
   * 取消订阅时顺手把**正在跑**的那条脚本停掉 —— 否则「取消订阅 每帧更新」
   * 对一个 `一直重复` 的脚本毫无作用，而「让敌人停止巡逻」正是最常见的用法。
   *
   * @param {object|string} entity 实体或实体名（积木里传的是 self）
   * @param {string} channel       广播频道
   * @param {boolean} on           true = 订阅，false = 取消订阅
   * @returns {number} 这个实体在该频道上的订阅条数（没订阅过就是 0）
   */
  setSubscribed(entity, channel, on) {
    const name = typeof entity === 'string' ? entity : (entity && entity.name);
    if (!name || !channel) return 0;
    const wantSub = on !== false;
    let affected = 0;
    let changed = 0;
    for (const s of this.subscribersOf(channel)) {
      if (s.entityName !== name) continue;
      affected++;
      if (!!s.muted === !wantSub) continue;      // 已经是想要的状态，不做无谓的日志与打断
      s.muted = !wantSub;
      changed++;
      if (!wantSub && s.thread && s.thread.state === 'running') {
        s.thread.state = 'stopped';
        s.thread.cancel = true;
      }
    }
    // 只在状态真的变了才记日志 —— 这个积木常被写在 update 里逐帧调用
    if (changed) {
      this.log(`📣 ${name} ${wantSub ? '订阅' : '取消订阅'}「${channel}」（${affected} 条脚本）`,
        wantSub ? 'ok' : 'warn');
    }
    return affected;
  }

  /** 某个实体在这个频道上还订不订阅（订阅列表面板用得上） */
  isSubscribed(entity, channel) {
    const name = typeof entity === 'string' ? entity : (entity && entity.name);
    const subs = this.subscribersOf(channel).filter((s) => s.entityName === name);
    return subs.length > 0 && subs.some((s) => !s.muted);
  }

  channelOrder(name) {
    const c = this.project.channels && this.project.channels[name];
    if (c && c.order != null) return c.order;
    const b = BUILTIN_CHANNELS.find((x) => x.name === name);
    return b ? b.order : 100;
  }

  /* ---------------------------------------------------------------- */
  /* 启动 / 停止 / 帧循环                                               */
  /* ---------------------------------------------------------------- */
  start() {
    if (this.running) return;
    this.reset();
    this.halted = false;              // 点运行 = 按绿旗，解除「全部停止」
    this.running = true;
    this.paused = false;
    this.budget = Runtime.BUDGET;   // 派发 _start 前必须给足本帧预算
    this._lastTs = 0;
    this.log('▶ 运行', 'ok');
    this.log('广播 [start]', 'bus');
    this._dispatch('_start', 0);
    // start 里的脚本允许跑一帧再进入循环
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._flushYield();
    for (const ch of Object.keys(this._subByChannel)) {
      for (const s of this._subByChannel[ch]) s.thread = null;
    }
    this._stopped = true;
    this._manualThreads.clear();
    // 停止时松开所有键：否则「按住方向键时点了停止」会留下一个按住的键，
    // 下次运行时角色会自己往那边跑。
    this.clearKeys();
  }

  pause() { this.paused = true; this.log('⏸ 暂停', 'warn'); }
  resume() { if (this.running) { this.paused = false; this._lastTs = 0; this.log('▶ 继续', 'ok'); } }
  isRunning() { return this.running && !this.paused; }

  _tick(ts) {
    if (!this.running) return;
    this._raf = requestAnimationFrame((t) => this._tick(t));
    if (this.paused) { this._lastTs = ts; return; }
    if (!this._lastTs) this._lastTs = ts;
    const real = Math.min(1 / 20, Math.max(0, (ts - this._lastTs) / 1000));
    this._lastTs = ts;
    this.step(real);
    if (this.hooks.afterFrame) this.hooks.afterFrame(this);
  }

  /** 手动推进一帧（调试单步用） */
  stepOnce() { this.step(1 / 60); if (this.hooks.afterFrame) this.hooks.afterFrame(this); }

  step(realDelta) {
    // delta 是「上一帧耗时」，必须在这里统一赋值：
    // 只用 requestAnimationFrame 的时间戳赋值的话，首帧和手动单步都会是 0，
    // 所有 (速度)×(delta) 的积木就会静默失效。
    if (realDelta > 0) this.delta = realDelta;
    this.frame++;
    this.time += realDelta;
    this.budget = Runtime.BUDGET;

    // 唤醒上一帧挂起的脚本
    this._flushYield();

    const tl = { frame: this.frame, delta: +(realDelta * 1000).toFixed(2), stages: [] };
    const t0 = performance.now();

    const runPhase = (name, extra) => {
      const s = performance.now();
      this._dispatch(name, realDelta, extra);
      const cost = performance.now() - s;
      tl.stages.push({ name, ms: +cost.toFixed(2), subs: this.subscribersOf(name).length });
      const st = this.channelStats[name] = this.channelStats[name] || { calls: 0, ms: 0, subs: 0 };
      st.calls++; st.ms += cost; st.subs = this.subscribersOf(name).length;
    };

    // FrameStart
    runPhase('frame_start');

    // Input
    this._emitKeyEdges();
    runPhase('input');

    // PhysicsUpdate（固定步长，一帧可能多次）
    this.fixedAcc += realDelta;
    const fd = this.settings.fixedDelta || 1 / 60;
    let steps = 0;
    while (this.fixedAcc >= fd && steps < 5) {
      this.fixedAcc -= fd;
      steps++;
      this.integratePhysics(fd);
      runPhase('physics_update');
    }
    if (steps === 5) this.fixedAcc = 0;

    // Update
    runPhase('update');
    this.detectCollisions();

    // LateUpdate
    this.updateCamera(realDelta);
    this.updateParticles(realDelta);
    if (this.state.shake > 0) this.state.shake = Math.max(0, this.state.shake - realDelta * 60);
    runPhase('late_update');

    runPhase('render');
    runPhase('frame_end');

    for (const e of Object.values(this.state.entities)) {
      if (e.bubble && e.bubble.until <= this.time) e.bubble = null;
    }

    tl.ms = +(performance.now() - t0).toFixed(2);
    this.timeline.push(tl);
    if (this.timeline.length > 90) this.timeline.shift();

    // 预算不足时丢掉本帧剩余线程
    for (const name of Object.keys(this.state.entities)) {
      const e = this.state.entities[name];
      if (!e.alive) this.removeEntity(name);
    }
  }

  /** 调试：单步「一个广播」 */
  stepBroadcast(channel) {
    this._flushYield();
    this._dispatch(channel, this.delta);
  }

  /* ---------------------------------------------------------------- */
  /* 调度与执行                                                         */
  /* ---------------------------------------------------------------- */
  _dispatch(channel, dt, extra) {
    // 执行过「停止 [全部]」之后，阶段广播不再触发任何脚本，
    // 直到重新点运行 —— 与 Scratch 的绿旗语义一致。
    if (this.halted && channel !== '_start') return;
    const subs = this.subscribersOf(channel);
    const phase = PHASE_CHANNELS.has(channel) || channel === '_start';
    for (const s of subs) {
      if (extra && !this._matchSub(s, extra)) continue;
      this._fire(s, channel, extra ? extra.value : 0, phase);
    }
  }

  _matchSub(s, extra) {
    if (extra.key !== undefined && s.key !== extra.key && s.key !== 'any') return false;
    if (extra.entity !== undefined) {
      const target = extra.entity;
      const ref = s.a === '$self' ? s.entityName : s.a;
      if (ref !== target) return false;
    }
    if (extra.a !== undefined) {
      const ra = s.a === '$self' ? s.entityName : s.a;
      const rb = s.b === '$self' ? s.entityName : s.b;
      if (!((ra === extra.a && rb === extra.b) || (ra === extra.b && rb === extra.a))) return false;
    }
    return true;
  }

  _fire(sub, channel, value, singleThread) {
    // 被「将 XX 广播订阅状态设为 取消订阅」关掉的订阅：直接不响应。
    // 判断放在这里而不是 _dispatch，是因为按键 / 碰撞 / 点击这些走的是别的派发路径，
    // 放这儿一处就能全覆盖。
    if (sub.muted) return;
    // 阶段频道：只有当脚本「真的挂起在等待中」时才跳过，
    // 这样一帧内的多次阶段广播（如多个 physics_update 子步）都能正常派发，
    // 又不会让 forever 脚本每帧堆出新线程。
    if (singleThread && sub.thread && sub.thread.suspended && sub.thread.state === 'running') return;

    const self = this.state.entities[sub.entityName];
    if (!self) return;
    const t0 = performance.now();
    this._runThread(self, sub.script, channel, value, sub);

    const st = this.channelStats[channel] = this.channelStats[channel] || { calls: 0, ms: 0, subs: 0 };
    st.ms += performance.now() - t0;
  }

  /**
   * 起一个线程跑一段脚本。
   * 订阅派发（_fire）和手动执行（runStack，即「点击积木」）共用同一套模型，
   * 所以手动跑的那段照常有「等待 / 一直重复」的语义，也能被「停止全部」一并停掉。
   */
  _runThread(self, script, channel, value, sub) {
    const thread = {
      id: ++Runtime._tid,
      self,
      script,
      channel,
      value,
      state: 'running',
      suspended: false,
      ctx: null,
      sub: sub || null,
      startedFrame: this.frame
    };
    thread.ctx = new Ctx(this, thread);
    this._subscriptions[thread.id] = thread;
    if (sub) sub.thread = thread;

    const cleanup = () => {
      thread.suspended = false;
      delete this._subscriptions[thread.id];
      if (sub && sub.thread === thread) sub.thread = null;
    };
    const onError = (err) => {
      if (err instanceof ScriptStop) {
        thread.state = 'stopped';
      } else {
        thread.state = 'error';
        this.log(`✖ ${self.name} / ${channel}: ${err && err.message}`, 'error');
      }
      cleanup();
    };
    try {
      const r = this.runSeq(script.body, thread.ctx);
      if (r && typeof r.then === 'function') {
        r.then(() => { thread.state = 'done'; cleanup(); }, onError);
      } else {
        if (thread.state === 'running') thread.state = 'done';
        cleanup();
      }
    } catch (err) {
      onError(err);
    }
    return thread;
  }

  /* ---------------------------------------------------------------- */
  /* 手动执行（点击积木）                                               */
  /* ---------------------------------------------------------------- */
  /**
   * 执行一段积木，不等订阅、也不受「同一订阅不重入」的限制。
   * @returns {{ok:boolean, reason?:string}}
   */
  runStack(entityName, hat, body) {
    const self = this.state.entities[entityName];
    if (!self || !self.alive) return { ok: false, reason: `找不到实体「${entityName}」` };
    if (!this.running) return { ok: false, reason: '引擎还没运行' };
    // 「停止全部」之后手动点积木，应该允许重新跑起来
    this.halted = false;
    // 同一实体重复点：先掐掉上一轮，免得「一直重复」越点越多
    const prev = this._manualThreads.get(entityName);
    if (prev && prev.state === 'running') {
      prev.cancel = true;
      prev.state = 'stopped';
    }
    const thread = this._runThread(self, { hat, body }, '_manual', 0, null);
    this._manualThreads.set(entityName, thread);
    return { ok: true };
  }

  /** 手动求一个表达式的值（点击圆形 / 六边形积木时显示气泡） */
  evalManual(node, entityName) {
    const self = entityName ? this.state.entities[entityName] : null;
    const thread = {
      id: ++Runtime._tid, self, value: 0, channel: '_eval',
      state: 'running', suspended: false, script: null, sub: null
    };
    const ctx = new Ctx(this, thread);
    return this.evalExpr(node, ctx);
  }

  _resolveSubs(subs, predicate) {
    return subs.filter(predicate);
  }


  /**
   * 顺序执行一个语句序列。
   * ================================================================
   * 用生成器做协程驱动：积木的 run() 既可以同步返回，也可以返回 Promise。
   * 只要整条语句都是同步的，脚本就在**同一帧内**跑完 ——
   * 如果用 async/await 一把梭，一帧内的多次阶段广播（比如 physics_update 的
   * 多个固定子步）就只会执行到第一条 await 之前，脚本的同步前缀会被反复重放。
   *
   * @returns {undefined|Promise} 同步跑完 → undefined；挂起了 → Promise
   */
  runSeq(seqNode, ctx) {
    return this._drive(this._seqGen(seqNode, ctx), ctx.thread);
  }

  *_seqGen(seqNode, ctx) {
    const thread = ctx.thread;
    const blocks = (seqNode && seqNode.blocks) || [];
    for (const b of blocks) {
      if (!this.running) throw new ScriptStop('runtime-stopped');
      if (thread.state !== 'running') throw new ScriptStop('thread-' + thread.state);
      if (thread.cancel) throw new ScriptStop('cancel');
      if (--this.budget <= 0) {
        this.log('⚠ 单帧执行预算耗尽（可能存在无 yield 的死循环），已中断脚本', 'warn');
        throw new ScriptStop('budget');
      }
      const def = this._defCache(b);
      if (!def || !def.run) continue;
      yield def.run(b, ctx);
    }
  }

  _drive(gen, thread) {
    for (;;) {
      let r;
      try {
        r = gen.next();
      } catch (err) {
        if (err instanceof ScriptStop) thread.state = 'stopped';
        throw err;
      }
      if (r.done) return undefined;
      const v = r.value;
      if (v && typeof v.then === 'function') {
        return v.then(() => this._resume(gen, thread), (err) => { throw err; });
      }
    }
  }

  _resume(gen, thread) {
    try {
      return this._drive(gen, thread);
    } catch (err) {
      throw err;
    }
  }

  /** 表达式求值（递归下降，与 blockdefs 的 run 一一对应） */
  evalExpr(node, ctx) {
    if (node == null) return 0;
    if (typeof node !== 'object') return node;
    if (node.type === 'Number' || node.type === 'String' || node.type === 'Bool') return node.value;
    const def = this._defCache(node);
    if (!def || !def.run) return 0;
    return def.run(node, ctx);
  }

  _defCache(node) {
    if (node.type === 'MacroCall' || node.type === 'MacroCallStatement') return MACRO_RUNNER;
    return Runtime._defsModule.defForNode(node);
  }

  /** 宏调用：按值捕获实参 → 替换 ParamRef → 内联求值（策划案 §7.4 内联展开策略） */
  _substitute(node, values) {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((n) => this._substitute(n, values));
    if (node.type === 'ParamRef') {
      const v = values[node.name];
      if (typeof v === 'string') return { type: 'String', value: v };
      return { type: 'Number', value: this.toNum(v) };
    }
    const out = { type: node.type };
    if (node.op !== undefined) out.op = node.op;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'type' || k === 'op') continue;
      out[k] = (v && typeof v === 'object') ? this._substitute(v, values) : v;
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* 帧内服务                                                          */
  /* ---------------------------------------------------------------- */
  frameYield(thread) {
    if (!this.running) return Promise.resolve();
    if (thread) thread.suspended = true;
    return new Promise((resolve) => this._yieldWaiters.push({ resolve, thread }));
  }

  _flushYield() {
    const w = this._yieldWaiters;
    this._yieldWaiters = [];
    for (const item of w) {
      try {
        if (item.thread) item.thread.suspended = false;
        item.resolve();
      } catch { /* ignore */ }
    }
  }

  async wait(sec, thread) {
    const until = this.time + Math.max(0, sec);
    while (this.running && this.time < until) {
      if (thread && thread.state !== 'running') return;
      await this.frameYield();
      if (!this.running) return;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 广播                                                              */
  /* ---------------------------------------------------------------- */
  broadcast(channel, value, source) {
    const t0 = performance.now();
    this._ensureChannel(channel);
    const subs = this.subscribersOf(channel);
    // 自定义广播：按优先级 + 注册顺序，总是开新线程
    for (const s of subs) this._fire(s, channel, value, false);
    if (this.logs.length < 4000) {
      this.logEvent(channel, value, source, subs.length);
    }
    const st = this.channelStats[channel] = this.channelStats[channel] || { calls: 0, ms: 0, subs: 0 };
    st.ms += performance.now() - t0;
  }

  async broadcastAndWait(channel, value, source) {
    this._ensureChannel(channel);
    const subs = this.subscribersOf(channel);
    const waits = [];
    for (const s of subs) {
      const before = s.thread;
      this._fire(s, channel, value, false);
      if (s.thread && s.thread !== before) waits.push(s.thread);
    }
    this.logEvent(channel, value, source, subs.length);
    while (waits.some((t) => t.state === 'running')) {
      await this.frameYield();
      if (!this.running) break;
    }
  }

  _ensureChannel(name) {
    if (!this.project.channels) this.project.channels = {};
    if (!this.project.channels[name] && !PHASE_CHANNELS.has(name)) {
      this.project.channels[name] = { name, builtin: false, order: 100, doc: '由积木自动注册' };
      if (!this._subByChannel[name]) this._subByChannel[name] = [];
      if (this.hooks.onChannelsChanged) this.hooks.onChannelsChanged(name);
    }
  }

  logEvent(channel, value, source, count) {
    const entry = { channel, value, source: source ? source.name : '系统', count, frame: this.frame };
    this.broadcastLog.push(entry);
    if (this.broadcastLog.length > 200) this.broadcastLog.shift();
    if (this.hooks.onBroadcast) this.hooks.onBroadcast(entry);
  }

  /**
   * 热重载：把项目的最新改动同步进运行时，不打断正在跑的帧循环。
   * 策划案原则 6 —— 改完立刻生效，不重启。
   */
  syncProject(project, opts = {}) {
    this.project = project;
    this.settings = project.settings;
    const alive = new Set();
    for (const def of project.entities || []) {
      if (def.kind === 'group') continue;
      alive.add(def.name);
      const e = this.state.entities[def.name];
      if (!e) { this.spawnFromDef(def, false); continue; }
      e.irDef = def;
      e.scripts = def.scripts || [];
      e.color = def.render ? def.render.color : e.color;
      e.stroke = def.render ? def.render.stroke : e.stroke;
      e.shape = def.render ? def.render.shape : e.shape;
      e.w = def.render ? def.render.width : e.w;
      e.h = def.render ? def.render.height : e.h;
      e.solid = def.solid === true || (def.tags || []).includes('solid');
      e.gravity = (def.physics && def.physics.gravity) || 0;
      e.phyOn = !!(def.physics && def.physics.enabled);
      e.kind = def.kind;
      if (!this.isRunning() || opts.resetPose) {
        e.x = def.x; e.y = def.y; e.dir = def.dir; e.size = def.size; e.opacity = def.opacity;
        e.visible = def.visible; e.vx = 0; e.vy = 0;
      }
    }
    for (const n of [...this.state.order]) {
      const e = this.state.entities[n];
      if (!e) continue;
      const proto = e.isClone ? e.cloneOf : n;
      if (!alive.has(proto)) this.removeEntity(n);
    }
    for (const [k, v] of Object.entries(project.variables || {})) if (!(k in this.state.vars)) this.state.vars[k] = v;
    for (const [k, v] of Object.entries(project.lists || {})) if (!(k in this.state.lists)) this.state.lists[k] = JSON.parse(JSON.stringify(v));
    this.buildSubscriptions();
  }

  /* ---------------------------------------------------------------- */
  /* 实体与物理                                                        */
  /* ---------------------------------------------------------------- */
  entity(ref, self) {
    if (!ref || ref === '$self') return self || { x: 0, y: 0, dir: 0, size: 100, opacity: 100, vx: 0, vy: 0, gravity: 0, w: 0, h: 0, visible: true, name: '$self' };
    return this.state.entities[ref] || this.state.entities[String(ref)] || (self || { x: 0, y: 0 });
  }

  aabb(a) {
    // y 轴向上：bottom < top
    // 「大小」（百分比）必须算进去：画面上放大到 200% 的角色，判定框也得跟着放大，
    // 否则会出现「看着碰上了却穿过去」和「点它点不中」。
    // 编辑器里的拾取（viewport.pickFromProject）一直是按大小算的，这里跟它对齐 ——
    // 绘制、拾取、物理、点击四处必须用同一个框。
    const k = (a.size || 100) / 100;
    const w = a.w * k / 2, h = a.h * k / 2;
    return { l: a.x - w, r: a.x + w, bottom: a.y - h, top: a.y + h };
  }

  touching(a, b) {
    if (!a || !b) return false;
    const A = this.aabb(a), B = this.aabb(b);
    return A.l < B.r && A.r > B.l && A.bottom < B.top && A.top > B.bottom;
  }

  integratePhysics(fd) {
    const H = this.settings.stageHeight / 2;
    for (const name of this.state.order) {
      const e = this.state.entities[name];
      if (!e || !e.alive) continue;
      if (e.kind === 'stage') continue;
      const dynamic = e.phyOn === true || e.gravity !== 0;
      if (!dynamic) { e.grounded = false; continue; }

      e.grounded = false;
      // 舞台坐标 y 轴向上：重力向下 = vy 变小
      if (e.gravity) e.vy -= e.gravity * fd;
      e.x += e.vx * fd;
      e.y += e.vy * fd;
      if (e.drag && e.drag !== 1) e.vx *= Math.pow(e.drag, fd * 60);

      // 与「实心」实体的简单 AABB 解算
      for (const on of this.state.order) {
        if (on === name) continue;
        const o = this.state.entities[on];
        if (!o || !o.alive || !o.solid) continue;
        const A = this.aabb(e), B = this.aabb(o);
        if (!(A.l < B.r && A.r > B.l && A.bottom < B.top && A.top > B.bottom)) continue;
        const penUp = B.top - A.bottom;      // 往上推，站到 B 顶上
        const penDown = A.top - B.bottom;    // 往下推，贴到 B 底下
        const penLeft = A.r - B.l;
        const penRight = B.r - A.l;
        const min = Math.min(penUp, penDown, penLeft, penRight);
        if (min === penUp && e.vy <= 0) { e.y += penUp; e.vy = 0; e.grounded = true; }
        else if (min === penDown && e.vy >= 0) { e.y -= penDown; e.vy = 0; }
        else if (min === penLeft && e.vx >= 0) { e.x -= penLeft; e.vx = e.bounce ? -e.vx * e.bounce : 0; }
        else if (min === penRight && e.vx <= 0) { e.x += penRight; e.vx = e.bounce ? -e.vx * e.bounce : 0; }
      }

      // 舞台边界（地板 / 天花板）
      if (e.y - e.h / 2 <= -H) { e.y = -H + e.h / 2; if (e.vy < 0) e.vy = e.bounce ? -e.vy * e.bounce : 0; e.grounded = true; }
      if (e.y + e.h / 2 >= H) { e.y = H - e.h / 2; if (e.vy > 0) e.vy = e.bounce ? -e.vy * e.bounce : 0; }
    }
  }

  detectCollisions() {
    const list = this.state.order.map((n) => this.state.entities[n]).filter((e) => e && e.alive);
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const key = a.name + '|' + b.name;
        if (!this.touching(a, b)) { this._collisionPairs.delete(key); continue; }
        if (this._collisionPairs.has(key)) continue;
        this._collisionPairs.add(key);
        seen.add(key);
        for (const s of this.subscribersOf('_collision')) {
          const ra = s.a === '$self' ? s.entityName : s.a;
          const rb = s.b === '$self' ? s.entityName : s.b;
          if ((ra === a.protoName && rb === b.protoName) || (ra === b.protoName && rb === a.protoName)) {
            this._fire(s, '_collision', 0, false);
          }
        }
      }
    }
    for (const k of Array.from(this._collisionPairs)) if (!seen.has(k)) this._collisionPairs.delete(k);
  }

  cloneCount() { return this.state.clones.filter((n) => this.state.entities[n]).length; }

  clone(ent) {
    if (!ent || !ent.irDef) return;
    if (this.state.order.length > 400) { this.log('克隆体数量已达上限（400）', 'warn'); return; }
    const c = this.spawnFromDef(ent.irDef, true, { x: ent.x, y: ent.y, dir: ent.dir, size: ent.size, opacity: ent.opacity });
    this.state.clones.push(c.name);
    const subs = this.subscribersOf('_clone').filter((s) => s.entityName === ent.protoName);
    for (const s of subs) {
      const t = { id: ++Runtime._tid, self: c, script: s.script, channel: '_clone', value: 0, state: 'running', suspended: false, ctx: null, sub: s };
      t.ctx = new Ctx(this, t);
      this._subscriptions[t.id] = t;
      const done = () => { t.state = 'done'; delete this._subscriptions[t.id]; };
      const bad = (e) => {
        t.state = e instanceof ScriptStop ? 'stopped' : 'error';
        if (!(e instanceof ScriptStop)) this.log(`✖ 克隆体 / ${s.entityName}: ${e.message}`, 'error');
        delete this._subscriptions[t.id];
      };
      try {
        const r = this.runSeq(s.script.body, t.ctx);
        if (r && typeof r.then === 'function') r.then(done, bad);
        else done();
      } catch (e) { bad(e); }
    }
    return c;
  }

  deleteClone(ent) {
    if (ent) ent.alive = false;
  }

  removeEntity(name) {
    if (this.__diag) this.__diag.remove++;
    const idx = this.state.order.indexOf(name);
    if (idx >= 0) this.state.order.splice(idx, 1);
    delete this.state.entities[name];
  }

  spawn(name, x, y) {
    const def = (this.project.entities || []).find((d) => d.name === name || d.id === name);
    if (!def) { this.log(`找不到实体「${name}」`, 'warn'); return null; }
    const e = this.spawnFromDef(def, false);
    e.x = x; e.y = y;
    return e;
  }

  destroy(ent) { if (ent) ent.alive = false; }

  bounce(ent) {
    const H = this.settings.stageHeight / 2, W = this.settings.stageWidth / 2;
    if (!ent) return;
    if (ent.x - ent.w / 2 < -W) { ent.x = -W + ent.w / 2; ent.vx = Math.abs(ent.vx || 60); ent.dir = 90; }
    else if (ent.x + ent.w / 2 > W) { ent.x = W - ent.w / 2; ent.vx = -Math.abs(ent.vx || 60); ent.dir = -90; }
    else if (ent.y - ent.h / 2 < -H) { ent.y = -H + ent.h / 2; ent.vy = Math.abs(ent.vy || 60); }
    else if (ent.y + ent.h / 2 > H) { ent.y = H - ent.h / 2; ent.vy = -Math.abs(ent.vy || 60); }
    else if (!ent.vx && !ent.vy) { ent.vx = 90; }
  }

  stopScripts(target) {
    if (target === 'all') {
      for (const id of Object.keys(this._subscriptions)) {
        const t = this._subscriptions[id];
        if (t) t.state = 'stopped';
      }
      this._flushYield();
      for (const ch of Object.keys(this._subByChannel)) {
        for (const s of this._subByChannel[ch]) s.thread = null;
      }
      this.halted = true;
      this.log('⏹ 停止全部脚本（点 ▶ 重新开始）', 'warn');
      if (this.hooks.onHalt) this.hooks.onHalt();
      return;
    }
    // 停止当前脚本：抛控制流异常，由 runSeq 捕获
    throw new ScriptStop('stop-' + target);
  }

  /* ---------------------------------------------------------------- */
  /* 反馈层：音效 / HUD / 粒子 / 相机 / 存档                              */
  /* ---------------------------------------------------------------- */
  ensureAudio() {
    if (this.audio) return this.audio;
    try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.audio = null; }
    return this.audio;
  }
  playSound(name) {
    const ac = this.ensureAudio();
    if (!ac) return;
    const presets = {
      beep: [660, 0.12, 'square'], jump: [520, 0.18, 'sine'],
      coin: [990, 0.16, 'sine'], hurt: [180, 0.22, 'sawtooth'], boom: [90, 0.5, 'sawtooth']
    };
    const [freq, dur, type] = presets[name] || presets.beep;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (name === 'jump') osc.frequency.exponentialRampToValueAtTime(freq * 2, ac.currentTime + dur);
    if (name === 'coin') osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ac.currentTime + dur);
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25 * this.volume, ac.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  }
  stopAllSounds() { if (this.audio && this.audio.state === 'running') this.audio.suspend(); setTimeout(() => this.audio && this.audio.resume(), 30); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); }

  say(ent, text, sec) { if (ent) ent.bubble = { text, until: this.time + Math.max(0.2, sec) }; }
  hud(text) { this.state.hud = text; }
  monitor(name, on) { this.state.monitors[name] = !!on; }
  shake(n) { this.state.shake = Math.min(40, this.state.shake + n); }
  particles(ent, n, color) {
    if (!ent) return;
    const cnt = Math.min(60, Math.max(1, Math.floor(n)));
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 140;
      this.state.particles.push({
        x: ent.x, y: ent.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.5, max: 1, color, size: 2 + Math.random() * 3
      });
    }
    if (this.state.particles.length > 800) this.state.particles.splice(0, this.state.particles.length - 800);
  }
  updateParticles(dt) {
    const ps = this.state.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 220 * dt;
    }
  }
  cameraFollow(ent, k) {
    this.state.camera.target = ent;
    this.state.camera.k = k || 0.12;
  }
  updateCamera(dt) {
    const cam = this.state.camera;
    if (!cam.target) return;
    const k = Math.max(0.02, Math.min(1, cam.k));
    cam.x += (cam.target.x - cam.x) * k;
    cam.y += (cam.target.y - cam.y) * k;
  }
  switchScene(name) {
    const from = this.state.scene;
    this.state.scene = name;
    this.log(`场景切换 ${from} → ${name}`, 'info');
  }
  saveSlot(slot) {
    const data = { vars: this.state.vars, lists: this.state.lists, scene: this.state.scene, entities: {} };
    for (const n of this.state.order) {
      const e = this.state.entities[n];
      if (e.isClone) continue;
      data.entities[n] = { x: e.x, y: e.y, vx: e.vx, vy: e.vy, visible: e.visible, size: e.size };
    }
    this.state.saves[slot] = data;
    try { localStorage.setItem('dualforge.save.' + slot, JSON.stringify(data)); } catch { /* ignore */ }
    this.log(`💾 存档到「${slot}」`, 'ok');
  }
  loadSlot(slot) {
    let data = this.state.saves[slot];
    if (!data) { try { data = JSON.parse(localStorage.getItem('dualforge.save.' + slot)); } catch { /* ignore */ } }
    if (!data) { this.log(`存档「${slot}」不存在`, 'warn'); return; }
    this.state.vars = Object.assign(this.state.vars, data.vars || {});
    this.state.lists = Object.assign(this.state.lists, data.lists || {});
    this.state.scene = data.scene || this.state.scene;
    for (const [n, s] of Object.entries(data.entities || {})) {
      const e = this.state.entities[n];
      if (e) Object.assign(e, s);
    }
    this.log(`📂 读取存档「${slot}」`, 'ok');
  }

  /* ---------------------------------------------------------------- */
  /* 输入                                                              */
  /* ---------------------------------------------------------------- */
  setKey(code, down) {
    if (typeof code !== 'string' || !code) return;
    if (down) { if (!this.input.keys.has(code)) this.input.pressed.add(code); this.input.keys.add(code); }
    else this.input.keys.delete(code);
  }

  /** 松开所有键。窗口失焦、停止运行时调用 —— 否则按键会「卡住」 */
  clearKeys() {
    this.input.keys.clear();
    this.input.pressed.clear();
    this.input.mouseDown = false;
  }
  _emitKeyEdges() {
    if (!this.input.pressed.size) return;
    const subs = this.subscribersOf('_key');
    for (const code of Array.from(this.input.pressed)) {
      for (const s of subs) {
        if (s.key === code || s.key === 'any') this._fire(s, '_key', 0, false);
      }
    }
    this.input.pressed.clear();
  }
  clickAt(x, y) {
    const list = this.state.order.map((n) => this.state.entities[n]).filter((e) => e && e.alive && e.visible);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const A = this.aabb(e);
      // 注意字段名：aabb() 给的是 bottom / top（y 轴向上），
      // 写成 A.t / A.b 会拿到 undefined，比较结果恒为 false ——
      // 那样点舞台上任何角色都不会触发「当被点击」，而界面上完全看不出错。
      if (x >= A.l && x <= A.r && y >= A.bottom && y <= A.top) {
        const subs = this.subscribersOf('_click');
        for (const s of subs) {
          const ra = s.a === '$self' ? s.entityName : s.a;
          if (ra === e.protoName) this._fire(s, '_click', 0, false);
        }
        return e;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* 代码积木                                                          */
  /* ---------------------------------------------------------------- */
  evalCode(code, ctx, isExpr) {
    try {
      const body = isExpr ? `return (${code});` : code;
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', 'self', 'vars', 'lists', 'df', 'frame', 'delta', body);
      return fn(ctx, ctx.self, this.state.vars, this.state.lists, this.apiFor(ctx), this.frame, this.delta);
    } catch (err) {
      this.log(`代码积木错误：${err.message}`, 'error');
      return 0;
    }
  }

  /** 暴露给代码积木 / 生成代码的 df 门面 */
  apiFor(ctx) {
    const rt = this;
    return {
      get self() { return ctx.self; },
      entity: (n) => rt.entity(n, ctx.self),
      setPosition: (e, x, y) => { e.x = rt.toNum(x); e.y = rt.toNum(y); },
      setVelocity: (e, vx, vy) => { e.vx = rt.toNum(vx); e.vy = rt.toNum(vy); },
      jump: (e, power) => { e.vy = rt.toNum(power); e.grounded = false; },
      setGravity: (e, g) => { e.gravity = rt.toNum(g); },
      moveBy: (e, dx, dy) => { e.x += rt.toNum(dx); e.y += rt.toNum(dy); },
      bounce: (e) => rt.bounce(e),
      clone: (e) => rt.clone(e),
      deleteClone: () => rt.deleteClone(ctx.self),
      spawn: (n, x, y) => rt.spawn(n, rt.toNum(x), rt.toNum(y)),
      destroy: (e) => rt.destroy(e),
      broadcast: (c, v) => rt.broadcast(c, v, ctx.self),
      broadcastAndWait: (c, v) => rt.broadcastAndWait(c, v, ctx.self),
      // 订阅开关：作用在「当前实体」上（和积木的语义一致）
      setSubscribed: (c, on) => rt.setSubscribed(ctx.self, c, on),
      isSubscribed: (c) => rt.isSubscribed(ctx.self, c),
      wait: (s) => rt.wait(rt.toNum(s)),
      tick: () => rt.frameYield(),
      random: (a, b) => { const x = Math.ceil(rt.toNum(a)), y = Math.floor(rt.toNum(b)); return x + Math.floor(Math.random() * Math.max(1, y - x + 1)); },
      math: (op, x) => { const v = rt.toNum(x); switch (op) { case 'abs': return Math.abs(v); case 'floor': return Math.floor(v); case 'ceil': return Math.ceil(v); case 'round': return Math.round(v); case 'sqrt': return Math.sqrt(Math.max(0, v)); case 'log10': return Math.log10(Math.max(1e-12, v)); case 'ln': return Math.log(Math.max(1e-12, v)); case 'sin': return Math.sin(v * Math.PI / 180); case 'cos': return Math.cos(v * Math.PI / 180); case 'tan': return Math.tan(v * Math.PI / 180); default: return 0; } },
      join: (a, b) => rt.toStr(a) + rt.toStr(b),
      letterOf: (s, i) => { const t = rt.toStr(s), k = Math.floor(rt.toNum(i)) - 1; return k >= 0 && k < t.length ? t[k] : ''; },
      lengthOf: (s) => rt.toStr(s).length,
      contains: (a, b) => rt.toStr(a).includes(rt.toStr(b)),
      touching: (a, b) => rt.touching(a, b),
      distanceTo: (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y)),
      keyDown: (k) => rt.keyDownCheck(k),
      mouseDown: () => rt.input.mouseDown,
      mouseX: () => Math.round(rt.input.mouseX),
      mouseY: () => Math.round(rt.input.mouseY),
      timer: () => rt.timer(),
      resetTimer: () => rt.resetTimer(),
      playSound: (n) => rt.playSound(n),
      stopAllSounds: () => rt.stopAllSounds(),
      volume: (v) => rt.setVolume(rt.toNum(v)),
      say: (e, t, s) => rt.say(e, rt.toStr(t), rt.toNum(s)),
      hud: (t) => rt.hud(rt.toStr(t)),
      shake: (n) => rt.shake(rt.toNum(n)),
      particles: (e, n, c) => rt.particles(e, rt.toNum(n), c),
      cameraFollow: (e, k) => rt.cameraFollow(e, rt.toNum(k)),
      switchScene: (n) => rt.switchScene(rt.toStr(n)),
      save: (s) => rt.saveSlot(rt.toStr(s)),
      load: (s) => rt.loadSlot(rt.toStr(s)),
      monitor: (n, on) => rt.monitor(n, on),
      stop: (t) => rt.stopScripts(t),
      sceneName: () => rt.state.scene,
      cloneCount: () => rt.state.clones.filter((n) => rt.state.entities[n]).length,
      listIndex: (n, v) => { const l = ctx.getList(n); const i = l.findIndex((x) => rt.toStr(x) === rt.toStr(rt.toNum(v))); return i < 0 ? 0 : i + 1; },
      listContains: (n, v) => ctx.getList(n).some((x) => rt.toStr(x) === rt.toStr(rt.toNum(v))),
      log: (m) => rt.log(m, 'info')
    };
  }

  keyDownCheck(key) {
    if (key === 'any') return this.input.keys.size > 0;
    return this.input.keys.has(key);
  }
  timer() { return (this.time - this._timerBase); }
  resetTimer() { this._timerBase = this.time; }

  /* ---------------------------------------------------------------- */
  /* 工具                                                              */
  /* ---------------------------------------------------------------- */
  toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v == null) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  toStr(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  }
  log(msg, level = 'info') {
    const entry = { msg, level, frame: this.frame, t: Date.now() };
    this.logs.push(entry);
    if (this.logs.length > 800) this.logs.shift();
    if (this.hooks.onLog) this.hooks.onLog(entry);
  }
  getRuntimeEntity(name) { return this.state.entities[name]; }
  entityDefs() { return this.project.entities || []; }
}

Runtime.BUDGET = 200000;
Runtime._tid = 0;
Runtime._defsModule = null;

/** 宏调用的通用执行器：按值捕获实参 → IR 变量替换 → 内联求值 */
const MACRO_RUNNER = {
  run(node, ctx) {
    const macro = ctx.rt.project.macros && ctx.rt.project.macros[node.macroId];
    if (!macro) { ctx.log(`缺失的积木宏：${node.macroId}`, 'warn'); return 0; }
    const depth = (ctx.thread.macroDepth = (ctx.thread.macroDepth || 0) + 1);
    if (depth > 32) { ctx.thread.macroDepth--; throw new ScriptStop('macro-depth'); }
    try {
      const values = Object.create(null);
      (macro.params || []).forEach((p, i) => {
        values[p.name] = ctx.rt.evalExpr((node.args || [])[i], ctx);
      });
      const body = ctx.rt._substitute(macro.body, values);
      if (macro.kind === 'expression') return ctx.rt.evalExpr(body, ctx);
      return ctx.rt.runSeq(body, ctx);
    } finally {
      ctx.thread.macroDepth--;
    }
  }
};

/** 由外部注入 blockdefs（避免 vm ↔ blockdefs 的循环依赖） */
export function attachDefs(mod) { Runtime._defsModule = mod; }
