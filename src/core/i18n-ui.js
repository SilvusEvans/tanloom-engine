/**
 * Tanloom Engine — 面板 / 对话框 文案
 * ================================================================
 * 覆盖 src/ui/panels.js、src/ui/dialogs.js、src/ui/macro-dialog.js、
 * src/ui/appearance.js 四个文件里所有会被用户看到的中文字符串。
 *
 * 键 = 简体原文（它同时也是 zh-Hans 的译文），所以只存 en 与 zh-Hant 两份。
 * 模板字符串里的 `${expr}` 写成 `{expr}`，译文里的占位符与键一一对应。
 * 英文术语对齐 Scratch 官方英文，繁中术语对齐 Scratch 官方繁中。
 */
export const UI = {
  /* ---------------- src/ui/panels.js ---------------- */
  '<div class="tl-head"><span>阶段</span><span>耗时 ms</span><span>订阅者</span><span>占比</span></div>': {
    en: '<div class="tl-head"><span>Phase</span><span>Duration ms</span><span>Subscribers</span><span>Share</span></div>',
    'zh-Hant': '<div class="tl-head"><span>階段</span><span>耗時 ms</span><span>訂閱者</span><span>佔比</span></div>',
  },
  '<div class="log-line info">还没运行。按 ▶ 开始，这里会显示每帧的广播时间轴。</div>': {
    en: '<div class="log-line info">Not running yet. Press ▶ to start; the per-frame broadcast timeline shows up here.</div>',
    'zh-Hant': '<div class="log-line info">尚未執行。按下 ▶ 開始，這裡會顯示每幀的廣播時間軸。</div>',
  },
  '<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>合计</span><span>{last.ms.toFixed(2)}</span><span></span><span></span></div>': {
    en: '<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>Total</span><span>{last.ms.toFixed(2)}</span><span></span><span></span></div>',
    'zh-Hant': '<div class="tl-row" style="border-top:1px solid #333b4d;margin-top:2px"><span>合計</span><span>{last.ms.toFixed(2)}</span><span></span><span></span></div>',
  },
  '<div class="tl-row"><span>帧</span><span>{last.frame}</span><span></span><span>delta {last.delta} ms</span></div>': {
    en: '<div class="tl-row"><span>Frame</span><span>{last.frame}</span><span></span><span>delta {last.delta} ms</span></div>',
    'zh-Hant': '<div class="tl-row"><span>幀</span><span>{last.frame}</span><span></span><span>delta {last.delta} ms</span></div>',
  },
  '<div class="tl-head" style="margin-top:8px"><span colspan="4">最近广播</span></div>': {
    en: '<div class="tl-head" style="margin-top:8px"><span colspan="4">Recent broadcasts</span></div>',
    'zh-Hant': '<div class="tl-head" style="margin-top:8px"><span colspan="4">最近的廣播</span></div>',
  },
  '<div class="log-line info">（运行后这里会实时列出广播事件）</div>': {
    en: '<div class="log-line info">(Broadcast events are listed here in real time once running)</div>',
    'zh-Hant': '<div class="log-line info">（執行後這裡會即時列出廣播事件）</div>',
  },
  '<div class="log-line bus"><span class="f">帧 {e.frame}</span>': {
    en: '<div class="log-line bus"><span class="f">Frame {e.frame}</span>',
    'zh-Hant': '<div class="log-line bus"><span class="f">幀 {e.frame}</span>',
  },
  "<span>{isPhase ? '阶段广播' : ": {
    en: "<span>{isPhase ? 'Stage broadcast' : ",
    'zh-Hant': "<span>{isPhase ? '階段廣播' : ",
  },
  '{esc(ch.name)} <span class="badge">{ch.builtin ? \'内置\' : \'自定义\'} · {subs.length} 个订阅者': {
    en: '{esc(ch.name)} <span class="badge">{ch.builtin ? \'Built-in\' : \'Custom\'} · {subs.length} subscribers',
    'zh-Hant': '{esc(ch.name)} <span class="badge">{ch.builtin ? \'內建\' : \'自訂\'} · {subs.length} 個訂閱者',
  },
  '（没有脚本订阅这个广播）': {
    en: '(No scripts subscribe to this broadcast)',
    'zh-Hant': '（沒有腳本訂閱這個廣播）',
  },
  '当「{s.a}」碰到「{s.b}」': {
    en: 'When {s.a} touches {s.b}',
    'zh-Hant': '當「{s.a}」碰到「{s.b}」',
  },
  '当按下「{s.key}」': {
    en: 'When {s.key} key pressed',
    'zh-Hant': '當按下「{s.key}」',
  },
  '当「{s.a}」被点击': {
    en: 'When {s.a} clicked',
    'zh-Hant': '當「{s.a}」被點擊',
  },
  '当作为克隆体启动': {
    en: 'When I start as a clone',
    'zh-Hant': '當作為分身啟動',
  },
  '当 ▶ 被点击': {
    en: 'When ▶ clicked',
    'zh-Hant': '當 ▶ 被點擊',
  },
  '当收到「{s.channel}」': {
    en: 'When I receive {s.channel}',
    'zh-Hant': '當收到「{s.channel}」',
  },
  '{s.entityName} · {shape} · {(s.script.body.blocks || []).length} 块积木': {
    en: '{s.entityName} · {shape} · {(s.script.body.blocks || []).length} blocks',
    'zh-Hant': '{s.entityName} · {shape} · {(s.script.body.blocks || []).length} 塊積木',
  },
  ' · 已取消订阅': {
    en: ' · unsubscribed',
    'zh-Hant': ' · 已取消訂閱',
  },
  '<div class="var-card"><div class="k">变量 {esc(k)}</div><div class="v">{esc(fmt(v))}</div></div>': {
    en: '<div class="var-card"><div class="k">Variable {esc(k)}</div><div class="v">{esc(fmt(v))}</div></div>',
    'zh-Hant': '<div class="var-card"><div class="k">變數 {esc(k)}</div><div class="v">{esc(fmt(v))}</div></div>',
  },
  '<div class="var-card"><div class="k">列表 {esc(k)} · {arr.length} 项</div><div class="v">{esc(arr.slice(0, 8).map(fmt).join(\', \'))}{arr.length > 8 ? \' …\' : \'\'}</div></div>': {
    en: '<div class="var-card"><div class="k">List {esc(k)} · {arr.length} items</div><div class="v">{esc(arr.slice(0, 8).map(fmt).join(\', \'))}{arr.length > 8 ? \' …\' : \'\'}</div></div>',
    'zh-Hant': '<div class="var-card"><div class="k">清單 {esc(k)} · {arr.length} 項</div><div class="v">{esc(arr.slice(0, 8).map(fmt).join(\', \'))}{arr.length > 8 ? \' …\' : \'\'}</div></div>',
  },
  '<div class="var-card"><div class="k">{esc(e.name)}{e.isClone ? \' · 克隆体\' : \'\'}</div>': {
    en: '<div class="var-card"><div class="k">{esc(e.name)}{e.isClone ? \' · clone\' : \'\'}</div>',
    'zh-Hant': '<div class="var-card"><div class="k">{esc(e.name)}{e.isClone ? \' · 分身\' : \'\'}</div>',
  },
  '<div class="perf-row"><b>帧号</b><span>{rt.frame}</span><span>运行 {rt.time.toFixed(1)}s · delta {(rt.delta * 1000).toFixed(1)}ms</span></div>': {
    en: '<div class="perf-row"><b>Frame #</b><span>{rt.frame}</span><span>Running {rt.time.toFixed(1)}s · delta {(rt.delta * 1000).toFixed(1)}ms</span></div>',
    'zh-Hant': '<div class="perf-row"><b>幀號</b><span>{rt.frame}</span><span>已執行 {rt.time.toFixed(1)}s · delta {(rt.delta * 1000).toFixed(1)}ms</span></div>',
  },
  '<div class="perf-row"><b>克隆体</b><span>{rt.state.clones.filter((n) => rt.state.entities[n]).length}</span><span>粒子 {rt.state.particles.length}</span></div>': {
    en: '<div class="perf-row"><b>Clones</b><span>{rt.state.clones.filter((n) => rt.state.entities[n]).length}</span><span>Particles {rt.state.particles.length}</span></div>',
    'zh-Hant': '<div class="perf-row"><b>分身</b><span>{rt.state.clones.filter((n) => rt.state.entities[n]).length}</span><span>粒子 {rt.state.particles.length}</span></div>',
  },
  '<div class="perf-row"><b>活跃脚本线程</b><span>{Object.keys(rt._subscriptions || {}).length}</span><span></span></div>': {
    en: '<div class="perf-row"><b>Active script threads</b><span>{Object.keys(rt._subscriptions || {}).length}</span><span></span></div>',
    'zh-Hant': '<div class="perf-row"><b>使用中的腳本執行緒</b><span>{Object.keys(rt._subscriptions || {}).length}</span><span></span></div>',
  },
  '<span><div class="bar" style="width:{w}%"></div> <span class="dim">{s.calls} 次派发 · {s.subs} 订阅</span></span></div>': {
    en: '<span><div class="bar" style="width:{w}%"></div> <span class="dim">{s.calls} dispatches · {s.subs} subscriptions</span></span></div>',
    'zh-Hant': '<span><div class="bar" style="width:{w}%"></div> <span class="dim">{s.calls} 次派發 · {s.subs} 個訂閱</span></span></div>',
  },
  '<div class="log-line info">（空）</div>': {
    en: '<div class="log-line info">(empty)</div>',
    'zh-Hant': '<div class="log-line info">（空）</div>',
  },
  '舞台': { en: 'Stage', 'zh-Hant': '舞台' },
  '实体': { en: 'Entity', 'zh-Hant': '實體' },
  '克隆体（{clones.length}）': { en: 'Clones ({clones.length})', 'zh-Hant': '分身（{clones.length}）' },
  '<div class="dim" style="padding:8px">选中一个实体</div>': {
    en: '<div class="dim" style="padding:8px">Select an entity</div>',
    'zh-Hant': '<div class="dim" style="padding:8px">選取一個實體</div>',
  },
  '修改属性': { en: 'Edit properties', 'zh-Hant': '修改屬性' },
  '名称': { en: 'Name', 'zh-Hant': '名稱' },
  '方向': { en: 'Direction', 'zh-Hant': '方向' },
  '大小 %': { en: 'Size %', 'zh-Hant': '尺寸 %' },
  '形状': { en: 'Shape', 'zh-Hant': '形狀' },
  '宽 / 高': { en: 'Width / height', 'zh-Hant': '寬 / 高' },
  '颜色': { en: 'Color', 'zh-Hant': '顏色' },
  '物理 / 碰撞': { en: 'Physics / collision', 'zh-Hant': '物理 / 碰撞' },
  '重力': { en: 'Gravity', 'zh-Hant': '重力' },
  '弹性': { en: 'Bounce', 'zh-Hant': '彈性' },
  '实心（角色可站立）': { en: 'Solid (sprites can stand on it)', 'zh-Hant': '實心（角色可站立）' },
  '初始可见': { en: 'Visible at start', 'zh-Hant': '初始可見' },
  '标记为舞台': { en: 'Mark as stage', 'zh-Hant': '標記為舞台' },
  '删除这个实体': { en: 'Delete this entity', 'zh-Hant': '刪除這個實體' },
  '删除实体': { en: 'Delete entity', 'zh-Hant': '刪除實體' },
  '设置父级': { en: 'Set parent', 'zh-Hant': '設定父級' },
  '把实体拖到这里可取消父子关系': { en: 'Drop an entity here to unparent it', 'zh-Hant': '把實體拖到這裡可取消父子關係' },
  '删除「{_1}」？': { en: 'Delete "{_1}"?', 'zh-Hant': '刪除「{_1}」？' },
  '它有 {_1} 段脚本、被别处引用 {_2} 次、运行时有 {_3} 条订阅。删除后，这些脚本和订阅会一起消失。': {
    en: 'It has {_1} script(s), is referenced {_2} time(s) elsewhere, and has {_3} subscription(s) at runtime. Deleting removes those scripts and subscriptions together.',
    'zh-Hant': '它有 {_1} 段腳本、被別處引用 {_2} 次、執行時有 {_3} 條訂閱。刪除後，這些腳本和訂閱會一起消失。',
  },
  '别处对它的引用会留在原地（改成谁都不合适）；删错了可以 Ctrl+Z 撤销。': {
    en: 'References to it elsewhere are left in place (there is no right substitute); you can undo with Ctrl+Z.',
    'zh-Hant': '別處對它的引用會留在原地（改成誰都不合適）；刪錯了可以 Ctrl+Z 復原。',
  },
  '初始化值': { en: 'Initial value', 'zh-Hant': '初始值' },
  '修改变量': { en: 'Change variable', 'zh-Hant': '變更變數' },
  '重命名': { en: 'Rename', 'zh-Hant': '重新命名' },
  '删除': { en: 'Delete', 'zh-Hant': '刪除' },
  '删除变量': { en: 'Delete variable', 'zh-Hant': '刪除變數' },
  '{Array.isArray(v) ? v.length : 0} 项': {
    en: '{Array.isArray(v) ? v.length : 0} items',
    'zh-Hant': '{Array.isArray(v) ? v.length : 0} 項',
  },
  '清空': { en: 'Clear', 'zh-Hant': '清空' },
  '清空列表': { en: 'Clear list', 'zh-Hant': '清空清單' },
  '删除列表': { en: 'Delete list', 'zh-Hant': '刪除清單' },
  '内置 · ': { en: 'Built-in · ', 'zh-Hant': '內建 · ' },
  '{subs.length} 订阅': { en: '{subs.length} subscriptions', 'zh-Hant': '{subs.length} 個訂閱' },
  '查看订阅者': { en: 'View subscribers', 'zh-Hant': '檢視訂閱者' },
  '改颜色': { en: 'Change color', 'zh-Hant': '變更顏色' },
  '内置': { en: 'Built-in', 'zh-Hant': '內建' },
  '{m.display} · {m.kind} · {m.codegen} · 被调用 {uses} 次': {
    en: '{m.display} · {m.kind} · {m.codegen} · called {uses} times',
    'zh-Hant': '{m.display} · {m.kind} · {m.codegen} · 被呼叫 {uses} 次',
  },
  '编辑定义…': { en: 'Edit definition...', 'zh-Hant': '編輯定義…' },
  '<div class="list-row dim">还没有合成积木。在积木视图里右键一段积木 → 合成新积木。</div>': {
    en: '<div class="list-row dim">No custom blocks yet. In the block view, right-click a stack of blocks → Make a new block.</div>',
    'zh-Hant': '<div class="list-row dim">還沒有合成積木。在積木檢視裡對一段積木按右鍵 → 合成新積木。</div>',
  },

  /* ---------------- src/ui/dialogs.js ---------------- */
  '取消': { en: 'Cancel', 'zh-Hant': '取消' },
  '保存': { en: 'Save', 'zh-Hant': '儲存' },

  /* ---------------- src/ui/macro-dialog.js ---------------- */
  '// 这段是事件积木的默认动作，改成你要的': {
    en: '// Default action for an event block - change it to what you need',
    'zh-Hant': '// 這段是事件積木的預設動作，改成你要的',
  },
  '// 在这里写这个积木做什么': {
    en: '// Write what this block does here',
    'zh-Hant': '// 在這裡寫這個積木做什麼',
  },
  '新积木 (x)': { en: 'New block (x)', 'zh-Hant': '新積木 (x)' },
  '表达式（返回值）': { en: 'Expression (returns a value)', 'zh-Hant': '運算式（傳回值）' },
  '语句（执行动作）': { en: 'Statement (performs an action)', 'zh-Hant': '陳述式（執行動作）' },
  '事件（组合帽块）': { en: 'Event (hat block)', 'zh-Hant': '事件（組合帽塊）' },
  '实现已换成占位积木，保存后在积木视图里直接搭': {
    en: 'Implementation reset to a placeholder block; build it in the blocks view after saving',
    'zh-Hant': '實作已換成占位積木，儲存後在積木視圖裡直接搭建',
  },
  '仅本角色': { en: 'This sprite only', 'zh-Hant': '僅本角色' },
  '项目': { en: 'Project', 'zh-Hant': '專案' },
  '全局': { en: 'Global', 'zh-Hant': '全域' },
  '内联展开': { en: 'Inline expansion', 'zh-Hant': '內嵌展開' },
  '函数调用': { en: 'Function call', 'zh-Hant': '函式呼叫' },
  '原生映射': { en: 'Native mapping', 'zh-Hant': '原生對應' },
  '参数：<code>{chosen.map((r) => r.nm.value).join(\', \')}</code> —— 调用这个积木时，这些槽位会变成可填的输入口。': {
    en: 'Parameters: <code>{chosen.map((r) => r.nm.value).join(\', \')}</code> - when this block is called, these slots become fillable inputs.',
    'zh-Hant': '參數：<code>{chosen.map((r) => r.nm.value).join(\', \')}</code> —— 呼叫這個積木時，這些槽位會變成可填的輸入口。',
  },
  '没有提升任何参数：这个积木会把当前的字面量固化下来。': {
    en: 'No parameters promoted: this block will freeze the current literals.',
    'zh-Hant': '沒有提升任何參數：這個積木會把目前的字面值固定下來。',
  },
  '({lit.value})  →  出现 {countOccurrences(bodyIR, lit)} 次': {
    en: '({lit.value})  →  appears {countOccurrences(bodyIR, lit)} times',
    'zh-Hant': '({lit.value})  →  出現 {countOccurrences(bodyIR, lit)} 次',
  },
  '显示形式': { en: 'Display form', 'zh-Hant': '顯示形式' },
  '类型': { en: 'Type', 'zh-Hant': '類型' },
  '分类': { en: 'Category', 'zh-Hant': '分類' },
  '图标': { en: 'Icon', 'zh-Hant': '圖示' },
  '作用域': { en: 'Scope', 'zh-Hant': '作用範圍' },
  '代码生成': { en: 'Code generation', 'zh-Hant': '程式碼產生' },
  '<b>自由变量</b>：勾选要提升为参数的槽位（策划案 §7.2 第 3 步）。': {
    en: '<b>Free variables</b>: check the slots to promote to parameters (design doc §7.2, step 3).',
    'zh-Hant': '<b>自由變數</b>：勾選要提升為參數的槽位（設計文件 §7.2 第 3 步）。',
  },
  '保存后会立刻注册到选择区对应分类下；调用点可以随时右键「展开」还原成基础积木。': {
    en: 'After saving it is registered immediately under the matching category in the palette; any call site can be expanded back into basic blocks from its right-click menu at any time.',
    'zh-Hant': '儲存後會立刻註冊到選擇區對應分類下；呼叫點可以隨時從右鍵選單「展開」還原成基礎積木。',
  },
  '编辑积木「{macro.name}」': { en: 'Edit block "{macro.name}"', 'zh-Hant': '編輯積木「{macro.name}」' },
  '合成新积木': { en: 'Make a new block', 'zh-Hant': '合成新積木' },
  '保存修改': { en: 'Save changes', 'zh-Hant': '儲存修改' },
  '合成': { en: 'Create', 'zh-Hant': '合成' },
  '请填写名称': { en: 'Please enter a name', 'zh-Hant': '請填寫名稱' },
  '修改积木「{name}」': { en: 'Edit block "{name}"', 'zh-Hant': '修改積木「{name}」' },
  '合成新积木「{name}」': { en: 'Make block "{name}"', 'zh-Hant': '合成新積木「{name}」' },
  '积木定义已更新': { en: 'Block definition updated', 'zh-Hant': '積木定義已更新' },
  '已合成「{name}」，去选择区看看': { en: 'Created "{name}" - check the palette', 'zh-Hant': '已合成「{name}」，去選擇區看看' },
  '战斗系统': { en: 'Combat system', 'zh-Hant': '戰鬥系統' },
  '项目内可见': { en: 'Visible in project', 'zh-Hant': '專案內可見' },
  '分类名称': { en: 'Category name', 'zh-Hant': '分類名稱' },
  '排序值': { en: 'Order', 'zh-Hant': '排序值' },
  '可见性': { en: 'Visibility', 'zh-Hant': '可見性' },
  '分类决定积木的默认颜色、图标与在选择区里的位置。内置分类不可以删除。': {
    en: 'A category determines the default color, icon, and palette position of its blocks. Built-in categories cannot be deleted.',
    'zh-Hant': '分類決定積木的預設顏色、圖示與在選擇區裡的位置。內建分類不可以刪除。',
  },
  '新建积木分类': { en: 'New block category', 'zh-Hant': '新增積木分類' },
  '创建': { en: 'Create', 'zh-Hant': '建立' },
  '请填写分类名称': { en: 'Please enter a category name', 'zh-Hant': '請填寫分類名稱' },
  '已创建分类「{name}」': { en: 'Created category "{name}"', 'zh-Hant': '已建立分類「{name}」' },
  '方块': { en: 'Box', 'zh-Hant': '方塊' },
  '胶囊': { en: 'Capsule', 'zh-Hant': '膠囊' },
  '圆形': { en: 'Circle', 'zh-Hant': '圓形' },
  '三角': { en: 'Triangle', 'zh-Hant': '三角形' },
  '菱形': { en: 'Diamond', 'zh-Hant': '菱形' },

  /* ---------------- src/ui/appearance.js ---------------- */
  '非衬线（默认）': { en: 'Sans-serif (default)', 'zh-Hant': '無襯線（預設）' },
  '衬线': { en: 'Serif', 'zh-Hant': '襯線' },
  '等宽': { en: 'Monospace', 'zh-Hant': '等寬' },
  '等宽（默认）': { en: 'Monospace (default)', 'zh-Hant': '等寬（預設）' },
  '非衬线': { en: 'Sans-serif', 'zh-Hant': '無襯線' },
  '小': { en: 'Small', 'zh-Hant': '小' },
  '标准': { en: 'Standard', 'zh-Hant': '標準' },
  '大': { en: 'Large', 'zh-Hant': '大' },
  '特大': { en: 'Extra large', 'zh-Hant': '特大' },
  '夜幕 · 蓝': { en: 'Dusk · Blue', 'zh-Hant': '夜幕 · 藍' },
  '午夜 · 墨': { en: 'Midnight · Ink', 'zh-Hant': '午夜 · 墨' },
  'Nord · 极地': { en: 'Nord · Polar', 'zh-Hant': 'Nord · 極地' },
  '晨曦 · 白': { en: 'Dawn · White', 'zh-Hant': '晨曦 · 白' },
  'Solarized · 纸': { en: 'Solarized · Paper', 'zh-Hant': 'Solarized · 紙' },
  'Material You · 暗': { en: 'Material You · Dark', 'zh-Hant': 'Material You · 暗' },
  'Material You · 亮': { en: 'Material You · Light', 'zh-Hant': 'Material You · 亮' },
  'Material You · 生动': { en: 'Material You · Vivid', 'zh-Hant': 'Material You · 生動' },
  '蓝': { en: 'Blue', 'zh-Hant': '藍' },
  '紫': { en: 'Purple', 'zh-Hant': '紫' },
  '品红': { en: 'Magenta', 'zh-Hant': '洋紅' },
  '红': { en: 'Red', 'zh-Hant': '紅' },
  '橙': { en: 'Orange', 'zh-Hant': '橙' },
  '绿': { en: 'Green', 'zh-Hant': '綠' },
  '青': { en: 'Teal', 'zh-Hant': '青' },
  '石墨': { en: 'Graphite', 'zh-Hant': '石墨' },
  '主题': { en: 'Theme', 'zh-Hant': '主題' },
  '跟随系统': { en: 'Follow system', 'zh-Hant': '跟隨系統' },
  '重点色': { en: 'Accent color', 'zh-Hant': '強調色' },
  '跟随主题': { en: 'Follow theme', 'zh-Hant': '跟隨主題' },
  '自定义颜色': { en: 'Custom color', 'zh-Hant': '自訂顏色' },
  '字体与字号': { en: 'Fonts and sizes', 'zh-Hant': '字型與字型大小' },
  '界面字体': { en: 'UI font', 'zh-Hant': '介面字型' },
  '界面字号': { en: 'UI font size', 'zh-Hant': '介面字型大小' },
  '代码字体': { en: 'Code font', 'zh-Hant': '程式碼字型' },
  '代码字号': { en: 'Code font size', 'zh-Hant': '程式碼字型大小' },
  '分享码': { en: 'Share code', 'zh-Hant': '分享碼' },
  '把一套外观发给别人：点「生成分享码」复制走；拿到别人的就粘到这里点「应用分享码」': {
    en: 'Send a whole look to someone: click "Generate share code" and copy it; if someone sent you one, paste it here and click "Apply share code"',
    'zh-Hant': '把一組外觀傳給別人：點「產生分享碼」複製走；拿到別人的就貼到這裡點「套用分享碼」',
  },
  '生成分享码': { en: 'Generate share code', 'zh-Hant': '產生分享碼' },
  '已生成，Ctrl+C 复制走': { en: 'Generated - press Ctrl+C to copy', 'zh-Hant': '已產生，Ctrl+C 複製走' },
  '应用分享码': { en: 'Apply share code', 'zh-Hant': '套用分享碼' },
  '先粘一份分享码进来': { en: 'Paste a share code first', 'zh-Hant': '請先貼上一份分享碼' },
  '外观已套用': { en: 'Appearance applied', 'zh-Hant': '外觀已套用' },
  '这个分享码认不出来（一个字段都不认识）': {
    en: 'This share code is not recognized (none of its fields are known)',
    'zh-Hant': '這個分享碼認不出來（一個欄位都不認識）',
  },
  '这些都是编辑器自己的偏好，不会写进项目文件 —— 换台机器打开同一个游戏，样式各自保留。<br>': {
    en: 'These are preferences of your editor and are never written to the project file - open the same game on another machine and each keeps its own styling.<br>',
    'zh-Hant': '這些都是編輯器自己的偏好，不會寫進專案檔案 —— 換台機器開啟同一個遊戲，樣式各自保留。<br>',
  },
  '在 Material You 主题下，重点色就是「种子」—— 换一个颜色，整套界面会照着它重新长一遍。': {
    en: 'Under a Material You theme the accent is the "seed" - pick another color and the whole interface is regenerated from it.',
    'zh-Hant': '在 Material You 主題下，重點色就是「種子」—— 換一個顏色，整套介面會照著它重新長一遍。',
  },
  '积木画布与代码区共用「编辑区主题」，不选就是跟随界面主题；积木本身的分类色是 Scratch 官方色，不跟着换。': {
    en: 'The block canvas and the code area share one "editing theme" (leave it unset to follow the interface theme); the category colors on blocks themselves are the official Scratch colors and never change.',
    'zh-Hant': '積木畫布與程式碼區共用「編輯區主題」，不選就是跟隨介面主題；積木本身的分類色是 Scratch 官方色，不跟著換。',
  },
  '设置 · 编辑器': { en: 'Settings · Editor', 'zh-Hant': '設定 · 編輯器' },
  '设置': { en: 'Settings', 'zh-Hant': '設定' },
  '设置与帮助：主题 / 字体 / 语言 / 积木与代码 (Ctrl+,)': {
    en: 'Settings & help: theme / fonts / language / blocks & code (Ctrl+,)',
    'zh-Hant': '設定與說明：主題 / 字型 / 語言 / 積木與程式碼 (Ctrl+,)',
  },

  /* ---- 编辑区主题：积木画布与代码区共用的一套配色 ---- */
  '积木与代码': { en: 'Blocks & code', 'zh-Hant': '積木與程式碼' },
  '编辑区主题': { en: 'Editing theme', 'zh-Hant': '編輯區主題' },
  '积木画布和代码区共用这一套：换一个，两个编辑区一起变，不会一个深一个浅。': {
    en: 'The block canvas and the code area share it: change one and both editors change together, never one dark and one light.',
    'zh-Hant': '積木畫布和程式碼區共用這一套：換一個，兩個編輯區一起變，不會一個深一個淺。',
  },
  '跟随界面主题': { en: 'Follow interface theme', 'zh-Hant': '跟隨介面主題' },
  '夜幕 · 靛': { en: 'Nightfall · Indigo', 'zh-Hant': '夜幕 · 靛' },
  '德古拉': { en: 'Dracula', 'zh-Hant': '德古拉' },
  'Solarized · 暗': { en: 'Solarized · Dark', 'zh-Hant': 'Solarized · 暗' },
  'GitHub · 白': { en: 'GitHub · Light', 'zh-Hant': 'GitHub · 白' },
  '暖阳 · 纸': { en: 'Sunlight · Paper', 'zh-Hant': '暖陽 · 紙' },
  '示例项目已载入：按 ▶ 或 F5 会开一个窗口来玩；也可以直接点积木执行它': {
    en: 'Sample project loaded: press ▶ or F5 to play it in a separate window; you can also click a block to run it directly',
    'zh-Hant': '範例專案已載入：按 ▶ 或 F5 會開一個視窗來玩；也可以直接點積木執行它',
  },

  /* ---- 顶栏运行区的按钮提示（独立窗口成了默认玩法）---- */
  '在独立窗口里运行 (F5)': {
    en: 'Run in a separate window (F5)',
    'zh-Hant': '在獨立視窗裡執行 (F5)',
  },
  '暂停（编辑器里的逐帧调试）': {
    en: 'Pause (step debugging in the editor)',
    'zh-Hant': '暫停（編輯器裡的逐幀除錯）',
  },
  '停止（也会关掉运行窗口）': {
    en: 'Stop (also closes the run window)',
    'zh-Hant': '停止（也會關掉執行視窗）',
  },
  '完成': { en: 'Done', 'zh-Hant': '完成' },
  '恢复默认': { en: 'Restore defaults', 'zh-Hant': '恢復預設' },

  /* ---- 时间轴 / 订阅列表里的碎片（拼进模板串，所以单独成键）---- */
  '阶段广播': { en: 'phase broadcast', 'zh-Hant': '階段廣播' },
  '来自 {_1} · 参数 {_2} · {_3} 个订阅者':
    { en: 'from {_1} · value {_2} · {_3} subscribers', 'zh-Hant': '來自 {_1} · 參數 {_2} · {_3} 個訂閱者' },
  '自定义': { en: 'custom', 'zh-Hant': '自訂' },
  '阶段': { en: 'phase', 'zh-Hant': '階段' },
  '事件': { en: 'event', 'zh-Hant': '事件' },
  '生命周期': { en: 'lifecycle', 'zh-Hant': '生命週期' },
  '输入': { en: 'input', 'zh-Hant': '輸入' },
  '物理': { en: 'physics', 'zh-Hant': '物理' },

  /* ---- 对话框里的示例代码（注释跟着界面语言走）---- */
  '\n// 例：self.x += 10;': { en: '\n// example: self.x += 10;', 'zh-Hant': '\n// 例：self.x += 10;' },
  'tl.move(speed, 0);   // 注释': { en: 'tl.move(speed, 0);   // comment', 'zh-Hant': 'tl.move(speed, 0);   // 註解' },

  /* ---- 拼进模板串的碎片 ---- */
  " · 克隆体": { en: " · clone", 'zh-Hant': " · 分身" },

  /* ---- 拼进模板串的碎片 ---- */

  /* ---- 语言选择 ---- */
  "界面语言": { en: "Interface language", 'zh-Hant': "介面語言" },
  "换语言会重载窗口：积木上的字、原生积木的译文和所有面板要一起重建": { en: "Changing the language reloads the window: block text, the built-in block translations and every panel are rebuilt together", 'zh-Hant': "換語言會重新載入視窗：積木上的字、原生積木的譯文和所有面板要一起重建" },
};
