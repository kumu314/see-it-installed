/* ============================================================
 * src/data.js  ·  队友 B 第三轮 + 小羽代改（卫华真实产品线）
 *
 * 本轮改动（在 B 第三轮基础上，只改内容不改变逻辑）：
 *   1. configs 六套换成卫华官网公开的真实产品线
 *      （2000t 门机 / 450t 造船门机 / 500t 铸造 / 600t 水电门机 /
 *        电解铜多功能 / QD 32/5t 通用对照）
 *   2. 新增 productType（bridge/gantry/casting/portal）与 columnSpan，
 *      供 render.js 区分类别、供净距计算使用
 *   3. validate 的 capacity 上限 1000 -> 5000（否则 2000t 会被判非法）
 *   4. steps 前三步文案改为「录入 / 换算 / 命中」，避免被误读为自动识别
 *   5. rerender 改为「跨度 36 m、起重量 600 t」-> 目标 D
 *
 * 口径：型号与项目名来自卫华官网公开资料（source:'doc'）；
 *       跨度/轨高/出图用时为示意值，不是官方技术参数。
 * ========================================================== */
(function () {
  "use strict";

  window.WH = window.WH || {};

  var configs = [
    {
      id: 'A',
      model: 'QD 2000t 超大型门式',
      span: 48.0,
      capacity: 2000,
      railHeight: 30.0,
      duty: 'A8',
      agv: 0,
      renderSec: 120,
      bayType: 'outdoor',
      productType: 'gantry',
      columnSpan: 0,
      scene: '惠生南通重工项目',
      source: 'doc',
      painPoint: '超大件对基础承载和拼装场地要求极高，场地不平就装不起来。',
      industry: '船舶重工 / 海工',
      customerAsk: '2000 吨的活，我这场地基础扛得住吗？'
    },
    {
      id: 'B',
      model: '450t 造船门式',
      span: 60.0,
      capacity: 450,
      railHeight: 45.0,
      duty: 'A7',
      agv: 0,
      renderSec: 90,
      bayType: 'outdoor',
      productType: 'gantry',
      columnSpan: 0,
      scene: '船厂分段吊装',
      source: 'doc',
      painPoint: '分段重、对位精度要求高，海边风载还会让摆动变大。',
      industry: '船舶制造',
      customerAsk: '船体分段对位，能精确到几毫米？'
    },
    {
      id: 'C',
      model: '500t 铸造起重机',
      span: 28.0,
      capacity: 500,
      railHeight: 22.0,
      duty: 'A8',
      agv: 0,
      renderSec: 120,
      bayType: 'double',
      productType: 'casting',
      columnSpan: 12,
      scene: '冶金铸造车间',
      source: 'doc',
      painPoint: '炉区热辐射持续烤电气件，不单独做隔热寿命掉得很快。',
      industry: '冶金铸造',
      customerAsk: '高温工况，你们的电气件耐得住吗？'
    },
    {
      id: 'D',
      model: '600t 水电门式',
      span: 36.0,
      capacity: 600,
      railHeight: 28.0,
      duty: 'A7',
      agv: 0,
      renderSec: 100,
      bayType: 'outdoor',
      productType: 'gantry',
      columnSpan: 0,
      scene: '广东粤水电项目',
      source: 'doc',
      painPoint: '工地露天、风大，基础沉降和抗风等级是两条硬线。',
      industry: '水利水电',
      customerAsk: '工地风大，抗风等级多少？'
    },
    {
      id: 'E',
      model: '电解铜多功能起重机',
      span: 31.5,
      capacity: 100,
      railHeight: 16.0,
      duty: 'A7',
      agv: 2,
      renderSec: 110,
      bayType: 'double',
      productType: 'bridge',
      columnSpan: 12,
      scene: '有色冶炼',
      source: 'doc',
      painPoint: '一台机器要换几种吊具，节拍常常卡在换具那几分钟。',
      industry: '有色金属',
      customerAsk: '一台机器干几种活，能切换吗？'
    },
    {
      id: 'F',
      model: 'QD 32/5t 通用桥式',
      span: 22.5,
      capacity: 32,
      railHeight: 9.0,
      duty: 'A5',
      agv: 2,
      renderSec: 90,
      bayType: 'single',
      productType: 'bridge',
      columnSpan: 6,
      scene: '机械加工车间',
      source: 'sim',
      painPoint: '老厂房净空低，照明桥架压得低，小车过去容易蹭。',
      industry: '机械加工',
      customerAsk: '我这车间跨度就 22 米，能装多大的？'
    }
  ];

  var bays = {
    single:  { name: '单跨机械加工车间', columnSpan: 6,  railHeight: 9,  roof: '双坡', note: '有行车梁、照明桥架' },
    double:  { name: '双跨重装车间',     columnSpan: 12, railHeight: 12, roof: '网架', note: '中间有柱，需避让' },
    outdoor: { name: '露天堆场',         columnSpan: 0,  railHeight: 0,  roof: '—',   note: '轨道式门机，轨距随项目' }
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function pick(v, fallback) { return isNum(v) ? v : fallback; }
  function fixed(v, n) { return (isNum(v) ? v : 0).toFixed(n); }

  var maxSpan = 0, maxCapacity = 0;
  configs.forEach(function (c) {
    if (c.span > maxSpan) maxSpan = c.span;
    if (c.capacity > maxCapacity) maxCapacity = c.capacity;
  });

  function match(params) {
    var base = configs[0];
    var p = params && typeof params === 'object' ? params : {};
    var bayType = typeof p.bayType === 'string' ? p.bayType : base.bayType;
    var span = pick(p.span, base.span);
    var capacity = pick(p.capacity, base.capacity);

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

  function validate() {
    var out = [];
    var seen = Object.create(null);
    var bayOK = ['single', 'double', 'outdoor'];

    function check(field, value, ok, problem) {
      if (!ok) out.push({ field: field, value: value, problem: problem });
    }

    configs.forEach(function (c, i) {
      var p = 'configs[' + i + ']';
      check(p + '.span', c.span, isNum(c.span) && c.span > 0 && c.span < 150, 'span 必须在 (0, 150) 之间');
      check(p + '.capacity', c.capacity, isNum(c.capacity) && c.capacity > 0 && c.capacity < 5000, 'capacity 必须在 (0, 5000) 之间');
      check(p + '.railHeight', c.railHeight, isNum(c.railHeight) && c.railHeight > 0 && c.railHeight < 80, 'railHeight 必须在 (0, 80) 之间');
      check(p + '.agv', c.agv, isNum(c.agv) && c.agv >= 0 && c.agv <= 20, 'agv 必须在 [0, 20] 之间');
      check(p + '.renderSec', c.renderSec, isNum(c.renderSec) && c.renderSec > 0 && c.renderSec <= 600, 'renderSec 必须在 (0, 600] 之间');
      check(p + '.bayType', c.bayType, bayOK.indexOf(c.bayType) !== -1, 'bayType 必须是 single / double / outdoor');
      check(p + '.id', c.id, !(c.id in seen), 'id 重复：' + c.id);
      seen[c.id] = true;
    });

    return out;
  }

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
    meta: {
      track: '内容创作',
      scene: '场景 71',
      owner: '归属 活动方',
      disclaimer: '全部型号、跨度、起重量、用时均为演示模拟值，不是真实设备参数，不可用于工程判断；案例名称取自卫华官网公开资料，仅作示意，不代表合作或授权。',
      source: 'doc'
    },

    configs: configs,
    bays: bays,

    steps: [
      { t: '录入现场参数',   d: '柱距、轨顶标高、屋面形式（演示版人工录入）' },
      { t: '换算结构参数',   d: '跨度 {span} m · 轨高 {railHeight} m · 工作级别 {duty}' },
      { t: '命中归档方案',   d: '方案库 ' + configs.length + ' 套，按厂型与跨度命中库里最接近的一套' },
      { t: '渲染安装效果图', d: '{renderSec} s 生成 · 参数可改可重出' }
    ],

    rerender: {
      label: '客户改需求：跨度 36 m、起重量 600 t',
      target: 'D',
      done: '已按新需求重出图 · 30 s'
    },

    brief: {
      problem:  '投标现场客户指着厂房问「装上什么样」，等外部出图要两三天，窗口早过了。',
      solution: '给一张现场照片和方案参数，当场出实景安装效果图，参数能改、能重出。',
      value:    '出图从两三天压到 90 秒，当场改完当场看；这个周期账是本作品推算，不是实测。',
      landing:  '不连内网、不取真实图纸和客户数据，一个 HTML 双击就跑。',
      source: 'calc'
    },

    match: match,
    __validate: validate,
    format: format
  };
})();
