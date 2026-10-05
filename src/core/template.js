/**
 * Tanloom Engine — 内置示例项目
 * ================================================================
 * 打开就有一个能跑的平台跳跃小游戏，同时把策划案里的关键能力都用上了：
 *   · 每帧广播订阅（update / late_update）
 *   · 按键、碰撞、自定义广播 走同一条广播总线
 *   · (速度) × (delta) 的帧率无关写法
 *   · 合成积木「受伤」被脚本调用，且出现在选择区的自定义分类里
 *   · 嵌套合成：立方 = 平方 × y
 */

import { E, S, seq, uid } from './ir.js';

const n = (v) => E.num(v);
const s = (v) => E.str(v);
const bar = (v) => E.varRef(v);
const self = '$self';

export function createTemplateProject() {
  const catCombat = {
    id: 'combat', name: '战斗系统', color: '#E53935', icon: '⚔',
    order: 105, scope: 'project', builtin: false, createdBy: 'user', collapsed: false
  };

  /* ---------------- 合成积木 ---------------- */
  const macroPow2 = {
    type: 'MacroDef', id: 'macro_pow2', name: '平方', display: '(x)^2',
    kind: 'expression', category: 'operators', color: '#59C059', icon: '∑',
    scope: 'project', codegen: 'inline', version: 1, callCount: 0,
    params: [{ name: 'x', type: 'number' }],
    body: { type: 'BinaryOp', op: '*', left: E.paramRef('x'), right: E.paramRef('x') }
  };

  const macroCube = {
    type: 'MacroDef', id: 'macro_cube', name: '立方', display: '(y)^3',
    kind: 'expression', category: 'operators', color: '#59C059', icon: '∑',
    scope: 'project', codegen: 'inline', version: 1, callCount: 0,
    params: [{ name: 'y', type: 'number' }],
    body: {
      type: 'BinaryOp', op: '*',
      left: { type: 'MacroCall', macroId: 'macro_pow2', args: [E.paramRef('y')] },
      right: E.paramRef('y')
    }
  };

  const macroHurt = {
    type: 'MacroDef', id: 'macro_hurt', name: '受伤', display: '受伤 (伤害)',
    kind: 'statement', category: 'combat', color: '#E53935', icon: '⚔',
    scope: 'project', codegen: 'function', version: 1, callCount: 0,
    params: [{ name: '伤害', type: 'number' }],
    // 合成积木只负责「视听反馈」，数值扣减交给订阅「玩家受伤」的脚本 —— 各司其职
    body: seq([
      { type: 'EmitParticles', entity: self, n: E.bin('*', n(6), E.paramRef('伤害')), color: '#FF3B30' },
      S.playSound('hurt'),
      { type: 'ShakeScreen', n: E.bin('*', n(6), E.paramRef('伤害')) }
    ])
  };

  /* ---------------- 实体 ---------------- */
  const stage = {
    id: uid('ent'), name: '舞台', kind: 'stage', parent: null,
    visible: false, x: 0, y: 0, dir: 90, size: 100, opacity: 100, rotationStyle: 'none',
    render: { shape: 'box', color: '#000000', stroke: '#000000', width: 0, height: 0, label: '' },
    tags: [], solid: false, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1 },
    scripts: [
      {
        id: uid('script'), hat: { type: 'OnStart' },
        body: seq([
          S.setVar('分数', n(0)),
          S.setVar('生命', n(3)),
          S.setVar('速度', n(240)),
          S.setVar('重力', n(1400)),
          S.playSound('beep')
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: 'update' },
        body: seq([
          S.code('// 代码积木：直接写 TS，和积木共存\nvars["帧数"] = Math.round(ctx.frame % 1000);'),
          { type: 'UISetText', text: E.join(E.join(s('分数 '), bar('分数')), E.join(s('   生命 '), bar('生命'))) }
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: '玩家受伤' },
        body: seq([
          S.changeVar('生命', E.neg(E.paramRef('value'))),
          S.if(E.cmp('<', bar('生命'), n(1)), seq([S.broadcast('游戏结束', n(0))]))
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: '游戏结束' },
        body: seq([
          { type: 'UISetText', text: s('游戏结束 · 按 ▶ 重新开始') },
          { type: 'StopScripts', target: 'all' }
        ])
      }
    ]
  };

  const player = {
    id: uid('ent'), name: '玩家', kind: 'sprite', parent: null,
    visible: true, x: -170, y: 60, dir: 90, size: 100, opacity: 100, rotationStyle: 'left-right',
    render: { shape: 'capsule', color: '#4C97FF', stroke: '#3373CC', width: 42, height: 46, label: '' },
    tags: ['实体', '玩家'], solid: false,
    physics: { gravity: 1500, vx: 0, vy: 0, bounce: 0, drag: 1, enabled: true },
    scripts: [
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: 'update' },
        body: seq([
          { type: 'SetProp', entity: self, prop: 'vx', value: n(0) },
          S.if(
            E.keyDown('ArrowLeft'),
            seq([{ type: 'SetProp', entity: self, prop: 'vx', value: E.neg(bar('速度')) },
            { type: 'FaceDirection', entity: self, dir: n(-90) }])
          ),
          S.if(
            E.keyDown('ArrowRight'),
            seq([{ type: 'SetProp', entity: self, prop: 'vx', value: bar('速度') },
            { type: 'FaceDirection', entity: self, dir: n(90) }])
          ),
          S.if(
            E.logic('and', E.keyDown('Space'), E.cmp('<', E.getProp(self, 'vy'), n(1))),
            // 跳跃力度用合成积木「平方」算出来：9 × 48 = 432
            seq([S.jump(self, E.bin('*', E.macro('macro_pow2', [n(3)]), n(48)))])
          ),
          S.if(E.cmp('<', E.getProp(self, 'y'), n(-260)), seq([
            S.setPosition(self, n(-170), n(60)),
            { type: 'SetProp', entity: self, prop: 'vy', value: n(0) }
          ]))
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: 'late_update' },
        body: seq([{ type: 'CameraFollow', entity: self, k: n(0.1) }])
      },
      {
        id: uid('script'), hat: { type: 'OnCollision', a: '玩家', b: '敌人' },
        body: seq([
          // 调用自定义分类「战斗系统」里的合成积木
          S.macroCall('macro_hurt', [n(1)]),
          S.broadcast('玩家受伤', n(1))
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: '拾取金币' },
        body: seq([
          S.changeVar('分数', E.paramRef('value')),
          S.say(self, s('+1'), n(0.6))
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnKey', key: 'KeyK' },
        body: seq([
          S.clone(self)
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnClone' },
        body: seq([
          { type: 'SetProp', entity: self, prop: 'vx', value: n(-200) },
          S.wait(n(0.6)),
          { type: 'DeleteClone' }
        ])
      }
    ]
  };

  const ground = {
    id: uid('ent'), name: '地面', kind: 'sprite', parent: null,
    visible: true, x: 0, y: -170, dir: 90, size: 100, opacity: 100, rotationStyle: 'none',
    render: { shape: 'box', color: '#575E75', stroke: '#3F4553', width: 520, height: 40, label: '' },
    tags: ['实体', '地面'], solid: true, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1 },
    scripts: []
  };

  const platform = {
    id: uid('ent'), name: '平台', kind: 'sprite', parent: null,
    visible: true, x: 150, y: -70, dir: 90, size: 100, opacity: 100, rotationStyle: 'none',
    render: { shape: 'box', color: '#575E75', stroke: '#3F4553', width: 130, height: 22, label: '' },
    tags: ['实体', '地面'], solid: true, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1 },
    scripts: []
  };

  const coin = {
    id: uid('ent'), name: '金币', kind: 'sprite', parent: null,
    visible: true, x: 150, y: -20, dir: 90, size: 100, opacity: 100, rotationStyle: 'all',
    render: { shape: 'diamond', color: '#FFD500', stroke: '#C9A300', width: 24, height: 24, label: '' },
    tags: ['实体', '金币'], solid: false, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1 },
    scripts: [
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: 'update' },
        // 旋转用 delta 驱动：与帧率无关
        body: seq([
          { type: 'Rotate', entity: self, deg: E.bin('*', bar('速度'), E.paramRef('delta')) }
        ])
      },
      {
        id: uid('script'), hat: { type: 'OnCollision', a: '金币', b: '玩家' },
        body: seq([S.broadcast('拾取金币', n(1))])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: '拾取金币' },
        body: seq([
          S.playSound('coin'),
          { type: 'EmitParticles', entity: self, n: n(16), color: '#FFD500' },
          S.hide(self)
        ])
      }
    ]
  };

  const enemy = {
    id: uid('ent'), name: '敌人', kind: 'sprite', parent: null,
    visible: true, x: 120, y: -130, dir: 90, size: 100, opacity: 100, rotationStyle: 'left-right',
    render: { shape: 'triangle', color: '#FF6680', stroke: '#CC3355', width: 40, height: 36, label: '' },
    tags: ['实体', '敌人'], solid: false, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1, enabled: false },
    scripts: [
      {
        id: uid('script'), hat: { type: 'OnStart' },
        body: seq([{ type: 'SetProp', entity: self, prop: 'vx', value: n(110) }])
      },
      {
        id: uid('script'), hat: { type: 'OnBroadcast', channel: 'update' },
        // 这一行就是策划案 §14.1 的经典写法：位置 += 速度 × delta
        body: seq([
          S.moveBy(self, E.bin('*', E.getProp(self, 'vx'), E.paramRef('delta')), n(0)),
          S.if(E.cmp('>', E.getProp(self, 'x'), n(205)), seq([
            { type: 'SetProp', entity: self, prop: 'vx', value: n(-110) },
            { type: 'FaceDirection', entity: self, dir: n(-90) }
          ])),
          S.if(E.cmp('<', E.getProp(self, 'x'), n(-205)), seq([
            { type: 'SetProp', entity: self, prop: 'vx', value: n(110) },
            { type: 'FaceDirection', entity: self, dir: n(90) }
          ]))
        ])
      }
    ]
  };

  return {
    irVersion: 1,
    id: uid('proj'),
    name: '示例 · 平台跳跃',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      stageWidth: 480, stageHeight: 360, tickRate: 60,
      fixedDelta: 1 / 60, gravity: 980, maxBroadcastDepth: 32
    },
    scene: { background: '#0d1017', grid: true, sceneName: '场景 1' },
    categories: { combat: catCombat },
    channels: {
      玩家受伤: { name: '玩家受伤', builtin: false, order: 100, doc: '玩家被敌人碰到' },
      拾取金币: { name: '拾取金币', builtin: false, order: 100, doc: '金币被拾取' },
      游戏结束: { name: '游戏结束', builtin: false, order: 100, doc: '生命归零' }
    },
    macros: {
      macro_pow2: macroPow2,
      macro_cube: macroCube,
      macro_hurt: macroHurt
    },
    entities: [stage, player, ground, platform, coin, enemy],
    variables: { 分数: 0, 生命: 3, 速度: 240, 重力: 1500, 帧数: 0 },
    lists: { 存档点: [] },
    monitors: {}
  };
}
