/* ============================================================
 * src/data.js  ·  队友 B 负责
 * 结构契约见 CONTRACT.md 第 3 节。字段名不可删改，可新增。
 * 当前是可直接跑的初版，队友 B 在此基础上增强（方案匹配逻辑、更多厂型等）。
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};

  window.WH.DATA = {
    /* 四套配置：数字用 Number，单位由 UI 拼 */
    configs: [
      {
        id: "A", model: "QD 32/5t 双梁",
        span: 22.5, capacity: 32, railHeight: 9.0,
        duty: "A5", agv: 2, renderSec: 90,
        bayType: "single", scene: "机械加工车间"
      },
      {
        id: "B", model: "QD 50/10t 双梁",
        span: 28.5, capacity: 50, railHeight: 12.0,
        duty: "A6", agv: 2, renderSec: 30,
        bayType: "double", scene: "重装总装车间"
      },
      {
        id: "C", model: "LDA 10t 单梁",
        span: 16.5, capacity: 10, railHeight: 7.5,
        duty: "A3", agv: 0, renderSec: 45,
        bayType: "single", scene: "轻载仓储"
      },
      {
        id: "D", model: "QD 100/32t 双梁",
        span: 31.5, capacity: 100, railHeight: 14.0,
        duty: "A7", agv: 4, renderSec: 120,
        bayType: "outdoor", scene: "港口堆场 / 重型装备"
      }
    ],

    /* 三类厂房：用于「识别结构」那一步的说明 */
    bays: {
      single:  { name: "单跨机械加工车间", columnSpan: 6,  railHeight: 9,  roof: "双坡", note: "有行车梁、照明桥架" },
      double:  { name: "双跨重装车间",     columnSpan: 12, railHeight: 12, roof: "网架", note: "中间有柱，需避让" },
      outdoor: { name: "露天堆场",         columnSpan: 0,  railHeight: 0,  roof: "—",   note: "轨道式门机，轨距 31.5 m" }
    },

    /* 四步文案：{span} {railHeight} {duty} {renderSec} 由 UI 替换 */
    steps: [
      { t: "解析现场照片",   d: "识别柱距、轨顶标高、屋面形式、可避让障碍" },
      { t: "识别结构参数",   d: "跨度 {span} m · 轨高 {railHeight} m · 工作级别 {duty}" },
      { t: "匹配已归档方案", d: "方案库 3 套，相似度 87%" },
      { t: "渲染安装效果图", d: "{renderSec} s 生成 · 参数可改可重出" }
    ],

    /* 「客户改需求」桥段 */
    rerender: {
      label: "客户改需求：跨度 28.5 m、起重量 50 t",
      target: "B",
      done: "已按新需求重出图 · 30 s"
    },

    /* 一页说明 */
    brief: {
      problem:  "客户最想看的不是参数表，是「我的厂房装上它长什么样」；外部渲染排期 2–3 天，投标窗口等不起。",
      solution: "现场实景照片 + 客户技术方案 → 实景安装效果图，参数可改、当场重出。",
      value:    "售前沟通从「等图」变「当面改图」；周期账为本作品推算，非主办方原文。",
      landing:  "不碰内网，纯离线演示；出图引擎可后续接已报备的工具。"
    },

    /* 顶部标识（不要写死真实客户信息） */
    meta: {
      track: "内容创作",
      scene: "场景 71",
      owner: "归属 活动方",
      disclaimer: "全部型号、跨度、起重量、用时均为演示模拟值，不是真实设备参数，不可用于工程判断。"
    }
  };

  /* —— 可选增强（队友 B 可扩展）——
   * 1. 方案匹配：按 bayType/span 算相似度，替换 steps[2].d 里的「87%」
   * 2. 更多厂型：在 bays 里加键，同时在 configs 里引用
   * 3. 客户画像：给每套配置加 industry 字段，UI 可用来讲故事
   */
})();
