# weihua-71 · 场景 71《装好给你看》

卫华黑客松场景 71 的参赛原型：客户现场照片 + 技术方案 → 实景安装效果图，参数可改、当场重出。

**一个 HTML 文件，零依赖，双击即跑，断网可用。**

## 仓库地址

| 用途 | 地址 |
|---|---|
| 工作区（本机） | `D:\WorkBuddyData\WorkBuddy\2026-11-08-23-20-21\weihua-71` |
| 共享远端 origin | `file:///D:/WorkBuddyData/WorkBuddy/2026-11-08-23-20-21/weihua-71.git` |

```bash
git clone "file:///D:/WorkBuddyData/WorkBuddy/2026-11-08-23-20-21/weihua-71.git"
cd weihua-71
node build.js          # 合成 dist/作品71.html
```

## 目录

```
weihua-71/
├─ BRIEF.md            # 背景包：场景原文、约束、功能清单、数据、验收（先读这个）
├─ CONTRACT.md         # 接口契约：三个模块怎么对接（三方并行必须遵守）
├─ docs/
│  ├─ 分工.md          # 仓库地址、三人分工、时间线、分支、合并门禁
│  └─ 验收.md          # 10 条验收 + 自检命令 + 现场试跑
├─ src/
│  ├─ data.js          # 队友 B：配置、厂房、文案（已给可用初版）
│  ├─ render.js        # Codex：参数 → SVG 渲染引擎（当前是降级占位，请替换）
│  └─ ui.js            # 队友 A：交互外壳（当前是降级占位，请替换）
├─ template.html       # 外壳模板（含 <!--INJECT_CSS--> / <!--INJECT_JS-->）
├─ build.js            # 合成 + 三项自检
└─ dist/               # 产物：作品71.html
```

## 谁做什么

| 角色 | 文件 | 任务 |
|---|---|---|
| Codex | `src/render.js` | 渲染引擎（最难）：等轴测厂房 + 门机 + AGV 路径 |
| 队友 A | `src/ui.js` | 交互外壳：对比滑块、四步、改需求、播放/跳过/全屏 |
| 队友 B | `src/data.js` | 数据与内容：4 套配置、3 类厂房、文案、匹配逻辑 |
| 枯木 | `template.html` `build.js` `docs/*` | 契约、合成、验收、提交 |

**只改自己那一个文件**，不要顺手改别人的。契约见 `CONTRACT.md`。

## 规则摘要

- 零网络请求、零 CDN、零外部字体/图片
- 只用脱敏或模拟数据
- 最终产物必须是**单文件 HTML**
- 所有动画都要能被「跳过动画」瞬间终结
- 交付前跑 `node build.js`，自检不过不许合
