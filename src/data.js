/* ============================================================
 * src/data.js  ·  队友 B（第二轮：数据更真 / 文案更打动人 / 格式抗错）
 *
 * 数据来源：BRIEF.md 第 6 节（A–D 原样使用）；E/F 取自队友B任务2 文档
 * 结构来源：CONTRACT.md 第 3 节（已有字段名一律不改，只做新增）
 * 本轮新增：meta / configs[].painPoint / industry / customerAsk / source
 *           brief.source / steps[2] 模板 / match() / __validate() / format()
 *
 * 约定：IIFE，只挂 window.WH.DATA；三个函数均为纯函数，不碰 DOM、不写全局状态。
 * ========================================================== */
(function () {
  "use strict";

  window.WH = window.WH || {};

  /* ---------- 四套原始配置 + 两套业务补充 ---------- */
  /* E/F 的 renderSec：任务2 文档表格未给出图用时，按吨位量级暂定
     （E 150 s / F 60 s），已标 source:'sim'，待枯木确认后可直接改这两个数。 */
  var configs = [
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
      scene: '机械加工车间',
      source: 'sim',
      painPoint: '老车间照明桥架压得低，小车跑过去容易蹭到。',
      industry: '机械加工',
      customerAsk: '我这车间跨度就 22 米，能装多大的？'
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
      scene: '重装总装车间',
      source: 'sim',
      painPoint: '中间那排柱子最容易被忽略，吊装路线得提前绕开。',
      industry: '重型装备制造',
      customerAsk: '总装线中间有柱子，门机轨道怎么绕过去？'
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
      scene: '轻载仓储',
      source: 'sim',
      painPoint: '单梁看着省钱，后期想加吨位就得整台换。',
      industry: '仓储物流',
      customerAsk: '我们只吊十吨，单梁够不够用？'
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
      scene: '港口堆场 / 重型装备',
      source: 'sim',
      painPoint: '露天最怕风和雨，轨道基础和排水得一起看。',
      industry: '港口与堆场',
      customerAsk: '港口堆场露天，31 米跨度的门机怎么立？'
    },
    {
      id: 'E',
      model: 'QD 200/50t 双梁',
      span: 34.5,
      capacity: 200,
      railHeight: 16.0,
      duty: 'A8',
      agv: 4,
      renderSec: 150,
      bayType: 'double',
      scene: '冶金铸造车间',
      source: 'sim',
      painPoint: '车间温度高，电气和润滑件不按高温挑就容易停。',
      industry: '冶金铸造',
      customerAsk: '我们这车间温度高，设备扛得住吗？'
    },
    {
      id: 'F',
      model: 'QD 16/3.2t 双梁',
      span: 19.5,
      capacity: 16,
      railHeight: 8.0,
      duty: 'A4',
      agv: 1,
      renderSec: 60,
      bayType: 'single',
      scene: '洁净装配车间',
      source: 'sim',
      painPoint: '洁净车间怕落灰，普通链条和刹车会掉屑。',
      industry: '精密电子 / 洁净装配',
      customerAsk: '洁净车间怕落灰，设备会不会带尘进来？'
    }
  ];

  var bays = {
    single:  { name: '单跨机械加工车间', columnSpan: 6,  railHeight: 9,  roof: '双坡', note: '有行车梁、照明桥架' },
    double:  { name: '双跨重装车间',     columnSpan: 12, railHeight: 12, roof: '网架', note: '中间有柱，需避让' },
    outdoor: { name: '露天堆场',         columnSpan: 0,  railHeight: 0,  roof: '—',   note: '轨道式门机，轨距 31.5 m' }
  };

  /* ---------- 工具（内部用，不导出、不污染全局） ---------- */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function pick(v, fallback) { return isNum(v) ? v : fallback; }
  function fixed(v, n) { return (isNum(v) ? v : 0).toFixed(n); }

  var maxSpan = 0, maxCapacity = 0;
  configs.forEach(function (c) {
    if (c.span > maxSpan) maxSpan = c.span;
    if (c.capacity > maxCapacity) maxCapacity = c.capacity;
  });

  /* ---------- 相似度：真算的，可解释 ---------- */
  function match(params) {
    var base = configs[0];
    var p = params && typeof params === 'object' ? params : {};
    var bayType = typeof p.bayType === 'string' ? p.bayType : base.bayType;
    var span = pick(p.span, base.span);
    var capacity = pick(p.capacity, base.capacity);

    /* score = 0.5×厂房匹配 + 0.3×跨度接近度 + 0.2×吨位接近度 */
    var bestId = base.id, best = -Infinity;
    configs.forEach(function (c) {
      var s = 0.5 * (c.bayType === bayType ? 1 : 0.5)
            + 0.3 * (1 - Math.abs(c.span - span) / maxSpan)
            + 0.2 * (1 - Math.abs(c.capacity - capacity) / maxCapacity);
      if (s > best) { best = s; bestId = c.id; }
    });

    var score = Math.round(Math.min(1, Math.max(0, best)) * 100) / 100;
    return { count: configs.length, score: score, nearest: bestId };
  }

  /* ---------- 数据自检：空数组表示全通过 ---------- */
  function validate() {
    var out = [];
    var seen = Object.create(null);
    var bayOK = ['single', 'double', 'outdoor'];

    function check(field, value, ok, problem) {
      if (!ok) out.push({ field: field, value: value, problem: problem });
    }

    configs.forEach(function (c, i) {
      var p = 'configs[' + i + ']';
      check(p + '.span', c.span, isNum(c.span) && c.span > 0 && c.span < 100, 'span 必须在 (0, 100) 之间');
      check(p + '.capacity', c.capacity, isNum(c.capacity) && c.capacity > 0 && c.capacity < 1000, 'capacity 必须在 (0, 1000) 之间');
      check(p + '.railHeight', c.railHeight, isNum(c.railHeight) && c.railHeight > 0 && c.railHeight < 50, 'railHeight 必须在 (0, 50) 之间');
      check(p + '.agv', c.agv, isNum(c.agv) && c.agv >= 0 && c.agv <= 20, 'agv 必须在 [0, 20] 之间');
      check(p + '.renderSec', c.renderSec, isNum(c.renderSec) && c.renderSec > 0 && c.renderSec <= 600, 'renderSec 必须在 (0, 600] 之间');
      check(p + '.bayType', c.bayType, bayOK.indexOf(c.bayType) !== -1, 'bayType 必须是 single / double / outdoor');
      check(p + '.id', c.id, !(c.id in seen), 'id 重复：' + c.id);
      seen[c.id] = true;
    });

    return out;
  }

  /* ---------- 单位格式化：UI 不再各自拼 ---------- */
  function format(config) {
    var c = config && typeof config === 'object' ? config : configs[0];
    var agv = pick(c.agv, configs[0].agv);
    return {
      span: fixed(pick(c.span, configs[0].span), 1) + ' m',
      capacity: String(Math.round(pick(c.capacity, configs[0].capacity))) + ' t',
      railHeight: fixed(pick(c.railHeight, configs[0].railHeight), 1) + ' m',
      duty: typeof c.duty === 'string' ? c.duty : configs[0].duty,
      agv: agv === 0 ? '无 AGV' : String(agv) + ' 台',
      renderSec: String(Math.round(pick(c.renderSec, configs[0].renderSec))) + ' s'
    };
  }

  window.WH.DATA = {
    /* 页头三条与底部免责声明改由 UI 从此处读取，不再硬编码 */
    meta: {
      track: '内容创作',
      scene: '场景 71',
      owner: '归属 活动方',
      disclaimer: '全部型号、跨度、起重量、用时均为演示模拟值，不是真实设备参数，不可用于工程判断。'
    },

    configs: configs,

    bays: bays,

    /* 第 3 步改为模板：{matchCount} / {matchScore} 由 UI 用
       WH.DATA.match(cfg) 的 count 与 Math.round(score * 100) 替换；
       第 2、4 步占位符仍由 UI 按原有 fill() 规则替换。 */
    steps: [
      { t: '解析现场照片',   d: '识别柱距、轨顶标高、屋面形式、可避让障碍' },
      { t: '识别结构参数',   d: '跨度 {span} m · 轨高 {railHeight} m · 工作级别 {duty}' },
      { t: '匹配已归档方案', d: '方案库 {matchCount} 套，最接近 {matchScore}%' },
      { t: '渲染安装效果图', d: '{renderSec} s 生成 · 参数可改可重出' }
    ],

    rerender: {
      label: '客户改需求：跨度 28.5 m、起重量 50 t',
      target: 'B',
      done: '已按新需求重出图 · 30 s'
    },

    brief: {
      problem:  '投标现场客户指着厂房问「装上什么样」，等外部出图要两三天，窗口早过了。',
      solution: '给一张现场照片和方案参数，当场出实景安装效果图，参数能改、能重出。',
      value:    '出图从两三天压到 90 秒，当场改完当场看；这个周期账是本作品推算，不是实测。',
      landing:  '不连内网、不取真实图纸和客户数据，一个 HTML 双击就跑。',
      /* 仅 value 段「2–3 天 → 90 秒」的周期账属于推算；其余为文档口径 */
      source: 'calc'
    },

    match: match,
    __validate: validate,
    format: format
  };
})();
