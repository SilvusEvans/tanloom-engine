/**
 * Tanloom Engine — 外壳文案：顶栏 / 帮助 / HTML 静态文字 / 代码编辑器 / 输入
 * ================================================================
 * 覆盖 src/app.js、src/index.html、src/player.js、src/player.html、
 * src/code/editor.js、src/input/keys.js、src/scene/viewport.js 七个文件里
 * 会被用户看到的中文字符串。
 *
 * 键 = 简体原文（它同时也是 zh-Hans 的译文），所以只存 en 与 zh-Hant 两份。
 * 模板字符串里的 `${expr}` 写成 `{expr}`，译文里的占位符与键一一对应。
 * 英文术语对齐 Scratch 官方英文，繁中术语对齐 Scratch 官方繁中。
 *
 * 跳过（数据而非界面文案）：新建实体 / 变量 / 列表 / 广播的默认名 ——
 * 它们是写进项目文件（.tle）的标识符，不随界面语言变。
 */
export const SHELL = {
  /* ---------------- src/app.js ---------------- */
  'rt.load 失败': { en: 'rt.load failed', 'zh-Hant': 'rt.load 失敗' },
  '这是舞台：它的脚本负责全局逻辑与 HUD': {
    en: 'This is the stage: its scripts handle the global logic and the HUD',
    'zh-Hant': '這是舞台：它的腳本負責全域邏輯與 HUD',
  },
  '已新建「{ent.name}」': { en: 'Created "{ent.name}"', 'zh-Hant': '已新增「{ent.name}」' },
  '帧 {rt.frame}': { en: 'Frame {rt.frame}', 'zh-Hant': '幀 {rt.frame}' },
  'Esc / 「退出」返回编辑器': {
    en: 'Esc / "Exit" returns to the editor',
    'zh-Hant': 'Esc / 「結束」返回編輯器',
  },
  '⤡ 退出窗口全屏': { en: '⤡ Exit window fullscreen', 'zh-Hant': '⤡ 結束視窗全螢幕' },
  '⛶ 窗口全屏': { en: '⛶ Window fullscreen', 'zh-Hant': '⛶ 視窗全螢幕' },
  '⏹ 停止': { en: '⏹ Stop', 'zh-Hant': '⏹ 停止' },
  '▶ 运行': { en: '▶ Run', 'zh-Hant': '▶ 執行' },
  '已停止': { en: 'Stopped', 'zh-Hant': '已停止' },
  '当前环境不支持独立窗口（要用 Electron 打开）': {
    en: 'The separate window is not supported in this environment (open it with Electron)',
    'zh-Hant': '目前環境不支援獨立執行視窗（要用 Electron 開啟）',
  },
  '没能打开运行窗口': { en: 'Could not open the run window', 'zh-Hant': '無法開啟執行視窗' },
  '已在独立窗口里运行 · 编辑器这边的预览已停下；改了积木那边会热重载': {
    en: 'Running in the separate window · the preview in the editor has stopped; block edits hot-reload over there',
    'zh-Hant': '已在獨立視窗裡執行 · 編輯器這邊的預覽已停下；改了積木那邊會熱重載',
  },
  '当前环境不支持切换窗口全屏': {
    en: 'This environment does not support toggling window fullscreen',
    'zh-Hant': '目前環境不支援切換視窗全螢幕',
  },
  '已保存到 ': { en: 'Saved to ', 'zh-Hant': '已儲存到 ' },
  '已下载项目文件': { en: 'Project file downloaded', 'zh-Hant': '已下載專案檔案' },
  '项目已载入': { en: 'Project loaded', 'zh-Hant': '專案已載入' },
  '项目文件解析失败：': {
    en: 'Failed to parse the project file: ',
    'zh-Hant': '專案檔案解析失敗：',
  },
  '代码已导出到 ': { en: 'Code exported to ', 'zh-Hant': '程式碼已匯出到 ' },
  '已下载 {files.length} 个文件': {
    en: 'Downloaded {files.length} files',
    'zh-Hant': '已下載 {files.length} 個檔案',
  },
  '帮助 · Tanloom Engine': { en: 'Help · Tanloom Engine', 'zh-Hant': '說明 · Tanloom Engine' },
  '知道了': { en: 'Got it', 'zh-Hant': '知道了' },
  '关闭': { en: 'Close', 'zh-Hant': '關閉' },
  'Tanloom Engine 已就绪 · 点 ▶ 运行示例项目': {
    en: 'Tanloom Engine is ready · click ▶ to run the sample project',
    'zh-Hant': 'Tanloom Engine 已就緒 · 點 ▶ 執行範例專案',
  },
  '运行窗口已关闭': { en: 'Run window closed', 'zh-Hant': '執行視窗已關閉' },
  '示例项目已载入：按 ▶ 或 F5 试玩，F11 全屏；也可以直接点积木执行它': {
    en: 'Sample project loaded: press ▶ or F5 to play, F11 for fullscreen; you can also click a block to run it directly',
    'zh-Hant': '範例專案已載入：按 ▶ 或 F5 試玩，F11 全螢幕；也可以直接點積木執行它',
  },

  /* ---------------- src/index.html ---------------- */
  '新建实体': { en: 'New entity', 'zh-Hant': '新增實體' },
  '运行 (F5)': { en: 'Run (F5)', 'zh-Hant': '執行 (F5)' },
  '暂停': { en: 'Pause', 'zh-Hant': '暫停' },
  '单步推进一帧': { en: 'Step one frame', 'zh-Hant': '單步前進一幀' },
  '停止': { en: 'Stop', 'zh-Hant': '停止' },
  '在独立窗口里运行 (F6)': {
    en: 'Run in a separate window (F6)',
    'zh-Hant': '在獨立執行視窗裡執行 (F6)',
  },
  '全屏游玩 (F11)': { en: 'Fullscreen play (F11)', 'zh-Hant': '全螢幕遊玩 (F11)' },
  '撤销 (Ctrl+Z)': { en: 'Undo (Ctrl+Z)', 'zh-Hant': '復原 (Ctrl+Z)' },
  '重做 (Ctrl+Y)': { en: 'Redo (Ctrl+Y)', 'zh-Hant': '重做 (Ctrl+Y)' },
  '外观：主题色 / 字体 / 字号 (Ctrl+,)': {
    en: 'Appearance: theme color / font / font size (Ctrl+,)',
    'zh-Hant': '外觀：主題色 / 字型 / 字型大小 (Ctrl+,)',
  },
  '帮助': { en: 'Help', 'zh-Hant': '說明' },
  '新建分类': { en: 'New category', 'zh-Hant': '新增分類' },
  '缩放以适应': { en: 'Zoom to fit', 'zh-Hant': '縮放以適應' },
  '连窗口边框一起去掉': { en: 'Removes the window frame as well', 'zh-Hant': '連視窗邊框一起去掉' },
  '退出全屏 (Esc)': { en: 'Exit fullscreen (Esc)', 'zh-Hant': '結束全螢幕 (Esc)' },

  /* ---------------- src/player.js ---------------- */
  '⚠ 项目加载失败：': { en: '⚠ Failed to load the project: ', 'zh-Hant': '⚠ 專案載入失敗：' },
  ' · 运行': { en: ' · Run', 'zh-Hant': ' · 執行' },
  '▶ 继续': { en: '▶ Resume', 'zh-Hant': '▶ 繼續' },
  '⏸ 暂停': { en: '⏸ Pause', 'zh-Hant': '⏸ 暫停' },
  '已从头重新运行': { en: 'Restarted from the beginning', 'zh-Hant': '已從頭重新執行' },
  '⤡ 退出全屏': { en: '⤡ Exit fullscreen', 'zh-Hant': '⤡ 結束全螢幕' },
  '⛶ 全屏': { en: '⛶ Fullscreen', 'zh-Hant': '⛶ 全螢幕' },
  '已热重载项目': { en: 'Project hot-reloaded', 'zh-Hant': '專案已熱重載' },
  '⚠ 热重载失败：': { en: '⚠ Hot reload failed: ', 'zh-Hant': '⚠ 熱重載失敗：' },
  '等待编辑器发送项目…': {
    en: 'Waiting for the editor to send the project...',
    'zh-Hant': '等待編輯器傳送專案…',
  },
  '⚠ 取项目失败：': { en: '⚠ Failed to get the project: ', 'zh-Hant': '⚠ 取得專案失敗：' },

  /* ---------------- src/player.html ---------------- */
  '从头重新运行': { en: 'Restart from the beginning', 'zh-Hant': '從頭重新執行' },
  '暂停 / 继续': { en: 'Pause / resume', 'zh-Hant': '暫停 / 繼續' },
  '窗口全屏 (F11)': { en: 'Window fullscreen (F11)', 'zh-Hant': '視窗全螢幕 (F11)' },
  '关闭这个窗口 (Esc)': { en: 'Close this window (Esc)', 'zh-Hant': '關閉這個視窗 (Esc)' },

  /* ---------------- src/code/editor.js ---------------- */
  '未保存 · 按 Ctrl+S 同步回积木视图': {
    en: 'Unsaved · press Ctrl+S to sync back to the block view',
    'zh-Hant': '未儲存 · 按 Ctrl+S 同步回積木檢視',
  },
  '只读': { en: 'Read-only', 'zh-Hant': '唯讀' },
  '只读参考文件': { en: 'Read-only reference file', 'zh-Hant': '唯讀參考檔案' },
  '已同步 · 编辑后按 Ctrl+S 写回积木': {
    en: 'Synced · after editing, press Ctrl+S to write back to the blocks',
    'zh-Hant': '已同步 · 編輯後按 Ctrl+S 寫回積木',
  },
  '<span class="err">{this.diagnostics.length} 条解析提示</span>': {
    en: '<span class="err">{this.diagnostics.length} parse hints</span>',
    'zh-Hant': '<span class="err">{this.diagnostics.length} 條解析提示</span>',
  },
  '✓ 已同步回积木视图': { en: '✓ Synced back to the block view', 'zh-Hant': '✓ 已同步回積木檢視' },
  '同步完成，但有提示': { en: 'Synced, but with hints', 'zh-Hant': '同步完成，但有提示' },
  '⚠ 积木视图有新的改动，而这里的代码还没保存 —— 二者已经分叉。': {
    en: '⚠ The block view has new changes but the code here has not been saved yet - the two have diverged.',
    'zh-Hant': '⚠ 積木檢視有新的變更，而這裡的程式碼還沒儲存 —— 二者已經分叉。',
  },
  '以代码为准（覆盖积木）': {
    en: 'Use the code (overwrite the blocks)',
    'zh-Hant': '以程式碼為準（覆寫積木）',
  },
  '以积木为准（丢弃代码改动）': {
    en: 'Use the blocks (discard code changes)',
    'zh-Hant': '以積木為準（捨棄程式碼變更）',
  },

  /* ---------------- src/input/keys.js ---------------- */
  /* 该文件只有注释含中文，没有字符串字面量，无需条目。 */

  /* ---------------- src/scene/viewport.js ---------------- */
  '未运行 · 按 ▶ 开始': { en: 'Not running · press ▶ to start', 'zh-Hant': '未執行 · 按 ▶ 開始' },

  "Tanloom Engine · 双模游戏引擎": { en: "Tanloom Engine · dual-mode game engine", 'zh-Hant': "Tanloom Engine · 雙模遊戲引擎" },
  "Tanloom Engine 运行": { en: "Tanloom Engine — Player", 'zh-Hant': "Tanloom Engine 執行" },
  "重来": { en: "Restart", 'zh-Hant': "重來" },
  "关闭": { en: "Close", 'zh-Hant': "關閉" },
  "窗口全屏 (F11)": { en: "Fullscreen window (F11)", 'zh-Hant': "視窗全螢幕 (F11)" },
  "关闭这个窗口 (Esc)": { en: "Close this window (Esc)", 'zh-Hant': "關閉這個視窗 (Esc)" },
  /* ---- HTML 里的静态文字（index.html / player.html，靠 data-i18n 取）---- */
  "双模引擎": { en: "dual-mode engine", 'zh-Hant': "雙模引擎" },
  "积木": { en: "Blocks", 'zh-Hant': "積木" },
  "代码": { en: "Code", 'zh-Hant': "程式碼" },
  "场景": { en: "Scene", 'zh-Hant': "場景" },
  "资源": { en: "Assets", 'zh-Hant': "資源" },
  "编辑对象": { en: "Editing", 'zh-Hant': "編輯對象" },
  "运行": { en: "Run", 'zh-Hant': "執行" },
  "新窗口": { en: "New window", 'zh-Hant': "新視窗" },
  "全屏": { en: "Fullscreen", 'zh-Hant': "全螢幕" },
  "撤销": { en: "Undo", 'zh-Hant': "復原" },
  "重做": { en: "Redo", 'zh-Hant': "重做" },
  "打开": { en: "Open", 'zh-Hant': "開啟" },
  "保存": { en: "Save", 'zh-Hant': "儲存" },
  "导出代码": { en: "Export code", 'zh-Hant': "匯出程式碼" },
  "外观": { en: "Appearance", 'zh-Hant': "外觀" },
  "帧 {n}": { en: "frame {n}", 'zh-Hant': "幀 {n}" },
  "关闭这个窗口": { en: "Close this window", 'zh-Hant': "關閉這個視窗" },
  "窗口全屏": { en: "Fullscreen window", 'zh-Hant': "視窗全螢幕" },
};
