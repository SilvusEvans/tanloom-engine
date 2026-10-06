# Material You 动效层

这一层是**纯增量**的：没有动过任何布局结构，也没有动业务逻辑。
新增的三个文件各管一段：

| 文件 | 职责 |
|---|---|
| `src/styles/motion.css` | 全部的过渡与动画（容器变换 / 共享轴 / 淡入 / 按压 / 状态变化） |
| `src/ui/motion.js` | 只有停靠面板那一处需要 JS 帮忙判定「什么时候该动」 |
| `tools/probe-motion.cjs` | 动效探针（`npm run motion`）：断言动画真的生效、时长合规、降级有效 |

`src/index.html` 只加了一行 —— 样式表放在最后引入：

```html
<link rel="stylesheet" href="styles/motion.css" />
```

放在最后是有意的：它只写过渡和动画，靠「后来者居上」把各处的 `transition`
统一收编到同一组曲线上，不用去改每个组件自己写的那条。

---

## 1. 统一的 token（改这里就能改全局手感）

定义在 `motion.css` 的 `:root`。**所有时长都写成 `calc(基准 * var(--motion))`**，
`--motion` 是全局倍数，降级时置 0，于是一处开关关掉全部动效，
不需要再维护第二套「无动画版」规则。

| 变量 | 值 | 用在哪 |
|---|---|---|
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | 通用：颜色、边框、阴影的变化 |
| `--ease-standard-accelerate` | `cubic-bezier(.3,0,1,1)` | 离场（消失、退场）先慢后快 |
| `--ease-standard-decelerate` | `cubic-bezier(0,0,0,1)` | 进场（出现、展开）先快后慢 |
| `--ease-emphasized` | `cubic-bezier(.2,0,0,1)` | 强调型通用 |
| `--ease-emphasized-decelerate` | `cubic-bezier(.05,.7,.1,1)` | 最常用：容器变换、共享轴、toast |
| `--ease-emphasized-accelerate` | `cubic-bezier(.3,0,.8,.15)` | 强调型离场 |
| `--dur-short` | `200ms` | 小部件进出、状态切换 |
| `--dur-medium` | `300ms` | 容器变换、共享轴 |
| `--dur-long` | `400ms` | 大范围布局变化（停靠坞折叠） |
| `--dur-extra` | `500ms` | 预留：整页级切换 |
| `--dur-press` | `90ms` | 按压反馈（必须快于 150ms 才「贴手」） |
| `--slide-x` / `--slide-y` | `28px` / `14px` | 共享轴的推进距离 |
| `--zoom-from` | `.92` | 容器变换的起始缩放 |
| `--press-scale` | `.96` | 按钮按下去缩到多大 |
| `--lift` | `2px` | 卡片悬停抬升的高度 |
| `--stagger` | `16ms` | 列表逐项出场的延迟步长 |
| `--item-slide` | `0px` | 列表项入场要不要位移（见 §5） |
| `--motion` | `1` | **总开关倍数**，降级时 0 |

时长档位是照 M3 的 short / medium / long 三档取的，全部落在 200–500ms 区间；
只有按压反馈例外 —— 它按 M3 的规矩走更短的反馈档（90ms）。

---

## 2. 容器变换：对话框

- **触发时机**：任何 `showModal()` —— 新建实体、设置对话框、宏、各处的增删改
- **实现位置**：`motion.css` 第 1 节；对象是 `dialogs.js` 建出来的 `.modal-back` / `.modal`
- **播的内容**
  - 遮罩 `.modal-back`：`m3-backdrop-in`，200ms + `--ease-standard`（纯淡入）
  - 卡片 `.modal`：`m3-container-in`，300ms + `--ease-emphasized-decelerate`
    —— 从 `scale(.92) translateY(8px)` 到位
- **可调参数**：`--zoom-from`（起始缩放）、`--dur-medium`、`--ease-emphasized-decelerate`

