/**
 * Tanloom Engine — 带插槽的模板文案
 * ================================================================
 * 这些文案里混着表达式（`` `帧 ${rt.frame}` `` 这种），没法当成纯文本一条条翻译，
 * 所以改成**位置占位符**：`{_1}` `{_2}` 对应该模板里第 1、2 个表达式，
 * 调用处写成 `t('帧 {_1}', { _1: rt.frame })`。
 *
 * 编号是按表达式**首次出现的顺序**排的，同一个表达式重复出现时共用一个编号。
 * 绝大部分是右栏面板的 HTML 片段。
 *
 * 键 = 简体原文（同时也是 zh-Hans 的译文），只存 en 与 zh-Hant 两份。
 */
export const TPL = {
  '已新建「{_1}」': { en: 'Added "{_1}"', 'zh-Hant': '已新增「{_1}」' },
  '帧 {_1}': { en: 'frame {_1}', 'zh-Hant': '幀 {_1}' },
  '已下载 {_1} 个文件': { en: 'Downloaded {_1} files', 'zh-Hant': '已下載 {_1} 個檔案' },

  /* ---- 右栏：性能 / 时间轴 ---- */
  '<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>合计</span><span>{_1}</span><span></span><span></span></div>':
    { en: '<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>total</span><span>{_1}</span><span></span><span></span></div>', 'zh-Hant': '<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>總計</span><span>{_1}</span><span></span><span></span></div>' },
  '<div class="tl-row"><span>帧</span><span>{_1}</span><span></span><span>delta {_2} ms</span></div>':
    { en: '<div class="tl-row"><span>frame</span><span>{_1}</span><span></span><span>delta {_2} ms</span></div>', 'zh-Hant': '<div class="tl-row"><span>幀</span><span>{_1}</span><span></span><span>delta {_2} ms</span></div>' },
  '<div class="log-line bus"><span class="f">帧 {_1}</span>':
    { en: '<div class="log-line bus"><span class="f">frame {_1}</span>', 'zh-Hant': '<div class="log-line bus"><span class="f">幀 {_1}</span>' },
  '{_1} <span class="badge">{_2} · {_3} 个订阅者':
    { en: '{_1} <span class="badge">{_2} · {_3} subscribers', 'zh-Hant': '{_1} <span class="badge">{_2} · {_3} 個訂閱者' },

  /* ---- 右栏：订阅 / 脚本列表 ---- */
  '当「{_1}」碰到「{_2}」': { en: 'when "{_1}" touches "{_2}"', 'zh-Hant': '當「{_1}」碰到「{_2}」' },
  '当按下「{_1}」': { en: 'when "{_1}" key pressed', 'zh-Hant': '當按下「{_1}」' },
  '当「{_1}」被点击': { en: 'when "{_1}" clicked', 'zh-Hant': '當「{_1}」被點擊' },
  '当收到「{_1}」': { en: 'when I receive "{_1}"', 'zh-Hant': '當收到「{_1}」' },
  '{_1} · {_2} · {_3} 块积木': { en: '{_1} · {_2} · {_3} blocks', 'zh-Hant': '{_1} · {_2} · {_3} 塊積木' },

  /* ---- 右栏：变量 / 列表 / 实体卡片 ---- */
  '<div class="var-card"><div class="k">变量 {_1}</div><div class="v">{_2}</div></div>':
    { en: '<div class="var-card"><div class="k">variable {_1}</div><div class="v">{_2}</div></div>', 'zh-Hant': '<div class="var-card"><div class="k">變數 {_1}</div><div class="v">{_2}</div></div>' },
  '<div class="var-card"><div class="k">列表 {_1} · {_2} 项</div><div class="v">{_3}{_4}</div></div>':
    { en: '<div class="var-card"><div class="k">list {_1} · {_2} items</div><div class="v">{_3}{_4}</div></div>', 'zh-Hant': '<div class="var-card"><div class="k">清單 {_1} · {_2} 項</div><div class="v">{_3}{_4}</div></div>' },
  '克隆体（{_1}）': { en: 'Clones ({_1})', 'zh-Hant': '分身（{_1}）' },
  '{_1} 项': { en: '{_1} items', 'zh-Hant': '{_1} 項' },
  '{_1} 订阅': { en: '{_1} subscriptions', 'zh-Hant': '{_1} 訂閱' },
  '{_1} · {_2} · {_3} · 被调用 {_4} 次':
    { en: '{_1} · {_2} · {_3} · called {_4} times', 'zh-Hant': '{_1} · {_2} · {_3} · 被呼叫 {_4} 次' },

  /* ---- 右栏：性能表 ---- */
  '<div class="perf-row"><b>帧号</b><span>{_1}</span><span>运行 {_2}s · delta {_3}ms</span></div>':
    { en: '<div class="perf-row"><b>Frame</b><span>{_1}</span><span>running {_2}s · delta {_3}ms</span></div>', 'zh-Hant': '<div class="perf-row"><b>幀號</b><span>{_1}</span><span>已執行 {_2}s · delta {_3}ms</span></div>' },
  '<div class="perf-row"><b>克隆体</b><span>{_1}</span><span>粒子 {_2}</span></div>':
    { en: '<div class="perf-row"><b>Clones</b><span>{_1}</span><span>particles {_2}</span></div>', 'zh-Hant': '<div class="perf-row"><b>分身</b><span>{_1}</span><span>粒子 {_2}</span></div>' },
  '<div class="perf-row"><b>活跃脚本线程</b><span>{_1}</span><span></span></div>':
    { en: '<div class="perf-row"><b>Active script threads</b><span>{_1}</span><span></span></div>', 'zh-Hant': '<div class="perf-row"><b>使用中的腳本執行緒</b><span>{_1}</span><span></span></div>' },
  '<span><div class="bar" style="width:{_1}%"></div> <span class="dim">{_2} 次派发 · {_3} 订阅</span></span></div>':
    { en: '<span><div class="bar" style="width:{_1}%"></div> <span class="dim">{_2} dispatches · {_3} subscriptions</span></span></div>', 'zh-Hant': '<span><div class="bar" style="width:{_1}%"></div> <span class="dim">{_2} 次派發 · {_3} 訂閱</span></span></div>' },

  /* ---- 合成积木对话框 ---- */
  '参数：<code>{_1}</code> —— 调用这个积木时，这些槽位会变成可填的输入口。':
    { en: 'Parameters: <code>{_1}</code> — when this block is used, these slots become fillable inputs.', 'zh-Hant': '參數：<code>{_1}</code> —— 呼叫這個積木時，這些插槽會變成可填寫的輸入。' },
  '({_1})  →  出现 {_2} 次': { en: '({_1})  →  appears {_2} times', 'zh-Hant': '({_1})  →  出現 {_2} 次' },
  '编辑积木「{_1}」': { en: 'Edit block "{_1}"', 'zh-Hant': '編輯積木「{_1}」' },
  '修改积木「{_1}」': { en: 'Change block "{_1}"', 'zh-Hant': '修改積木「{_1}」' },
  '合成新积木「{_1}」': { en: 'Compose new block "{_1}"', 'zh-Hant': '合成新積木「{_1}」' },
  '合成积木 · {_1}': { en: 'Composite block · {_1}', 'zh-Hant': '合成積木 · {_1}' },
  '新积木会归到「{_1}」': { en: 'The new block will go to "{_1}"', 'zh-Hant': '新積木會歸到「{_1}」' },

  /* ---- 状态中心（撤销栈标签 / toast）---- */
  '已创建分类「{_1}」': { en: 'Created category "{_1}"', 'zh-Hant': '已建立分類「{_1}」' },
  '新建实体 {_1}': { en: 'Add entity {_1}', 'zh-Hant': '新增實體 {_1}' },
  '删除实体 {_1}': { en: 'Delete entity {_1}', 'zh-Hant': '刪除實體 {_1}' },
  '重命名 {_1} → {_2}': { en: 'Rename {_1} → {_2}', 'zh-Hant': '重新命名 {_1} → {_2}' },
  '新建分类 {_1}': { en: 'Add category {_1}', 'zh-Hant': '新增分類 {_1}' },
  '删除分类 {_1}': { en: 'Delete category {_1}', 'zh-Hant': '刪除分類 {_1}' },
  '删除积木「{_1}」': { en: 'Delete block "{_1}"', 'zh-Hant': '刪除積木「{_1}」' },
  '注册广播「{_1}」': { en: 'Register broadcast "{_1}"', 'zh-Hant': '註冊廣播「{_1}」' },
  '新建变量 {_1}': { en: 'Add variable {_1}', 'zh-Hant': '新增變數 {_1}' },
  '新建列表 {_1}': { en: 'Add list {_1}', 'zh-Hant': '新增清單 {_1}' },

  /* ---- 运行时 / 诊断 ---- */
  '已加载项目「{_1}」，实体 {_2} 个':
    { en: 'Loaded project "{_1}" with {_2} entities', 'zh-Hant': '已載入專案「{_1}」，實體 {_2} 個' },
  '📣 {_1} {_2}「{_3}」（{_4} 条脚本）':
    { en: '📣 {_1} {_2} "{_3}" ({_4} scripts)', 'zh-Hant': '📣 {_1} {_2}「{_3}」（{_4} 條指令）' },
  '✖ 克隆体 / {_1}: {_2}': { en: '✖ Clone / {_1}: {_2}', 'zh-Hant': '✖ 分身 / {_1}: {_2}' },
  '代码积木错误：{_1}': { en: 'Code block error: {_1}', 'zh-Hant': '程式積木錯誤：{_1}' },
  '缺失的积木宏：{_1}': { en: 'Missing block macro: {_1}', 'zh-Hant': '缺少積木巨集：{_1}' },
  '<span class="err">{_1} 条解析提示</span>':
    { en: '<span class="err">{_1} parse notes</span>', 'zh-Hant': '<span class="err">{_1} 則解析提示</span>' },

  /* ---- IR 校验 ---- */
  '{_1}: 未知表达式类型 {_2}': { en: '{_1}: unknown expression type {_2}', 'zh-Hant': '{_1}: 未知的運算式類型 {_2}' },
  '{_1}: 期望 BlockSequence，实际 {_2}': { en: '{_1}: expected BlockSequence, got {_2}', 'zh-Hant': '{_1}: 預期 BlockSequence，實際為 {_2}' },
  '{_1}: 未知语句类型 {_2}': { en: '{_1}: unknown statement type {_2}', 'zh-Hant': '{_1}: 未知的陳述式類型 {_2}' },
  '{_1}: 引用不存在的宏 {_2}': { en: '{_1}: references a macro that does not exist: {_2}', 'zh-Hant': '{_1}: 引用了不存在的巨集 {_2}' },
  '{_1}: 广播频道「{_2}」未注册，将自动注册':
    { en: '{_1}: broadcast channel "{_2}" is not registered - registering it automatically', 'zh-Hant': '{_1}: 廣播頻道「{_2}」尚未註冊，將自動註冊' },
  '实体 {_1} 的脚本缺少 hat': { en: 'The script of entity {_1} has no hat block', 'zh-Hant': '實體 {_1} 的指令缺少帽塊' },

  /* ---- 代码生成（会写进导出文件）---- */
  '/* 未知积木 {_1} */ 0': { en: '/* unknown block {_1} */ 0', 'zh-Hant': '/* 未知積木 {_1} */ 0' },
  '{_1}// ⚠ 无法生成的语句：{_2}': { en: '{_1}// ⚠ statement cannot be generated: {_2}', 'zh-Hant': '{_1}// ⚠ 無法產生的陳述式：{_2}' },
  '/* 实体：{_1}  id：{_2} */\n': { en: '/* entity: {_1}  id: {_2} */\n', 'zh-Hant': '/* 實體：{_1}  id：{_2} */\n' },

  /* ---- 生成文件的文件头（一行一条，源码里本来就是拼起来的）---- */
  '/* Tanloom Engine · 由积木视图同步生成\n':
    { en: '/* Tanloom Engine · generated from the block view\n', 'zh-Hant': '/* Tanloom Engine · 由積木視圖同步產生\n' },
  ' * 本文件与积木视图共享同一份 IR（唯一真源），可以双向编辑：\n':
    { en: ' * This file and the block view share one IR (the single source of truth), editable both ways:\n', 'zh-Hant': ' * 本檔案與積木視圖共用同一份 IR（唯一真實來源），可以雙向編輯：\n' },
  ' *   · 积木改动 → 自动重写本文件\n':
    { en: ' *   · block edits → this file is rewritten automatically\n', 'zh-Hant': ' *   · 積木變更 → 自動重寫本檔案\n' },
  ' *   · 本文件改动 → 按 Ctrl+S 解析回积木\n':
    { en: ' *   · edits here → press Ctrl+S to parse back into blocks\n', 'zh-Hant': ' *   · 本檔案變更 → 按 Ctrl+S 解析回積木\n' },
  ' * 注解 // @on xxx 表示该函数订阅哪个广播频道。\n':
    { en: ' * The // @on xxx annotation says which broadcast channel the function subscribes to.\n', 'zh-Hant': ' * 註解 // @on xxx 表示該函式訂閱哪個廣播頻道。\n' },
  ' * 支持 // @macro name(p) => 表达式 来定义新的合成积木。\n':
    { en: ' * // @macro name(p) => expression defines a new composite block.\n', 'zh-Hant': ' * 支援 // @macro name(p) => 運算式 來定義新的合成積木。\n' },

  /* ---- 反向解析报错 ---- */
  '第 {_1} 行：期望 "{_2}"，实际是 "{_3}"':
    { en: 'line {_1}: expected "{_2}", got "{_3}"', 'zh-Hant': '第 {_1} 行：預期 "{_2}"，實際是 "{_3}"' },
};
