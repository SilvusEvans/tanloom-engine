/**
 * Tanloom Engine — 下拉项 / 属性名 的译文
 * ================================================================
 * 键是 `命名空间.值 id`，值 id 是**稳定标识**（`'Space'` / `'abs'` / `'x'`），
 * 三种语言里都不变 —— 变的只有显示名。这样积木里存的值、生成出来的代码、
 * 以及项目文件都不会因为切语言而变化。
 *
 * 为什么要命名空间：同一个值 id 在不同菜单里意思不同 ——
 * `all` 在「停止」里是「全部」，在「旋转方式」里是「任意方向」；
 * `jump` 在造型动画里是「跳跃」，在声音里是一个音效名。只按值 id 索引会撞车。
 *
 * 值 id 与命名空间的对照表（画布/面板两侧共用）：
 *   key       空格 / 方向键 / 字母键 / 任意          （KeyboardEvent.code）
 *   stop      停止 [全部 / 这个脚本 / 角色的其他脚本]
 *   rot       旋转方式 [任意方向 / 左右翻转 / 不旋转]
 *   prop      实体属性（坐标 / 方向 / 大小 / 透明度 / 速度 / 是否显示）
 *   math      数学函数
 *   param     帧上下文的可读参数
 *   anim      造型动画名
 *   sound     内置音效名
 *   phase     内置帧阶段广播
 *   subscribe 广播订阅状态
 *   entity    实体特指（自己）
 */
