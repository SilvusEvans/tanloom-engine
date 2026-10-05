/**
 * DualForge — 代码生成（IR → TypeScript）
 * ================================================================
 * 这是「IR → 代码视图」这条投影。
 *
 * 生成策略：
 *   · 每个实体一个文件，每个「帽块 + 脚本体」一个带注解的函数
 *   · 注解既给人看，也是反向解析的锚点（// @on update）
 *   · 合成积木按 codegen 策略生成：inline → 调用点直接展开；function → 具名函数；native → 原生映射
 *   · 生成器只使用「受限 TypeScript 子集」，保证 parser 可以逐字解析回来
 */

import { defOf } from './blockdefs.js';
import { substituteParams, safeIdent, memberAccess } from './ir.js';
import { BUILTIN_CHANNELS } from './registry.js';

export { safeIdent, memberAccess };

/* ================================================================== */
/* 生成器上下文                                                        */
/* ================================================================== */
class Gen {
  constructor(project) {
    this.project = project;
    this.level = 1;
    this.usedNames = new Set();
  }
  ind() { return '  '.repeat(this.level); }
  q(s) { return JSON.stringify(String(s ?? '')); }
  ent(ref) {
    const name = ref === '$self' || ref == null ? null : String(ref);
    if (!name) return 'self';
    return `df.entity(${this.q(name)})`;
  }
  varRef(name) { return memberAccess('vars', name); }
  listRef(name) { return memberAccess('lists', name); }
  e(node) {
    if (node == null) return '0';
    if (typeof node !== 'object') return this.q(node);
    switch (node.type) {
      case 'Number': return String(this.num(node.value));
      case 'String': return this.q(node.value);
      case 'Bool': return node.value ? 'true' : 'false';
      default: break;
    }
    const def = defOf(node, this.project);
    if (!def) return '/* 未知节点 */ 0';
    if (def.isMacro) return this.macroCall(node, def, true);
    if (!def.gen) return this.codeFallback(node);
    return def.gen(node, this);
  }
  codeFallback(node) {
    return `/* 未知积木 ${String(node.type).replace(/\*\//g, '')} */ 0`;
  }
  num(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    return String(n);
  }
  /** 语句序列 → 代码行 */
  seq(seqNode, level) {
    const saved = this.level;
    this.level = level;
    const out = [];
    for (const b of (seqNode && seqNode.blocks) || []) {
      out.push(...this.stmt(b));
    }
    this.level = saved;
    return out;
  }
  stmt(node) {
    if (node.type === 'MacroCallStatement') {
      const def = defOf(node, this.project);
      const macro = this.project.macros[node.macroId];
      if (macro && macro.codegen === 'inline' && macro.kind === 'statement') {
        const values = {};
        (macro.params || []).forEach((p, i) => { values[p.name] = (node.args || [])[i] || { type: 'Number', value: 0 }; });
        const sub = substituteParams(macro.body, values);
        const saved = this.level;
        this.level = this.level;
        const lines = this.seq(sub, this.level);
        this.level = saved;
        return lines;
      }
      return [`${this.ind()}await ${this.macroFnName(macro)}(${this.argList(node.args, macro)});`];
    }
    const def = defOf(node, this.project);
    if (!def || !def.gen) return [`${this.ind()}// ⚠ 无法生成的语句：${node.type}`];
    const out = def.gen(node, this);
    return Array.isArray(out) ? out : [String(out)];
  }
  argList(args, macro) {
    const parts = (args || []).map((a) => this.e(a));
    const needSelf = macro && macro.kind === 'statement';
    return needSelf ? ['self', ...parts].join(', ') : parts.join(', ');
  }
  macroFnName(macro) {
    if (!macro) return 'unknownMacro';
    return safeIdent(macro.name) || 'macro_' + String(macro.id).replace(/[^\w]/g, '');
  }
  /** 宏调用（表达式位置） */
  macroCall(node, def, asExpr) {
    const macro = this.project.macros[node.macroId];
    if (!macro) return '0';
    const args = node.args || [];
    if (macro.codegen === 'inline' && macro.kind === 'expression') {
      const values = {};
      (macro.params || []).forEach((p, i) => { values[p.name] = args[i] || { type: 'Number', value: 0 }; });
      const expanded = substituteParams(macro.body, values);
      return this.e(expanded);
    }
    if (macro.codegen === 'native' && macro.native) {
      const parts = args.map((a) => this.e(a));
      let txt = String(macro.native);
      (macro.params || []).forEach((p, i) => {
        txt = txt.split('$' + p.name).join(parts[i] || '0');
      });
      return `(${txt})`;
    }
    return `${this.macroFnName(macro)}(${args.map((a) => this.e(a)).join(', ')})`;
  }
}