> M3 真正的 container transform 是「从触发它的那块 UI 长出来」（要读起点元素的
> 位置和尺寸）。这里用「从略小的卡片缩放到位」近似它——差别在于没有连接起點与终點
> 的那段连续形变。好处是零业务侵入：不需要给每个按钮记录自己的位置。

---

## 3. 共享轴 Z：四大视图切换

- **触发时机**：点「积木 / 代码 / 场景 / 资源」任一页签（`app.js` 的 `switchView`）
- **实现位置**：`motion.css` 第 2 节；对象是 `#view-blocks / #view-code / #view-scene / #view-assets`
- **播的内容**：`m3-fade-through`，300ms + `--ease-emphasized-decelerate`
  —— `opacity 0 + scale(.985)` → 到位
- **可调参数**：起始缩放 `.985`、`--dur-medium`、曲线

> M3 的 fade through 原本是「旧的先淡出、旧的说完再见新的才进来」两段。
> 这里旧视图是被 `display:none` 直接摘掉的，没法陪着淡出，所以只播后半段。
> 观感仍是「内容整体换了一茬」，代价是不需要重排 DOM 生命周期。

---

## 4. 共享轴 Y：停靠面板 / 代码提示条 / 全屏层

- **触发时机**
  - `#dock-body`：**点「广播时间轴 / 订阅列表 / 变量监视 / 性能 / 控制台」页签的那一下**
  - `.code-banner`：代码区有未保存改动或解析报错时冒出
  - `.fullscreen-layer`：张开全屏游玩层
- **实现位置**：`motion.css` 第 3 节 + `src/ui/motion.js`
- **播的内容**：`m3-axis-y`，300ms + `--ease-emphasized-decelerate`
  —— 沿着 Y 轴从 `-14px` 推进到位
- **可调参数**：`--slide-y`、`--dur-medium`、曲线

### 为什么停靠面板必须用 JS

`#dock-body` 的内容是**每 160ms 重建一次**的（`app.js` 的 `draw` 里做了节流刷新）。
所以「子节点插入就播动画」这种写法会让它持续抖动。值得跟随的是「用户点了页签」这个
明确动作，于是 `motion.js` 里用一个 `MutationObserver` 盯着 `#dock-tabs` 的 class 变化
（只看 `class`，且**只在 active 真的换了别的值时才触发**），给容器挂一次 `.mo-axis-y`。
动画挂在容器上而不是内容上，内容的重建就不会影响它。

---

## 5. 逐项进场：列表行

- **触发时机**：层级树 / 文件列表 / 资源面板里的条目被重建时
  ——切实体、增删改变量与频道、切到对应视图
- **实现位置**：`motion.css` 第 4 节
- **播的内容**：`m3-item-in`，300ms + `--ease-emphasized-decelerate`，
  前 8 项按 `--stagger` 错开延迟，第 9 项起统一收在高位
- **可调参数**：`--item-slide`、`--stagger`、`--dur-medium`

> `--item-slide` 默认是 `0px`，也就是**只淡不滑**。原因很实在：这些列表项是要点击的，
> 动画期间带着位移会让「算好的点击坐标」落空。想要更有层次把它调成 `6px` 就行，
> 代价是自动化点击要避开入场的那 300ms。

---

## 6. 按压反馈：所有按钮

- **触发时机**：任意按钮按下 / 松开（顶栏运行区、页签、停靠页签、对话框按钮…）
- **实现位置**：`motion.css` 第 5 节（全局 `button`）
- **播的内容**
  - 按下：`scale(var(--press-scale))`，90ms + `--ease-standard-accelerate`
  - 松开：回到原样，200ms + `--ease-emphasized-decelerate`
  - 主按钮（`▶ 运行`、`.primary`）再沉一点点（`--press-scale - .02`）
- **可调参数**：`--press-scale`、`--dur-press`、`--dur-short`

方向是有讲究的：「按下」要快（先响应用户），「回位」要慢一点并且用递减曲线（优雅地落回去），
这就是 M3 里 "respond immediately, settle gracefully" 的手感来源。

---

## 7. 状态变化：页签二级指示器

