/**
 * Tanloom Engine — 积木定义表
 * ================================================================
 * 每一块积木在这里只定义一次，然后同时驱动：
 *   · 积木视图的外观（label 中的 [ ] ( ) < > { } 标记决定形状与插槽）
 *   · 代码视图的 TypeScript 生成（gen）
 *   · 运行时的行为（run）
 * 这就是「双视图平权」的落地点：不是两套实现，是一份定义的两个投影。
 *
 * label 标记语言：
 *   [XX]  字段插槽（下拉 / 实体 / 变量选择器）—— 圆角矩形
 *   (XX)  值插槽 —— 圆形/椭圆，可嵌入圆形或六边形积木
 *   <XX>  布尔插槽 —— 六边形
 *   {XX}  子栈插槽 —— C 型积木的嘴
 */

import { E, seq } from './ir.js';
import { KEY_OPTIONS, MATH_OPTIONS, PROP_OPTIONS, SETPROP_OPTIONS, SUBSCRIBE_OPTIONS } from './registry.js';

/* ------------------------------------------------------------------ */
/* 参数规格简写                                                        */
/* ------------------------------------------------------------------ */
const SOUND_OPTIONS = [
  { label: '哔', value: 'beep' }, { label: '跳跃', value: 'jump' },
  { label: '金币', value: 'coin' }, { label: '受伤', value: 'hurt' },
  { label: '爆炸', value: 'boom' }
];
const ANIM_OPTIONS = [
  { label: '待机', value: 'idle' }, { label: '奔跑', value: 'run' },
  { label: '跳跃', value: 'jump' }, { label: '受伤', value: 'hurt' }
];
const STOP_OPTIONS = [
  { label: '全部', value: 'all' }, { label: '这个脚本', value: 'script' },
  { label: '其他脚本', value: 'others' }
];
const ROT_OPTIONS = [
  { label: '任意方向', value: 'all' }, { label: '左右翻转', value: 'left-right' },
  { label: '不旋转', value: 'none' }
];
const PARAM_OPTIONS = [
  { label: '帧号 frame', value: 'frame' },
  { label: '时间差 delta', value: 'delta' },
  { label: '固定步长 fixedDelta', value: 'fixedDelta' },
  { label: '广播参数 value', value: 'value' }
];

const A = {
  ent: (v = '$self') => ({ slot: 'field', kind: 'entity', def: v, width: 74 }),
  num: (v = 0) => ({ slot: 'input', kind: 'number', def: () => E.num(v) }),
  num10: (v = 10) => ({ slot: 'input', kind: 'number', def: () => E.num(v), width: 42 }),
  text: (v = '你好') => ({ slot: 'input', kind: 'text', def: () => E.str(v), width: 64 }),
  bool: (v = false) => ({ slot: 'bool', def: () => E.bool(v) }),
  vari: (v = '分数') => ({ slot: 'field', kind: 'variable', def: v, width: 74 }),
  list: (v = '存档点') => ({ slot: 'field', kind: 'list', def: v, width: 74 }),
  chan: (v = 'update') => ({ slot: 'field', kind: 'channel', def: v, width: 96 }),
  key: (v = 'Space') => ({ slot: 'field', kind: 'key', def: v, width: 66 }),
  sel: (options, v, width = 74) => ({ slot: 'field', kind: 'select', options, def: v, width }),
  color: (v = '#FFD500') => ({ slot: 'field', kind: 'color', def: v, width: 62 }),
  sub: () => ({ slot: 'sub' }),
  code: (v = '// 任意 TS 代码，可读写 self / vars / tl') => ({ slot: 'field', kind: 'code', def: v, width: 120 })
};

/* ------------------------------------------------------------------ */
/* 帽块（事件入口）                                                     */
/* ------------------------------------------------------------------ */
export const HAT_DEFS = [
  {
    op: 'OnStart', id: 'hat_start', kind: 'hat', category: 'event',
    label: '当 ▶ 被点击',
    args: {},
    annotation: () => ({ tag: 'start', args: {}, fnName: 'onStart' }),
    doc: '项目启动或绿旗被点击时触发一次'
  },
  {
    op: 'OnBroadcast', id: 'hat_broadcast', kind: 'hat', category: 'event',
    label: '当收到 [CHANNEL]',
    args: { CHANNEL: A.chan('update') },
    annotation: (n) => {
      const builtin = ['frame_start', 'input', 'physics_update', 'update', 'late_update', 'render', 'frame_end'];
      if (builtin.includes(n.channel)) {
        return { tag: n.channel, args: {}, fnName: 'on' + n.channel.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join('') };
      }
      return { tag: 'event', args: { channel: n.channel }, fnName: 'onEvent_' + n.channel };
    },
    doc: '订阅一个广播频道；每帧阶段广播与自定义广播统一走这条通路'
  },
  {
    op: 'OnKey', id: 'hat_key', kind: 'hat', category: 'event',
    label: '当按下 [KEY] 键',
    args: { KEY: A.key('Space') },
    annotation: (n) => ({ tag: 'key', args: { key: n.key }, fnName: 'onKey_' + n.key }),
    doc: '按键也是一次广播，只是由输入系统替你发'
  },
  {
    op: 'OnClick', id: 'hat_click', kind: 'hat', category: 'event',
    label: '当 [ENTITY] 被点击',
    args: { ENTITY: A.ent() },
    annotation: (n) => ({ tag: 'click', args: { target: n.entity }, fnName: 'onClick_' + String(n.entity).replace(/[^\w\u4e00-\u9fa5]/g, '_') }),
    doc: '在预览区点击该实体时触发'
  },
  {
    op: 'OnCollision', id: 'hat_collision', kind: 'hat', category: 'event',
    label: '当 [A] 碰到 [B]',
    args: { A: A.ent(), B: A.ent('敌人') },
    annotation: (n) => ({ tag: 'collision', args: { a: n.a, b: n.b }, fnName: 'onCollision' }),
    doc: '碰撞检测结果以广播形式投递'
  },
  {
    op: 'OnClone', id: 'hat_clone', kind: 'hat', category: 'event',
    label: '当作为克隆体启动时',
    args: {},
    annotation: () => ({ tag: 'clone', args: {}, fnName: 'onClone' }),
    doc: '克隆体诞生时触发'
  }
];

