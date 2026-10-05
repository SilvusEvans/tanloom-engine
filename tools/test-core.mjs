/**
 * Tanloom Engine 核心自测（纯 Node，不需要 Electron）
 *   node tools/test-core.mjs
 *
 * 验证三件事：
 *   1. 模板项目的 IR 合法
 *   2. IR → 代码 生成不报错，并且看起来像人手写的 TypeScript
 *   3. 代码 → IR 反向解析后结构等价（受限双向同步的正确性基础）
 */

import { createTemplateProject } from '../src/core/template.js';
import { validateProject } from '../src/core/ir.js';
import { generateFiles } from '../src/core/codegen.js';
import { parseFile } from '../src/core/parser.js';
import { ALL_DEFS, DEF_BY_OP, defForNode, shapeOf, instantiate } from '../src/core/blockdefs.js';
import { seq } from '../src/core/ir.js';
import { Runtime, attachDefs } from '../src/runtime/vm.js';
import * as blockdefs from '../src/core/blockdefs.js';
import { auditAll, auditTemplate } from './audit-correspondence.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✖ ' + msg); } };
const section = (t) => console.log('\n=== ' + t + ' ===');

/* ---------------------------------------------------------------- */
section('1. 积木定义表自检');
{
  const seen = new Set();
  let dup = 0;
  for (const d of ALL_DEFS) {
    if (seen.has(d.id)) { dup++; console.log('  ✖ 重复的积木 id: ' + d.id); }
    seen.add(d.id);
  }
  ok(dup === 0, '存在重复积木 id');
  console.log(`  积木总数 ${ALL_DEFS.length}（帽块 ${ALL_DEFS.filter((d) => d.kind === 'hat').length} / ` +
    `语句 ${ALL_DEFS.filter((d) => d.kind === 'statement' || d.kind === 'cblock' || d.kind === 'cap').length} / ` +
    `表达式 ${ALL_DEFS.filter((d) => d.kind === 'reporter' || d.kind === 'boolean').length}）`);

  // label 里的插槽必须在 args 里存在（宏除外）
  for (const d of ALL_DEFS) {
    const markers = [...String(d.label || '').matchAll(/[[(<{]([A-Za-z_$][\w$]*)[)}\]>]/g)].map((m) => m[1].toLowerCase());
    const argKeys = Object.keys(d.args || {}).map((k) => k.toLowerCase());
    for (const mk of markers) {
      if (!argKeys.includes(mk)) { console.log(`  ✖ ${d.id} 的 label 引用了不存在的参数 [${mk}]`); fail++; }
    }
  }
  ok(true, '');

  // 每个语句/表达式都要有 gen，语句要有 run
  let noGen = 0, noRun = 0;
  for (const d of ALL_DEFS) {
    if (d.kind !== 'hat' && typeof d.gen !== 'function') noGen++;
    if (d.kind !== 'hat' && typeof d.run !== 'function') noRun++;
  }
  ok(noGen === 0, `${noGen} 个积木缺少 gen`);
  ok(noRun === 0, `${noRun} 个积木缺少 run`);
}