/* ================================================================== */
/* 注解                                                                */
/* ================================================================== */
export function hatAnnotation(hat) {
  const def = defOf(hat, { macros: {}, categories: {} });
  const a = def && def.annotation ? def.annotation(hat) : { tag: 'update', args: {}, fnName: 'onUpdate' };
  return a;
}

function annotationLine(a) {
  const argStr = Object.entries(a.args || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return argStr ? `// @on ${a.tag}(${argStr})` : `// @on ${a.tag}`;
}

/* ================================================================== */
/* 生成一个脚本                                                        */
/* ================================================================== */
function genScript(script, entityName, g) {
  const a = hatAnnotation(script.hat);
  let fnName = a.fnName || 'onScript';
  let n = 2;
  while (g.usedNames.has(fnName)) fnName = `${a.fnName}_${n++}`;
  g.usedNames.add(fnName);

  const lines = [];
  lines.push(`// @df:script ${script.id}`);
  lines.push(annotationLine(a));
  lines.push(`export async function ${fnName}(ctx: FrameCtx) {`);
  lines.push(`  const self = ctx.self;`);
  g.level = 1;
  const body = g.seq(script.body, 1);
  if (!body.length) lines.push('  // （空脚本）');
  lines.push(...body);
  lines.push('}');
  return lines.join('\n');
}

/* ================================================================== */
/* 生成合成积木定义                                                     */
/* ================================================================== */
function genMacro(macro, g) {
  const lines = [];
  const names = (macro.params || []).map((p) => p.name);
  const isStmt = macro.kind === 'statement' || macro.kind === 'event';
  lines.push(`// @df:macro ${macro.id}`);
  lines.push(`// @macro ${macro.name}(${names.join(', ')})`);
  if (isStmt) lines.push(`// @kind ${macro.kind}`);
  lines.push(`// @display ${macro.display || macro.name}`);
  lines.push(`// @category ${macro.category}`);
  if (macro.color) lines.push(`// @color ${macro.color}`);
  if (macro.icon) lines.push(`// @icon ${macro.icon}`);
  if (macro.scope) lines.push(`// @scope ${macro.scope}`);
  if (macro.codegen) lines.push(`// @codegen ${macro.codegen}`);
  if (macro.native) lines.push(`// @native ${macro.native}`);

  const fmt = (n) => `${safeIdent(n) || 'p_' + String(n).replace(/[^\w]/g, '')}: number`;
  if (isStmt) {
    lines.push(`export async function ${g.macroFnName(macro)}(self: Entity, ${names.map(fmt).join(', ')}) {`);
    lines.push('  // 语句型合成积木：由「合成新积木」生成');
    lines.push('}');
  } else {
    lines.push(`export function ${g.macroFnName(macro)}(${names.map(fmt).join(', ')}): number {`);
    lines.push('  // 表达式型合成积木');
    lines.push('  return 0;');
    lines.push('}');
  }
  return lines.join('\n');
}

/* ================================================================== */
/* 对外：生成全部文件                                                   */
/* ================================================================== */
export function generateFiles(project) {
  const files = [];

  const header =
    `/* DualForge · 由积木视图同步生成\n` +
    ` * 本文件与积木视图共享同一份 IR（唯一真源），可以双向编辑：\n` +
    ` *   · 积木改动 → 自动重写本文件\n` +
    ` *   · 本文件改动 → 按 Ctrl+S 解析回积木\n` +
    ` * 注解 // @on xxx 表示该函数订阅哪个广播频道。\n` +
    ` * 支持 // @macro name(p) => 表达式 来定义新的合成积木。\n` +
    ` */\n` +
    `import type { FrameCtx, Entity } from './_runtime';\n` +
    `import { df, vars, lists } from './_runtime';\n`;

  for (const ent of project.entities || []) {
    if (ent.kind === 'group') continue;
    const g = new Gen(project);
    const parts = [];
    parts.push(header);
    parts.push(`/* 实体：${ent.name}  id：${ent.id} */\n`);
    const macroDefs = Object.values(project.macros || {}).filter((m) => m.scope === 'entity' && m.owner === ent.id);
    for (const m of macroDefs) parts.push(genMacro(m, g) + '\n');
    for (const sc of ent.scripts || []) parts.push(genScript(sc, ent.name, g) + '\n');
    if (!(ent.scripts || []).length && !macroDefs.length) parts.push('// 这个实体还没有脚本。回到积木视图拖一个「当收到 [update]」出来试试。\n');
    files.push({ name: `${ent.name}.ts`, entityId: ent.id, entityName: ent.name, text: parts.join('\n') });
  }

  // 合成积木：非实体作用域的集中在一个文件
  const globalMacros = Object.values(project.macros || {}).filter((m) => m.scope !== 'entity');
  if (globalMacros.length) {
    const g = new Gen(project);
    const parts = [header, '/* 项目级 / 全局合成积木 */\n'];
    for (const m of globalMacros) parts.push(genMacro(m, g) + '\n');
    files.push({ name: '_blocks.ts', entityId: null, entityName: null, text: parts.join('\n') });
  }

  files.push({
    name: '_runtime.d.ts',
    readonly: true,
    text: RUNTIME_STUB
  });
  return files;
}

const RUNTIME_STUB = `/* DualForge 运行时 API 参考（只读）
 * 生成的代码里可以自由使用下面这些符号。
 */

export interface Entity {
  name: string;
  x: number; y: number;      // 舞台坐标，原点在中心
  dir: number;               // 方向，90 = 朝右
  size: number; opacity: number; visible: boolean;
  vx: number; vy: number;    // 速度（像素/秒）
  gravity: number;
  grounded: boolean;
  color: string;
}

export interface FrameCtx {
  readonly self: Entity;
  readonly frame: number;      // 帧号
  readonly delta: number;      // 上一帧耗时（秒）
  readonly fixedDelta: number; // 固定步长
  readonly value: number;      // 本次广播携带的参数
  readonly input: { mouseX: number; mouseY: number; mouseDown: boolean };
  num(e: unknown): number;
  str(e: unknown): string;
  bool(e: unknown): boolean;
}

export declare const vars:   Record<string, number>;
export declare const lists:  Record<string, number[]>;

export declare const df: {
  entity(name: string): Entity;
  setPosition(e: Entity, x: number, y: number): void;
  setVelocity(e: Entity, vx: number, vy: number): void;
  moveBy(e: Entity, dx: number, dy: number): void;
  bounce(e: Entity): void;
  clone(e: Entity): Entity | undefined;
  deleteClone(): void;
  spawn(name: string, x: number, y: number): Entity | null;
  destroy(e: Entity): void;
  broadcast(channel: string, value?: number): void;
  broadcastAndWait(channel: string, value?: number): Promise<void>;
  wait(sec: number): Promise<void>;
  tick(): Promise<void>;                 // 让出本帧（forever 循环用）
  random(from: number, to: number): number;
  math(op: string, x: number): number;
  join(a: unknown, b: unknown): string;
  touching(a: Entity, b: Entity): boolean;
  distanceTo(a: Entity, b: Entity): number;
  keyDown(key: string): boolean;
  timer(): number;
  resetTimer(): void;
  playSound(name: string): void;
  say(e: Entity, text: string, sec: number): void;
  hud(text: string): void;
  shake(n: number): void;
  particles(e: Entity, n: number, color: string): void;
  cameraFollow(e: Entity, k: number): void;
  switchScene(name: string): void;
  save(slot: string): void;
  load(slot: string): void;
  stop(target: 'all' | 'script'): void;
  stopAllSounds(): void;
  volume(v: number): void;
  monitor(name: string, on: boolean): void;
  sceneName(): string;
  cloneCount(): number;
};
`;

/** 把单个表达式 IR 生成成 TypeScript 表达式（右键「转为代码积木」用） */
export function exprToCode(project, node) {
  const g = new Gen(project);
  return g.e(node);
}

export const PHASE_DOC = BUILTIN_CHANNELS;