- **触发时机**：模式页签 / 停靠页签的选中项变化（`active` class 切换）
- **实现位置**：`motion.css` 第 6 节，用 `::after` 伪元素画（没有碰 HTML）
- **播的内容**：`scaleX(0) → scaleX(1)`，200ms + `--ease-emphasized-decelerate`，
  颜色取 `--md-primary`（Material You 下有值，其他主题兜底到 `--accent`）
- **可调参数**：`--dur-short`、指示器的 `height`（2px）、左右留白（`12%`）

---

## 8. 卡片：悬停抬升与折叠

- **触发时机**：鼠标掠过资源面板卡片 / 变量监视卡；点 ▾ 折叠停靠坞
- **实现位置**：`motion.css` 第 7 节
- **播的内容**
  - 悬停：`translateY(-2px)` + 阴影变化，200ms
  - 停靠坞折叠：把原来 `.16s` 的 height 过渡换成 `--dur-long` + `--ease-emphasized-decelerate`
- **可调参数**：`--lift`、`--dur-long`、`--dur-short`

---

## 9. 轻提示 snackbar 与弹出菜单

- **触发时机**：`toast()` 被调用；右键菜单 / 下拉菜单出现
- **实现位置**：`motion.css` 第 8、9 节
- **播的内容**
  - toast：从下方 14px 处滑入 + `scale(.96)` 到位，300ms 递减曲线；
    退场是 `dialogs.js` 自己加的行内 `opacity`，这里把 `transform` 一起带上，
    于是退场变成「滑下去 + 淡掉」
  - 菜单：`m3-menu-in`，200ms，从 `scale(.96)` 展开，`transform-origin: top left`
- **可调参数**：`--slide-y`、`--zoom-from`、`--dur-medium` / `--dur-short`

---

## 10. 降级

两条路，任选其一即刻全关：

1. **系统级**：用户在系统里开了「减少动态效果」→
   `@media (prefers-reduced-motion: reduce)` 把 `--motion` 置 0、
   `--slide-*` / `--lift` 归零、`--press-scale` 归 1。
   归零的写法（而不是把规则注释掉）保证降级路径和正常路径**共用同一份 keyframes**，
   不会出现「关掉动画那条分支常年没人维护」的情况。
2. **手动**：`localStorage.setItem('tl.motion', 'off')`，或者代码里
   `setMotion(false)`。`motion.js` 里的所有 `play*` 都会先问 `motionEnabled()`。

优先级：手动开关 > 系统偏好。探针两条都验（第 6、7 节断言）。

---

## 11. 配色为什么跟着动态取色走

动效层里**一处颜色都没写死**：

- 指示器取 `var(--md-primary, var(--accent))` —— Material You 下由种子算出，
  其他主题兜底到重点色
- 阴影、状态层用的是各组件本来就有的变量（`--shadow-sm`、`--hover-layer`）
- 输入槽、工具箱、画布的底色是 scratch-blocks 的主题算出来的
  （见 src/ui/appearance.js 的 editTheme）

所以换主题 / 换重点色时，动效不需要额外同步：它本身就在读同一组变量。

---

## 12. 探针

```
npm run motion
```

断言落在**计算后**的样式上（`getComputedStyle`），理由是「写了 CSS 规则」和
「规则真的生效」之间隔着引入顺序、特异性、被后写的规则覆盖这几层。

覆盖：
1. token 存在且时长落在 200–500ms 区间（`--dur-press` 单独按 <150ms 判）
2. 对话框的名称、时长、曲线都按 M3 来；遮罩单独一层
3. 视图切换是 `m3-fade-through`；点停靠页签真的重播了共享轴
4. 列表行是同一个动画、延迟逐项递增
5. 按钮 transition 带 transform、回位曲线正确；**用 CDP 强制 `:active` 伪状态**
   读到按下瞬间真实的 `transform`（而不是只验参数写对了）
6. 用 CDP 的 `Emulation.setEmulatedMedia` 真的把媒体特性改成 reduce —— 时长归 0s
7. 手动开关关掉后不再触发动画，再打开能恢复
8. 整个过程零控制台错误