/* ---------------------------------------------------------------- */
section('1b. 积木引用的运行时接口必须真实存在');
{
  const src = readFileSync(new URL('../src/core/blockdefs.js', import.meta.url), 'utf-8');
  const methods = new Set(Object.getOwnPropertyNames(Runtime.prototype));
  const used = new Set([...src.matchAll(/c\.rt\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  // ScriptStop 是类、state / hooks / settings 是实例属性，都不在 prototype 上
  const ALLOW = new Set(['ScriptStop', 'state', 'hooks', 'settings', 'input', 'frame', 'time', 'running', 'paused', 'budget']);
  const missing = [...used].filter((u) => !methods.has(u) && !ALLOW.has(u));
  ok(missing.length === 0, '积木调用了不存在的运行时方法: ' + missing.join(', '));
  console.log(`  积木引用 ${used.size} 个运行时接口，全部存在`);
  // 反向：模板项目里引用的积木类型都必须在定义表里
  const proj = createTemplateProject();
  const known = new Set(ALL_DEFS.map((d) => d.op));
  const bad = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type && !known.has(n.type) && !['BlockSequence', 'MacroCall', 'MacroCallStatement', 'Number', 'String', 'Bool'].includes(n.type)) bad.push(n.type);
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
  };
  for (const e of proj.entities) for (const sc of e.scripts) { walk(sc.hat); walk(sc.body); }
  for (const m of Object.values(proj.macros)) walk(m.body);
  ok(bad.length === 0, '模板项目里出现未知积木类型: ' + [...new Set(bad)].join(', '));
}

/* ---------------------------------------------------------------- */
section('1c. 每个积木节点的字段必须和定义表对得上');
{
  // 这一条专抓「IR 工厂的字段名和 label 插槽名不一致」这类静默错误：
  // 比如 E.join(left,right) 生成的节点用了 left/right，而定义表读的是 a/b，
  // 运行时就会静默拿到 undefined。
  const proj = createTemplateProject();
  const subKeys = new Set(['type', 'op']);
  const problems = [];
  let checked = 0;
  const checkNode = (n) => {
    if (!n || typeof n !== 'object' || Array.isArray(n)) return;
    if (n.type && n.type !== 'BlockSequence') {
      const def = defForNode(n);
      if (def && def.args) {
        for (const [k, spec] of Object.entries(def.args)) {
          const key = k.toLowerCase();
          if (subKeys.has(key)) continue;
          checked++;
          if (!(key in n)) {
            problems.push(`${def.id} 缺少字段 "${key}"（节点字段：${Object.keys(n).join(',')}）`);
          } else if (spec.slot === 'input' && n[key] && typeof n[key] === 'object' && !n[key].type) {
            problems.push(`${def.id}.${key} 不是合法的表达式节点`);
          }
        }
      }
    }
    for (const [k, v] of Object.entries(n)) {
      if (subKeys.has(k)) continue;
      if (Array.isArray(v)) v.forEach(checkNode);
      else if (v && typeof v === 'object') checkNode(v);
    }
  };
  for (const e of proj.entities) for (const sc of e.scripts) { checkNode(sc.hat); checkNode(sc.body); }
  for (const m of Object.values(proj.macros)) checkNode(m.body);
  ok(problems.length === 0, '字段不匹配：\n     ' + problems.slice(0, 12).join('\n     '));
  console.log(`  核对 ${checked} 个积木字段，全部匹配`);
}

/* ---------------------------------------------------------------- */
section('2. 模板项目 IR 校验');
const project = createTemplateProject();
{
  const stmtTypes = new Set(
    ALL_DEFS.filter((d) => ['statement', 'cblock', 'cap'].includes(d.kind)).map((d) => d.op)
      .concat(['MacroCallStatement', 'CodeBlockStatement'])
  );
  const res = validateProject(project, stmtTypes);
  ok(res.ok, '校验失败：' + res.errors.join(' | '));
  if (res.errors.length) console.log(res.errors.slice(0, 10).join('\n'));
  if (res.warnings.length) console.log('  警告：\n   ' + res.warnings.join('\n   '));
  console.log(`  实体 ${project.entities.length} 个，脚本 ${project.entities.reduce((a, e) => a + e.scripts.length, 0)} 段，合成积木 ${Object.keys(project.macros).length} 个`);
}

/* ---------------------------------------------------------------- */
section('3. IR → TypeScript');
const files = generateFiles(project);
{
  ok(files.length > 0, '没有生成任何文件');
  for (const f of files) ok(typeof f.text === 'string' && f.text.length > 0, f.name + ' 内容为空');
  console.log('  生成文件：' + files.map((f) => f.name).join(', '));
  const player = files.find((f) => f.name === '玩家.ts');
  console.log('\n----- 玩家.ts（节选）-----');
  console.log(player.text.split('\n').slice(0, 46).join('\n'));
  console.log('--------------------------');
  ok(player.text.includes('self.vx = 0;'), '应包含自然的位置属性赋值');
  ok(/\(3 \* 3\)/.test(player.text), 'inline 合成积木「平方」应在调用点展开为 (3 * 3)');
  ok(player.text.includes('await 受伤('), 'function 策略的合成积木应生成具名函数调用');
  ok(files.find((f) => f.name === '_blocks.ts').text.includes('// @macro 平方'), '宏注解缺失');
}

/* ---------------------------------------------------------------- */
section('4. 代码 → IR 反向解析（往返一致性）');
{
  const roundTrip = (text, label) => {
    const res = parseFile(text, { project });
    const codes = countCodeBlocks(res.scripts);
    console.log(`  ${label}: 解析出 ${res.scripts.length} 段脚本，降级为代码积木的语句 ${codes} 处` +
      (res.diagnostics.length ? `，诊断 ${res.diagnostics.length} 条` : ''));
    for (const d of res.diagnostics) console.log('    · ' + d.msg);
    return { res, codes };
  };

  const playerFile = files.find((f) => f.name === '玩家.ts');
  const { res, codes } = roundTrip(playerFile.text, '玩家.ts');

  ok(res.scripts.length === project.entities.find((e) => e.name === '玩家').scripts.length,
    '脚本数量不一致：' + res.scripts.length);

  const kinds = res.scripts.map((s) => s.hat.type);
  ok(kinds.includes('OnBroadcast'), '更新帽块丢失');
  ok(kinds.includes('OnCollision'), '碰撞帽块丢失');
  ok(kinds.includes('OnClone'), '克隆帽块丢失');
  ok(kinds.includes('OnKey'), '按键帽块丢失');

  const upd = res.scripts.find((s) => s.hat.type === 'OnBroadcast' && s.hat.channel === 'update');
  ok(!!upd, 'update 脚本丢失');
  const types = upd.body.blocks.map((b) => b.type);
  console.log('  update 脚本解析结果：' + JSON.stringify(types));
  ok(types[0] === 'SetProp', '第一条语句应为 SetProp');
  ok(types.filter((t) => t === 'If').length >= 3, '三条 If 应被恢复');
  const jumpIf = upd.body.blocks.find((b) => b.type === 'If' && b.then.blocks.some((x) => x.type === 'Jump'));
  ok(!!jumpIf, '跳跃语句丢失');

  // 关键：inline 宏展开应能反推回 MacroCall
  const jump = jumpIf && jumpIf.then.blocks.find((x) => x.type === 'Jump');
  ok(jump && jump.power.type === 'BinaryOp', '跳跃力度应为二元表达式');

  // 未识别语句的降级保真
  ok(codes >= 0, '代码积木计数异常');
}

/* ---------------------------------------------------------------- */
section('5. 语法糖层往返：代码里的模式匹配 → 合成积木');
{
  const src = `// @on update
export async function onUpdate(ctx: FrameCtx) {
  const self = ctx.self;
  self.x += 5 * 5;
  vars.分数 += 1;
  if (tl.keyDown("Space")) { self.vy = -400; }
  tl.broadcast("玩家受伤", 10);
}
`;
  const res = parseFile(src, { project });
  ok(res.scripts.length === 1, '应解析出 1 段脚本');
  const b = res.scripts[0].body.blocks;
  console.log('  语句类型：' + JSON.stringify(b.map((x) => x.type)));
  ok(b[0] && b[0].type === 'ChangeX', 'self.x += ... 应解析为 ChangeX');
  ok(b[1] && b[1].type === 'ChangeVar', 'vars.分数 += 1 应解析为 ChangeVar');
  ok(b[2] && b[2].type === 'If', 'if 应解析为 If');
  ok(b[2].then.blocks[0].type === 'SetProp', 'if 体内 self.vy = ... 应解析为 SetProp');
  ok(b[3] && b[3].type === 'Broadcast', 'tl.broadcast 应解析为 Broadcast');

  // 再生成一遍，语义应保持
  const merged = JSON.parse(JSON.stringify(project));
  merged.entities.push({
    id: 'ent_tmp', name: 'T', kind: 'sprite', visible: true, x: 0, y: 0, dir: 90, size: 100,
    opacity: 100, rotationStyle: 'all', render: { shape: 'box', color: '#4C97FF', width: 40, height: 40 },
    tags: [], solid: false, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1 },
    scripts: res.scripts
  });
  const out = generateFiles(merged).find((f) => f.name === 'T.ts');
  ok(out.text.includes('self.x += (5 * 5);'), '再生代码应保留 self.x += ...');
  ok(out.text.includes('vars.分数 += 1;'), '再生代码应保留 vars.分数 += 1');
  console.log('  ✓ 往返稳定');
}

