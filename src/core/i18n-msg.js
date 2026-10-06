/**
 * Tanloom Engine — 运行时提示与诊断
 * ================================================================
 * 覆盖 src/runtime/vm.js、src/core/store.js、src/core/ir.js、
 * src/core/codegen.js、src/core/parser.js 五个文件里会被用户看到的
 * 中文字符串。
 *
 * 键 = 简体原文（它同时也是 zh-Hans 的译文），所以只存 en 与 zh-Hant 两份。
 * 模板字符串里的 `${expr}` 写成 `{expr}`，译文里的占位符与键一一对应。
 * 英文术语对齐 Scratch 官方英文，繁中术语对齐 Scratch 官方繁中。
 *
 * codegen.js 里会写进导出 .ts 文件的注释（块注释与行注释）保留注释前缀与
 * 换行结构，只翻中文词。
 *
 * 跳过（数据而非界面文案）：新建实体的默认名（`新实体N`）、碰撞帽块的默认目标
 * 实体名（`敌人`）—— 它们是写进项目文件（.tle）的标识符，不随界面语言变。
 */
export const MSG = {
  /* ---------------- src/runtime/vm.js ---------------- */
  '场景 1': { en: 'Scene 1', 'zh-Hant': '場景 1' },
  '已加载项目「{p.name}」，实体 {this.state.order.length} 个': {
    en: 'Loaded project "{p.name}" with {this.state.order.length} entities',
    'zh-Hant': '已載入專案「{p.name}」，實體 {this.state.order.length} 個',
  },
  "📣 {name} {wantSub ? '订阅' : '取消订阅'}「{channel}」（{affected} 条脚本）": {
    en: "📣 {name} {wantSub ? '订阅' : '取消订阅'}「{channel}」({affected} scripts)",
    'zh-Hant': "📣 {name} {wantSub ? '订阅' : '取消订阅'}「{channel}」（{affected} 條腳本）",
  },
  '广播 [start]': { en: 'Broadcast [start]', 'zh-Hant': '廣播 [start]' },
  '找不到实体「{entityName}」': {
    en: 'Unknown entity: {entityName}',
    'zh-Hant': '找不到實體「{entityName}」',
  },
  '引擎还没运行': { en: 'The engine is not running yet', 'zh-Hant': '引擎還沒執行' },
  '⚠ 单帧执行预算耗尽（可能存在无 yield 的死循环），已中断脚本': {
    en: '⚠ Single-frame execution budget exhausted (possibly an infinite loop without yield); script interrupted',
    'zh-Hant': '⚠ 單幀執行預算耗盡（可能存在無 yield 的無窮迴圈），已中斷腳本',
  },
  '由积木自动注册': { en: 'Registered automatically by blocks', 'zh-Hant': '由積木自動註冊' },
  '系统': { en: 'System', 'zh-Hant': '系統' },
  '克隆体数量已达上限（400）': {
    en: 'Clone limit reached (400)',
    'zh-Hant': '分身數量已達上限（400）',
  },
  '✖ 克隆体 / {s.entityName}: {e.message}': {
    en: '✖ Clone / {s.entityName}: {e.message}',
    'zh-Hant': '✖ 分身 / {s.entityName}: {e.message}',
  },
  '找不到实体「{name}」': {
    en: 'Unknown entity: {name}',
    'zh-Hant': '找不到實體「{name}」',
  },
  '⏹ 停止全部脚本（点 ▶ 重新开始）': {
    en: '⏹ Stop all scripts (click ▶ to start again)',
    'zh-Hant': '⏹ 停止全部腳本（點 ▶ 重新開始）',
  },
  '场景切换 {from} → {name}': {
    en: 'Scene switch {from} → {name}',
    'zh-Hant': '場景切換 {from} → {name}',
  },
  '💾 存档到「{slot}」': { en: '💾 Saved to "{slot}"', 'zh-Hant': '💾 儲存到「{slot}」' },
  '存档「{slot}」不存在': {
    en: 'Save "{slot}" does not exist',
    'zh-Hant': '存檔「{slot}」不存在',
  },
  '📂 读取存档「{slot}」': { en: '📂 Loaded save "{slot}"', 'zh-Hant': '📂 讀取存檔「{slot}」' },
  '代码积木错误：{err.message}': {
    en: 'Code block error: {err.message}',
    'zh-Hant': '程式積木錯誤：{err.message}',
  },
  '缺失的积木宏：{node.macroId}': {
    en: 'Missing block macro: {node.macroId}',
    'zh-Hant': '缺少的積木巨集：{node.macroId}',
  },

  /* ---------------- src/core/store.js ---------------- */
  '该文件只读': { en: 'This file is read-only', 'zh-Hant': '該檔案為唯讀' },
  '代码同步回积木': { en: 'Sync code back to blocks', 'zh-Hant': '程式碼同步回積木' },
  '由代码自动注册': { en: 'Registered automatically by code', 'zh-Hant': '由程式碼自動註冊' },
  '新建实体 {ent.name}': { en: 'New entity {ent.name}', 'zh-Hant': '新增實體 {ent.name}' },
  '删除实体 {ent.name}': { en: 'Delete entity {ent.name}', 'zh-Hant': '刪除實體 {ent.name}' },
  '重命名 {old} → {newName}': {
    en: 'Rename {old} → {newName}',
    'zh-Hant': '重新命名 {old} → {newName}',
  },
  '新建分类 {name}': { en: 'New category {name}', 'zh-Hant': '新增分類 {name}' },
  '修改分类': { en: 'Edit category', 'zh-Hant': '修改分類' },
  '删除分类 {cat.name}': { en: 'Delete category {cat.name}', 'zh-Hant': '刪除分類 {cat.name}' },
  '合成新积木「{macro.name}」': {
    en: 'Make block "{macro.name}"',
    'zh-Hant': '合成新積木「{macro.name}」',
  },
  '删除积木「{m.name}」': { en: 'Delete block "{m.name}"', 'zh-Hant': '刪除積木「{m.name}」' },
  '注册广播「{name}」': { en: 'Register broadcast "{name}"', 'zh-Hant': '註冊廣播「{name}」' },
  '用户定义': { en: 'User-defined', 'zh-Hant': '使用者定義' },
  '新建变量 {name}': { en: 'New variable {name}', 'zh-Hant': '新增變數 {name}' },
  '新建列表 {name}': { en: 'New list {name}', 'zh-Hant': '新增清單 {name}' },
  '新建脚本': { en: 'New script', 'zh-Hant': '新增腳本' },
  '删除脚本': { en: 'Delete script', 'zh-Hant': '刪除腳本' },

  /* ---------------- src/core/ir.js ---------------- */
  '未命名项目': { en: 'Untitled project', 'zh-Hant': '未命名專案' },
  '项目为空': { en: 'Project is empty', 'zh-Hant': '專案為空' },
  'entities 必须是数组': { en: 'entities must be an array', 'zh-Hant': 'entities 必須是陣列' },
  'channels 缺失': { en: 'channels is missing', 'zh-Hant': 'channels 缺失' },
  '{where}: 表达式为空': { en: '{where}: expression is empty', 'zh-Hant': '{where}: 運算式為空' },
  '{where}: 表达式必须是对象': {
    en: '{where}: expression must be an object',
    'zh-Hant': '{where}: 運算式必須是物件',
  },
  '{where}: 未知表达式类型 {n.type}': {
    en: '{where}: unknown expression type {n.type}',
    'zh-Hant': '{where}: 未知運算式類型 {n.type}',
  },
  '{where}: 期望 BlockSequence，实际 {s.type}': {
    en: '{where}: expected BlockSequence, got {s.type}',
    'zh-Hant': '{where}: 期望 BlockSequence，實際 {s.type}',
  },
  '{w}: 语句缺少 type': { en: '{w}: statement is missing type', 'zh-Hant': '{w}: 陳述式缺少 type' },
  '{w}: 未知语句类型 {b.type}': {
    en: '{w}: unknown statement type {b.type}',
    'zh-Hant': '{w}: 未知陳述式類型 {b.type}',
  },
  '{w}: 引用不存在的宏 {b.macroId}': {
    en: '{w}: reference to a nonexistent macro {b.macroId}',
    'zh-Hant': '{w}: 引用不存在的巨集 {b.macroId}',
  },
  '{w}: 广播频道「{b.channel}」未注册，将自动注册': {
    en: '{w}: broadcast channel "{b.channel}" is not registered and will be registered automatically',
    'zh-Hant': '{w}: 廣播頻道「{b.channel}」未註冊，將自動註冊',
  },
  '实体 {ent.name} 的脚本缺少 hat': {
    en: 'Entity {ent.name} script is missing a hat',
    'zh-Hant': '實體 {ent.name} 的腳本缺少 hat',
  },
  '宏 {id} 缺少 params': { en: 'Macro {id} is missing params', 'zh-Hant': '巨集 {id} 缺少 params' },

  /* ---------------- src/core/codegen.js（会写进导出的 .ts 文件） ---------------- */
  '/* 未知节点 */ 0': { en: '/* Unknown node */ 0', 'zh-Hant': '/* 未知節點 */ 0' },
  '{this.ind()}// ⚠ 无法生成的语句：{node.type}': {
    en: '{this.ind()}// ⚠ Cannot generate statement: {node.type}',
    'zh-Hant': '{this.ind()}// ⚠ 無法產生的陳述式：{node.type}',
  },
  '  // （空脚本）': { en: '  // (empty script)', 'zh-Hant': '  // （空腳本）' },
  '  // 语句型合成积木：由「合成新积木」生成': {
    en: '  // Statement-type composite block: generated by "Make a new block"',
    'zh-Hant': '  // 陳述式型合成積木：由「合成新積木」產生',
  },
  '  // 表达式型合成积木': {
    en: '  // Expression-type composite block',
    'zh-Hant': '  // 運算式型合成積木',
  },

  /* ---------------- src/core/parser.js ---------------- */
  '第 {this.line(this.cur)} 行：期望 "{v}"，实际是 "{this.cur.value}"': {
    en: 'Line {this.line(this.cur)}: expected "{v}", got "{this.cur.value}"',
    'zh-Hant': '第 {this.line(this.cur)} 行：期望 "{v}"，實際是 "{this.cur.value}"',
  },
  '函数 {fnName} 缺少函数体': {
    en: 'Function {fnName} is missing its body',
    'zh-Hant': '函式 {fnName} 缺少函式主體',
  },

  /* ---- 广播日志里的动词 ---- */
  '订阅': { en: 'subscribed to', 'zh-Hant': '訂閱' },
  '取消订阅': { en: 'unsubscribed from', 'zh-Hant': '取消訂閱' },

  /* ---- 写进导出文件的注释 ---- */
  '// 这个实体还没有脚本。回到积木视图拖一个「当收到 [update]」出来试试。\n':
    { en: '// This entity has no scripts yet. Go back to the block view and drag a "when I receive [update]" out.\n', 'zh-Hant': '// 這個實體還沒有指令。回到積木視圖拖一個「當收到 [update]」出來試試。\n' },
  '/* 项目级 / 全局合成积木 */\n':
    { en: '/* project-level / global composite blocks */\n', 'zh-Hant': '/* 專案層級 / 全域合成積木 */\n' },
};
