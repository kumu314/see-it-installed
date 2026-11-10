# weihua-71 · 场景 71《装好给你看》

卫华黑客松场景 71 的参赛原型：客户现场照片 + 技术方案 → 实景安装效果图，参数可改、当场重出。

**一个 HTML 文件，零依赖，双击即跑，断网可用。**

## 本轮 UI 优化（2026-11）

按《卫华场景 71 UI 优化研究与详细实施方案 v1》施工，已落地：唯一方案状态提交入口（修 F01）、弹层焦点与快捷键隔离（F02/F03）、全局唯一视图模式（F05）、参数草稿/校验/应用/放弃、首屏现场照片入口、标定单点纠错与步骤状态、暂停全部动效、导出预览与模式命名。

- 改动说明与验收记录：[docs/UI优化实施记录.md](docs/UI优化实施记录.md)
- 浏览器回归脚本：`node tests/ui-verify/t1-state.cjs` ~ `t4-motion.cjs`（需 Edge + playwright）
- 截图：`docs/screenshots/`
## 仓库地址

| 用途 | 地址 |
|---|---|
| **GitHub（跨人协作，私有）** | **https://github.com/kumu314/weihua-71** |
| 工作区（本机） | `D:\WorkBuddyData\WorkBuddy\2026-11-08-23-20-21\weihua-71` |
| 现场兜底 origin（本地裸仓库） | `file:///D:/WorkBuddyData/WorkBuddy/2026-11-08-23-20-21/weihua-71.git` |

```bash
# 队友（需先被加为 collaborator 并接受邀请）
git clone https://github.com/kumu314/weihua-71.git
cd weihua-71
node build.js          # 合成 dist/作品71.html

# 本机（不走网络）
git clone "file:///D:/WorkBuddyData/WorkBuddy/2026-11-08-23-20-21/weihua-71.git"
```

> **私有仓库**：队友必须先被邀请为 collaborator（Settings → Collaborators），接受邀请后才能 clone。
> **现场若连不上 GitHub**：改用 `origin`（本地裸仓库）或 U 盘，见 `docs/分工.md` 第 0 节。

## 仓库里只有三样东西

```
weihua-71/
├─ BRIEF.md            # 背景包：场景原文、硬约束、功能清单、脱敏数据、6 分钟节奏、验收
├─ CONTRACT.md         # 接口契约：三个模块各自的输入输出、加载顺序、边界
├─ docs/
│  └─ 验收.md          # 10 条验收 + 自检命令 + 现场试跑
├─ template.html       # 容器骨架：只有 #app 和两个注入占位符，不含任何样式
├─ build.js            # 合成单文件 + 三项自检
└─ src/                # 空目录，三个模块由开工者按契约创建
```

**这里没有实现代码**。`src/` 是空的，`template.html` 不含视觉——页面长什么样、怎么写，由开工者自己决定。

## 开工顺序

1. 读 `BRIEF.md` —— 要做什么、不能做什么、用什么数据
2. 读 `CONTRACT.md` —— 三个文件各自的接口，别写串
3. 在 `src/` 下创建自己负责的模块
4. `node build.js` —— 缺哪个文件会直接报 `MISSING FILE`
5. 对着 `docs/验收.md` 逐条自检

## 硬规则

- 零网络请求、零 CDN、零外部字体/图片
- 只用脱敏或模拟数据
- 最终产物必须是**单文件 HTML**
- 所有动画都要能被「跳过动画」瞬间终结
- 三个模块各自独立，**不要改别人正在写的文件**

## 规则摘要

- 零网络请求、零 CDN、零外部字体/图片
- 只用脱敏或模拟数据
- 最终产物必须是**单文件 HTML**
- 所有动画都要能被「跳过动画」瞬间终结
- 交付前跑 `node build.js`，自检不过不许合