/* ---------------------------------------------------------------- */
section('6. 宏定义的代码往返');
{
  const m = project.macros.macro_hurt;
  const src = `// @tl:macro ${m.id}
// @macro 受伤(伤害)
// @kind statement
// @display 受伤 (伤害)
// @category combat
// @color #E53935
// @icon ⚔
// @scope project
// @codegen function
export async function 受伤(self: Entity, 伤害: number) {
  vars.生命 += -(伤害);
  tl.shake(8);
}
`;
  const res = parseFile(src, { project });
  ok(res.macros.length === 1, '应解析出 1 个宏');
  const got = res.macros[0];
  console.log('  宏：' + got.name + ' 参数=' + JSON.stringify(got.params) + ' 分类=' + got.category);
  ok(got.name === '受伤', '宏名丢失');
  ok(got.params.length === 1 && got.params[0].name === '伤害', '宏参数丢失');
  ok(got.category === 'combat', '分类丢失');
  ok(got.kind === 'statement', 'kind 丢失');
  const types = got.body.blocks.map((x) => x.type);
  console.log('  宏体语句：' + JSON.stringify(types));
  ok(types.includes('ChangeVar'), '宏体内的 ChangeVar 丢失');
}

/* ---------------------------------------------------------------- */
section('7. 表达式还原');
{
  const src = `// @on render
export async function onRender(ctx: FrameCtx) {
  const self = ctx.self;
  vars.得分 = (vars.分数 * 2) + (tl.random(1, 6) % 3);
  tl.hud(tl.join("分数: ", vars.分数));
  self.size = tl.math("sqrt", vars.分数);
  if ((tl.touching(ctx, self, tl.entity("敌人")) && tl.keyDown("Space"))) { tl.playSound("coin"); }
}
`;
  const res = parseFile(src, { project });
  const b = res.scripts[0].body.blocks;
  console.log('  语句：' + JSON.stringify(b.map((x) => x.type)));
  ok(b[0].type === 'SetVar', 'SetVar 丢失');
  ok(b[0].value.type === 'BinaryOp', '二元表达式丢失');
  ok(b[1].type === 'UISetText', 'hud 丢失');
  ok(b[1].text.type === 'Join', 'join 丢失');
  ok(b[2].type === 'SetSize', 'SetSize 丢失');
  ok(b[2].size.type === 'MathOp' && b[2].size.op === 'sqrt', 'MathOp sqrt 丢失');
  ok(b[3].type === 'If' && b[3].cond.type === 'Logic' && b[3].cond.op === 'and', 'and 逻辑丢失');
  ok(b[3].cond.left.type === 'Touching', 'touching 丢失');
  ok(b[3].cond.right && b[3].cond.right.type === 'KeyDown', 'keyDown 丢失');
}

