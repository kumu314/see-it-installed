/* ============================================================
 * src/data.js  ·  队友 B（第四轮 / 今晚最后一轮：真实产品线数据收口）
 *
 * 【基线说明】本轮开工前，main@7caf51f 已由小羽按「B 推不上则代改
 *   data.js」的兜底条款，把六套配置换成卫华官网公开的真实产品线并
 *   直接合入 main。B 已逐条核对：六套型号、productType、columnSpan、
 *   customerAsk / painPoint、source:'doc'、validate 上限、steps 去 AI 化、
 *   rerender 对齐 D，全部符合本轮任务表格。故本轮【六套数据一字未改】，
 *   不重复造轮子、不覆盖队友工作，只补 B 职责内仍缺的收口项。
 *
 * 本轮（B）改动，仅 3 处，均不触碰六套数据、不删改任何已有字段名：
 *   1. __validate() 纳入本轮新增字段：productType 枚举 / columnSpan 与
 *      bayType 一致性 / source 枚举 / model·scene·customerAsk·painPoint
 *      非空。理由：作品本轮要从「能看」升级到「能判断」，而 productType
 *      与 columnSpan 正是四形态渲染与净距判断的数据基础，缺自检则数据
 *      出错时没有任何拦截。沿用前几轮 B 建立的自检机制，返回 [] 表示全过。
 *   2. meta 拆清来源口径：source='doc'（型号与项目名来自官网公开资料）与
 *      valueSource='sim'（跨度/吨位/轨高/柱距/出图用时均为演示示意值），
 *      避免「doc」被误读成「数值来自官网」。
 *   3. disclaimer 精确化：明确「仅作示意、不代表卫华授权或合作、非官方
 *      技术参数、不可用于工程判断」，对应本轮边界第 6 条与话术合规红线。
 *
 * 小羽代改版已包含（本轮全部保留）：
 *   - configs 六套换成卫华官网公开的真实产品线
 *     （2000t 门机 / 450t 造船门机 / 500t 铸造 / 600t 水电门机 /
 *       电解铜多功能 / QD 32/5t 通用对照），F 保留为通用对照
 *   - 新增 productType（bridge/gantry/casting/portal）与 columnSpan
 *     （露天 0 / 单跨 6 / 双跨 12），供四形态渲染与净距计算使用
 *   - source:'doc' 标注型号与项目名来自官网公开资料
 *   - validate 上限放宽：span<150 / capacity<5000 / railHeight<80
 *   - steps 前三步文案改「录入 / 换算 / 命中」，避免被误读为自动识别
 *   - rerender 改「跨度 36 m、起重量 600 t」→ 目标 D
 *
 * 口径：型号与项目名来自卫华官网公开资料，仅作示意，不代表卫华授权或
 *       合作；跨度、起重量、轨高、柱距、出图用时等数值均为演示示意值，
 *       非官方技术参数、非实测，不可用于工程判断。
 *
 * 约定：IIFE，只挂 window.WH.DATA；match / __validate / format 均为纯函数，
 *       不碰 DOM、不写全局状态；零外部 URL。
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

  /* ---------- 数据自检：空数组表示全通过 ----------
     第四轮起纳入本轮新增字段：productType / columnSpan / source /
     model·scene·customerAsk·painPoint，作为「能判断」的数据质量门禁。 */
  function validate() {
    var out = [];
    var seen = Object.create(null);
    var bayOK = ['single', 'double', 'outdoor'];
    var typeOK = ['bridge', 'gantry', 'casting', 'portal'];
    var srcOK = ['sim', 'calc', 'doc'];
    var textKeys = ['model', 'scene', 'customerAsk', 'painPoint'];

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

      /* 本轮新增字段：四形态与净距判断的数据基础 */
      check(p + '.productType', c.productType, typeOK.indexOf(c.productType) !== -1,
            'productType 必须是 bridge / gantry / casting / portal');
      check(p + '.columnSpan', c.columnSpan,
            isNum(c.columnSpan) &&
            (c.bayType === 'outdoor' ? c.columnSpan === 0 :
             c.bayType === 'double'  ? c.columnSpan === 12 :
                                       c.columnSpan === 6),
            'columnSpan 必须与 bayType 一致：outdoor 0 / single 6 / double 12');
      check(p + '.source', c.source, srcOK.indexOf(c.source) !== -1,
            'source 必须是 sim / calc / doc');
      textKeys.forEach(function (k) {
        check(p + '.' + k, c[k], typeof c[k] === 'string' && c[k].length > 0,
              k + ' 必须是非空字符串');
      });
    });

    return out;
  }

  /* ---------- 单套参数校验（W3：手输参数/自定义方案共用一套范围，不在 UI 重复写） ----------
     返回 [{ field, message }]；空数组 = 通过。 */
  function validateConfig(c) {
    var out = [];
    function bad(field, message) { out.push({ field: field, message: message }); }
    if (!c || typeof c !== "object") { bad("config", "缺少参数对象"); return out; }
    if (!isNum(c.span) || !(c.span > 0) || !(c.span < 150)) bad("span", "跨度需为 0–150 米之间的数字");
    if (!isNum(c.capacity) || !(c.capacity > 0) || !(c.capacity < 5000)) bad("capacity", "起重量需为 0–5000 吨之间的数字");
    if (!isNum(c.railHeight) || !(c.railHeight > 0) || !(c.railHeight < 80)) bad("railHeight", "轨高需为 0–80 米之间的数字");
    if (!isNum(c.agv) || c.agv < 0 || c.agv > 20) bad("agv", "AGV 数量需为 0–20 的整数");
    if (["A5", "A6", "A7", "A8"].indexOf(c.duty) === -1) bad("duty", "工作级别需在 A5–A8 之间");
    if (["bridge", "gantry", "casting", "portal"].indexOf(c.productType) === -1) bad("productType", "设备类别需在 桥式/门式/铸造/门座 之间");
    if (!c.model || !String(c.model).trim()) bad("model", "方案名称不能为空");
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
      /* 型号与项目名取自卫华官网公开资料，仅作示意；数值全部为演示示意值 */
      disclaimer: '型号与项目名称取自卫华官网公开资料，仅作示意，不代表卫华授权或合作；跨度、起重量、轨高、柱距、出图用时等数值均为演示示意值，非官方技术参数、非实测，不可用于工程判断。',
      /* 页头口径与型号出处来自规则/场景原文与官网公开资料 */
      source: 'doc',
      /* 跨度/吨位/轨高/柱距/出图用时等数值均为演示模拟，避免 doc 被误读为数值出处 */
      valueSource: 'sim'
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
    validateConfig: validateConfig,
    format: format
  };
})();