/* ------------------------------------------------------------------ */
/* 语句积木                                                            */
/* ------------------------------------------------------------------ */
export const STATEMENT_DEFS = [
  /* ---------------- 控制 ---------------- */
  {
    op: 'Wait', id: 'control_wait', kind: 'statement', category: 'control',
    label: '等待 (SEC) 秒',
    args: { SEC: A.num(1) },
    gen: (n, g) => [`${g.ind()}await tl.wait(${g.e(n.sec)});`],
    run: (n, c) => c.wait(c.num(n.sec))
  },
  {
    op: 'Repeat', id: 'control_repeat', kind: 'cblock', category: 'control',
    label: '重复 (TIMES) 次 {BODY}',
    args: { TIMES: A.num10(10), BODY: A.sub() },
    gen: (n, g) => [`${g.ind()}for (let i = 0; i < ${g.e(n.times)}; i++) {`, ...g.seq(n.body, g.level + 1), `${g.ind()}}`],
    run: (n, c) => {
      const times = Math.max(0, Math.floor(c.num(n.times)));
      let i = 0;
      const step = () => {
        for (; i < times; i++) {
          const r = c.runSeq(n.body);
          if (r && typeof r.then === 'function') { i++; return r.then(step); }
        }
        return undefined;
      };
      return step();
    }
  },
  {
    op: 'Forever', id: 'control_forever', kind: 'cblock', category: 'control',
    label: '一直重复 {BODY}',
    args: { BODY: A.sub() },
    gen: (n, g) => [`${g.ind()}while (true) {`, ...g.seq(n.body, g.level + 1), `${g.ind()}  await tl.tick();`, `${g.ind()}}`],
    run: (n, c) => {
      const loop = () => {
        if (!c.rt.running) return undefined;
        const r = c.runSeq(n.body);
        if (r && typeof r.then === 'function') return r.then(loop);
        const y = c.frameYield();
        return (y && typeof y.then === 'function') ? y.then(loop) : undefined;
      };
      return loop();
    }
  },
  {
    op: 'RepeatUntil', id: 'control_repeat_until', kind: 'cblock', category: 'control',
    label: '重复直到 <COND> {BODY}',
    args: { COND: A.bool(), BODY: A.sub() },
    gen: (n, g) => [`${g.ind()}while (!(${g.e(n.cond)})) {`, ...g.seq(n.body, g.level + 1), `${g.ind()}  await tl.tick();`, `${g.ind()}}`],
    run: (n, c) => {
      const loop = () => {
        if (!c.rt.running || c.bool(n.cond)) return undefined;
        const r = c.runSeq(n.body);
        if (r && typeof r.then === 'function') return r.then(loop);
        const y = c.frameYield();
        return (y && typeof y.then === 'function') ? y.then(loop) : undefined;
      };
      return loop();
    }
  },
  {
    op: 'If', id: 'control_if', kind: 'cblock', category: 'control',
    label: '如果 <COND> 那么 {THEN}',
    args: { COND: A.bool(), THEN: A.sub() },
    gen: (n, g) => [`${g.ind()}if (${g.e(n.cond)}) {`, ...g.seq(n.then, g.level + 1), `${g.ind()}}`],
    run: (n, c) => { if (c.bool(n.cond)) return c.runSeq(n.then); return undefined; }
  },
  {
    op: 'IfElse', id: 'control_if_else', kind: 'cblock', category: 'control',
    label: '如果 <COND> 那么 {THEN} 否则 {OTHERWISE}',
    args: { COND: A.bool(), THEN: A.sub(), OTHERWISE: A.sub() },
    gen: (n, g) => [
      `${g.ind()}if (${g.e(n.cond)}) {`, ...g.seq(n.then, g.level + 1),
      `${g.ind()}} else {`, ...g.seq(n.otherwise, g.level + 1), `${g.ind()}}`
    ],
    run: (n, c) => c.runSeq(c.bool(n.cond) ? n.then : n.otherwise)
  },
  {
    op: 'StopScripts', id: 'control_stop', kind: 'cap', category: 'control',
    label: '停止 [TARGET]',
    args: { TARGET: A.sel(STOP_OPTIONS, 'all') },
    gen: (n, g) => [`${g.ind()}tl.stop(${g.q(n.target)});`],
    run: (n, c) => { c.rt.stopScripts(n.target); }
  },
  {
    op: 'Clone', id: 'control_clone', kind: 'statement', category: 'control',
    label: '克隆 [ENTITY]',
    args: { ENTITY: A.ent() },
    gen: (n, g) => [`${g.ind()}tl.clone(${g.ent(n.entity)});`],
    run: (n, c) => { c.rt.clone(c.ent(n.entity)); }
  },
  {
    op: 'DeleteClone', id: 'control_delete_clone', kind: 'cap', category: 'control',
    label: '删除此克隆体',
    args: {},
    gen: (n, g) => [`${g.ind()}tl.deleteClone();`],
    run: (n, c) => { c.rt.deleteClone(c.self); throw new c.rt.ScriptStop('delete-clone'); }
  },
  {
    op: 'Broadcast', id: 'control_broadcast', kind: 'statement', category: 'control',
    label: '广播 [CHANNEL] 带 (VALUE)',
    args: { CHANNEL: A.chan('玩家受伤'), VALUE: A.num(10) },
    gen: (n, g) => [`${g.ind()}tl.broadcast(${g.q(n.channel)}, ${g.e(n.value)});`],
    run: (n, c) => { c.rt.broadcast(n.channel, c.num(n.value), c.self); }
  },
  {
    // 「订阅状态」不是把订阅项从表里删掉，而是给它挂一个开关：
    // 这样「取消订阅」之后还能「订阅」回来。运行时重载项目时会自动复位。
    op: 'SetSubscribed', id: 'control_set_subscribed', kind: 'statement', category: 'control',
    label: '将 [CHANNEL] 广播订阅状态设为 [STATE]',
    args: { CHANNEL: A.chan('update'), STATE: A.sel(SUBSCRIBE_OPTIONS, 'subscribe') },
    gen: (n, g) => [`${g.ind()}tl.setSubscribed(${g.q(n.channel)}, ${n.state === 'subscribe' ? 'true' : 'false'});`],
    run: (n, c) => { c.rt.setSubscribed(c.self, n.channel, n.state === 'subscribe'); },
    doc: '控制「自己」在这个广播频道上的脚本要不要响应；取消订阅会顺手停掉正在跑的那条'
  },
  {
    op: 'BroadcastAndWait', id: 'control_broadcast_wait', kind: 'cblock', category: 'control',
    label: '广播 [CHANNEL] 带 (VALUE) 并等待 {BODY}',
    args: { CHANNEL: A.chan('玩家受伤'), VALUE: A.num(10), BODY: A.sub() },
    gen: (n, g) => [`${g.ind()}await tl.broadcastAndWait(${g.q(n.channel)}, ${g.e(n.value)});`],
    run: (n, c) => c.rt.broadcastAndWait(n.channel, c.num(n.value), c.self)
  },

  /* ---------------- 运动 ---------------- */
  {
    op: 'MoveBy', id: 'motion_move', kind: 'statement', category: 'motion',
    label: '移动 [ENTITY] 水平 (DX) 垂直 (DY)',
    args: { ENTITY: A.ent(), DX: A.num(0), DY: A.num(0) },
    // 生成单条 tl.moveBy(...) 而不是拆成 `self.x += …; self.y += …;`：
    // 拆开之后「1 块积木」变成「2 条语句」，代码视图里再保存回来就会得到两块
    // 「将 x 坐标增加」——积木形状和原来对不上了。parser 里本来就有
    // `tl.moveBy` 的反解规则，用它才对得上。
    gen: (n, g) => [`${g.ind()}tl.moveBy(${g.ent(n.entity)}, ${g.e(n.dx)}, ${g.e(n.dy)});`],
    run: (n, c) => { const t = c.ent(n.entity); t.x += c.num(n.dx); t.y += c.num(n.dy); }
  },
  {
    op: 'SetPosition', id: 'motion_set_pos', kind: 'statement', category: 'motion',
    label: '把 [ENTITY] 移到 x: (X) y: (Y)',
    args: { ENTITY: A.ent(), X: A.num(0), Y: A.num(0) },
    gen: (n, g) => [`${g.ind()}tl.setPosition(${g.ent(n.entity)}, ${g.e(n.x)}, ${g.e(n.y)});`],
    run: (n, c) => { const t = c.ent(n.entity); t.x = c.num(n.x); t.y = c.num(n.y); }
  },
  {
    op: 'ChangeX', id: 'motion_change_x', kind: 'statement', category: 'motion',
    label: '把 [ENTITY] 的 x 坐标增加 (DX)',
    args: { ENTITY: A.ent(), DX: A.num(10) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.x += ${g.e(n.dx)};`],
    run: (n, c) => { c.ent(n.entity).x += c.num(n.dx); }
  },
  {
    op: 'ChangeY', id: 'motion_change_y', kind: 'statement', category: 'motion',
    label: '把 [ENTITY] 的 y 坐标增加 (DY)',
    args: { ENTITY: A.ent(), DY: A.num(10) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.y += ${g.e(n.dy)};`],
    run: (n, c) => { c.ent(n.entity).y += c.num(n.dy); }
  },
  {
    op: 'SetProp', id: 'motion_set_prop', kind: 'statement', category: 'motion',
    label: '把 [ENTITY] 的 [PROP] 设为 (VALUE)',
    args: { ENTITY: A.ent(), PROP: A.sel(SETPROP_OPTIONS, 'x', 82), VALUE: A.num(0) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.${n.prop} = ${g.e(n.value)};`],
    run: (n, c) => {
      const t = c.ent(n.entity);
      switch (n.prop) {
        case 'visible': t.visible = c.bool(n.value); break;
        case 'color': t.color = c.str(n.value); break;
        case 'anim': t.anim = c.str(n.value); break;
        default: t[n.prop] = c.num(n.value); break;
      }
    }
  },
  {
    op: 'FaceDirection', id: 'motion_face', kind: 'statement', category: 'motion',
    label: '让 [ENTITY] 面向 (DIR) 度',
    args: { ENTITY: A.ent(), DIR: A.num(90) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.dir = ${g.e(n.dir)};`],
    run: (n, c) => { c.ent(n.entity).dir = c.num(n.dir); }
  },
  {
    op: 'Rotate', id: 'motion_rotate', kind: 'statement', category: 'motion',
    label: '让 [ENTITY] 旋转 (DEG) 度',
    args: { ENTITY: A.ent(), DEG: A.num(15) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.dir += ${g.e(n.deg)};`],
    run: (n, c) => { c.ent(n.entity).dir += c.num(n.deg); }
  },
  {
    op: 'SetVelocity', id: 'motion_set_velocity', kind: 'statement', category: 'motion',
    label: '设置 [ENTITY] 的速度 vx: (VX) vy: (VY)',
    args: { ENTITY: A.ent(), VX: A.num(0), VY: A.num(0) },
    gen: (n, g) => [`${g.ind()}tl.setVelocity(${g.ent(n.entity)}, ${g.e(n.vx)}, ${g.e(n.vy)});`],
    run: (n, c) => { const t = c.ent(n.entity); t.vx = c.num(n.vx); t.vy = c.num(n.vy); }
  },
  {
    op: 'Jump', id: 'motion_jump', kind: 'statement', category: 'motion',
    label: '让 [ENTITY] 跳跃 力度 (POWER)',
    args: { ENTITY: A.ent(), POWER: A.num(380) },
    gen: (n, g) => [`${g.ind()}tl.jump(${g.ent(n.entity)}, ${g.e(n.power)});`],
    run: (n, c) => { const t = c.ent(n.entity); t.vy = c.num(n.power); t.grounded = false; }
  },
  {
    op: 'SetGravity', id: 'motion_gravity', kind: 'statement', category: 'motion',
    label: '设置 [ENTITY] 的重力为 (G)',
    args: { ENTITY: A.ent(), G: A.num(1400) },
    gen: (n, g) => [`${g.ind()}tl.setGravity(${g.ent(n.entity)}, ${g.e(n.g)});`],
    run: (n, c) => { c.ent(n.entity).gravity = c.num(n.g); }
  },
  {
    op: 'BounceOnEdge', id: 'motion_bounce', kind: 'statement', category: 'motion',
    label: '[ENTITY] 碰到边缘就反弹',
    args: { ENTITY: A.ent() },
    gen: (n, g) => [`${g.ind()}tl.bounce(${g.ent(n.entity)});`],
    run: (n, c) => { c.rt.bounce(c.ent(n.entity)); }
  },

  /* ---------------- 外观 ---------------- */
  {
    op: 'Show', id: 'looks_show', kind: 'statement', category: 'looks',
    label: '显示 [ENTITY]',
    args: { ENTITY: A.ent() },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.visible = true;`],
    run: (n, c) => { c.ent(n.entity).visible = true; }
  },
  {
    op: 'Hide', id: 'looks_hide', kind: 'statement', category: 'looks',
    label: '隐藏 [ENTITY]',
    args: { ENTITY: A.ent() },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.visible = false;`],
    run: (n, c) => { c.ent(n.entity).visible = false; }
  },
  {
    op: 'SetSize', id: 'looks_set_size', kind: 'statement', category: 'looks',
    label: '把 [ENTITY] 的大小设为 (SIZE) %',
    args: { ENTITY: A.ent(), SIZE: A.num(100) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.size = ${g.e(n.size)};`],
    run: (n, c) => { c.ent(n.entity).size = c.num(n.size); }
  },
  {
    op: 'ChangeSize', id: 'looks_change_size', kind: 'statement', category: 'looks',
    label: '把 [ENTITY] 的大小增加 (D) %',
    args: { ENTITY: A.ent(), D: A.num(10) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.size += ${g.e(n.d)};`],
    run: (n, c) => { c.ent(n.entity).size += c.num(n.d); }
  },
  {
    op: 'SetOpacity', id: 'looks_set_opacity', kind: 'statement', category: 'looks',
    label: '把 [ENTITY] 的透明度设为 (OP) %',
    args: { ENTITY: A.ent(), OP: A.num(100) },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.opacity = ${g.e(n.op)};`],
    run: (n, c) => { c.ent(n.entity).opacity = c.num(n.op); }
  },
  {
    op: 'PlayAnimation', id: 'looks_animation', kind: 'statement', category: 'looks',
    label: '播放 [ENTITY] 的动画 [NAME]',
    args: { ENTITY: A.ent(), NAME: A.sel(ANIM_OPTIONS, 'run') },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.anim = ${g.q(n.name)};`],
    run: (n, c) => { c.ent(n.entity).anim = n.name; }
  },
  {
    op: 'Say', id: 'looks_say', kind: 'statement', category: 'looks',
    label: '让 [ENTITY] 说 (TEXT) (SEC) 秒',
    args: { ENTITY: A.ent(), TEXT: A.text('你好'), SEC: A.num(2) },
    gen: (n, g) => [`${g.ind()}tl.say(${g.ent(n.entity)}, ${g.e(n.text)}, ${g.e(n.sec)});`],
    run: (n, c) => { c.rt.say(c.ent(n.entity), c.str(n.text), c.num(n.sec)); }
  },
  {
    op: 'SetColor', id: 'looks_set_color', kind: 'statement', category: 'looks',
    label: '把 [ENTITY] 的颜色设为 [COLOR]',
    args: { ENTITY: A.ent(), COLOR: A.color('#FFD500') },
    gen: (n, g) => [`${g.ind()}${g.ent(n.entity)}.color = ${g.q(n.color)};`],
    run: (n, c) => { c.ent(n.entity).color = n.color; }
  },

  /* ---------------- 声音 ---------------- */
  {
    op: 'PlaySound', id: 'sound_play', kind: 'statement', category: 'sound',
    label: '播放声音 [NAME]',
    args: { NAME: A.sel(SOUND_OPTIONS, 'beep') },
    gen: (n, g) => [`${g.ind()}tl.playSound(${g.q(n.name)});`],
    run: (n, c) => { c.rt.playSound(n.name); }
  },
  {
    op: 'StopAllSounds', id: 'sound_stop', kind: 'statement', category: 'sound',
    label: '停止所有声音',
    args: {},
    gen: (n, g) => [`${g.ind()}tl.stopAllSounds();`],
    run: (n, c) => { c.rt.stopAllSounds(); }
  },
  {
    op: 'SetVolume', id: 'sound_volume', kind: 'statement', category: 'sound',
    label: '把音量设为 (V) %',
    args: { V: A.num(100) },
    gen: (n, g) => [`${g.ind()}tl.volume(${g.e(n.v)} / 100);`],
    run: (n, c) => { c.rt.setVolume(c.num(n.v) / 100); }
  },

  /* ---------------- 侦测 ---------------- */
  {
    op: 'ResetTimer', id: 'sensing_reset_timer', kind: 'statement', category: 'sensing',
    label: '重置计时器',
    args: {},
    gen: (n, g) => [`${g.ind()}tl.resetTimer();`],
    run: (n, c) => { c.rt.resetTimer(); }
  },

  /* ---------------- 变量 ---------------- */
  {
    op: 'SetVar', id: 'var_set', kind: 'statement', category: 'variables',
    label: '把 [NAME] 设为 (VALUE)',
    args: { NAME: A.vari('分数'), VALUE: A.num(0) },
    gen: (n, g) => [`${g.ind()}${g.varRef(n.name)} = ${g.e(n.value)};`],
    run: (n, c) => { c.setVar(n.name, c.num(n.value)); }
  },
  {
    op: 'ChangeVar', id: 'var_change', kind: 'statement', category: 'variables',
    label: '把 [NAME] 增加 (DELTA)',
    args: { NAME: A.vari('分数'), DELTA: A.num(1) },
    gen: (n, g) => [`${g.ind()}${g.varRef(n.name)} += ${g.e(n.delta)};`],
    run: (n, c) => { c.setVar(n.name, c.num({ type: 'VarRef', name: n.name }) + c.num(n.delta)); }
  },
  {
    op: 'ShowVar', id: 'var_show', kind: 'statement', category: 'variables',
    label: '显示变量 [NAME]',
    args: { NAME: A.vari('分数') },
    gen: (n, g) => [`${g.ind()}tl.monitor(${g.q(n.name)}, true);`],
    run: (n, c) => { c.rt.monitor(n.name, true); }
  },
  {
    op: 'HideVar', id: 'var_hide', kind: 'statement', category: 'variables',
    label: '隐藏变量 [NAME]',
    args: { NAME: A.vari('分数') },
    gen: (n, g) => [`${g.ind()}tl.monitor(${g.q(n.name)}, false);`],
    run: (n, c) => { c.rt.monitor(n.name, false); }
  },

  /* ---------------- 列表 ---------------- */
  {
    op: 'ListAdd', id: 'list_add', kind: 'statement', category: 'lists',
    label: '把 (VALUE) 加入 [LIST]',
    args: { VALUE: A.num(0), LIST: A.list('存档点') },
    gen: (n, g) => [`${g.ind()}${g.listRef(n.list)}.push(${g.e(n.value)});`],
    run: (n, c) => { c.getList(n.list).push(c.num(n.value)); }
  },
  {
    op: 'ListDelete', id: 'list_delete', kind: 'statement', category: 'lists',
    label: '删除 [LIST] 的第 (INDEX) 项',
    args: { LIST: A.list('存档点'), INDEX: A.num(1) },
    gen: (n, g) => [`${g.ind()}${g.listRef(n.list)}.splice(${g.e(n.index)} - 1, 1);`],
    run: (n, c) => { const l = c.getList(n.list); l.splice(c.num(n.index) - 1, 1); }
  },
  {
    op: 'ListInsert', id: 'list_insert', kind: 'statement', category: 'lists',
    label: '在 [LIST] 的第 (INDEX) 项前插入 (VALUE)',
    args: { LIST: A.list('存档点'), INDEX: A.num(1), VALUE: A.num(0) },
    gen: (n, g) => [`${g.ind()}${g.listRef(n.list)}.splice(${g.e(n.index)} - 1, 0, ${g.e(n.value)});`],
    run: (n, c) => { const l = c.getList(n.list); l.splice(Math.max(0, c.num(n.index) - 1), 0, c.num(n.value)); }
  },
  {
    op: 'ListReplace', id: 'list_replace', kind: 'statement', category: 'lists',
    label: '把 [LIST] 的第 (INDEX) 项替换为 (VALUE)',
    args: { LIST: A.list('存档点'), INDEX: A.num(1), VALUE: A.num(0) },
    gen: (n, g) => [`${g.ind()}${g.listRef(n.list)}[${g.e(n.index)} - 1] = ${g.e(n.value)};`],
    run: (n, c) => { const l = c.getList(n.list); l[c.num(n.index) - 1] = c.num(n.value); }
  },
  {
    op: 'ListClear', id: 'list_clear', kind: 'statement', category: 'lists',
    label: '删除 [LIST] 的全部项目',
    args: { LIST: A.list('存档点') },
    gen: (n, g) => [`${g.ind()}${g.listRef(n.list)}.length = 0;`],
    run: (n, c) => { c.getList(n.list).length = 0; }
  },
  {
    op: 'ListShow', id: 'list_show', kind: 'statement', category: 'lists',
    label: '显示列表 [LIST]',
    args: { LIST: A.list('存档点') },
    gen: (n, g) => [`${g.ind()}tl.monitor(${g.q('list:' + n.list)}, true);`],
    run: (n, c) => { c.rt.monitor('list:' + n.list, true); }
  },
  {
    op: 'ListHide', id: 'list_hide', kind: 'statement', category: 'lists',
    label: '隐藏列表 [LIST]',
    args: { LIST: A.list('存档点') },
    gen: (n, g) => [`${g.ind()}tl.monitor(${g.q('list:' + n.list)}, false);`],
    run: (n, c) => { c.rt.monitor('list:' + n.list, false); }
  },

  /* ---------------- 游戏专用 ---------------- */
  {
    op: 'SwitchScene', id: 'game_switch_scene', kind: 'statement', category: 'game',
    label: '切换到场景 [NAME]',
    args: { NAME: A.text('场景 2') },
    gen: (n, g) => [`${g.ind()}tl.switchScene(${g.e(n.name)});`],
    run: (n, c) => { c.rt.switchScene(c.str(n.name)); }
  },
  {
    op: 'SaveGame', id: 'game_save', kind: 'statement', category: 'game',
    label: '存档到 [SLOT]',
    args: { SLOT: A.text('slot1') },
    gen: (n, g) => [`${g.ind()}tl.save(${g.e(n.slot)});`],
    run: (n, c) => { c.rt.saveSlot(c.str(n.slot)); }
  },
  {
    op: 'LoadGame', id: 'game_load', kind: 'statement', category: 'game',
    label: '读取存档 [SLOT]',
    args: { SLOT: A.text('slot1') },
    gen: (n, g) => [`${g.ind()}tl.load(${g.e(n.slot)});`],
    run: (n, c) => { c.rt.loadSlot(c.str(n.slot)); }
  },
  {
    op: 'CameraFollow', id: 'game_camera', kind: 'statement', category: 'game',
    label: '让相机跟随 [ENTITY] 平滑 (K)',
    args: { ENTITY: A.ent(), K: A.num(0.12) },
    gen: (n, g) => [`${g.ind()}tl.cameraFollow(${g.ent(n.entity)}, ${g.e(n.k)});`],
    run: (n, c) => { c.rt.cameraFollow(c.ent(n.entity), c.num(n.k)); }
  },
  {
    op: 'EmitParticles', id: 'game_particles', kind: 'statement', category: 'game',
    label: '在 [ENTITY] 处播放 (N) 个粒子 颜色 [COLOR]',
    args: { ENTITY: A.ent(), N: A.num(12), COLOR: A.color('#FFD500') },
    gen: (n, g) => [`${g.ind()}tl.particles(${g.ent(n.entity)}, ${g.e(n.n)}, ${g.q(n.color)});`],
    run: (n, c) => { c.rt.particles(c.ent(n.entity), c.num(n.n), n.color); }
  },
  {
    op: 'UISetText', id: 'game_ui_set', kind: 'statement', category: 'game',
    label: '把 HUD 文字设为 (TEXT)',
    args: { TEXT: A.text('分数: 0') },
    gen: (n, g) => [`${g.ind()}tl.hud(${g.e(n.text)});`],
    run: (n, c) => { c.rt.hud(c.str(n.text)); }
  },
  {
    op: 'ShakeScreen', id: 'game_shake', kind: 'statement', category: 'game',
    label: '屏幕震动 强度 (N)',
    args: { N: A.num(8) },
    gen: (n, g) => [`${g.ind()}tl.shake(${g.e(n.n)});`],
    run: (n, c) => { c.rt.shake(c.num(n.n)); }
  },
  {
    op: 'SpawnEntity', id: 'game_spawn', kind: 'statement', category: 'game',
    label: '生成 [ENTITY] 于 x: (X) y: (Y)',
    args: { ENTITY: A.ent('敌人'), X: A.num(0), Y: A.num(0) },
    gen: (n, g) => [`${g.ind()}tl.spawn(${g.q(n.entity)}, ${g.e(n.x)}, ${g.e(n.y)});`],
    run: (n, c) => { c.rt.spawn(n.entity, c.num(n.x), c.num(n.y)); }
  },
  {
    op: 'DestroyEntity', id: 'game_destroy', kind: 'statement', category: 'game',
    label: '销毁 [ENTITY]',
    args: { ENTITY: A.ent() },
    gen: (n, g) => [`${g.ind()}tl.destroy(${g.ent(n.entity)});`],
    run: (n, c) => { c.rt.destroy(c.ent(n.entity)); }
  },

  /* ---------------- 代码积木 ---------------- */
  {
    op: 'CodeBlockStatement', id: 'code_statement', kind: 'statement', category: 'myblocks',
    label: '⚙ 执行代码 (CODE)',
    args: { CODE: A.code('self.x += 10;') },
    gen: (n, g) => String(n.code || '').split('\n').map((l) => g.ind() + l),
    run: (n, c) => { c.rt.evalCode(String(n.code || ''), c, false); }
  }
];

/* ------------------------------------------------------------------ */
/* 表达式积木                                                          */
/* ------------------------------------------------------------------ */
export const EXPR_DEFS = [
  /* 运算 */
  { op: 'BinaryOp', id: 'op_add', kind: 'reporter', category: 'operators', label: '(LEFT) + (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(0) }, fixOp: '+',
    gen: (n, g) => `(${g.e(n.left)} + ${g.e(n.right)})`, run: (n, c) => c.num(n.left) + c.num(n.right) },
  { op: 'BinaryOp', id: 'op_sub', kind: 'reporter', category: 'operators', label: '(LEFT) − (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(0) }, fixOp: '-',
    gen: (n, g) => `(${g.e(n.left)} - ${g.e(n.right)})`, run: (n, c) => c.num(n.left) - c.num(n.right) },
  { op: 'BinaryOp', id: 'op_mul', kind: 'reporter', category: 'operators', label: '(LEFT) × (RIGHT)',
    args: { LEFT: A.num(1), RIGHT: A.num(1) }, fixOp: '*',
    gen: (n, g) => `(${g.e(n.left)} * ${g.e(n.right)})`, run: (n, c) => c.num(n.left) * c.num(n.right) },
  { op: 'BinaryOp', id: 'op_div', kind: 'reporter', category: 'operators', label: '(LEFT) ÷ (RIGHT)',
    args: { LEFT: A.num(1), RIGHT: A.num(1) }, fixOp: '/',
    gen: (n, g) => `(${g.e(n.left)} / ${g.e(n.right)})`, run: (n, c) => { const d = c.num(n.right); return d === 0 ? 0 : c.num(n.left) / d; } },
  { op: 'BinaryOp', id: 'op_mod', kind: 'reporter', category: 'operators', label: '(LEFT) mod (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(1) }, fixOp: '%',
    gen: (n, g) => `(${g.e(n.left)} % ${g.e(n.right)})`, run: (n, c) => { const d = c.num(n.right); return d === 0 ? 0 : c.num(n.left) % d; } },
  { op: 'Random', id: 'op_random', kind: 'reporter', category: 'operators', label: '在 (FROM) 到 (TO) 之间取随机数',
    args: { FROM: A.num(1), TO: A.num(10) },
    gen: (n, g) => `tl.random(${g.e(n.from)}, ${g.e(n.to)})`,
    run: (n, c) => { const a = Math.ceil(c.num(n.from)); const b = Math.floor(c.num(n.to)); return a + Math.floor(Math.random() * Math.max(1, b - a + 1)); } },
  { op: 'Compare', id: 'op_gt', kind: 'boolean', category: 'operators', label: '(LEFT) > (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(0) }, fixOp: '>',
    gen: (n, g) => `(${g.e(n.left)} > ${g.e(n.right)})`, run: (n, c) => c.num(n.left) > c.num(n.right) },
  { op: 'Compare', id: 'op_lt', kind: 'boolean', category: 'operators', label: '(LEFT) < (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(0) }, fixOp: '<',
    gen: (n, g) => `(${g.e(n.left)} < ${g.e(n.right)})`, run: (n, c) => c.num(n.left) < c.num(n.right) },
  { op: 'Compare', id: 'op_eq', kind: 'boolean', category: 'operators', label: '(LEFT) = (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(0) }, fixOp: '==',
    gen: (n, g) => `(${g.e(n.left)} == ${g.e(n.right)})`, run: (n, c) => c.num(n.left) === c.num(n.right) },
  { op: 'Compare', id: 'op_ne', kind: 'boolean', category: 'operators', label: '(LEFT) ≠ (RIGHT)',
    args: { LEFT: A.num(0), RIGHT: A.num(0) }, fixOp: '!=',
    gen: (n, g) => `(${g.e(n.left)} != ${g.e(n.right)})`, run: (n, c) => c.num(n.left) !== c.num(n.right) },
  { op: 'Logic', id: 'op_and', kind: 'boolean', category: 'operators', label: '<LEFT> 与 <RIGHT>',
    args: { LEFT: A.bool(), RIGHT: A.bool() }, fixOp: 'and',
    gen: (n, g) => `(${g.e(n.left)} && ${g.e(n.right)})`, run: (n, c) => c.bool(n.left) && c.bool(n.right) },
  { op: 'Logic', id: 'op_or', kind: 'boolean', category: 'operators', label: '<LEFT> 或 <RIGHT>',
    args: { LEFT: A.bool(), RIGHT: A.bool() }, fixOp: 'or',
    gen: (n, g) => `(${g.e(n.left)} || ${g.e(n.right)})`, run: (n, c) => c.bool(n.left) || c.bool(n.right) },
  { op: 'Not', id: 'op_not', kind: 'boolean', category: 'operators', label: '不成立 <A>',
    args: { A: A.bool() },
    gen: (n, g) => `!(${g.e(n.a)})`, run: (n, c) => !c.bool(n.a) },
  { op: 'Neg', id: 'op_neg', kind: 'reporter', category: 'operators', label: '− (A)',
    args: { A: A.num(0) },
    gen: (n, g) => `(-(${g.e(n.a)}))`, run: (n, c) => -c.num(n.a) },
  { op: 'MathOp', id: 'op_math', kind: 'reporter', category: 'operators', label: '[OP] (X)',
    args: { OP: A.sel(MATH_OPTIONS, 'abs', 84), X: A.num(0) },
    gen: (n, g) => `tl.math(${g.q(n.op)}, ${g.e(n.x)})`,
    run: (n, c) => {
      const x = c.num(n.x);
      switch (n.op) {
        case 'abs': return Math.abs(x);
        case 'floor': return Math.floor(x);
        case 'ceil': return Math.ceil(x);
        case 'round': return Math.round(x);
        case 'sqrt': return Math.sqrt(Math.max(0, x));
        case 'log10': return Math.log10(Math.max(1e-12, x));
        case 'ln': return Math.log(Math.max(1e-12, x));
        case 'sin': return Math.sin((x * Math.PI) / 180);
        case 'cos': return Math.cos((x * Math.PI) / 180);
        case 'tan': return Math.tan((x * Math.PI) / 180);
        default: return 0;
      }
    } },
  { op: 'Join', id: 'op_join', kind: 'reporter', category: 'operators', label: '连接 (A) (B)',
    args: { A: A.text('苹果'), B: A.text('香蕉') },
    gen: (n, g) => `tl.join(${g.e(n.a)}, ${g.e(n.b)})`, run: (n, c) => c.str(n.a) + c.str(n.b) },
  { op: 'LetterOf', id: 'op_letter', kind: 'reporter', category: 'operators', label: '(A) 的第 (I) 个字符',
    args: { A: A.text('世界'), I: A.num(1) },
    gen: (n, g) => `tl.letterOf(${g.e(n.a)}, ${g.e(n.i)})`,
    run: (n, c) => { const s = c.str(n.a); const i = Math.floor(c.num(n.i)) - 1; return i >= 0 && i < s.length ? s[i] : ''; } },
  { op: 'LengthOf', id: 'op_length', kind: 'reporter', category: 'operators', label: '(A) 的长度',
    args: { A: A.text('世界') },
    gen: (n, g) => `tl.lengthOf(${g.e(n.a)})`, run: (n, c) => c.str(n.a).length },
  { op: 'Contains', id: 'op_contains', kind: 'boolean', category: 'operators', label: '(A) 包含 (B) ?',
    args: { A: A.text('苹果'), B: A.text('果') },
    gen: (n, g) => `tl.contains(${g.e(n.a)}, ${g.e(n.b)})`, run: (n, c) => c.str(n.a).includes(c.str(n.b)) },

  /* 侦测 */
  { op: 'Touching', id: 'sen_touching', kind: 'boolean', category: 'sensing', label: '[A] 碰到 [B] ?',
    args: { A: A.ent(), B: A.ent('地面') },
    gen: (n, g) => `tl.touching(ctx, ${g.ent(n.a)}, ${g.ent(n.b)})`,
    run: (n, c) => c.rt.touching(c.ent(n.a), c.ent(n.b)) },
  { op: 'DistanceTo', id: 'sen_distance', kind: 'reporter', category: 'sensing', label: '[A] 到 [B] 的距离',
    args: { A: A.ent(), B: A.ent('敌人') },
    gen: (n, g) => `tl.distanceTo(${g.ent(n.a)}, ${g.ent(n.b)})`,
    run: (n, c) => { const a = c.ent(n.a); const b = c.ent(n.b); return Math.round(Math.hypot(a.x - b.x, a.y - b.y)); } },
  { op: 'KeyDown', id: 'sen_key', kind: 'boolean', category: 'sensing', label: '按键 [KEY] 被按下?',
    args: { KEY: A.key('Space') },
    gen: (n, g) => `tl.keyDown(${g.q(n.key)})`, run: (n, c) => c.rt.keyDownCheck(n.key) },
  { op: 'MouseDown', id: 'sen_mousedown', kind: 'boolean', category: 'sensing', label: '鼠标被按下?',
    args: {}, gen: () => 'tl.mouseDown()', run: (n, c) => !!c.input.mouseDown },
  { op: 'MouseX', id: 'sen_mousex', kind: 'reporter', category: 'sensing', label: '鼠标的 x 坐标',
    args: {}, gen: () => 'tl.mouseX()', run: (n, c) => c.input.mouseX },
  { op: 'MouseY', id: 'sen_mousey', kind: 'reporter', category: 'sensing', label: '鼠标的 y 坐标',
    args: {}, gen: () => 'tl.mouseY()', run: (n, c) => c.input.mouseY },
  { op: 'Timer', id: 'sen_timer', kind: 'reporter', category: 'sensing', label: '计时器',
    args: {}, gen: () => 'tl.timer()', run: (n, c) => c.rt.timer() },
  { op: 'GetProp', id: 'sen_prop', kind: 'reporter', category: 'sensing', label: '[ENTITY] 的 [PROP]',
    args: { ENTITY: A.ent(), PROP: A.sel(PROP_OPTIONS, 'x', 82) },
    gen: (n, g) => `${g.ent(n.entity)}.${n.prop}`,
    run: (n, c) => c.ent(n.entity)[n.prop] },

  /* 变量 */
  { op: 'VarRef', id: 'var_get', kind: 'reporter', category: 'variables', label: '[NAME]',
    args: { NAME: A.vari('分数') },
    gen: (n, g) => g.varRef(n.name), run: (n, c) => c.getVar(n.name) },
  { op: 'ParamRef', id: 'param_get', kind: 'reporter', category: 'sensing', label: '参数 [NAME]',
    args: { NAME: A.sel(PARAM_OPTIONS, 'delta', 150) },
    gen: (n, g) => ({ frame: 'ctx.frame', delta: 'ctx.delta', fixedDelta: 'ctx.fixedDelta', value: 'ctx.value' }[n.name] || 'ctx.delta'),
    run: (n, c) => ({ frame: c.frame, delta: c.delta, fixedDelta: c.fixedDelta, value: c.value }[n.name] ?? 0) },

  /* 列表 */
  { op: 'ListItem', id: 'list_item', kind: 'reporter', category: 'lists', label: '[LIST] 的第 (I) 项',
    args: { LIST: A.list('存档点'), I: A.num(1) },
    gen: (n, g) => `${g.listRef(n.list)}[${g.e(n.i)} - 1]`,
    run: (n, c) => { const l = c.getList(n.list); const v = l[c.num(n.i) - 1]; return v === undefined ? '' : v; } },
  { op: 'ListLength', id: 'list_length', kind: 'reporter', category: 'lists', label: '[LIST] 的长度',
    args: { LIST: A.list('存档点') },
    gen: (n, g) => `${g.listRef(n.list)}.length`, run: (n, c) => c.getList(n.list).length },
  { op: 'ListIndex', id: 'list_index', kind: 'reporter', category: 'lists', label: '[LIST] 中第一个 (V) 的位置',
    args: { LIST: A.list('存档点'), V: A.num(0) },
    gen: (n, g) => `tl.listIndex(${g.q(n.list)}, ${g.e(n.v)})`,
    run: (n, c) => { const l = c.getList(n.list); const i = l.findIndex((x) => String(x) === String(c.num(n.v))); return i < 0 ? 0 : i + 1; } },
  { op: 'ListContains', id: 'list_contains', kind: 'boolean', category: 'lists', label: '[LIST] 包含 (V) ?',
    args: { LIST: A.list('存档点'), V: A.num(0) },
    gen: (n, g) => `tl.listContains(${g.q(n.list)}, ${g.e(n.v)})`,
    run: (n, c) => c.getList(n.list).some((x) => String(x) === String(c.num(n.v))) },

  /* 游戏专用 */
  { op: 'CurrentScene', id: 'game_scene', kind: 'reporter', category: 'game', label: '当前场景名',
    args: {}, gen: () => 'tl.sceneName()', run: (n, c) => c.rt.state.scene },
  { op: 'CloneCount', id: 'game_clones', kind: 'reporter', category: 'game', label: '克隆体数量',
    args: {}, gen: () => 'tl.cloneCount()', run: (n, c) => c.rt.cloneCount() },

  /* 代码积木 */
  { op: 'CodeBlock', id: 'code_expr', kind: 'reporter', category: 'myblocks', label: '⚙ 代码表达式 (CODE)',
    args: { CODE: A.code('self.x + 10') },
    gen: (n) => `(${n.code || '0'})`,
    run: (n, c) => c.rt.evalCode(String(n.code || '0'), c, true) }
];

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */
export const ALL_DEFS = [...HAT_DEFS, ...STATEMENT_DEFS, ...EXPR_DEFS];

/** opName -> 定义（同一 op 可有多条定义，用 byId 索引更精确） */
export const DEF_BY_OP = {};
export const DEF_BY_ID = {};
for (const d of ALL_DEFS) {
  (DEF_BY_OP[d.op] = DEF_BY_OP[d.op] || []).push(d);
  DEF_BY_ID[d.id] = d;
}

/** 给定一个 IR 节点，找出它的积木定义（靠 op + 形状 + fixOp 区分同 op 家族） */
export function defForNode(node) {
  const list = DEF_BY_OP[node.type];
  if (!list) return null;
  if (list.length === 1) return list[0];
  if (node.op != null && node.op !== '' && typeof node.op === 'string') {
    const hit = list.find((d) => d.fixOp === node.op);
    if (hit) return hit;
  }
  if (node.prop != null && typeof node.prop === 'string') {
    const hit = list.find((d) => d.args && d.args.PROP && d.args.PROP.kind === 'select' && !d.fixOp);
    if (hit) return hit;
  }
  return list[0];
}

/** 形状分类：决定几何生成走哪条路 */
export function shapeOf(def) {
  if (!def) return 'statement';
  if (def.kind === 'hat') return 'hat';
  if (def.kind === 'cblock') return 'cblock';
  if (def.kind === 'cap') return 'cap';
  if (def.kind === 'boolean') return 'boolean';
  if (def.kind === 'reporter') return 'reporter';
  return 'statement';
}

/* ------------------------------------------------------------------ */
/* 宏（合成积木）的「定义」—— 让宏调用拥有和内置积木完全一样的地位          */
/* ------------------------------------------------------------------ */
export function macroDefOf(node, project) {
  const macro = project && project.macros && project.macros[node.macroId];
  if (!macro) {
    return {
      op: node.type, id: 'missing_macro_' + node.macroId, kind: 'statement',
      category: 'myblocks', label: '⚠ 缺失的积木', args: {}, isBroken: true
    };
  }
  const isExpr = macro.kind === 'expression';
  const args = {};
  for (const p of macro.params || []) args[p.name] = { slot: 'input', kind: p.type || 'number' };
  return {
    op: node.type,
    id: 'macro:' + macro.id,
    kind: macro.kind === 'event' ? 'hat' : (isExpr ? 'reporter' : 'statement'),
    category: macro.category,
    color: macro.color,
    icon: macro.icon,
    label: macro.display || macro.name,
    args,
    macroParams: macro.params || [],
    macroName: macro.name,
    isMacro: true
  };
}

/** 兜底积木：遇到无法识别的节点时不要让渲染器 / 生成器崩掉 */
export function unknownDef(node) {
  const isExpr = ['Number', 'String', 'Bool', 'VarRef', 'ListRef', 'ParamRef', 'BinaryOp', 'Compare',
    'Logic', 'Not', 'Neg', 'Random', 'MathOp', 'Join', 'LetterOf', 'LengthOf', 'Contains', 'ListItem',
    'ListLength', 'ListIndex', 'ListContains', 'Touching', 'DistanceTo', 'KeyDown', 'MouseDown',
    'MouseX', 'MouseY', 'Timer', 'GetProp'].includes(node.type);
  return {
    op: node.type, id: 'unknown_' + node.type, kind: isExpr ? 'reporter' : 'statement',
    category: 'myblocks', label: '⚠ 未知积木 ' + node.type, args: {}, isBroken: true
  };
}

export function defOf(node, project) {
  if (node.type === 'MacroCall' || node.type === 'MacroCallStatement') return macroDefOf(node, project || {});
  return defForNode(node) || unknownDef(node);
}

/* ------------------------------------------------------------------ */
/* 由定义实例化一个积木节点                                             */
/* ------------------------------------------------------------------ */
export function instantiate(def, overrides = {}) {
  const node = { type: def.op };
  if (def.fixOp) node.op = def.fixOp;
  for (const [name, spec] of Object.entries(def.args || {})) {
    const key = name.toLowerCase();
    switch (spec.slot) {
      case 'field': node[key] = spec.def; break;
      case 'input': node[key] = spec.def(); break;
      case 'bool': node[key] = spec.def(); break;
      case 'sub': node[key] = seq(); break;
      default: break;
    }
  }
  Object.assign(node, overrides);
  return node;
}

/** 分类 → 颜色（用户分类可覆盖内置分类） */
export function categoryOf(def, project) {
  const id = def.category;
  if (project && project.categories && project.categories[id]) return project.categories[id];
  return null;
}

/** 一个积木定义在给定项目下的实际颜色 */
export function colorOfDef(def, project) {
  if (!def) return '#87909F';
  if (def.color) return def.color;
  const cat = project && project.categories && project.categories[def.category];
  if (cat && cat.color) return cat.color;
  return null;
}