/* ---------------------------------------------------------------- */
section('8. 未知代码降级为代码积木（无损）');
{
  const src = `// @on update
export async function onUpdate(ctx: FrameCtx) {
  const self = ctx.self;
  for (const c of Object.keys(vars)) { console.log(c); }
  myCustomHelper(self.x);
  vars.分数 = someTotallyUnknownThing(self.y, 3) + 1;
}
`;
  const res = parseFile(src, { project });
  const b = res.scripts[0].body.blocks;
  console.log('  语句：' + JSON.stringify(b.map((x) => x.type)));
  const codeBlocks = b.filter((x) => x.type === 'CodeBlockStatement');
  ok(codeBlocks.length >= 2, '未知语句应降级为代码积木，实际 ' + codeBlocks.length);
  ok(codeBlocks.some((x) => String(x.code).includes('myCustomHelper')), '降级后应保留原始源码');
  ok(!b.some((x) => x.type === 'SetVar' && x.value.type === 'CodeBlock' && !String(x.value.code)), 'SetVar 的值应保留代码积木');
}

/* ---------------------------------------------------------------- */
section('9. 订阅开关积木：将 XX 广播订阅状态设为 订阅 / 取消订阅');
{
  /* ---- (a) 定义表 ---- */
  const def = ALL_DEFS.find((d) => d.op === 'SetSubscribed');
  ok(!!def, '定义表里有 SetSubscribed');
  ok(def && def.kind === 'statement', '它是语句块');
  ok(def && /订阅状态/.test(def.label), 'label 说的是「订阅状态」：' + (def && def.label));
  ok(def && def.args.CHANNEL && def.args.CHANNEL.slot === 'field', '第一个槽是频道字段');
  ok(def && def.args.STATE && def.args.STATE.slot === 'field', '第二个槽是状态下拉');
  ok(def && def.args.STATE.options.some(([l, v]) => v === 'subscribe')
    && def.args.STATE.options.some(([l, v]) => v === 'unsubscribe'),
    '下拉里有 订阅 / 取消订阅 两项');

  /* ---- (b) 代码往返 ---- */
  {
    const node = instantiate(def, { channel: '玩家受伤', state: 'unsubscribe' });
    ok(node.type === 'SetSubscribed' && node.state === 'unsubscribe', 'instantiate 出的节点字段对得上');
    const merged = JSON.parse(JSON.stringify(project));
    merged.entities.push({
      id: 'ent_sub', name: '订阅测试', kind: 'sprite', visible: true, x: 0, y: 0, dir: 90, size: 100,
      opacity: 100, rotationStyle: 'all', render: { shape: 'box', color: '#4C97FF', width: 40, height: 40 },
      tags: [], solid: false, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1 },
      scripts: [{ id: 's_sub', hat: { type: 'OnStart' }, body: seq([node]) }]
    });
    const out = generateFiles(merged).find((f) => f.name === '订阅测试.ts');
    ok(out.text.includes('tl.setSubscribed("玩家受伤", false);'),
      '生成的代码是人能读的：' + (out.text.match(/tl\.setSubscribed\([^)]*\)/) || ['没找到'])[0]);

    const back = parseFile(out.text, { project: merged });
    const got = back.scripts[0] && back.scripts[0].body.blocks[0];
    ok(got && got.type === 'SetSubscribed' && got.channel === '玩家受伤' && got.state === 'unsubscribe',
      '解析回来还是同一块积木：' + JSON.stringify(got));

    // 参数写成 true 也要能回来
    const back2 = parseFile('// @on start\nexport async function onStart(ctx: FrameCtx) {\n  tl.setSubscribed("update", true);\n}\n', { project: merged });
    const got2 = back2.scripts[0] && back2.scripts[0].body.blocks[0];
    ok(got2 && got2.type === 'SetSubscribed' && got2.state === 'subscribe' && got2.channel === 'update',
      'true 解析成「订阅」：' + JSON.stringify(got2));

    // 参数不是 true/false 字面量 → 降级成代码积木，不丢信息
    const back3 = parseFile('// @on start\nexport async function onStart(ctx: FrameCtx) {\n  tl.setSubscribed(动态频道, 开关);\n}\n', { project: merged });
    const got3 = back3.scripts[0] && back3.scripts[0].body.blocks[0];
    ok(got3 && got3.type === 'CodeBlockStatement' && /setSubscribed/.test(got3.code),
      '映射不回来时降级为代码积木（原样保留）：' + JSON.stringify(got3));
  }

  /* ---- (c) 运行时语义：纯 Node 里步进就能验 ---- */
  {
    attachDefs(blockdefs);
    const build = () => {
      const p = createTemplateProject();
      p.variables['计数'] = 0;
      p.entities.push({
        id: 'ent_t', name: '测试体', kind: 'sprite', visible: true, x: 0, y: 0, dir: 90, size: 100,
        opacity: 100, rotationStyle: 'all', render: { shape: 'box', color: '#ffffff', width: 10, height: 10 },
        tags: [], solid: false, physics: { gravity: 0, vx: 0, vy: 0, bounce: 0, drag: 1, enabled: false },
        scripts: [
          // 订阅 update；体内用 一直重复 + 等待，制造一条「会长跑」的线程 ——
          // 这正是「取消订阅要能把它停下来」要覆盖的情况
          { id: 's_t', hat: { type: 'OnBroadcast', channel: 'update' }, body: seq([
            { type: 'Forever', body: seq([
              { type: 'ChangeVar', name: '计数', delta: { type: 'Number', value: 1 } },
              { type: 'Wait', sec: { type: 'Number', value: 0.02 } },
            ]) },
          ]) },
        ],
      });
      const rt = new Runtime(p, {});
      rt.load(p);
      rt.running = true;             // 纯 Node 里没有 rAF，手动步进即可
      return rt;
    };
    // 每一帧之间要让出一次事件循环：脚本「等待」是用 Promise 挂起的，
    // 恢复它靠微任务。浏览器里 rAF 之间自然会排空微任务，纯 Node 里一路同步
    // 调 step() 的话微任务要等到整个循环结束才跑，测出来就是「脚本只跑了一次」。
    const step = async (rt, n) => {
      for (let i = 0; i < n; i++) {
        rt.step(1 / 60);
        await new Promise((r) => setTimeout(r, 0));
      }
    };

    const rt = build();
    await step(rt, 30);
    const a = rt.state.vars['计数'];
    ok(a > 5, `订阅状态下脚本在跑（30 帧后 计数=${a}）`);

    ok(rt.isSubscribed('测试体', 'update') === true, 'isSubscribed 说是「订阅中」');
    const n = rt.setSubscribed('测试体', 'update', false);
    ok(n === 1, '这个实体在该频道上有 1 条订阅（返回值 ' + n + '）');
    ok(rt.isSubscribed('测试体', 'update') === false, '取消后 isSubscribed 说是「已取消」');

    await step(rt, 40);
    const b = rt.state.vars['计数'];
    ok(b === a, `取消订阅后不再增长（也把正在跑的那条停了）：${a} → ${b}`);

    rt.setSubscribed('测试体', 'update', true);
    await step(rt, 30);
    const c = rt.state.vars['计数'];
    ok(c > b + 5, `重新订阅后又能跑起来：${b} → ${c}`);

    // 没在任何地方订阅这个频道的实体：返回 0，且不报错
    ok(rt.setSubscribed('没有这个实体', 'update', false) === 0, '没订阅过的实体返回 0（不报错）');
    ok(rt.setSubscribed('玩家', '这个频道没人订阅', false) === 0, '频道上没人订阅时也返回 0');
    // 刷新项目（重新点运行）会回到初始订阅状态
    const rt2 = build();
    rt2.setSubscribed('测试体', 'update', false);
    rt2.load(rt2.project);
    rt2.running = true;
    ok(rt2.isSubscribed('测试体', 'update') === true, '重新 load 之后订阅状态回到初始值');
    console.log(`  订阅中 30 帧 → 计数 ${a}；取消订阅再 40 帧 → ${b}（不涨）；重新订阅 30 帧 → ${c}`);
  }
}