export const OPTIONS = {
  /* ---- 按键（值用的是 scratch-blocks 那一套：'space' / 'up arrow' / 'w' …）---- */
  'key.space':       { en: 'space',      'zh-Hans': '空格',   'zh-Hant': '空白鍵' },
  'key.up arrow':    { en: 'up arrow',   'zh-Hans': '↑',      'zh-Hant': '↑' },
  'key.down arrow':  { en: 'down arrow', 'zh-Hans': '↓',      'zh-Hant': '↓' },
  'key.left arrow':  { en: 'left arrow', 'zh-Hans': '←',      'zh-Hant': '←' },
  'key.right arrow': { en: 'right arrow','zh-Hans': '→',      'zh-Hant': '→' },
  'key.w':           { en: 'W',          'zh-Hans': 'W',      'zh-Hant': 'W' },
  'key.a':           { en: 'A',          'zh-Hans': 'A',      'zh-Hant': 'A' },
  'key.s':           { en: 'S',          'zh-Hans': 'S',      'zh-Hant': 'S' },
  'key.d':           { en: 'D',          'zh-Hans': 'D',      'zh-Hant': 'D' },
  'key.j':           { en: 'J',          'zh-Hans': 'J',      'zh-Hant': 'J' },
  'key.k':           { en: 'K',          'zh-Hans': 'K',      'zh-Hant': 'K' },
  'key.l':           { en: 'L',          'zh-Hans': 'L',      'zh-Hant': 'L' },
  'key.any':         { en: 'any',        'zh-Hans': '任意',   'zh-Hant': '任意' },

  /* ---- 停止 ---- */
  'stop.all':       { en: 'all',          'zh-Hans': '全部',     'zh-Hant': '全部' },
  'stop.script':    { en: 'this script',  'zh-Hans': '这个脚本', 'zh-Hant': '這個程式' },
  'stop.others':    { en: 'other scripts in sprite', 'zh-Hans': '其他脚本', 'zh-Hant': '角色中的其他程式' },

  /* ---- 旋转方式 ---- */
  'rot.all':        { en: 'all around',   'zh-Hans': '任意方向', 'zh-Hant': '任意方向' },
  'rot.left-right': { en: 'left-right',   'zh-Hans': '左右翻转', 'zh-Hant': '左右翻轉' },
  'rot.none':       { en: "don't rotate", 'zh-Hans': '不旋转',   'zh-Hant': '不旋轉' },

  /* ---- 实体属性 ---- */
  'prop.x':         { en: 'x position',   'zh-Hans': 'x 坐标',   'zh-Hant': 'x 座標' },
  'prop.y':         { en: 'y position',   'zh-Hans': 'y 坐标',   'zh-Hant': 'y 座標' },
  'prop.dir':       { en: 'direction',    'zh-Hans': '方向',     'zh-Hant': '方向' },
  'prop.size':      { en: 'size',         'zh-Hans': '大小',     'zh-Hant': '尺寸' },
  'prop.opacity':   { en: 'transparency', 'zh-Hans': '透明度',   'zh-Hant': '透明度' },
  'prop.vx':        { en: 'x velocity',   'zh-Hans': 'x 速度',   'zh-Hant': 'x 速度' },
  'prop.vy':        { en: 'y velocity',   'zh-Hans': 'y 速度',   'zh-Hant': 'y 速度' },
  'prop.visible':   { en: 'visible',      'zh-Hans': '是否显示', 'zh-Hant': '是否顯示' },

  /* ---- 数学函数 ---- */
  'math.abs':       { en: 'abs',     'zh-Hans': '绝对值',   'zh-Hant': '絕對值' },
  'math.floor':     { en: 'floor',   'zh-Hans': '向下取整', 'zh-Hant': '向下取整' },
  'math.ceil':      { en: 'ceiling', 'zh-Hans': '向上取整', 'zh-Hant': '向上取整' },
  'math.round':     { en: 'round',   'zh-Hans': '四舍五入', 'zh-Hant': '四捨五入' },
  'math.sqrt':      { en: 'sqrt',    'zh-Hans': '平方根',   'zh-Hant': '平方根' },
  'math.log10':     { en: '10 ^',    'zh-Hans': '10 ^',     'zh-Hant': '10 ^' },
  'math.ln':        { en: 'ln',      'zh-Hans': '自然对数', 'zh-Hant': '自然對數' },
  'math.sin':       { en: 'sin',     'zh-Hans': 'sin',      'zh-Hant': 'sin' },
  'math.cos':       { en: 'cos',     'zh-Hans': 'cos',      'zh-Hant': 'cos' },
  'math.tan':       { en: 'tan',     'zh-Hans': 'tan',      'zh-Hant': 'tan' },

  /* ---- 帧上下文参数 ---- */
  'param.frame':      { en: 'frame number',  'zh-Hans': '帧号 frame',            'zh-Hant': '幀號 frame' },
  'param.delta':      { en: 'delta',         'zh-Hans': '时间差 delta',          'zh-Hant': '時間差 delta' },
  'param.fixedDelta': { en: 'fixed delta',   'zh-Hans': '固定步长 fixedDelta',  'zh-Hant': '固定步長 fixedDelta' },
  'param.value':      { en: 'broadcast argument', 'zh-Hans': '广播参数 value',   'zh-Hant': '廣播參數 value' },

  /* ---- 造型动画 ---- */
  'anim.idle': { en: 'idle', 'zh-Hans': '待机', 'zh-Hant': '待機' },
  'anim.run':  { en: 'run',  'zh-Hans': '奔跑', 'zh-Hant': '奔跑' },
  'anim.jump': { en: 'jump', 'zh-Hans': '跳跃', 'zh-Hant': '跳躍' },
  'anim.hurt': { en: 'hurt', 'zh-Hans': '受伤', 'zh-Hant': '受傷' },

  /* ---- 内置音效 ---- */
  'sound.beep': { en: 'beep', 'zh-Hans': '哔',   'zh-Hant': '嗶' },
  'sound.jump': { en: 'jump', 'zh-Hans': '跳跃', 'zh-Hant': '跳躍' },
  'sound.coin': { en: 'coin', 'zh-Hans': '金币', 'zh-Hant': '金幣' },
  'sound.hurt': { en: 'hurt', 'zh-Hans': '受伤', 'zh-Hant': '受傷' },
  'sound.boom': { en: 'boom', 'zh-Hans': '爆炸', 'zh-Hant': '爆炸' },

  /* ---- 帧阶段 ---- */
  'phase.frame_start':    { en: 'frame start',    'zh-Hans': '帧开始',   'zh-Hant': '幀開始' },
  'phase.input':          { en: 'input',          'zh-Hans': '输入',     'zh-Hant': '輸入' },
  'phase.physics_update': { en: 'physics update', 'zh-Hans': '物理更新', 'zh-Hant': '物理更新' },
  'phase.update':         { en: 'update',         'zh-Hans': '每帧更新', 'zh-Hant': '每幀更新' },
  'phase.late_update':    { en: 'late update',    'zh-Hans': '延迟更新', 'zh-Hant': '延遲更新' },
  'phase.render':         { en: 'render',         'zh-Hans': '渲染',     'zh-Hant': '繪製' },
  'phase.frame_end':      { en: 'frame end',      'zh-Hans': '帧结束',   'zh-Hant': '幀結束' },

  /* ---- 订阅状态 ---- */
  'subscribe.subscribe':   { en: 'subscribe',   'zh-Hans': '订阅',     'zh-Hant': '訂閱' },
  'subscribe.unsubscribe': { en: 'unsubscribe', 'zh-Hans': '取消订阅', 'zh-Hant': '取消訂閱' },

  /* ---- 实体特指 ---- */
  'entity.$self': { en: 'myself', 'zh-Hans': '自己', 'zh-Hant': '自己' },
};
