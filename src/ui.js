/* ============================================================
 * src/ui.js  ·  队友A  ·  交互外壳（第二轮：交互收口）
 *
 * 职责：页面全部 DOM 与样式（#app 是唯一容器）
 *   - 对比滑块（原生 input[type=range]，可拖拽 + 键盘）
 *   - 四步出图进度（播放依次点亮 / 跳过一次全亮）
 *   - 参数卡（7 值随方案变）
 *   - 方案 A/B/C/D 切换
 *   - 「客户改需求」完整重出图桥段（≤3s：进度重置→快速重跑→换参数→扫光→角标）
 *   - 单图 / 并排对比 双模式
 *   - 键盘操作（空格 / F / 1-4 / R）
 *   - 一页说明（默认 问题+价值，可展开四段）
 *
 * 约定：只读 WH.DATA，只调 WH.renderScene()，不写死任何参数数值。
 * 定时器统一进 timers[]，任何新动作先 clearAll()；用代次号 gen 防旧回调生效。
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};

  /* ---------------- 全局状态 ---------------- */
  var DATA = null;
  var cfg = null;          // 当前方案
  var p = 50;              // 滑块位置 0..100
  var timers = [];         // 所有 setTimeout
  var gen = 0;             // 代次号：clearAll() 自增，旧回调全部失效
  var rafId = null;        // 滑块动画
  var playing = false;
  var rendering = false;   // 「客户改需求」进行中
  var sbs = false;         // 并排对比（图内左右分栏）
  var viewMode = 'diagram';// diagram | model | compare | beforeafter —— 全局唯一视图状态（F05）
  var cfgRev = 0;          // 参数版本号：每次成功提交递增，2D/3D/导出同源
  var photoState = 'none'; // none | ready —— 现场照片是否已标定接入
  var photoName = '';
  var photoSize = '';
  var briefOpen = false;
  var inited = false;
  var envelopeMode = "ok";   // 示意净距三态：ok / tight / fail

  var $ = {};              // DOM 引用

  /* ---------------- 小工具 ---------------- */
  function q(sel, root) { return (root || document).querySelector(sel); }
  function dispatch(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* 极老环境忽略 */ }
  }
  function serializeConfig(c) {
    return {
      id: c.id, model: c.model, span: c.span, capacity: c.capacity,
      railHeight: c.railHeight, duty: c.duty, agv: c.agv,
      productType: c.productType, columnSpan: c.columnSpan, bayType: c.bayType,
      scene: c.scene, source: c.source
    };
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) {
    if (typeof n !== "number" || isNaN(n)) return String(n);
    var r = Math.round(n * 10) / 10;
    return r % 1 === 0 ? String(r) : r.toFixed(1);
  }
  // 轨高按契约固定 1 位小数：9.0 m，不能被压成 9 m
  function fixed1(n) {
    if (typeof n !== "number" || isNaN(n)) return String(n);
    return n.toFixed(1);
  }
  // 优先用 data.js 的 format()，取不到再本地兜底（UI 不再各自拼单位）
  function fmtOf(c) {
    try {
      if (DATA && typeof DATA.format === "function") return DATA.format(c);
    } catch (e) { /* 落到本地兜底 */ }
    return null;
  }
  // 相似度：优先问 data.js 的 match()，没有就退化成静态描述
  function matchOf(c) {
    try {
      if (DATA && typeof DATA.match === "function") {
        var m = DATA.match(c);
        if (m && typeof m === "object") return m;
      }
    } catch (e) { /* 落到兜底 */ }
    return null;
  }
  function cfgById(id) {
    if (!DATA || !DATA.configs) return null;
    for (var i = 0; i < DATA.configs.length; i++) {
      if (DATA.configs[i].id === id) return DATA.configs[i];
    }
    return null;
  }
  // 占位符替换：{span}/{railHeight}/{duty}/{renderSec} + {matchCount}/{matchScore}
  // 末尾兜底清掉任何未识别的 {xxx}，保证屏幕上不会漏出花括号
  function fill(t, c) {
    var f = fmtOf(c);
    var m = matchOf(c);
    var total = (DATA && DATA.configs && DATA.configs.length) ? DATA.configs.length : 0;
    var matchCount = m && m.count ? String(m.count) : (total ? String(total) : "—");
    var matchScore = (m && typeof m.score === "number") ? String(Math.round(m.score * 100)) : "—";
    return String(t)
      .replace(/\{span\}/g, f ? f.span.replace(/\s*m$/, "") : num(c.span))
      .replace(/\{railHeight\}/g, f ? f.railHeight.replace(/\s*m$/, "") : fixed1(c.railHeight))
      .replace(/\{duty\}/g, c.duty)
      .replace(/\{renderSec\}/g, f ? f.renderSec.replace(/\s*s$/, "") : num(c.renderSec))
      .replace(/\{matchCount\}/g, matchCount)
      .replace(/\{matchScore\}/g, matchScore)
      /* 第三步用：命中库内哪一套（切方案时实时变化） */
      .replace(/\{hitName\}/g, (function () {
        var s = c.scene || "";
        if (s.length > 8) s = s.split("/")[0].trim();   // 卡片窄，长场景名截到第一段
        return c.id + (s ? " · " + s : "");
      })())
      .replace(/\{[A-Za-z0-9_]+\}/g, "");   // 兜底：未知占位符不留残骸
  }

  /* ---------------- 定时器（代次号强一致） ---------------- */
  function clearAll() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    gen++;                       // 之前排队的回调一律作废
  }
  function at(ms, fn) {
    var g = gen;
    timers.push(setTimeout(function () { if (g === gen) fn(); }, ms));
  }
  // 扫描动画重启：先摘类再加回，强制重放
  function replayClass(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;         // 强制回流，动画才能重放
    el.classList.add(cls);
  }

  /* ---------------- 参数定义（7 值） ---------------- */
  // 参数值一律走 data.js 的 format()，取不到才本地兜底
  function pval(k, c) {
    var f = fmtOf(c);
    if (f && f[k] != null && f[k] !== "") return String(f[k]);
    if (k === "span") return num(c.span) + " m";
    if (k === "capacity") return Math.round(c.capacity) + " t";
    if (k === "railHeight") return fixed1(c.railHeight) + " m";
    if (k === "duty") return String(c.duty);
    if (k === "agv") return c.agv > 0 ? c.agv + " 台" : "无 AGV";
    if (k === "renderSec") return num(c.renderSec) + " s";
    return "";
  }
  var PARAMS = [
    { k: "model",      label: "型号",     g: 0, f: function (c) { return c.model; } },
    { k: "span",       label: "跨度",     g: 1, f: function (c) { return pval("span", c); } },
    { k: "capacity",   label: "起重量",   g: 1, f: function (c) { return pval("capacity", c); } },
    { k: "railHeight", label: "轨高",     g: 1, f: function (c) { return pval("railHeight", c); } },
    { k: "duty",       label: "工作级别", g: 1, f: function (c) { return pval("duty", c); } },
    { k: "agv",        label: "AGV 数量", g: 3, f: function (c) { return pval("agv", c); } },
    { k: "renderSec",  label: "出图用时", g: 3, f: function (c) { return pval("renderSec", c); } }
  ];
  var PARAMS_BY_K = {};
  (function () { for (var i = 0; i < PARAMS.length; i++) PARAMS_BY_K[PARAMS[i].k] = PARAMS[i]; })();

  /* ---------------- 样式（全部由 ui.js 注入） ---------------- */
  var CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:radial-gradient(1200px 800px at 70% -10%,#1a2431 0%,#0c1015 55%,#090c10 100%);color:#e8eef5;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}
#app{height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* ---------- 头部 ---------- */
.wh-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:clamp(7px,.8vh,10px) clamp(14px,1.5vw,22px);border-bottom:1px solid #232c37;background:linear-gradient(180deg,rgba(22,28,36,.92),rgba(14,18,24,.92))}
.wh-brand{display:flex;align-items:center;gap:12px;min-width:0}
.wh-logo{width:clamp(34px,2.8vw,42px);height:clamp(34px,2.8vw,42px);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:clamp(13px,1vw,15px);letter-spacing:.5px;color:#0b0e12;background:linear-gradient(135deg,#ffc24b,#f59a1f);box-shadow:0 4px 14px rgba(245,154,31,.28);flex:0 0 auto}
.wh-title{font-size:clamp(16px,1.36vw,23px);font-weight:800;letter-spacing:.5px;line-height:1.12;white-space:nowrap}
.wh-sub{font-size:clamp(10.5px,.82vw,12px);color:#8fa0b2;letter-spacing:.3px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-tags{display:flex;gap:8px;flex:0 0 auto}
.wh-tag{font-size:clamp(10.5px,.82vw,12px);color:#cdd8e4;background:rgba(55,214,198,.08);border:1px solid rgba(55,214,198,.28);padding:4px 10px;border-radius:999px;white-space:nowrap}

/* ---------- 主区 ---------- */
.wh-main{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1.68fr) minmax(320px,1fr);gap:14px;padding:clamp(8px,1vh,14px) clamp(14px,1.5vw,22px) 6px;overflow:hidden}
.wh-stage-col{min-width:0;min-height:0;display:flex;flex-direction:column}
.wh-compare{position:relative;flex:1 1 auto;min-height:0;border-radius:14px;overflow:hidden;border:1px solid #2a3341;background:#0a0d11;box-shadow:0 18px 40px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.02)}
.wh-layer{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden}
.wh-fig{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.wh-fig svg{display:block;height:100%;width:auto;max-width:100%;max-height:100%}
.wh-after{will-change:clip-path}
/* 并排模式下的单幅卡片：标题 + 2:1 图 + 参数块 */
.wh-pane-h,.wh-pane-p{display:none}

/* 扫光 */
.wh-scan{position:absolute;top:0;bottom:0;left:-20%;width:18%;background:linear-gradient(90deg,transparent,rgba(120,220,255,.30),transparent);opacity:0;pointer-events:none}
.wh-compare.wh-play .wh-scan{animation:wh-sweep 1.5s linear infinite}
.wh-compare.wh-render .wh-scan{animation:wh-sweep .95s ease-in-out 1}
@keyframes wh-sweep{0%{left:-20%;opacity:0}12%{opacity:.95}88%{opacity:.95}100%{left:100%;opacity:0}}

/* 滑块 */
.wh-handle{position:absolute;top:0;bottom:0;left:50%;width:2px;background:linear-gradient(180deg,rgba(255,255,255,.1),#ffc24b 18%,#ffc24b 82%,rgba(255,255,255,.1));transform:translateX(-1px);pointer-events:none;z-index:7}
.wh-grip{position:absolute;top:50%;left:50%;width:clamp(28px,2.4vw,36px);height:clamp(28px,2.4vw,36px);margin:calc(clamp(28px,2.4vw,36px) / -2) 0 0 calc(clamp(28px,2.4vw,36px) / -2);border-radius:50%;background:linear-gradient(135deg,#1d2530,#141a22);border:2px solid #ffc24b;box-shadow:0 6px 16px rgba(0,0,0,.5)}
.wh-grip::before,.wh-grip::after{content:"";position:absolute;top:50%;margin-top:-5px;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent}
.wh-grip::before{left:7px;border-right:6px solid #ffc24b}
.wh-grip::after{right:7px;border-left:6px solid #ffc24b}
/* 原生 range 铺满整幅图，看不见但可拖拽/可键盘 */
.wh-range{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:ew-resize;z-index:8;opacity:0}
.wh-range::-webkit-slider-runnable-track{height:100%;background:transparent}
.wh-range::-webkit-slider-thumb{-webkit-appearance:none;width:2px;height:100%;background:transparent;border:0}
.wh-range::-moz-range-track{height:100%;background:transparent}
.wh-range::-moz-range-thumb{width:2px;height:100%;background:transparent;border:0}
.wh-range:focus{outline:none}
/* 键盘聚焦时给拖手一个可见焦点环 */
.wh-compare.kb .wh-grip{box-shadow:0 0 0 4px rgba(55,214,198,.45),0 6px 16px rgba(0,0,0,.5)}

/* 并排模式 */
.wh-compare.wh-sbs{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr);gap:10px;padding:10px;align-items:stretch}
.wh-compare.wh-sbs .wh-layer{position:relative;inset:auto;min-height:0;border-radius:11px;border:1px solid #2a3441;background:linear-gradient(180deg,#0e1319,#0a0d11);overflow:hidden}
.wh-compare.wh-sbs .wh-fig{flex:0 0 auto;aspect-ratio:2 / 1;border-bottom:1px solid #1e2630}
.wh-compare.wh-sbs .wh-pane-h{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:6px 10px;border-bottom:1px solid #1e2630;background:rgba(255,255,255,.02)}
.wh-compare.wh-sbs .wh-pane-h b{font-size:11.5px;font-weight:800;color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);border-radius:5px;padding:1px 7px}
.wh-compare.wh-sbs .wh-pane-h span{font-size:11.5px;color:#9fb0c2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-compare.wh-sbs .wh-pane-h em{font-style:normal;margin-left:auto;font-size:10.5px;color:#37d6c6;white-space:nowrap}
.wh-compare.wh-sbs .wh-pane-p{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;justify-content:space-between;padding:8px 11px;gap:0}
.wh-compare.wh-sbs .wh-pp{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;padding:clamp(6px,.9vh,10px) 0;border-top:1px solid rgba(255,255,255,.055)}
.wh-compare.wh-sbs .wh-pp:first-child{border-top:0}
.wh-compare.wh-sbs .wh-pp span{font-size:clamp(10px,.8vw,11.5px);color:#8fa0b2;white-space:nowrap}
.wh-compare.wh-sbs .wh-pp b{font-size:clamp(11px,.86vw,13px);color:#eaf1f8;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-compare.wh-sbs .wh-handle,.wh-compare.wh-sbs .wh-range{display:none}
.wh-compare.wh-sbs .wh-after{clip-path:none !important;-webkit-clip-path:none !important}

/* ---------- 控制条 ---------- */
.wh-controls{flex:0 0 auto;display:flex;align-items:center;gap:9px;margin-top:9px;min-width:0}
.wh-legend{display:flex;align-items:center;gap:6px;font-size:clamp(10.5px,.82vw,12px);color:#8fa0b2;white-space:nowrap;min-width:0;overflow:hidden}
.wh-legend i{font-style:normal;color:#37d6c6}
.wh-legend .wh-dot{width:8px;height:8px;border-radius:2px;background:#4a5a6c;flex:0 0 auto}
.wh-legend .wh-dot.amber{background:#f5a524}
.wh-btn{font-family:inherit;font-size:clamp(12px,.96vw,14.5px);font-weight:600;color:#dbe4ee;background:#1a212b;border:1px solid #2c3745;padding:clamp(7px,.85vh,9px) clamp(12px,1vw,16px);border-radius:10px;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;white-space:nowrap;flex:0 0 auto}
.wh-btn:hover{background:#212a36;border-color:#3a4757}
.wh-btn:active{transform:translateY(1px)}
.wh-btn:disabled,.wh-btn[disabled]{opacity:.5;cursor:not-allowed;filter:saturate(.5)}
.wh-btn:disabled:hover{background:inherit;border-color:#2c3745}
.wh-btn-primary{color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);border-color:transparent;box-shadow:0 6px 16px rgba(245,154,31,.3)}
.wh-btn-primary:hover{background:linear-gradient(135deg,#ffce64,#ffa62e)}
.wh-badge{margin-left:auto;font-size:clamp(11px,.9vw,13.5px);font-weight:700;color:#0f1a16;background:linear-gradient(135deg,#5cf0c0,#2ad2a6);padding:clamp(5px,.7vh,7px) 12px;border-radius:999px;opacity:0;transform:translateX(-6px);transition:opacity .25s,transform .25s;white-space:nowrap;flex:0 0 auto}
.wh-badge.on{opacity:1;transform:none}

/* ---------- 四步 ---------- */
.wh-steps{flex:0 0 auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:9px}
.wh-step{min-width:0;padding:6px 9px;border-radius:11px;background:#141a22;border:1px solid #29323e;opacity:.62;transition:opacity .2s,border-color .2s,background .2s}
.wh-step.on{opacity:1;background:linear-gradient(180deg,rgba(245,154,31,.14),rgba(245,154,31,.04));border-color:rgba(245,154,31,.55)}
.wh-step-h{display:flex;align-items:center;gap:7px;min-width:0}
.wh-step-n{width:20px;height:20px;border-radius:50%;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:center;background:#2a3341;color:#9fb0c2;flex:0 0 auto}
.wh-step.on .wh-step-n{background:linear-gradient(135deg,#ffc24b,#f59a1f);color:#12161c}
.wh-step-t{font-size:clamp(11.5px,.94vw,15px);font-weight:700;color:#e8eef5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wh-step-d{font-size:clamp(10px,.82vw,12px);color:#8fa0b2;margin-top:3px;line-height:1.3;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}

/* ---------- 右侧 ---------- */
.wh-side{min-width:0;min-height:0;display:flex;flex-direction:column;gap:11px;overflow:auto;padding-right:2px}
.wh-panel{background:linear-gradient(180deg,#161c24,#12171e);border:1px solid #28323e;border-radius:14px;padding:9px 11px;box-shadow:0 10px 24px rgba(0,0,0,.28);flex:0 0 auto}
.wh-panel-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid #242d38;font-size:clamp(12.5px,1.02vw,15px);font-weight:800;letter-spacing:.4px;color:#eaf1f8}
.wh-scene{font-size:clamp(10.5px,.82vw,12px);font-weight:600;color:#37d6c6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-hint{font-size:11px;font-weight:400;color:#7f8f9f}

/* 模式开关 */
.wh-modebar{display:flex;align-items:center;gap:6px;margin:0 0 8px;padding:3px;background:#10151c;border:1px solid #242d38;border-radius:9px}
.wh-modebar span{font-size:10.5px;color:#7f8f9f;margin:0 4px 0 6px;white-space:nowrap}
.wh-seg{flex:1 1 0;min-width:0;font-family:inherit;font-size:clamp(10.5px,.82vw,12px);font-weight:700;color:#9fb0c2;background:transparent;border:0;border-radius:7px;padding:5px 6px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.wh-seg:hover{color:#dbe4ee}
.wh-seg.active{color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);box-shadow:0 4px 10px rgba(245,154,31,.25)}

.wh-params{display:flex;flex-direction:column;gap:1px}
.wh-prow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:clamp(4px,.55vh,7px) 8px;border-radius:8px;transition:opacity .28s,transform .28s,background .2s}
.wh-prow.dim{opacity:.22;transform:translateX(6px)}
.wh-prow.on{background:rgba(55,214,198,.07)}
.wh-pk{font-size:clamp(11px,.9vw,13.5px);color:#8fa0b2;white-space:nowrap}
.wh-pv{font-size:clamp(12.5px,1.05vw,16px);font-weight:800;color:#f2f6fa;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.wh-pv.flash{animation:wh-pvflash .55s ease}
.wh-gapbar{display:flex;align-items:center;gap:8px;margin-top:9px;padding-top:9px;border-top:1px solid #2b3541;flex-wrap:wrap}
.wh-gapbar[hidden]{display:none}
.wh-gap-k{font-size:clamp(10.5px,.84vw,12px);color:#8fa0b2;white-space:nowrap}
.wh-gap-seg{display:flex;gap:4px}
.wh-gap-btn{font-family:inherit;font-size:clamp(10.5px,.84vw,12px);font-weight:700;color:#9fb0c2;background:#1a212b;border:1px solid #2c3745;border-radius:7px;padding:4px 9px;cursor:pointer;white-space:nowrap}
.wh-gap-btn:hover{color:#e8eef5;border-color:#3a4757}
.wh-gap-btn.active{color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);border-color:transparent}
.wh-gap-v{margin-left:auto;font-size:clamp(10.5px,.84vw,12px);font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
.wh-gap-v[data-s="ok"]{color:#83d8ad}
.wh-gap-v[data-s="tight"]{color:#f3c34f}
.wh-gap-v[data-s="fail"]{color:#ff7773}
@keyframes wh-pvflash{0%{color:#7ef0d3;transform:scale(1.1)}100%{color:#f2f6fa;transform:none}}

.wh-schemes{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.wh-scheme{font-family:inherit;text-align:left;cursor:pointer;background:#161d26;border:1px solid #2a3441;border-radius:10px;padding:7px 9px;color:#ccd7e3;transition:border-color .15s,background .15s;min-width:0}
.wh-scheme b{display:block;font-size:clamp(13px,1.08vw,16px);color:#e8eef5}
.wh-scheme span{display:block;font-size:10.5px;color:#8fa0b2;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-scheme:hover{background:#1b2330}
.wh-scheme.active{border-color:rgba(245,154,31,.65);background:linear-gradient(180deg,rgba(245,154,31,.16),rgba(245,154,31,.04))}
.wh-scheme.active b{color:#ffc24b}
.wh-rerender{width:100%;margin-top:8px;color:#12161c;background:linear-gradient(135deg,#7ef0d3,#2ad2a6);border-color:transparent;box-shadow:0 6px 16px rgba(42,210,166,.24);text-align:center;white-space:normal;line-height:1.3}

/* ---------- 底部说明 ---------- */
.wh-brief{flex:0 0 auto;padding:8px clamp(14px,1.5vw,22px) 10px;border-top:1px solid #232c37;background:linear-gradient(180deg,rgba(14,18,24,.6),rgba(10,13,17,.9))}
.wh-brief-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.wh-brief.open .wh-brief-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.wh-bi{min-width:0}
.wh-bi h4{margin:0 0 2px;font-size:clamp(10.5px,.86vw,13px);font-weight:800;color:#ffc24b;letter-spacing:.5px}
.wh-bi p{margin:0;font-size:clamp(10px,.84vw,12.5px);line-height:1.4;color:#a9b7c6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wh-brief.open .wh-bi p{-webkit-line-clamp:3}
.wh-brief:not(.open) .wh-bi[data-full="1"]{display:none}
.wh-brief-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:6px}
.wh-disc{font-size:10.5px;line-height:1.35;min-width:0;color:#6f7f8f}
.wh-more{font-family:inherit;font-size:11px;font-weight:700;color:#9fb0c2;background:transparent;border:1px solid #2c3745;border-radius:7px;padding:3px 9px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.wh-more:hover{color:#e8eef5;border-color:#3a4757}
/* ---------- 参数：摘要 chips + 草稿表单 ---------- */
.wh-chips{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:9px}
.wh-chip{min-width:0;background:#101720;border:1px solid #232d39;border-radius:7px;padding:2px 7px;display:flex;align-items:baseline;gap:6px;justify-content:space-between;transition:opacity .25s,transform .25s}
.wh-chip .wh-ck{font-size:10.5px;color:#8fa0b2;white-space:nowrap}
.wh-chip .wh-cv{font-size:clamp(11.5px,.95vw,14px);color:#f2f6fa;font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-chip.dim{opacity:.25}
.wh-chip.on{background:rgba(55,214,198,.09);border-color:rgba(55,214,198,.35)}
.wh-form{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.wh-field{display:flex;flex-direction:column;gap:3px;min-width:0}
.wh-fl{font-size:10.5px;color:#8fa0b2}
.wh-fc{display:flex;align-items:center;gap:4px;background:#0d141c;border:1px solid #2c3745;border-radius:7px;padding:0 7px;min-height:36px}
.wh-fc:focus-within{border-color:#6ec8fa;box-shadow:0 0 0 3px rgba(110,200,250,.18)}
.wh-fi{flex:1 1 auto;min-width:0;width:100%;background:transparent;border:0;color:#f2f6fa;font:inherit;font-size:clamp(13px,1vw,15px);font-variant-numeric:tabular-nums;padding:5px 0;outline:none}
.wh-fi option{background:#0d141c;color:#f2f6fa}
.wh-fu{font-size:11px;color:#7f8f9f;white-space:nowrap}
.wh-formfoot{grid-column:1 / -1;display:flex;gap:8px;margin-top:2px}
.wh-btn-apply{flex:1 1 auto;color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);border-color:transparent}
.wh-btn-apply:disabled{background:#232d39;color:#8fa0b2;box-shadow:none;border-color:#2c3745;opacity:1;filter:none}
.wh-draft[hidden],.wh-conflict[hidden],.wh-photo-body[hidden]{display:none!important}
.wh-draft{display:flex;align-items:center;gap:7px;margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(255,209,138,.1);border:1px solid rgba(255,209,138,.35);color:#ffd18a;font-size:11.5px;line-height:1.4}
.wh-draft-dot{width:7px;height:7px;border-radius:50%;background:#ffd18a;flex:0 0 auto}
.wh-fielderr{min-height:16px;margin-top:5px;font-size:11.5px;color:#ff9b9b}
.wh-conflict{margin-top:8px;padding:9px;border-radius:9px;background:#1b2836;border:1px solid #314254;font-size:11.5px;color:#e8eef5}
.wh-conflict-b{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
.wh-conflict-b .wh-btn{flex:1 1 auto;font-size:11.5px;padding:6px 8px}
.wh-scheme b{display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap}
.wh-scheme b i{font-style:normal;font-size:10px;font-weight:800;color:#12161c;background:#8fa0b2;border-radius:4px;padding:1px 5px;flex:0 0 auto}
.wh-scheme.active b i{background:#ffc24b}
.wh-sm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}

/* ---------- 现场照片 ---------- */
.wh-photo-body{display:flex;flex-direction:column;gap:8px}
.wh-photo-p{margin:0;font-size:11px;line-height:1.42;color:#a8b6c6}
.wh-photo-thumb{display:flex;gap:9px;align-items:flex-start}
.wh-photo-thumb img{width:76px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #2c3745;background:#0d141c;flex:0 0 auto}
.wh-photo-meta{min-width:0;font-size:11px;color:#8fa0b2;line-height:1.45}
.wh-photo-meta b{display:block;color:#e8eef5;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wh-photo-ok{color:#69d7ad}
.wh-photo-btns{display:flex;gap:7px;flex-wrap:wrap}
.wh-photo-btns .wh-btn{flex:1 1 auto;font-size:11.5px;padding:7px 9px}

/* ---------- 页头动作 ---------- */
.wh-head-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.wh-head-actions .wh-btn{font-size:12.5px;padding:8px 13px}

/* ---------- 导出预览弹层 ---------- */
.wh-modal{position:fixed;inset:0;z-index:9999;background:rgba(4,8,14,.9);display:flex;align-items:center;justify-content:center;padding:18px}
.wh-modal-box{width:min(920px,100%);max-height:94vh;overflow:auto;background:#101820;border:1px solid #2c3745;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.wh-modal-h{display:flex;align-items:center;justify-content:space-between;gap:10px}
.wh-modal-h h3{margin:0;font-size:16px}
.wh-modal-prev{background:#070b10;border:1px solid #232d39;border-radius:10px;padding:8px;display:flex;align-items:center;justify-content:center;min-height:220px}
.wh-modal-prev img{max-width:100%;max-height:52vh;display:block}
.wh-modal-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#a8b6c6}
.wh-modal-meta b{color:#e8eef5}
.wh-modal-note{font-size:11.5px;color:#ffd18a;line-height:1.5}
.wh-modal-b{display:flex;gap:9px;flex-wrap:wrap}
.wh-modal-b .wh-btn{flex:0 0 auto}
.wh-modal-err{font-size:12px;color:#ff9b9b}

/* ---------- 画布状态条 ---------- */
.wh-statusbar{flex:0 0 auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px;padding:7px 11px;border-radius:9px;background:#10161d;border:1px solid #232c37;font-size:clamp(10.5px,.84vw,12px);color:#a8b6c6;min-height:34px}
.wh-statusbar b{color:#e8eef5;font-weight:700}
.wh-statusbar .wh-st-dot{width:7px;height:7px;border-radius:50%;background:#69d7ad;flex:0 0 auto}
.wh-statusbar .wh-st-dot.warn{background:#ffd18a}
.wh-statusbar .wh-st-sep{color:#3a4757}
.wh-statusbar .wh-st-rev{margin-left:auto;color:#6f7f8f;font-variant-numeric:tabular-nums}

/* ---------- 响应式：1280 / 1440 / 1920 ---------- */
@media (max-width:1400px){
  .wh-main{grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);gap:12px}
  .wh-brief.open .wh-brief-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .wh-btn{padding:7px 11px}
}
@media (max-width:1240px){
  .wh-main{grid-template-columns:minmax(0,1.45fr) minmax(288px,1fr)}
  .wh-tags .wh-tag:nth-child(3){display:none}
  .wh-step{padding:7px 8px}
  .wh-step-n{width:18px;height:18px;font-size:11px}
}
@media (max-height:780px){
  .wh-step-d{height:auto;max-height:2.7em}
  .wh-prow{padding:4px 8px}
  .wh-brief{padding:6px 16px 8px}
}
/* 900px 高度下把三个面板压进一屏：方案库 F 卡不再被截 */
@media (max-height:960px){
  .wh-side{gap:8px}
  .wh-panel{padding:8px 10px}
  .wh-panel-h{padding-bottom:6px;margin-bottom:6px}
  .wh-chips{gap:4px;margin-bottom:7px}
  .wh-chip{padding:1px 6px}
  .wh-fc{min-height:34px}
  .wh-form{gap:5px}
  .wh-photo-p{font-size:10.5px;line-height:1.35}
  .wh-scheme{padding:5px 8px}
  .wh-scheme span{font-size:10px;margin-top:1px}
  .wh-rerender{margin-top:6px;padding:6px}
  .wh-steps{margin-top:7px}
  .wh-step-d{margin-top:2px}
}

@media (max-width:720px){
  .wh-header{flex-wrap:wrap;gap:8px;padding:8px 12px}
  .wh-brand{flex:1 1 auto;min-width:0}
  .wh-sub{display:none}
  .wh-head-actions .wh-btn{font-size:12px;padding:7px 10px}
  .wh-statusbar{font-size:11px;gap:6px;padding:6px 9px}
  .wh-modebar .wh-seg{font-size:11px;padding:6px 3px;min-height:40px}
  /* iOS 聚焦 <16px 输入会自动放大整页，手机上统一 16px + 44px 触控高度 */
  .wh-fi{font-size:16px}
  .wh-fc{min-height:44px}
  .wh-btn{min-height:44px}
  .wh-scheme{min-height:56px}
}
@media (max-width:900px){
  body{overflow:auto}
  #app{height:auto;min-height:100vh}
  .wh-main{grid-template-columns:1fr}
  .wh-steps{grid-template-columns:repeat(2,minmax(0,1fr))}
  .wh-brief-grid,.wh-brief.open .wh-brief-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .wh-compare{min-height:300px}
  .wh-steps{display:none}
  .wh-side{overflow:visible}
  .wh-brief{display:none}
}
`;

  function injectStyle() {
    if (document.getElementById("wh-ui-style")) return;
    var s = document.createElement("style");
    s.id = "wh-ui-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------- 骨架 ---------------- */
  var HTML =
    '<header class="wh-header">' +
      '<div class="wh-brand">' +
        '<span class="wh-logo">WH</span>' +
        '<div><div class="wh-title">装好给你看</div>' +
        '<div class="wh-sub">客户现场照片 + 技术方案 → 实景安装效果图</div></div>' +
      '</div>' +
      '<div class="wh-head-actions">' +
        '<button class="wh-btn" id="whPause" type="button" aria-pressed="false">暂停动效</button>' +
        '<button class="wh-btn wh-btn-primary" id="whExport" type="button">导出预览</button>' +
      '</div>' +
    '</header>' +
    '<div class="wh-main">' +
      '<div class="wh-stage-col">' +
        '<div class="wh-compare" id="whCompare">' +
          '<div class="wh-layer wh-before" id="whBefore"></div>' +
          '<div class="wh-layer wh-after" id="whAfter"></div>' +
          '<div class="wh-scan" id="whScan"></div>' +
          '<div class="wh-handle" id="whHandle"><span class="wh-grip"></span></div>' +
          '<input class="wh-range" id="whRange" type="range" min="0" max="100" step="0.5" value="50" aria-label="对比滑块：左右拖动切换现场照片与效果图">' +
        '</div>' +
        '<div class="wh-statusbar" id="whStatus" role="status" aria-live="polite"></div>' +
        '<div class="wh-controls">' +
          '<div class="wh-legend" id="whLegend">' +
            '<span class="wh-dot"></span>客户现场' +
            '<span>·</span>' +
            '<span class="wh-dot amber"></span>AI 效果图' +
          '</div>' +
          '<button class="wh-btn wh-btn-primary" id="whPlay" type="button">▶ 播放演示</button>' +
          '<button class="wh-btn" id="whSkip" type="button">⏭ 跳过动画</button>' +
          '<button class="wh-btn" id="whFs" type="button">⛶ 全屏</button>' +
          '<span class="wh-badge" id="whBadge"></span>' +
        '</div>' +
        '<div class="wh-steps" id="whSteps"></div>' +
      '</div>' +
      '<aside class="wh-side">' +
        '<section class="wh-panel">' +
          '<div class="wh-panel-h"><span>方案参数</span><span class="wh-scene" id="whScene"></span></div>' +
          '<div class="wh-modebar" id="whModebar" role="group" aria-label="视图切换">' +
            '<button class="wh-seg active" id="whModeSingle" type="button" data-mode="diagram" aria-pressed="true">示意图</button>' +
            '<button class="wh-seg" id="whModeModel" type="button" data-mode="model" aria-pressed="false">3D 预览</button>' +
            '<button class="wh-seg" id="whModeCompare" type="button" data-mode="compare" aria-pressed="false">方案对比</button>' +
            '<button class="wh-seg" id="whModeBa" type="button" data-mode="beforeafter" aria-pressed="false">前后对比</button>' +
          '</div>' +
          '<div class="wh-params" id="whParams"></div>' +
          '<div class="wh-gapbar" id="whGapbar" hidden>' +
            '<span class="wh-gap-k">示意净距</span>' +
            '<div class="wh-gap-seg" id="whGapSeg">' +
              '<button class="wh-gap-btn active" type="button" data-gap="ok">充足</button>' +
              '<button class="wh-gap-btn" type="button" data-gap="tight">临界</button>' +
              '<button class="wh-gap-btn" type="button" data-gap="fail">不足</button>' +
            '</div>' +
            '<span class="wh-gap-v" id="whGapV" data-s="ok">—</span>' +
          '</div>' +
        '</section>' +
        '<section class="wh-panel">' +
          '<div class="wh-panel-h"><span>现场照片</span><span class="wh-hint" id="whPhotoState">未添加</span></div>' +
          '<div class="wh-photo-body" id="whPhotoBody"></div>' +
        '</section>' +
        '<section class="wh-panel">' +
          '<div class="wh-panel-h"><span>方案库</span><span class="wh-hint">点选切换整套参数与效果图</span></div>' +
          '<div class="wh-schemes" id="whSchemes"></div>' +
          '<button class="wh-btn wh-rerender" id="whRerender" type="button"></button>' +
        '</section>' +
      '</aside>' +
    '</div>' +
    '<footer class="wh-brief" id="whBrief"></footer>';

  /* ---------------- 构建各部分 ---------------- */
  function buildSteps() {
    $.stepsEl.innerHTML = DATA.steps.map(function (s, i) {
      return '<div class="wh-step" data-i="' + i + '">' +
        '<div class="wh-step-h"><span class="wh-step-n">' + (i + 1) + '</span>' +
        '<span class="wh-step-t" title="' + esc(s.t) + '">' + esc(s.t) + '</span></div>' +
        '<div class="wh-step-d" title="' + esc(s.d || '') + '"></div></div>';
    }).join("");
    $.steps = [];
    for (var i = 0; i < DATA.steps.length; i++) {
      $.steps.push(q('.wh-step[data-i="' + i + '"]', $.stepsEl));
    }
  }

  /* ---------- 参数面板（W3）：已应用摘要 + 草稿表单 + 应用/放弃 ---------- */
  // 只列可安全手输的字段；型号/场景由方案库决定，AGV 与示意用时为记录值。
  var EDIT_FIELDS = [
    { k: 'span',       label: '跨度',   unit: 'm', step: '0.1', min: 0.1, max: 149.9, type: 'number', g: 1 },
    { k: 'capacity',   label: '起重量', unit: 't', step: '1',   min: 1,   max: 4999, type: 'number', g: 1 },
    { k: 'railHeight', label: '轨高',   unit: 'm', step: '0.1', min: 0.1, max: 79.9, type: 'number', g: 1 },
    { k: 'duty',       label: '工作级别', unit: '', step: '',  min: 0,   max: 0,    type: 'select', options: ['A5', 'A6', 'A7', 'A8'], g: 1 }
  ];
  var draft = null;            // 正在编辑但未提交的参数；null = 干净
  var pendingScheme = null;    // 有草稿时点击的方案，等用户决定

  function cloneObj(o) {
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  function fmtField(k, v) {
    if (v == null || v === '') return '—';
    if (k === 'span' || k === 'railHeight') return fixed1(Number(v)) + ' m';
    if (k === 'capacity') return Math.round(Number(v)) + ' t';
    return String(v);
  }

  function buildParams() {
    var chips = [
      { k: 'model', label: '型号', g: 0 },
      { k: 'span', label: '跨度', g: 1 },
      { k: 'capacity', label: '起重量', g: 1 },
      { k: 'railHeight', label: '轨高', g: 1 },
      { k: 'duty', label: '工作级别', g: 1 },
      { k: 'agv', label: 'AGV', g: 3 },
      { k: 'renderSec', label: '示意用时', g: 3 }
    ].map(function (it) {
      return '<div class="wh-chip" data-g="' + it.g + '"><span class="wh-ck">' + esc(it.label) + '</span>' +
        '<b class="wh-cv" data-k="' + it.k + '">—</b></div>';
    }).join('');

    var fields = EDIT_FIELDS.map(function (f) {
      var id = 'whF_' + f.k;
      var ctrl = f.type === 'select'
        ? '<select class="wh-fi" id="' + id + '" data-f="' + f.k + '" aria-label="' + esc(f.label) + '">' +
            f.options.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') + '</select>'
        : '<input class="wh-fi" id="' + id + '" data-f="' + f.k + '" type="number" inputmode="decimal" step="' + f.step + '" min="' + f.min + '" max="' + f.max + '" aria-label="' + esc(f.label + '（' + f.unit + '）') + '">';
      return '<label class="wh-field" for="' + id + '" data-g="' + f.g + '">' +
        '<span class="wh-fl">' + esc(f.label) + '</span>' +
        '<span class="wh-fc">' + ctrl + (f.unit ? '<span class="wh-fu">' + esc(f.unit) + '</span>' : '') + '</span>' +
        '</label>';
    }).join('');

    $.paramsEl.innerHTML =
      '<div class="wh-chips">' + chips + '</div>' +
      '<div class="wh-form" id="whForm">' + fields +
        '<div class="wh-formfoot"><button class="wh-btn wh-btn-apply" id="whApply" type="button" disabled>应用参数</button>' +
        '<button class="wh-btn" id="whDiscard" type="button" disabled>放弃修改</button></div>' +
      '</div>' +
      '<div class="wh-draft" id="whDraft" hidden><span class="wh-draft-dot"></span><span id="whDraftText">有未应用修改</span></div>' +
      '<div class="wh-fielderr" id="whFieldErr" role="alert"></div>' +
      '<div class="wh-conflict" id="whConflict" hidden>' +
        '<div id="whConflictText">有未应用修改，先决定如何处理：</div>' +
        '<div class="wh-conflict-b">' +
          '<button class="wh-btn" id="whCApply" type="button">应用后切换</button>' +
          '<button class="wh-btn" id="whCDiscard" type="button">放弃修改后切换</button>' +
          '<button class="wh-btn" id="whCStay" type="button">留在当前</button>' +
        '</div>' +
      '</div>';

    $.formEl = q('#whForm', $.paramsEl);
    $.applyBtn = q('#whApply', $.paramsEl);
    $.discardBtn = q('#whDiscard', $.paramsEl);
    $.draftEl = q('#whDraft', $.paramsEl);
    $.draftTextEl = q('#whDraftText', $.paramsEl);
    $.fieldErrEl = q('#whFieldErr', $.paramsEl);
    $.conflictEl = q('#whConflict', $.paramsEl);
    $.conflictTextEl = q('#whConflictText', $.paramsEl);

    $.formEl.addEventListener('input', onFormInput);
    $.formEl.addEventListener('change', onFormInput);
    $.applyBtn.addEventListener('click', function () { applyDraft('apply'); });
    $.discardBtn.addEventListener('click', discardDraft);
    q('#whCApply', $.paramsEl).addEventListener('click', function () { resolveConflict('apply'); });
    q('#whCDiscard', $.paramsEl).addEventListener('click', function () { resolveConflict('discard'); });
    q('#whCStay', $.paramsEl).addEventListener('click', function () { resolveConflict('stay'); });
  }

  function syncFormFrom(c) {
    if (!$.formEl || !c) return;
    EDIT_FIELDS.forEach(function (f) {
      var el = q('#whF_' + f.k, $.paramsEl);
      if (!el) return;
      var v = c[f.k];
      if (f.type === 'number') el.value = (v == null || v === '') ? '' : String(v);
      else el.value = String(v);
    });
  }

  function readForm() {
    var out = {};
    EDIT_FIELDS.forEach(function (f) {
      var el = q('#whF_' + f.k, $.paramsEl);
      if (!el) return;
      out[f.k] = f.type === 'number' ? Number(el.value) : el.value;
    });
    return out;
  }

  function diffText(d, c) {
    var bits = [];
    EDIT_FIELDS.forEach(function (f) {
      if (d[f.k] == null || d[f.k] === '') return;
      if (d[f.k] !== c[f.k]) bits.push(f.label + ' ' + fmtField(f.k, c[f.k]) + ' → ' + fmtField(f.k, d[f.k]));
    });
    return bits;
  }

  function onFormInput() {
    draft = readForm();
    clearFieldError();
    renderDraftBar();
  }

  function renderDraftBar() {
    if (!$.draftEl) return;
    var bits = draft ? diffText(draft, cfg) : [];
    var dirty = bits.length > 0;
    if (!dirty) draft = null;
    $.draftEl.hidden = !dirty;
    $.applyBtn.disabled = !dirty;
    $.discardBtn.disabled = !dirty;
    if (dirty) $.draftTextEl.textContent = '有未应用修改：' + bits.join(' · ');
    else if ($.conflictEl) $.conflictEl.hidden = true;
  }

  function showFieldError(err) {
    if (!$.fieldErrEl) return;
    $.fieldErrEl.textContent = err && err.message ? err.message : '';
    if (err && err.field) {
      var el = q('#whF_' + err.field, $.paramsEl);
      if (el && el.focus) { try { el.focus(); } catch (e) { /* 忽略 */ } }
    }
  }
  function clearFieldError() { if ($.fieldErrEl) $.fieldErrEl.textContent = ''; }

  function findPresetId(cand) {
    for (var i = 0; i < DATA.configs.length; i++) {
      var c = DATA.configs[i];
      if (Math.abs(c.span - cand.span) < 1e-6 && Math.abs(c.capacity - cand.capacity) < 1e-6 &&
          Math.abs(c.railHeight - cand.railHeight) < 1e-6 && c.duty === cand.duty) return c.id;
    }
    return null;
  }

  function buildCandidate() {
    var cand = cloneObj(cfg);
    cand.span = draft.span;
    cand.capacity = draft.capacity;
    cand.railHeight = draft.railHeight;
    cand.duty = draft.duty;
    var presetId = findPresetId(cand);
    if (presetId) {
      var preset = cfgById(presetId);
      if (preset) return cloneObj(preset);
    }
    cand.id = '自定义';
    cand.model = '基于 ' + cfg.id + ' 的自定义';
    cand.scene = cfg.scene + ' · 自定义参数';
    cand.source = 'sim';
    return cand;
  }

  function applyDraft(next) {
    if (!draft) return true;
    clearFieldError();
    var cand = buildCandidate();
    var errs = (DATA && typeof DATA.validateConfig === 'function') ? DATA.validateConfig(cand) : [];
    if (errs && errs.length) { showFieldError(errs[0]); return false; }
    if (!commitConfig(cand, 'form')) { showFieldError({ field: 'config', message: '参数未通过校验，画布保持上一版' }); return false; }
    draft = null;
    renderDraftBar();
    syncFormFrom(cfg);
    flashParams();
    return true;
  }

  function discardDraft() {
    draft = null;
    clearFieldError();
    if ($.conflictEl) $.conflictEl.hidden = true;
    renderDraftBar();
    syncFormFrom(cfg);
  }

  function askConflict(id) {
    pendingScheme = id;
    if (!$.conflictEl) return;
    $.conflictTextEl.textContent = '有未应用修改，切到方案 ' + id + ' 前先选择：';
    $.conflictEl.hidden = false;
  }

  function resolveConflict(choice) {
    var id = pendingScheme;
    pendingScheme = null;
    if ($.conflictEl) $.conflictEl.hidden = true;
    if (choice === 'stay') return;
    if (choice === 'apply') { if (!applyDraft()) return; }
    else { discardDraft(); }
    if (id) setScheme(id);
  }

  function buildSchemes() {
    $.schemesEl.innerHTML = DATA.configs.map(function (c) {
      return '<button class="wh-scheme" type="button" data-id="' + esc(c.id) + '" title="' + esc(c.model + ' · ' + c.scene) + '" aria-pressed="false">' +
        '<b><i>' + esc(c.id) + '</i><span class="wh-sm">' + esc(c.model) + '</span></b>' +
        '<span>' + esc(c.scene) + ' · ' + esc(fmtField('span', c.span)) + ' · ' + esc(fmtField('capacity', c.capacity)) + '</span></button>';
    }).join('');
  }

  function buildBrief() {
    var b = DATA.brief || {};
    // 合规口径只在数据层维护：ui.js 不再硬编码免责声明，避免 data.js 已经补了
    // 「不可用于工程判断 / 不代表合作或授权」，屏幕上却还是旧短文案。
    // 老基线没有 meta.disclaimer 时回退旧文案，保证不白屏。
    var meta = DATA.meta || {};
    var disc = meta.disclaimer ||
      '示意 / 推算，非真实设备参数 · 本作品为离线演示原型，全程零网络请求';
    var rows = [
      ["问题", b.problem, 0],
      ["方案", b.solution, 1],
      ["价值", b.value, 0],
      ["落地", b.landing, 1]
    ];
    var grid = rows.map(function (r) {
      return '<div class="wh-bi" data-full="' + r[2] + '"><h4>' + esc(r[0]) + '</h4><p>' + esc(r[1] || "") + '</p></div>';
    }).join("");
    $.briefEl.innerHTML =
      '<div class="wh-brief-grid">' + grid + '</div>' +
      '<div class="wh-brief-foot">' +
        '<span class="wh-disc" title="' + esc(disc) + '">' + esc(disc) + '</span>' +
        '<button class="wh-more" id="whMore" type="button">展开说明 ▾</button>' +
      '</div>';
  }

  /* ---------------- 示意净距三态 ----------------
   * 依赖 render.js 的纯函数 WH.renderClearance()。没有它时控件整体隐藏，
   * 不留下按了没反应的死按钮。columnEnvelope 由按钮档位按当前跨度反算：
   * gap = span - envelope - 1.5，tight 取 0.5 m，fail 取 -2 m。 */
  function gapEnvelope(c) {
    if (envelopeMode === "ok") return undefined;   // 交给 render 走缺省包络
    var sp = (c && typeof c.span === "number" && isFinite(c.span)) ? c.span : 22.5;
    if (envelopeMode === "tight") return Math.max(0, sp - 2.0);
    return Math.min(100, sp + 0.5);
  }
  function clearanceOf(c) {
    if (!window.WH || typeof window.WH.renderClearance !== "function") return null;
    try {
      return window.WH.renderClearance({
        span: c.span, bayType: c.bayType, columnEnvelope: gapEnvelope(c)
      });
    } catch (e) { return null; }
  }
  function updateGapReadout() {
    if (!$.gapEl || !$.gapV || !cfg) return;
    var r = clearanceOf(cfg);
    if (!r) { $.gapEl.hidden = true; return; }
    $.gapEl.hidden = false;
    $.gapV.setAttribute("data-s", r.status);
    $.gapV.textContent = "净距 " + r.gap.toFixed(2) + " m · " +
      (r.status === "ok" ? "充足" : r.status === "tight" ? "临界" : "不足");
    $.gapV.title = r.msg;
    if ($.gapSeg) {
      var btns = $.gapSeg.querySelectorAll(".wh-gap-btn");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-gap") === envelopeMode);
      }
    }
  }
  function bindGap() {
    if (!$.gapSeg) return;
    $.gapSeg.addEventListener("click", function (e) {
      var b = e.target;
      while (b && b !== $.gapSeg) {
        if (b.getAttribute && b.getAttribute("data-gap")) {
          envelopeMode = b.getAttribute("data-gap");
          updateGapReadout();
          renderStage();
          return;
        }
        b = b.parentNode;
      }
    });
  }

  /* ---------------- 状态同步 ---------------- */
  function updateParams() {
    var cells = $.paramsEl.querySelectorAll('.wh-cv[data-k]');
    for (var i = 0; i < cells.length; i++) {
      var k = cells[i].getAttribute('data-k');
      var pr = PARAMS_BY_K[k];
      if (pr) cells[i].textContent = pr.f(cfg);
    }
    if (!draft) syncFormFrom(cfg);
  }

  function flashParams() {
    var cells = $.paramsEl.querySelectorAll('.wh-cv[data-k]');
    for (var i = 0; i < cells.length; i++) {
      (function (el) {
        el.classList.remove("flash");
        void el.offsetWidth;
        el.classList.add("flash");
      })(cells[i]);
    }
  }

  function updateStepsText() {
    for (var i = 0; i < $.steps.length; i++) {
      if (!$.steps[i]) continue;
      var d = q(".wh-step-d", $.steps[i]);
      if (d) d.textContent = fill(DATA.steps[i].d, cfg);
    }
  }

  function updateSchemeActive() {
    var btns = $.schemesEl.querySelectorAll(".wh-scheme");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-id') === cfg.id;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function updateScene() {
    if (!$.sceneEl) return;
    if (sbs) {
      var a = baseConfig();
      var b = pairConfig();
      $.sceneEl.textContent = a.id + " vs " + b.id;
    } else {
      $.sceneEl.textContent = cfg.scene;
    }
  }

  function updateModeButtons() {
    var map = { diagram: $.modeSingle, model: $.modeModel, compare: $.modeCompare, beforeafter: $.modeBa };
    for (var k in map) {
      if (!map[k]) continue;
      var on = (viewMode === k);
      map[k].classList.toggle("active", on);
      map[k].setAttribute("aria-pressed", on ? "true" : "false");
    }
    if ($.modeBa) {
      var ready = photoState === "ready";
      $.modeBa.disabled = !ready;
      $.modeBa.title = ready ? "原图与安装预览对比" : "先添加现场照片才能做前后对比";
    }
  }

  function updateStatus() {
    if (!$.statusEl) return;
    var modeName = viewMode === 'model' ? '3D 预览' : (viewMode === 'compare' ? '方案对比' : (viewMode === 'beforeafter' ? '前后对比' : '示意图'));
    var sim = !!(DATA.meta && DATA.meta.valueSource === 'sim');
    var photoTxt = photoState === 'ready' ? '照片已标定' : '照片未添加';
    $.statusEl.innerHTML =
      '<span class="wh-st-dot' + (photoState === 'ready' ? '' : ' warn') + '"></span>' +
      '<span><b>' + esc(modeName) + '</b></span>' +
      '<span class="wh-st-sep">·</span>' +
      '<span>当前方案 <b>' + esc(cfg ? cfg.id : '—') + '</b></span>' +
      '<span class="wh-st-sep">·</span>' +
      '<span>' + (sim ? '参数为演示示意值' : '参数来源已标注') + '</span>' +
      '<span class="wh-st-sep">·</span>' +
      '<span>' + esc(photoTxt) + (photoState === 'ready' && photoName ? '（' + esc(photoName) + '）' : '') + '</span>' +
      '<span class="wh-st-rev">v' + cfgRev + '</span>';
  }

  /* ---------------- 渲染 ---------------- */
  function sceneSVG(c, mode) {
    var s = null;
    try {
      if (window.WH && typeof window.WH.renderScene === "function") {
        var pr = {
          span: c.span, capacity: c.capacity, railHeight: c.railHeight,
          duty: c.duty, agv: c.agv, bayType: c.bayType, mode: mode
        };
        // 透传 data.js 的新字段。只有 render.js 已提供增强接口时才传，
        // 老版 render 会静默忽略这些键，届时净距控件也会自动隐藏。
        if (typeof window.WH.renderClearance === "function" && c.productType != null) {
          pr.productType = c.productType;
          pr.columnSpan = c.columnSpan;
          var env = gapEnvelope(c);
          if (env !== undefined) pr.columnEnvelope = env;
        }
        s = window.WH.renderScene(pr);
      }
    } catch (e) { s = null; }
    if (!s || typeof s !== "string" || !s.length) return fallbackSVG(mode);
    // render 用 slice 会在容器比例不等于 2:1 时裁掉四角标注（左下「设备」被切）。
    // 这里只做显示层归一化：改成 meet，保证任何分辨率都不裁内容、不变形。
    return s.replace(/preserveAspectRatio\s*=\s*["'][^"']*["']/g, 'preserveAspectRatio="xMidYMid meet"');
  }
  function fallbackSVG(mode) {
    var fillC = mode === "after" ? "#1c2733" : "#121820";
    return '<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">' +
      '<rect width="800" height="400" fill="' + fillC + '"/>' +
      '<text x="400" y="204" fill="#6b7b8c" font-size="18" font-family="sans-serif" text-anchor="middle">渲染模块待接入</text></svg>';
  }

  function paneHeader(c, role) {
    return '<div class="wh-pane-h"><b>' + esc(c.id) + '</b><span>' + esc(c.scene) + '</span>' +
      '<em>' + esc(role) + '</em></div>';
  }
  function paneParams(c) {
    var rows = [
      ["型号", c.model],
      ["跨度", pval("span", c)],
      ["起重量", pval("capacity", c)],
      ["轨高", pval("railHeight", c)]
    ];
    return '<div class="wh-pane-p">' + rows.map(function (r) {
      return '<div class="wh-pp"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join("") + '</div>';
  }
  // 并排模式的一幅：卡片头 + 2:1 图 + 参数块（图不裁不缩，参数各标各的）
  function paneHTML(svg, c, role) {
    return paneHeader(c, role) + '<div class="wh-fig">' + svg + '</div>' + paneParams(c);
  }
  function layerHTML(svg) {
    return '<div class="wh-fig">' + svg + '</div>';
  }

  function baseConfig() {
    return cfgById("A") || DATA.configs[0];
  }
  function pairConfig() {
    var a = baseConfig();
    if (cfg && cfg.id !== a.id) return cfg;
    return DATA.configs[1] || a;
  }

  function renderStage() {
    if (sbs) {
      var a = baseConfig(), b = pairConfig();
      $.beforeEl.innerHTML = paneHTML(sceneSVG(a, "before"), a, "基准方案");
      $.afterEl.innerHTML = paneHTML(sceneSVG(b, "after"), b, "对比方案");
    } else {
      $.beforeEl.innerHTML = layerHTML(sceneSVG(cfg, "before"));
      $.afterEl.innerHTML = layerHTML(sceneSVG(cfg, "after"));
      setP(p);
    }
    updateScene();
  }

  // 唯一配置提交入口：方案卡 / 快捷键 / 客户改需求 / 重置 / 手输参数 全部走这里。
  // 任何入口都不许直接写 cfg，否则 3D 与导出会读到另一套参数（F01）。
  function commitConfig(next, reason, noRender) {
    var c = typeof next === 'string' ? cfgById(next) : next;
    if (!c) return false;
    if (typeof DATA.validateConfig === 'function') {
      var errs = DATA.validateConfig(c);
      if (errs && errs.length) return false;      // 非法参数不得进入已应用状态
    }
    cfg = c;
    cfgRev++;
    updateParams();
    updateStepsText();
    updateSchemeActive();
    updateScene();
    updateGapReadout();
    if (!noRender) renderStage();
    updateStatus();
    dispatch('wh71:config', { id: c.id, config: serializeConfig(c), revision: cfgRev, reason: reason || 'unknown' });
    return true;
  }
  function applyConfig(id, noRender) { return commitConfig(id, 'legacy', noRender); }

  /* ---------------- 滑块 ---------------- */
  function setP(v) {
    p = Math.max(0, Math.min(100, v));
    if ($.afterEl) {
      var clip = "inset(0 0 0 " + p + "%)";
      $.afterEl.style.clipPath = clip;
      $.afterEl.style.webkitClipPath = clip;
    }
    if ($.handleEl) $.handleEl.style.left = p + "%";
    if ($.rangeEl && Number($.rangeEl.value) !== p) $.rangeEl.value = String(p);
  }
  function animateP(from, to, dur) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    var g = gen;
    var t0 = null;
    function frame(ts) {
      if (g !== gen) { rafId = null; return; }       // 代次已变，立刻停
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
      setP(from + (to - from) * e);
      if (k < 1) { rafId = requestAnimationFrame(frame); }
      else { rafId = null; }
    }
    rafId = requestAnimationFrame(frame);
  }

  /* ---------------- 四步与参数联动 ---------------- */
  function stepsAllOff() {
    for (var i = 0; i < $.steps.length; i++) if ($.steps[i]) $.steps[i].classList.remove("on");
  }
  function lightStep(i) {
    if ($.steps[i]) $.steps[i].classList.add("on");
    var rows = $.paramsEl.querySelectorAll('[data-g="' + i + '"]');
    for (var j = 0; j < rows.length; j++) { rows[j].classList.remove("dim"); rows[j].classList.add("on"); }
  }
  function lightAll() {
    for (var i = 0; i < $.steps.length; i++) if ($.steps[i]) $.steps[i].classList.add("on");
  }
  function paramsDim() {
    var rows = $.paramsEl.querySelectorAll("[data-g]");
    for (var i = 0; i < rows.length; i++) { rows[i].classList.add("dim"); rows[i].classList.remove("on"); }
  }
  function paramsRevealAll() {
    var rows = $.paramsEl.querySelectorAll("[data-g]");
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove("dim");
  }

  /* ---------------- 徽标 / 忙碌态 ---------------- */
  function showBadge(text) {
    if (!$.badgeEl) return;
    $.badgeEl.textContent = text;
    $.badgeEl.classList.add("on");
  }
  function hideBadge() {
    if (!$.badgeEl) return;
    $.badgeEl.classList.remove("on");
  }
  function busy(on) {
    rendering = !!on;
    if ($.rerenderBtn) {
      $.rerenderBtn.disabled = !!on;
      $.rerenderBtn.textContent = on ? "重出图…" : (DATA.rerender && DATA.rerender.label) || "客户改需求";
    }
  }

  /* ---------------- 动作 ---------------- */

  // 播放：连点只播一轮（playing 期间直接忽略）
  function play() {
    if (playing || rendering || paused) return;
    clearAll();
    hideBadge();
    playing = true;
    replayClass($.compareEl, "wh-play");
    stepsAllOff();
    paramsDim();
    setP(100);                                  // 先全露出「现场原貌」
    var n = $.steps.length || 4;
    var stepMs = 1150;
    for (var i = 0; i < n; i++) {
      (function (i) { at(350 + i * stepMs, function () { lightStep(i); }); })(i);
    }
    var dur = 350 + n * stepMs;
    animateP(100, 0, dur);                      // 自动走成「安装效果图」
    at(dur + 150, function () {
      playing = false;
      $.compareEl.classList.remove("wh-play");
      lightAll();
      paramsRevealAll();
    });
  }

  // 跳过：立即到终态，之后不再有任何动画
  function skip() {
    clearAll();
    playing = false;
    $.compareEl.classList.remove("wh-play");
    $.compareEl.classList.remove("wh-render");
    if (rendering) {                              // 重出图被跳过 → 直接落到终态
      busy(false);
      commitConfig((DATA.rerender && DATA.rerender.target) || 'B', 'skip');
      showBadge((DATA.rerender && DATA.rerender.done) || "已重出图");
    }
    if (sbs) { renderStage(); lightAll(); paramsRevealAll(); return; }
    setP(0);                                      // 终态：完整效果图
    lightAll();
    paramsRevealAll();
    if (cfg && DATA.rerender && cfg.id === DATA.rerender.target) showBadge(DATA.rerender.done);
  }

  // 客户改需求：进度重置 → 快速重跑(200ms/步) → 参数切换 → 扫光 → 角标；全程 ≈1.5s
  function rerender() {
    if (rendering) return;                        // 防连点
    clearAll();
    playing = false;
    $.compareEl.classList.remove("wh-play");
    hideBadge();
    busy(true);
    stepsAllOff();
    paramsDim();
    replayClass($.compareEl, "wh-render");

    var target = (DATA.rerender && DATA.rerender.target) || "B";
    var n = $.steps.length || 4;
    var STEP = 200;                               // 每步 200ms
    var T0 = 110;
    for (var i = 0; i < n; i++) {
      (function (i) { at(T0 + i * STEP, function () { lightStep(i); }); })(i);
    }
    var tSwitch = T0 + n * STEP + 40;             // ≈ 950ms：换参数 + 出图
    at(tSwitch, function () {
      commitConfig(target, 'demo');
      if (!sbs) setP(0);
      paramsRevealAll();
      flashParams();
      lightAll();
      replayClass($.compareEl, "wh-render");      // 扫光在新图上再走一遍
    });
    var tDone = tSwitch + 560;                    // ≈ 1510ms：角标出现（< 3s）
    at(tDone, function () {
      $.compareEl.classList.remove("wh-render");
      showBadge((DATA.rerender && DATA.rerender.done) || "已重出图");
      busy(false);
    });
  }

  // 方案切换请求：有未应用草稿时先让用户决定（应用后切换 / 放弃后切换 / 留在当前）
  function requestSchemeChange(id) {
    if (!cfgById(id)) return;
    if (draft) { askConflict(id); return; }
    setScheme(id);
  }

  // 切方案：旧动画全停，直接出图，不残留上一套元素
  function setScheme(id) {
    if (!cfgById(id)) return;
    clearAll();
    playing = false;
    if (rendering) busy(false);
    $.compareEl.classList.remove("wh-play");
    $.compareEl.classList.remove("wh-render");
    hideBadge();
    commitConfig(id, 'scheme');
    stepsAllOff();
    paramsRevealAll();
    if (sbs) { renderStage(); }
    else { setP(50); }
  }

  // 重置到初始态
  function reset() {
    clearAll();
    playing = false;
    if (rendering) busy(false);
    $.compareEl.classList.remove("wh-play");
    $.compareEl.classList.remove("wh-render");
    hideBadge();
    if (viewMode === 'model') dispatch('wh71:viewmode', { mode: 'diagram' });
    viewMode = 'diagram';
    sbs = false;
    $.compareEl.classList.remove('wh-sbs');
    updateModeButtons();
    if (briefOpen) toggleBrief(false);
    applyConfig(DATA.configs[0].id);
    stepsAllOff();
    paramsRevealAll();
    setP(50);
  }

  // 视图切换：示意图 / 3D 预览 / 前后对比。全局唯一样式来源（F05）。
  // 视图切换：示意图 / 3D 预览 / 前后对比。全局唯一 viewMode（F05）。
  // 视图切换：示意图 / 3D 预览 / 方案对比 / 前后对比。全局唯一 viewMode（F05）
  function setViewMode(mode) {
    var next = (mode === "model" || mode === "compare" || mode === "beforeafter") ? mode : "diagram";
    if (next === viewMode && inited) return viewMode;
    // 前后对比必须有已标定照片，否则不假提能力
    if (next === "beforeafter" && photoState !== "ready") {
      showBadge("先添加现场照片才能做前后对比");
      setTimeout(hideBadge, 2600);
      updateModeButtons();
      return viewMode;
    }
    viewMode = next;
    sbs = (next === "compare");
    clearAll();
    playing = false;
    if (rendering) busy(false);
    $.compareEl.classList.remove("wh-play");
    $.compareEl.classList.remove("wh-render");
    hideBadge();
    $.compareEl.classList.toggle("wh-sbs", sbs);
    updateModeButtons();
    updateStatus();
    updateScene();
    if (next === "model" || next === "beforeafter") {
      dispatch("wh71:viewmode", { mode: next });
    } else {
      dispatch("wh71:viewmode", { mode: next });
      renderStage();
      stepsAllOff();
      paramsRevealAll();
      if (!sbs) setP(p);
    }
    return viewMode;
  }

  function toggleBrief(force) {
    briefOpen = typeof force === "boolean" ? force : !briefOpen;
    $.briefEl.classList.toggle("open", briefOpen);
    if ($.moreBtn) $.moreBtn.textContent = briefOpen ? "收起说明 ▴" : "展开说明 ▾";
  }

  function toggleFs() {
    var d = document;
    var fsEl = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (!fsEl) {
        var r = d.documentElement;
        if (r.requestFullscreen) r.requestFullscreen();
        else if (r.webkitRequestFullscreen) r.webkitRequestFullscreen();
      } else {
        if (d.exitFullscreen) d.exitFullscreen();
        else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      }
    } catch (e) { /* 无全屏权限时忽略 */ }
  }
  function updateFsBtn() {
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if ($.fsBtn) $.fsBtn.textContent = on ? "⛶ 退出全屏" : "⛶ 全屏";
  }

  /* ---------- 现场照片面板（W2：首屏可见的照片入口） ---------- */
  function renderPhotoPanel() {
    if (!$.photoBody) return;
    var stateEl = q('#whPhotoState');
    if (photoState === 'ready') {
      if (stateEl) { stateEl.textContent = '已标定'; stateEl.style.color = '#69d7ad'; }
      $.photoBody.innerHTML =
        '<div class="wh-photo-thumb"><img id="whPhotoThumb" alt="已标定的现场照片">' +
          '<div class="wh-photo-meta"><b>' + esc(photoName || '现场照片') + '</b>' +
            '<span class="wh-photo-ok">照片已标定</span>' +
            (photoSize ? '<br>' + esc(photoSize) : '') +
          '</div></div>' +
        '<div class="wh-photo-btns"><button class="wh-btn" id="whPhotoAgain" type="button">重新标定</button>' +
        '<button class="wh-btn" id="whPhotoClear" type="button">移除照片</button></div>';
      var thumb = q('#whPhotoThumb');
      if (thumb && window.WH.__photo && window.WH.__photo.src) thumb.src = window.WH.__photo.src;
    } else {
      if (stateEl) { stateEl.textContent = '未添加'; stateEl.style.color = ''; }
      if (!window.WH.photo) {
        // 2D 单文件版没有 3D/标定模块：说清楚，不假提能力
        $.photoBody.innerHTML = '<p class="wh-photo-p">当前为 2D 单文件版，不含现场照片标定；打开 3D 版可使用照片与四点标定。</p>';
      } else {
        $.photoBody.innerHTML =
          '<p class="wh-photo-p">选择一张包含清晰地面矩形的现场照片，并准备其中一条边的真实长度。没有照片时也可以先用示意图沟通。</p>' +
          '<div class="wh-photo-btns"><button class="wh-btn wh-btn-primary" id="whPhotoPick" type="button">选择照片</button></div>';
      }
    }
  }

  function openPhoto() {
    if (!window.WH.photo || typeof window.WH.photo.open !== 'function') {
      showBadge('照片模块未就绪');
      return;
    }
    var r = window.WH.photo.open();
    if (r && r.ok === false) showBadge(r.reason || '无法打开标定');
  }

  function clearPhoto() {
    photoState = 'none';
    photoName = '';
    photoSize = '';
    window.WH.__photo = null;
    window.WH.__calib = null;
    if (viewMode === 'model') setViewMode('diagram');
    renderPhotoPanel();
    updateStatus();
    updateModeButtons();
  }

  /* ---------- 全局暂停（F12：一个按钮停全部动效） ---------- */
  var paused = false;
  function paintPauseBtn() {
    if (!$.pauseBtn) return;
    $.pauseBtn.textContent = paused ? '继续动效' : '暂停动效';
    $.pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    $.pauseBtn.classList.toggle('wh-btn-primary', paused);
  }
  function togglePause() {
    paused = !paused;
    if (paused) {
      clearAll();
      playing = false;
      $.compareEl.classList.remove('wh-play');
      $.compareEl.classList.remove('wh-render');
      dispatch('wh71:pause', {});
    }
    paintPauseBtn();
    dispatch('wh71:motion-state', { detail: { paused: paused } });
  }

  /* ---------- 导出预览（W6） ---------- */
  function svgToPng(svgEl, cb) {
    if (!svgEl) { cb(new Error('当前没有可导出的画面')); return; }
    var svgText = new XMLSerializer().serializeToString(svgEl);
    if (svgText.indexOf('xmlns=') === -1) svgText = svgText.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    var blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var im = new Image();
    im.onload = function () {
      try {
        var w = im.naturalWidth || 1600, h = im.naturalHeight || 800;
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#080c11'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(im, 0, 0, w, h);
        drawWatermark(ctx, w, h);
        URL.revokeObjectURL(url);
        cb(null, c.toDataURL('image/png'));
      } catch (e) { URL.revokeObjectURL(url); cb(e); }
    };
    im.onerror = function () { URL.revokeObjectURL(url); cb(new Error('画面栅格化失败')); };
    im.src = url;
  }

  function drawWatermark(ctx, w, h) {
    var fs = Math.max(13, Math.round(w * 0.014));
    ctx.font = fs + 'px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'bottom';
    var lines = [
      '方案 ' + (cfg ? cfg.id : '-') + ' · ' + (cfg ? cfg.model : ''),
      (cfg ? ('跨度 ' + fmtField('span', cfg.span) + ' · 起重量 ' + fmtField('capacity', cfg.capacity) + ' · 轨高 ' + fmtField('railHeight', cfg.railHeight)) : ''),
      '沟通示意，非施工依据 · 卫华场景 71' + (photoState === 'ready' ? ' · 照片安装预览' : ' · 示意预览')
    ];
    var bw = 0;
    lines.forEach(function (t) { bw = Math.max(bw, ctx.measureText(t).width); });
    var barH = fs * 1.5 * lines.length + fs;
    ctx.fillStyle = 'rgba(6,10,16,.74)';
    ctx.fillRect(0, h - barH, bw + fs * 3, barH);
    ctx.fillStyle = '#ffd27a';
    lines.forEach(function (t, i) {
      ctx.fillText(t, fs * 1.4, h - fs * 0.8 - (lines.length - 1 - i) * fs * 1.5);
    });
  }

  function exportModeName() {
    if (viewMode === 'model') return photoState === 'ready' ? '照片安装预览' : '3D示意预览';
    if (viewMode === 'compare') return '方案对比示意';
    if (viewMode === 'beforeafter') return '前后对比';
    return '示意预览';
  }

  function openExport() {
    if (document.querySelector('[data-wh-modal="1"]')) return;
    var modal = document.createElement('div');
    modal.className = 'wh-modal';
    modal.setAttribute('data-wh-modal', '1');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '导出预览');
    modal.innerHTML =
      '<div class="wh-modal-box">' +
        '<div class="wh-modal-h"><h3>导出预览</h3><button class="wh-btn" id="whExpClose" type="button">关闭</button></div>' +
        '<div class="wh-modal-prev" id="whExpPrev"><span style="color:#7f8f9f;font-size:12px">正在生成预览…</span></div>' +
        '<div class="wh-modal-meta" id="whExpMeta"></div>' +
        '<div class="wh-modal-note">导出的图片仅用于方案沟通：参数为演示示意值，不能作为施工或工程验收依据；照片与参数不上传、不联网。</div>' +
        (draft ? '<div class="wh-modal-note" id="whExpDraft">当前有未应用修改，导出的是已应用方案 ' + esc(cfg.id) + '。</div>' : '') +
        '<div class="wh-modal-err" id="whExpErr"></div>' +
        '<div class="wh-modal-b"><button class="wh-btn wh-btn-primary" id="whExpSave" type="button" disabled>保存 PNG</button>' +
        '<button class="wh-btn" id="whExpBack" type="button">返回画布</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.setAttribute('aria-hidden', 'false');

    // 背景 inert（与标定弹层一致）
    var app = document.getElementById('app');
    if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }

    var prevEl = q('#whExpPrev', modal), errEl = q('#whExpErr', modal), saveBtn = q('#whExpSave', modal);
    var dataURL = null, filename = '';
    var modeName = exportModeName();
    var dateStr = (function () { var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); })();
    filename = '卫华场景71_' + modeName + '_' + (cfg ? cfg.id : '-') + '_' + dateStr + '.png';

    q('#whExpMeta', modal).innerHTML =
      '<span>模式 <b>' + esc(modeName) + '</b></span>' +
      '<span>方案 <b>' + esc(cfg.id) + ' · ' + esc(cfg.model) + '</b></span>' +
      '<span>跨度 <b>' + esc(fmtField('span', cfg.span)) + '</b></span>' +
      '<span>起重量 <b>' + esc(fmtField('capacity', cfg.capacity)) + '</b></span>' +
      '<span>轨高 <b>' + esc(fmtField('railHeight', cfg.railHeight)) + '</b></span>' +
      '<span>版本 <b>v' + cfgRev + '</b></span>';

    function closeModal() {
      modal.remove();
      if (app) { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
      var back = q('#whExport');
      if (back && back.focus) { try { back.focus(); } catch (e) { /* 忽略 */ } }
    }

    function fail(msg) {
      errEl.textContent = msg;
      prevEl.innerHTML = '<span style="color:#ff9b9b;font-size:12px">' + esc(msg) + '</span>';
      saveBtn.disabled = true;
    }

    function done(url) {
      dataURL = url;
      prevEl.innerHTML = '<img alt="导出预览" src="' + url + '">';
      saveBtn.disabled = false;
    }

    if (viewMode === 'model' || viewMode === 'beforeafter') {
      var raw = (typeof window.WH.export3d === 'function') ? window.WH.export3d() : null;
      if (!raw) { fail('3D 画面尚未就绪，请稍后重试'); }
      else {
        // 3D 导出图再叠一层统一水印，保证「示意 / 照片」命名与免责文案一致（F11）
        var im2 = new Image();
        im2.onload = function () {
          try {
            var c2 = document.createElement('canvas');
            c2.width = im2.naturalWidth; c2.height = im2.naturalHeight;
            var x2 = c2.getContext('2d');
            x2.drawImage(im2, 0, 0);
            drawWatermark(x2, c2.width, c2.height);
            done(c2.toDataURL('image/png'));
          } catch (e2) { fail('导出图像处理失败：' + ((e2 && e2.message) || e2)); }
        };
        im2.onerror = function () { fail('导出图像解码失败，请重试'); };
        im2.src = raw;
      }
    } else {      var svg = $.afterEl && $.afterEl.querySelector('svg');
      if (svg) {
        svgToPng(svg, function (err, url) { if (err) fail(err.message); else done(url); });
      } else fail('当前没有可导出的画面');
    }

    q('#whExpClose', modal).addEventListener('click', closeModal);
    q('#whExpBack', modal).addEventListener('click', closeModal);
    saveBtn.addEventListener('click', function () {
      if (!dataURL) return;
      try {
        var a = document.createElement('a');
        a.href = dataURL; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        errEl.textContent = '';
        saveBtn.textContent = '已生成，正在下载…';
        setTimeout(closeModal, 700);
      } catch (e) {
        errEl.textContent = '下载失败：' + ((e && e.message) || e) + '，可再试一次';
      }
    });
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeModal(); }
    });
    setTimeout(function () { try { saveBtn.focus(); } catch (e) { /* 忽略 */ } }, 50);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    bindGap();
    $.playBtn.addEventListener("click", play);
    $.skipBtn.addEventListener("click", skip);
    $.fsBtn.addEventListener("click", toggleFs);
    $.rerenderBtn.addEventListener("click", rerender);

    $.moreBtn = q("#whMore");
    if ($.moreBtn) $.moreBtn.addEventListener("click", function () { toggleBrief(); });

    $.modeSingle = q('#whModeSingle');
    $.modeCompare = q('#whModeCompare');
    $.modeBa = q('#whModeBa');
    $.modeModel = q('#whModeModel');
    if ($.modeSingle) $.modeSingle.addEventListener('click', function () { setViewMode('diagram'); });
    if ($.modeCompare) $.modeCompare.addEventListener('click', function () { setViewMode('compare'); });
    if ($.modeBa) $.modeBa.addEventListener('click', function () { setViewMode('beforeafter'); });
    if ($.modeModel) $.modeModel.addEventListener('click', function () { setViewMode('model'); });

    // 照片标定成功：状态条与照片卡同步（标定不重建模型，只改叠加相机）
    document.addEventListener('wh71:photo-calibrated', function (e) {
      var d = (e && e.detail) || {};
      photoState = 'ready';
      photoName = String((d.name || (d.photo && d.photo.__whName) || '')).slice(0, 28);
      photoSize = (d.width && d.height) ? (d.width + '×' + d.height + ' px') : '';
      updateStatus();
      updateModeButtons();
      if (typeof renderPhotoPanel === 'function') renderPhotoPanel();
    });
    // 3D 侧回报实际状态：保证同一时刻只有一个模式选中
    document.addEventListener('wh71:viewmode-changed', function (e) {
      var m = e && e.detail && e.detail.mode;
      document.body.classList.toggle('wh-3d', m === 'model');
      if (m === 'model') {
        viewMode = 'model'; sbs = false;
        $.compareEl.classList.remove('wh-sbs');
        updateModeButtons(); updateStatus();
      } else if (m === 'diagram' || m === 'compare') {
        viewMode = m; sbs = (m === 'sbs');
        $.compareEl.classList.toggle('wh-sbs', sbs);
        updateModeButtons(); updateStatus();
      }
    });

    $.pauseBtn = q('#whPause');
    $.exportBtn = q('#whExport');
    $.photoBody = q('#whPhotoBody');
    renderPhotoPanel();
    if ($.pauseBtn) $.pauseBtn.addEventListener('click', togglePause);
    if ($.exportBtn) $.exportBtn.addEventListener('click', openExport);
    if ($.photoBody) $.photoBody.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'whPhotoPick' || t.id === 'whPhotoAgain') openPhoto();
      else if (t.id === 'whPhotoClear') clearPhoto();
    });
    paintPauseBtn();

    document.addEventListener('fullscreenchange', updateFsBtn);
    document.addEventListener("webkitfullscreenchange", updateFsBtn);

    // 滑块：原生 range 驱动（拖拽 + 键盘都由浏览器负责）
    $.rangeEl.addEventListener("input", function () { setP(Number($.rangeEl.value)); });
    $.rangeEl.addEventListener("focus", function () { $.compareEl.classList.add("kb"); });
    $.rangeEl.addEventListener("blur", function () { $.compareEl.classList.remove("kb"); });

    // 方案切换（事件委托）
    $.schemesEl.addEventListener("click", function (e) {
      var b = e.target;
      while (b && b !== $.schemesEl) {
        if (b.classList && b.classList.contains('wh-scheme')) {
          requestSchemeChange(b.getAttribute('data-id'));
          return;
        }
        b = b.parentNode;
      }
    });

    // 键盘：空格 / F / 1-4 / R；Esc 交给浏览器
    document.addEventListener("keydown", function (e) {
      // 弹层打开时，背景快捷键一律失效（F02：标定中按 2 不能换背景方案）
      if (document.querySelector('[data-wh-modal="1"]')) return;
      var t = e.target;
      var tag = (t && t.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key;
      if (k === " " || k === "Spacebar") {
        e.preventDefault();
        play();
      } else if (k === "f" || k === "F") {
        e.preventDefault();
        toggleFs();
      } else if (k >= "1" && k <= "4") {
        e.preventDefault();
        var c = DATA.configs[Number(k) - 1];
        if (c) setScheme(c.id);
      } else if (k === "r" || k === "R") {
        e.preventDefault();
        reset();
      }
    });
  }

  /* ---------------- 初始化 ---------------- */
  function initUI() {
    if (inited) return;
    var root = document.getElementById("app");
    if (!root) { document.addEventListener("DOMContentLoaded", initUI); return; }
    inited = true;

    DATA = window.WH && window.WH.DATA;
    if (!DATA || !DATA.configs || !DATA.configs.length) {
      root.innerHTML = '<div style="padding:40px;color:#f5a524;font-family:sans-serif">缺少 WH.DATA，请确认 src/data.js 已加载。</div>';
      return;
    }

    injectStyle();
    root.innerHTML = HTML;

    $.app = root;
    $.compareEl = q("#whCompare");
    $.beforeEl = q("#whBefore");
    $.afterEl = q("#whAfter");
    $.handleEl = q("#whHandle");
    $.scanEl = q("#whScan");
    $.rangeEl = q("#whRange");
    $.playBtn = q("#whPlay");
    $.skipBtn = q("#whSkip");
    $.fsBtn = q("#whFs");
    $.badgeEl = q("#whBadge");
    $.stepsEl = q("#whSteps");
    $.paramsEl = q("#whParams");
    $.schemesEl = q("#whSchemes");
    $.rerenderBtn = q("#whRerender");
    $.sceneEl = q("#whScene");
    $.briefEl = q("#whBrief");
    $.gapEl = q("#whGapbar");
    $.gapSeg = q("#whGapSeg");
    $.gapV = q("#whGapV");
    $.statusEl = q('#whStatus');

    // 2D 单文件版没有 3D 模块：按钮不可点并说明原因
    if (!window.WH || !window.WH.view3d) {
      if ($.modeModel) {
        $.modeModel.disabled = true;
        $.modeModel.title = '当前为 2D 单文件版，不含 3D 模块';
        $.modeModel.setAttribute('aria-disabled', 'true');
      }
    }

    buildSteps();
    buildParams();
    buildSchemes();
    buildBrief();

    if ($.rerenderBtn && DATA.rerender) $.rerenderBtn.textContent = DATA.rerender.label;

    bind();

    applyConfig(DATA.configs[0].id);
    setP(50);
    stepsAllOff();
    paramsRevealAll();
    updateModeButtons();
    updateFsBtn();
  }

  /* ---------------- 对外接口 ---------------- */
  WH.initUI = initUI;
  WH.__setConfig = function (id) { return commitConfig(id, 'api'); };
  WH.__getState = function () {
    return { id: cfg && cfg.id, revision: cfgRev, viewMode: viewMode, sbs: sbs, config: cfg ? serializeConfig(cfg) : null };
  };
  WH.__dispatch = dispatch;
  WH.__setViewMode = function (m) { return setViewMode(m); };

  if (document.getElementById("app")) {
    initUI();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }
})();
