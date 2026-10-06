/**
 * Tanloom Engine — 帮助对话框正文（三语）
 * ================================================================
 * 这段 HTML 一千三百多字、结构还带 <b>/<code>/<br>，塞进「原文当键」的字典里
 * 既不现实也没法维护，所以单独放在这里：**按语言 id 直接取**。
 * 三份的结构（分节、加粗、快捷键写法）保持一致，只有文字不同。
 */
export const HELP = {
  'zh-Hans': `
    <div class="hint">
      <b>Tanloom Engine</b> —— 画得出，也写得出。积木和代码共享同一份 IR，不是两套实现。<br><br>
      <b>积木视图</b>：用 Scratch 官方渲染器（scratch-blocks 2.1.27），
      积木形状、配色、拖拽吸附、插入标记都和在 Scratch 里一模一样。
      左侧选分类挑积木，拖到画布上会吸附进插槽；拖到右下角垃圾桶＝删除；
      在积木上<b>右键</b>可以「合成新积木」或「编辑积木定义」；
      <b>单击积木就能执行</b>——点语句块会把它所在的一整条栈跑一遍（没在运行的话会自动开始运行），
      点圆形/六边形积木会算出一个值并弹个气泡。<br>
      <b>代码视图</b>：注解 <code>// @on update</code> 表示该函数订阅哪个广播；改完按 <b>Ctrl+S</b> 解析回积木。
      不认识的写法会原样保留为「代码积木」。<br>
      <b>广播模型</b>：每帧依次广播 frame_start → input → physics_update → update → late_update → render → frame_end，
      脚本用帽块订阅；按键、碰撞、自定义事件都走同一条总线。<br>
      <b>合成积木</b>：基础积木 → 合成积木 → 选择区 → 继续合成。可归入内置分类，也可以新建分类。<br>
      <b>独立运行窗口</b>：点顶部 <b>⧉ 新窗口</b> 或按 <b>F6</b>，游戏会在一个新窗口里跑起来
      （可以拖到另一个显示器）。编辑器里改完积木，那边会热重载。<br>
      <b>全屏游玩</b>：点顶部 <b>⛶ 全屏</b> 或按 <b>F11</b>，编辑器会被舞台整个盖住（还没运行的话会自动开始运行），
      再按 <b>Esc</b> 退出。全屏时键盘完全归游戏，方向键不会滚页面、空格也不会去点按钮。<br>
      <b>外观与语言</b>：顶栏 <b>◐ 外观</b> 或 <b>Ctrl+,</b> —— 换主题色（6 套 + 跟随系统）、重点色（8 个预设
      之外还能用取色器挑任意色，字色按亮度自动选深/浅）、界面与代码的字体和字号，
      以及<b>界面语言</b>（English / 简体中文 / 繁體中文）；带实时预览，点一下立即生效；
      「分享码」可以把这套外观发给别人。<br>
      外观只影响编辑器界面，<b>不写进项目文件</b> —— 换台机器打开同一个游戏，皮肤各随各的。<br>
      <b>快捷键</b>：F5 运行/停止 · F6 独立窗口运行 · F11 全屏 · Esc 退出全屏 · Ctrl+, 外观 · Ctrl+Z 撤销 · Ctrl+Y 重做 · Ctrl+S 保存（代码视图里是同步回积木）· Ctrl+E 导出代码
    </div>`,

  en: `
    <div class="hint">
      <b>Tanloom Engine</b> — draw it, and write it. Blocks and code share a single IR; they are not two implementations.<br><br>
      <b>Block view</b>: powered by Scratch's own renderer (scratch-blocks 2.1.27), so block shapes, colours,
      drag snapping and insertion markers all behave exactly as in Scratch.
      Pick a category on the left, drag a block onto the canvas and it snaps into a slot; drop it on the
      bin at the bottom right to delete it; <b>right-click</b> a block to "compose a new block" or "edit its definition".
      <b>Clicking a block runs it</b> — clicking a stack header runs the whole stack (the project starts running if it is not
      already), and clicking a round or hexagonal block evaluates it and pops a value bubble.<br>
      <b>Code view</b>: the <code>// @on update</code> annotation says which broadcast a function subscribes to;
      press <b>Ctrl+S</b> to parse your edits back into blocks. Anything unrecognized is kept as is in a "code block".<br>
      <b>Broadcast model</b>: each frame broadcasts frame_start → input → physics_update → update → late_update → render → frame_end.
      Scripts subscribe with hat blocks; keys, collisions and custom events all travel the same bus.<br>
      <b>Composite blocks</b>: base block → composite block → palette → compose again. They can live in a built-in
      category or in a category of your own.<br>
      <b>Player window</b>: click <b>⧉ New window</b> at the top or press <b>F6</b> and the game runs in a separate window
      (drag it to another monitor). Edits in the editor hot-reload there.<br>
      <b>Fullscreen play</b>: click <b>⛶ Fullscreen</b> or press <b>F11</b> — the stage covers the whole editor
      (starting the project if needed). Press <b>Esc</b> to leave. In fullscreen the keyboard belongs to the game:
      arrow keys will not scroll and space will not press buttons.<br>
      <b>Appearance and language</b>: <b>◐ Appearance</b> in the toolbar, or <b>Ctrl+,</b> — pick a theme
      (6 built in, plus follow-system), an accent colour (8 presets, or any colour from the picker; label colour is
      chosen automatically by brightness), the interface and code fonts and their sizes, and the
      <b>interface language</b> (English / 简体中文 / 繁體中文). Everything applies instantly with a live preview;
      a "share code" passes the whole look on to someone else.<br>
      Appearance only affects the editor interface — it is <b>never written into the project file</b>, so the same game
      can be skinned differently on every machine.<br>
      <b>Shortcuts</b>: F5 run/stop · F6 run in a separate window · F11 fullscreen · Esc leave fullscreen · Ctrl+, appearance · Ctrl+Z undo · Ctrl+Y redo · Ctrl+S save (in the code view: sync back to blocks) · Ctrl+E export code
    </div>`,

  'zh-Hant': `
    <div class="hint">
      <b>Tanloom Engine</b> —— 畫得出，也寫得出。積木和程式碼共用同一份 IR，不是兩套實作。<br><br>
      <b>積木視圖</b>：使用 Scratch 官方渲染器（scratch-blocks 2.1.27），
      積木形狀、配色、拖曳吸附、插入標記都和在 Scratch 裡一模一樣。
      左側選分類挑積木，拖到畫布上會吸附進插槽；拖到右下角垃圾桶＝刪除；
      在積木上<b>按右鍵</b>可以「合成新積木」或「編輯積木定義」；
      <b>點一下積木就能執行</b>——點陳述式積木會把它所在的整條堆疊跑一遍（還沒在執行會自動開始），
      點圓形／六邊形積木會算出一個值並彈出氣泡。<br>
      <b>程式碼視圖</b>：註解 <code>// @on update</code> 表示該函式訂閱哪個廣播；改完按 <b>Ctrl+S</b> 解析回積木。
      不認得的寫法會原樣保留為「程式積木」。<br>
      <b>廣播模型</b>：每一幀依序廣播 frame_start → input → physics_update → update → late_update → render → frame_end，
      指令用帽塊訂閱；按鍵、碰撞、自訂事件都走同一條匯流排。<br>
      <b>合成積木</b>：基礎積木 → 合成積木 → 選擇區 → 繼續合成。可歸入內建分類，也可以新增分類。<br>
      <b>獨立執行視窗</b>：點頂部 <b>⧉ 新視窗</b> 或按 <b>F6</b>，遊戲會在另一個視窗裡跑起來
      （可以拖到另一個螢幕）。編輯器裡改完積木，那邊會熱重載。<br>
      <b>全螢幕遊玩</b>：點頂部 <b>⛶ 全螢幕</b> 或按 <b>F11</b>，編輯器會被舞台整個蓋住（還沒在執行會自動開始），
      再按 <b>Esc</b> 離開。全螢幕時鍵盤完全歸遊戲，方向鍵不會捲動頁面、空白鍵也不會去按按鈕。<br>
      <b>外觀與語言</b>：頂欄 <b>◐ 外觀</b> 或 <b>Ctrl+,</b> —— 換佈景主題（6 套 + 跟隨系統）、強調色（8 個預設
      之外還能用取色器挑任意色，文字色依亮度自動選深／淺）、介面與程式碼的字型和字型大小，
      以及<b>介面語言</b>（English / 简体中文 / 繁體中文）；有即時預覽，點一下立即生效；
      「分享碼」可以把這套外觀傳給別人。<br>
      外觀只影響編輯器介面，<b>不會寫進專案檔</b> —— 換台機器開啟同一個遊戲，外觀各隨各的。<br>
      <b>快速鍵</b>：F5 執行/停止 · F6 在獨立視窗執行 · F11 全螢幕 · Esc 離開全螢幕 · Ctrl+, 外觀 · Ctrl+Z 復原 · Ctrl+Y 重做 · Ctrl+S 儲存（在程式碼視圖是同步回積木）· Ctrl+E 匯出程式碼
    </div>`,
};
