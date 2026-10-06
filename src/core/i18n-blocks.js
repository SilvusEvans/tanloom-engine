/**
 * Tanloom Engine — 积木上的文案（自定义积木的 message、右键菜单、toast、选择区提示等）
 * ================================================================
 * 覆盖 src/blocks/scratch/defs.js、workspace.js、toolbox.js、sync.js 四个文件里，
 * 会被用户看到的中文字符串（下拉项、变量/列表/广播名等「项目数据」由值 id 表负责，不在此列）。
 *
 * 键 = 简体原文（它同时也是 zh-Hans 的译文），所以只存 en 与 zh-Hant 两份。
 * 模板字符串里的 `${expr}` 写成 `{expr}`，译文里的占位符与键一一对应。
 * 英文术语对齐 Scratch 官方英文，繁中术语对齐 Scratch 官方繁中。
 */
export const BLOCKS = {
  /* ---------------- src/blocks/scratch/defs.js ---------------- */

  // 自定义积木的 message0（积木上印的字，%1 %2 是 Blockly 的槽位）
  '当收到 %1 广播': { en: 'when I receive %1', 'zh-Hant': '當收到 %1 廣播' },
  '当 %1 被点击': { en: 'when %1 clicked', 'zh-Hant': '當 %1 被點擊' },
  '当 %1 碰到 %2': { en: 'when %1 touches %2', 'zh-Hant': '當 %1 碰到 %2' },
  '克隆 %1': { en: 'clone %1', 'zh-Hant': '建立 %1 的分身' },
  '广播 %1 参数 %2': { en: 'broadcast %1 with value %2', 'zh-Hant': '廣播 %1 參數 %2' },
  '将 %1 广播订阅状态设为 %2': {
    en: 'set %1 broadcast subscription to %2',
    'zh-Hant': '將 %1 廣播訂閱狀態設為 %2',
  },
  '广播 %1 参数 %2 并等待': {
    en: 'broadcast %1 with value %2 and wait',
    'zh-Hant': '廣播 %1 參數 %2 並等待',
  },
  '移动 %1 水平 %2 垂直 %3': {
    en: 'move %1 horizontal %2 vertical %3',
    'zh-Hant': '移動 %1 水平 %2 垂直 %3',
  },
  '把 %1 移到 x: %2 y: %3': { en: 'move %1 to x: %2 y: %3', 'zh-Hant': '把 %1 定位到 x: %2 y: %3' },
  '把 %1 的 x 坐标增加 %2': { en: 'change %1 x by %2', 'zh-Hant': '把 %1 的 x 座標增加 %2' },
  '把 %1 的 y 坐标增加 %2': { en: 'change %1 y by %2', 'zh-Hant': '把 %1 的 y 座標增加 %2' },
  '把 %1 的 %2 设为 %3': { en: 'set %1 %2 to %3', 'zh-Hant': '把 %1 的 %2 設為 %3' },
  '让 %1 面向 %2 度': { en: 'point %1 in direction %2', 'zh-Hant': '讓 %1 面向 %2 度' },
  '让 %1 旋转 %2 度': { en: 'rotate %1 by %2 degrees', 'zh-Hant': '讓 %1 旋轉 %2 度' },
  '设置 %1 的速度 vx: %2 vy: %3': {
    en: 'set %1 velocity vx: %2 vy: %3',
    'zh-Hant': '設定 %1 的速度 vx: %2 vy: %3',
  },
  '让 %1 跳跃 力度 %2': { en: 'make %1 jump with power %2', 'zh-Hant': '讓 %1 跳躍 力度 %2' },
  '设置 %1 的重力为 %2': { en: 'set %1 gravity to %2', 'zh-Hant': '設定 %1 的重力為 %2' },
  '%1 碰到边缘就反弹': { en: 'if %1 is on edge, bounce', 'zh-Hant': '%1 碰到邊緣就反彈' },
  '显示 %1': { en: 'show %1', 'zh-Hant': '顯示 %1' },
  '隐藏 %1': { en: 'hide %1', 'zh-Hant': '隱藏 %1' },
  '把 %1 的大小设为 %2 %%': { en: 'set %1 size to %2 %%', 'zh-Hant': '把 %1 的尺寸設為 %2 %%' },
  '把 %1 的大小增加 %2 %%': { en: 'change %1 size by %2 %%', 'zh-Hant': '把 %1 的尺寸增加 %2 %%' },
  '把 %1 的透明度设为 %2 %%': {
    en: 'set %1 ghost to %2 %%',
    'zh-Hant': '把 %1 的透明度設為 %2 %%',
  },
  '播放 %1 的动画 %2': { en: 'play %1 animation %2', 'zh-Hant': '播放 %1 的動畫 %2' },
  '让 %1 说 %2 %3 秒': { en: 'make %1 say %2 for %3 seconds', 'zh-Hant': '讓 %1 說 %2 %3 秒' },
  '把 %1 的颜色设为 %2': { en: 'set %1 color to %2', 'zh-Hant': '把 %1 的顏色設為 %2' },
  '播放声音 %1': { en: 'play sound %1', 'zh-Hant': '播放音效 %1' },
  '%1 碰到 %2 ?': { en: '%1 touching %2?', 'zh-Hant': '%1 碰到 %2？' },
  '%1 到 %2 的距离': { en: 'distance from %1 to %2', 'zh-Hant': '%1 到 %2 的距離' },
  '按下 %1 键?': { en: 'key %1 pressed?', 'zh-Hant': '按下 %1 鍵？' },
  '%1 的 %2': { en: "%1's %2", 'zh-Hant': '%1 的%2' },
  '切换到场景 %1': { en: 'switch to scene %1', 'zh-Hant': '切換到場景 %1' },
  '存档到 %1': { en: 'save to %1', 'zh-Hant': '儲存到 %1' },
  '读取存档 %1': { en: 'load save %1', 'zh-Hant': '讀取存檔 %1' },
  '让相机跟随 %1 平滑 %2': {
    en: 'make camera follow %1 smooth %2',
    'zh-Hant': '讓相機跟隨 %1 平滑 %2',
  },
  '在 %1 处播放 %2 个粒子 颜色 %3': {
    en: 'at %1 play %2 particles color %3',
    'zh-Hant': '在 %1 處播放 %2 個粒子 顏色 %3',
  },
  '把 HUD 文字设为 %1': { en: 'set HUD text to %1', 'zh-Hant': '把 HUD 文字設為 %1' },
  '屏幕震动 强度 %1': { en: 'shake screen strength %1', 'zh-Hant': '螢幕震動 強度 %1' },
  '生成 %1 于 x: %2 y: %3': { en: 'spawn %1 at x: %2 y: %3', 'zh-Hant': '生成 %1 於 x: %2 y: %3' },
  '销毁 %1': { en: 'destroy %1', 'zh-Hant': '銷毀 %1' },
  '当前场景名': { en: 'current scene name', 'zh-Hant': '目前場景名稱' },
  '克隆体数量': { en: 'clone count', 'zh-Hant': '分身數量' },
  '⚙ 执行代码 %1': { en: '⚙ run code %1', 'zh-Hant': '⚙ 執行程式碼 %1' },
  '⚙ 代码 %1': { en: '⚙ code %1', 'zh-Hant': '⚙ 程式碼 %1' },
  '⚠ 未识别 %1': { en: '⚠ unrecognized %1', 'zh-Hant': '⚠ 未識別 %1' },

  // 兜底积木的 tooltip、合成积木的 tooltip
  '这个积木在当前版本的引擎里没有对应实现，原样保留以免丢数据': {
    en: 'this block has no implementation in this version of the engine; it is kept as-is to avoid losing data',
    'zh-Hant': '這個積木在目前版本的引擎裡沒有對應實作，原樣保留以免遺失資料',
  },
  '合成积木 · {macro.name}': {
    en: 'composite block · {macro.name}',
    'zh-Hant': '合成積木 · {macro.name}',
  },

  /* ---------------- src/blocks/scratch/workspace.js ---------------- */
  '[积木] 载入失败': { en: '[blocks] failed to load', 'zh-Hant': '[積木] 載入失敗' },
  '[积木] 读取要执行的脚本失败': {
    en: '[blocks] failed to read the script to run',
    'zh-Hant': '[積木] 讀取要執行的腳本失敗',
  },
  '已自动开始运行 —— 点积木就是立刻执行它': {
    en: 'started running automatically — clicking a block runs it right away',
    'zh-Hant': '已自動開始執行 —— 點積木就是立刻執行它',
  },
  '没能执行：': { en: 'could not run: ', 'zh-Hant': '沒能執行：' },
  '[积木] 取值气泡失败': { en: '[blocks] value bubble failed', 'zh-Hant': '[積木] 取值氣泡失敗' },
  '编辑积木': { en: 'edit blocks', 'zh-Hant': '編輯積木' },
  '合成新积木…': { en: 'make a new block…', 'zh-Hant': '建立一個積木…' },
  '编辑积木定义…': { en: 'edit block definition…', 'zh-Hant': '編輯積木定義…' },
  '[积木] 替换为合成积木失败': {
    en: '[blocks] failed to replace with composite block',
    'zh-Hant': '[積木] 替換為合成積木失敗',
  },
  '新积木会归到「{cat.name}」': {
    en: 'the new block will go into "{cat.name}"',
    'zh-Hant': '新積木會歸到「{cat.name}」',
  },
  '[积木] 放置新积木失败': {
    en: '[blocks] failed to place the new block',
    'zh-Hant': '[積木] 放置新積木失敗',
  },
  '[积木] 刷新选择区失败': {
    en: '[blocks] failed to refresh the toolbox',
    'zh-Hant': '[積木] 重新整理選擇區失敗',
  },


  /* ---- 降级成「执行代码」时留下的注释 ---- */
  '// 未知积木 {_1}': { en: '// unknown block {_1}', 'zh-Hant': '// 未知積木 {_1}' },
  '// 无法还原 {_1}': { en: '// cannot restore {_1}', 'zh-Hant': '// 無法還原 {_1}' },

  /* ---- 拼进模板串的碎片 ---- */
  "这个分类还是空的": { en: "This category is empty", 'zh-Hant': "這個分類還是空的" },
  "在画布上搭一段积木 → 右键「合成新积木」→ 归到这里": { en: "Build a stack on the canvas → right-click \"compose new block\" → file it here", 'zh-Hant': "在畫布上疊一段積木 → 按右鍵「合成新積木」→ 歸到這裡" },
  "＋ 新建积木": { en: "＋ New block", 'zh-Hant': "＋ 新增積木" },
  "⚠ 缺失的合成积木 {_1}": { en: "⚠ missing composite block {_1}", 'zh-Hant': "⚠ 缺少的合成積木 {_1}" },

  /* ---- 拼进模板串的碎片 ---- */
};
