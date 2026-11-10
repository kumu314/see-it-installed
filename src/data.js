/* ============================================================
 * src/data.js  ·  队友 B
 * 数据与内容：4 套配置 / 3 类厂房 / 四步文案 / 改需求文案
 *
 * 数据来源：BRIEF.md 第 6 节（脱敏模拟数据，原样使用，不自行编造）
 * 结构来源：CONTRACT.md 第 3 节（字段名严格照抄，未增删改）
 * 本文件只挂 window.WH.DATA，不定义其他全局变量。
 * ========================================================== */
(function () {
  "use strict";

  window.WH = window.WH || {};

  window.WH.DATA = {
    /* BRIEF 6.1 —— 四套配置。
       bayType 按适用场景对应到 6.2 的三类厂房：
       机械加工车间 → single，重装总装车间 → double，
       轻载仓储 → single，港口堆场 / 重型装备 → outdoor。 */
    configs: [
      {
        id: 'A',
        model: 'QD 32/5t 双梁',
        span: 22.5,
        capacity: 32,
        railHeight: 9.0,
        duty: 'A5',
        agv: 2,
        renderSec: 90,
        bayType: 'single',
        scene: '机械加工车间'
      },
      {
        id: 'B',
        model: 'QD 50/10t 双梁',
        span: 28.5,
        capacity: 50,
        railHeight: 12.0,
        duty: 'A6',
        agv: 2,
        renderSec: 30,
        bayType: 'double',
        scene: '重装总装车间'
      },
      {
        id: 'C',
        model: 'LDA 10t 单梁',
        span: 16.5,
        capacity: 10,
        railHeight: 7.5,
        duty: 'A3',
        agv: 0,
        renderSec: 45,
        bayType: 'single',
        scene: '轻载仓储'
      },
      {
        id: 'D',
        model: 'QD 100/32t 双梁',
        span: 31.5,
        capacity: 100,
        railHeight: 14.0,
        duty: 'A7',
        agv: 4,
        renderSec: 120,
        bayType: 'outdoor',
        scene: '港口堆场 / 重型装备'
      }
    ],

    /* BRIEF 6.2 —— 三类厂房。
       outdoor 的「无柱 / —」按契约用 0 与 '—' 表示。 */
    bays: {
      single:  { name: '单跨机械加工车间', columnSpan: 6,  railHeight: 9,  roof: '双坡', note: '有行车梁、照明桥架' },
      double:  { name: '双跨重装车间',     columnSpan: 12, railHeight: 12, roof: '网架', note: '中间有柱，需避让' },
      outdoor: { name: '露天堆场',         columnSpan: 0,  railHeight: 0,  roof: '—',   note: '轨道式门机，轨距 31.5 m' }
    },

    /* BRIEF 6.3 —— 四步出图文案。
       第 2、4 步的 {span} / {railHeight} / {duty} / {renderSec}
       为占位符，由 ui.js 在渲染时替换为当前方案的值，不在此写死。 */
    steps: [
      { t: '解析现场照片',   d: '识别柱距、轨顶标高、屋面形式、可避让障碍' },
      { t: '识别结构参数',   d: '跨度 {span} m · 轨高 {railHeight} m · 工作级别 {duty}' },
      { t: '匹配已归档方案', d: '方案库 3 套，相似度 87%' },
      { t: '渲染安装效果图', d: '{renderSec} s 生成 · 参数可改可重出' }
    ],

    /* BRIEF 6.4 —— 客户改需求 */
    rerender: {
      label: '客户改需求：跨度 28.5 m、起重量 50 t',
      target: 'B',
      done: '已按新需求重出图 · 30 s'
    },

    /* CONTRACT 第 3 节 —— 一页说明四行 */
    brief: {
      problem:  '客户最想看的不是参数表，是「我的厂房装上它长什么样」；外部渲染排期 2–3 天，投标窗口等不起。',
      solution: '现场实景照片 + 客户技术方案 → 实景安装效果图，参数可改、当场重出。',
      value:    '售前沟通从「等图」变「当面改图」；周期账为本作品推算，非主办方原文。',
      landing:  '不碰内网，纯离线演示；出图引擎可后续接已报备的工具。'
    }
  };
})();