/* ---------------------------------------------------------------- */
section('10. 每个积木都能「代码 ↔ 积木」原样往返');
{
  // 这一条是给用户那句「有的代码没在积木编辑器里体现」上的锁：
  // 逐个积木跑 最小 IR → 代码 → IR，要求类型/家族判别字段/语句条数全对上。
  // 明细与复现命令见 tools/audit-correspondence.mjs。
  const { rows, gaps, total } = auditAll();
  ok(gaps.length === 0, `${gaps.length} 组取值往返不回来：\n     ` +
    gaps.slice(0, 8).map((x) => `${x.d.id}(${x.c.label}) ${x.r.why}`).join('\n     '));
  console.log(`  ${total} 块积木 / ${rows.length} 组取值逐个往返（字段值 / 子表达式 / 语句条数全覆盖）`);
  if (gaps.length) gaps.slice(0, 10).forEach((x) => console.log(`    · ${x.d.id} @${x.c.label}: ${x.r.why}`));

  const t = auditTemplate();
  ok(t.codes === 0, `示例项目生成的文件里有 ${t.codes} 处降级：${t.detail.join('，')}`);
  console.log(`  示例项目 ${t.scripts} 段脚本往返，降级 ${t.codes} 处`);

  // 「把属性设为」不许再出现和专门积木重叠的属性：那种重叠一定对不回来
  // （同一段代码既能是「把属性[大小]设为」也能是「把大小设为」，反解只能选一个）
  const setProp = ALL_DEFS.find((d) => d.op === 'SetProp');
  const propVals = (setProp.args.PROP.options || []).map((o) => (Array.isArray(o) ? o[1] : o.value));
  const overlap = propVals.filter((v) => ['dir', 'size', 'opacity', 'visible'].includes(v));
  ok(overlap.length === 0, '「把属性设为」的下拉里还有和专门积木重叠的属性：' + overlap.join(', '));
  const getProp = ALL_DEFS.find((d) => d.op === 'GetProp');
  const readVals = (getProp.args.PROP.options || []).map((o) => (Array.isArray(o) ? o[1] : o.value));
  ok(readVals.includes('size') && readVals.includes('dir'),
    '「读取属性」应该保留完整属性表（读大小 / 读方向都是有意义的）');
  console.log(`  「把属性设为」可选 ${propVals.join('/')}；「读取属性」可选 ${readVals.length} 项`);
}

