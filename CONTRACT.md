# 接口契约（CONTRACT）

> **三方并行开发的唯一约定。改契约前先在群里说，由枯木裁决；不要自己改别人文件。**
> 目标：三个人各写一个 JS 模块，最后由 `build.js` 合成一个 HTML。

---

## 1. 文件边界（硬规则）

| 谁 | 只能改 | 不能碰 |
|---|---|---|
| **Codex** | `src/render.js` | ui.js / data.js / template.html / build.js |
| **队友 A** | `src/ui.js` | render.js / data.js / template.html / build.js |
| **队友 B** | `src/data.js` | render.js / ui.js / template.html / build.js |
| **枯木** | `template.html`、`build.js`、`docs/*`、`README.md` | 三个 src 模块 |

每个文件都是 IIFE，挂到全局 `window.WH`，**不污染其他变量**。

```js
(function(){
  "use strict";
  window.WH = window.WH || {};
  // ... 你的实现
})();
```

---

## 2. 加载顺序

`build.js` 按下面顺序内联，**不能换**：

```
src/data.js  →  src/render.js  →  src/ui.js
```

原因：render 需要读 DATA 的默认值，ui 需要调用前两者。

---

## 3. `WH.DATA`（队友 B 负责，其余人只读）

```js
window.WH.DATA = {
  configs: [
    {
      id: 'A',                    // 'A' | 'B' | 'C' | 'D'
      model: 'QD 32/5t 双梁',
      span: 22.5,                 // 数字，单位 m
      capacity: 32,               // 数字，单位 t
      railHeight: 9.0,            // 数字，单位 m
      duty: 'A5',
      agv: 2,                     // 台数，0 表示无
      renderSec: 90,              // 出图用时（秒）
      bayType: 'single',          // 'single' | 'double' | 'outdoor'
      scene: '机械加工车间'
    }
    // B/C/D 同结构
  ],

  bays: {
    single:  { name: '单跨机械加工车间', columnSpan: 6,  railHeight: 9,  roof: '双坡', note: '有行车梁、照明桥架' },
    double:  { name: '双跨重装车间',     columnSpan: 12, railHeight: 12, roof: '网架', note: '中间有柱，需避让' },
    outdoor: { name: '露天堆场',         columnSpan: 0,  railHeight: 0,  roof: '—',   note: '轨道式门机，轨距 31.5 m' }
  },

  steps: [                        // 四步，固定 4 条
    { t: '解析现场照片',   d: '识别柱距、轨顶标高、屋面形式、可避让障碍' },
    { t: '识别结构参数',   d: '跨度 {span} m · 轨高 {railHeight} m · 工作级别 {duty}' },
    { t: '匹配已归档方案', d: '方案库 3 套，相似度 87%' },
    { t: '渲染安装效果图', d: '{renderSec} s 生成 · 参数可改可重出' }
  ],

  rerender: {
    label: '客户改需求：跨度 28.5 m、起重量 50 t',
    target: 'B',
    done: '已按新需求重出图 · 30 s'
  },

  brief: {
    problem:  '客户最想看的不是参数表，是「我的厂房装上它长什么样」；外部渲染排期 2–3 天，投标窗口等不起。',
    solution: '现场实景照片 + 客户技术方案 → 实景安装效果图，参数可改、当场重出。',
    value:    '售前沟通从「等图」变「当面改图」；周期账为本作品推算，非主办方原文。',
    landing:  '不碰内网，纯离线演示；出图引擎可后续接已报备的工具。'
  }
};
```

**约定**：
- `{span}` / `{railHeight}` / `{duty}` / `{renderSec}` 是占位符，由 **ui.js** 在渲染时替换成当前方案的值。
- 数字一律用 `Number`，不要写成 `"22.5 m"` 这种带单位的字符串（单位由 UI 拼）。
- 新增字段可以，但**不能删改已有字段名**。

---

## 4. `WH.renderScene(params)`（Codex 负责）

### 签名

```js
WH.renderScene(params) -> string
```

### 入参

```js
{
  span: 22.5,          // m
  capacity: 32,        // t
  railHeight: 9.0,     // m
  duty: 'A5',
  agv: 2,              // 0 表示不画 AGV
  bayType: 'single',   // 'single' | 'double' | 'outdoor'
  mode: 'after'        // 'before'（现场原貌）| 'after'（安装效果图）
}
```

### 返回值（硬约束）

- 返回**完整 SVG 字符串**，形如 `<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice"> ... </svg>`
- **不要**包含 `xmlns`（内联到 HTML 里不需要）
- **不要**包含 `<script>`、`<image>`、`<foreignObject>`、任何 `http` URL
- 所有颜色/描边写在元素内联属性里，**不依赖外部 CSS**
- 参数非法或缺失时用默认值兜底，**不要抛异常**
- 必须能连续调用 100 次不泄漏（纯函数，不保留全局状态）

### 视觉要求

- 等轴测或两点透视，看起来像"厂房里装了一台门机"，不是平面示意图
- 跨度变大时，厂房和门机的比例要跟着变（不能只是数字变）
- 有简单的光影：地面阴影、结构受光面
- `mode:'before'` 画空厂房（灰暗、无设备）；`mode:'after'` 画装好设备的效果图（暖光、有高亮标注）
- 起重量越大，主梁/小车/吊钩的视觉权重越大

### 性能

单次调用 ≤ 16 ms（60fps 下不掉帧），SVG 节点数量控制在 300 个以内。

---

## 5. `WH.initUI()`（队友 A 负责）

```js
WH.initUI()  // 由 ui.js 在最后自动调用一次
```

职责：
- 渲染对比容器、滑块、参数卡、四步进度、按钮、一页说明
- 调 `WH.renderScene()` 拿两版 SVG（before / after），塞进 `.compare` 容器
- 管理所有动画与定时器（重播前必须清空）
- 暴露 `WH.__setConfig(id)` 供调试

**不能**：直接写死任何参数数值（一律从 `WH.DATA` 读）。

---

## 6. `template.html`（容器骨架，不含视觉）

模板里只有一个容器和两个占位符：

```html
<main id="app"></main>
<!--INJECT_CSS-->
<!--INJECT_JS-->
```

**页面所有 DOM（header、按钮、主体、参数卡）和所有样式，都由 `src/ui.js` 生成/注入。** 模板不决定视觉，也不预设任何布局或配色。

`build.js` 会把 `src/app.css`（如有）和一个 `<script>` 块替换进去。

---

## 7. `build.js`（枯木/Codex 维护）

```bash
node build.js
```

输出 `dist/作品71.html`，并做三项自检：
1. 产物不含 `http://` / `https://`（`www.w3.org/2000/svg` 除外）
2. 产物不含 `<script src=` / `<link href=`
3. 三个模块都已内联（检查 `WH.DATA`、`WH.renderScene`、`WH.initUI` 字符串是否存在）

自检不过直接非零退出。

---

## 8. 冲突与联调

- 三人各自分支：`agent/codex/render`、`agent/a/ui`、`agent/b/data`
- 合并顺序：先 data → 再 render → 最后 ui
- 联调失败先看是不是**契约被单方面改了**，再查实现
- 契约变更必须写进 `docs/分工.md` 的「契约变更记录」并 @ 枯木