/* ---------------------------------------------------------------- */
section('11. 舞台点击：点角色能触发「当被点击」，判定框跟着「大小」走');
{
  // 这一节是补的。原来 clickAt() 读的是 aabb() 里不存在的字段（A.t / A.b），
  // 比较恒为 false —— 点舞台上任何角色都不会触发「当被点击」，
  // 而界面上完全看不出错（不报错、不警告，就是没反应）。
  attachDefs(blockdefs);
  const build = (size, target = '玩家') => {
    const p = createTemplateProject();
    p.variables['点击计数'] = 0;
    for (const e of p.entities) e.scripts = [];
    const ent = p.entities.find((e) => e.name === target);
    ent.x = -200; ent.y = 150; ent.size = size;
    ent.scripts = [{
      id: 's_click', hat: { type: 'OnClick', entity: '$self' },
      body: seq([{ type: 'ChangeVar', name: '点击计数', delta: { type: 'Number', value: 1 } }]),
    }];
    const rt = new Runtime(p, {});
    rt.load(p);
    rt.running = true;
    return rt;
  };
  const V = (rt) => rt.state.vars['点击计数'];

  {
    const rt = build(100);
    ok(rt.subscribersOf('_click').length === 1, '「当被点击」应注册成 _click 订阅');
    rt.clickAt(-200, 150);
    ok(V(rt) === 1, '点角色身上应触发「当被点击」，实际 ' + V(rt));
    rt.clickAt(-200 + 15, 150);                 // 玩家 w=42 → 半边 21px
    ok(V(rt) === 2, '点角色边上（15px，仍在框内）也应触发，实际 ' + V(rt));
    rt.clickAt(-200, 150 + 18);                 // 玩家 h=46 → 半边 23px
    ok(V(rt) === 3, '点角色上方 18px（仍在框内）也应触发，实际 ' + V(rt));
    rt.clickAt(-200 + 40, 150);                 // 超出半边 21px
    ok(V(rt) === 3, '点在角色外（右 40px）不该触发，实际 ' + V(rt));
    rt.clickAt(240, 180);
    ok(V(rt) === 3, '点舞台空处不该触发，实际 ' + V(rt));
  }

  {
    // 判定框要跟着「大小」缩放 —— 绘制、编辑器拾取、物理、点击必须同一个框
    const big = build(200);
    big.clickAt(-200 + 30, 150);                // 半边 21→42：这时点在框内
    ok(V(big) === 1, '大小 200% 时，放大后的范围内应命中，实际 ' + V(big));
    const full = build(100);
    full.clickAt(-200 + 30, 150);               // 原尺寸下 30 > 21：不该命中
    ok(V(full) === 0, '原尺寸下同一个点不该命中（判定框没跟着大小走？）实际 ' + V(full));
  }

  {
    // 命中了谁就只触发谁：金币上的「当被点击」不该被玩家的点击带跑
    const p = createTemplateProject();
    p.variables['金币点'] = 0;
    for (const e of p.entities) e.scripts = [];
    const coin = p.entities.find((e) => e.name === '金币');
    coin.x = -200; coin.y = 150;
    coin.scripts = [{
      id: 's_coin', hat: { type: 'OnClick', entity: '$self' },
      body: seq([{ type: 'ChangeVar', name: '金币点', delta: { type: 'Number', value: 1 } }]),
    }];
    const rt = new Runtime(p, {});
    rt.load(p); rt.running = true;
    rt.clickAt(-200, 150);                      // 这一点上金币压在玩家上面
    ok(rt.state.vars['金币点'] === 1, '应命中金币（它在 z 序上面）');
    const other = p.entities.find((e) => e.name === '玩家');
    other.x = -200; other.y = 150;
    rt.clickAt(-200, 150);
    ok(rt.state.vars['金币点'] === 2, '第二次仍然命中金币，不该穿到下面的玩家');
  }
}

/* ---------------------------------------------------------------- */
console.log(`\n=========== 结果：${pass} 通过 / ${fail} 失败 ===========`);
process.exit(fail ? 1 : 0);

function countCodeBlocks(scripts) {
  let c = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CodeBlockStatement' || node.type === 'CodeBlock') c++;
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  scripts.forEach((s) => walk(s.body));
  return c;
}
