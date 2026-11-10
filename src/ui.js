/* ============================================================
 * src/ui.js  ·  队友A  ·  交互外壳
 * 职责：页面全部 DOM 与样式（#app 是唯一容器）
 *   - 左右对比滑块
 *   - 四步出图进度（播放依次点亮 / 跳过一次全亮）
 *   - 参数卡（7 值随方案变）
 *   - 方案 A/B/C/D 切换
 *   - 「客户改需求」桥段（3 秒内完成）
 *   - 播放 / 跳过动画 / 全屏
 *   - 一页说明（问题/方案/价值/落地）
 * 约定：只读 WH.DATA，只调 WH.renderScene()，不写死任何参数数值。
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};

  /* ---------------- 全局状态 ---------------- */
  var DATA = null;
  var cfg = null;          // 当前方案
  var p = 50;              // 滑块位置 0..100
  var timers = [];         // 所有 setTimeout
  var rafId = null;        // 滑块动画
  var playing = false;
  var rerenderPending = null;
  var inited = false;
  var dragging = false;

  var app, compareEl, beforeEl, afterEl, handleEl, scanEl;
  var playBtn, skipBtn, fsBtn, badgeEl;
  var stepsEl, steps = [];
  var paramsEl, schemesEl, rerenderBtn, sceneEl, briefEl;

  /* ---------------- 小工具 ---------------- */
  function q(sel, root) { return (root || document).querySelector(sel); }
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
  function cfgById(id) {
    if (!DATA || !DATA.configs) return null;
    for (var i = 0; i < DATA.configs.length; i++) {
      if (DATA.configs[i].id === id) return DATA.configs[i];
    }
    return null;
  }
  // 把 {span}/{railHeight}/{duty}/{renderSec} 换成当前方案的值
  function fill(t, c) {
    return String(t)
      .replace(/\{span\}/g, num(c.span))
      .replace(/\{railHeight\}/g, num(c.railHeight))
      .replace(/\{duty\}/g, c.duty)
      .replace(/\{renderSec\}/g, num(c.renderSec));
  }

  /* ---------------- 参数定义（7 值） ---------------- */
  var PARAMS = [
    { k: "model",      label: "型号",     g: 0, f: function (c) { return c.model; } },
    { k: "span",       label: "跨度",     g: 1, f: function (c) { return num(c.span) + " m"; } },
    { k: "capacity",   label: "起重量",   g: 1, f: function (c) { return num(c.capacity) + " t"; } },
    { k: "railHeight", label: "轨高",     g: 1, f: function (c) { return num(c.railHeight) + " m"; } },
    { k: "duty",       label: "工作级别", g: 1, f: function (c) { return c.duty; } },
    { k: "agv",        label: "AGV 数量", g: 3, f: function (c) { return c.agv > 0 ? c.agv + " 台" : "无"; } },
    { k: "renderSec",  label: "出图用时", g: 3, f: function (c) { return num(c.renderSec) + " s"; } }
  ];
  var PARAMS_BY_K = {};
  (function () { for (var i = 0; i < PARAMS.length; i++) PARAMS_BY_K[PARAMS[i].k] = PARAMS[i]; })();

  /* ---------------- 样式（全部由 ui.js 注入） ---------------- */
  var CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:radial-gradient(1200px 800px at 70% -10%,#1a2431 0%,#0c1015 55%,#090c10 100%);color:#e8eef5;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}
#app{height:100vh;display:flex;flex-direction:column;overflow:hidden}
.wh-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 20px;border-bottom:1px solid #232c37;background:linear-gradient(180deg,rgba(22,28,36,.92),rgba(14,18,24,.92))}
.wh-brand{display:flex;align-items:center;gap:12px;min-width:0}
.wh-logo{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;letter-spacing:.5px;color:#0b0e12;background:linear-gradient(135deg,#ffc24b,#f59a1f);box-shadow:0 4px 14px rgba(245,154,31,.28);flex:0 0 auto}
.wh-title{font-size:19px;font-weight:800;letter-spacing:.5px;line-height:1.1}
.wh-sub{font-size:11.5px;color:#8fa0b2;letter-spacing:.3px;margin-top:2px}
.wh-tags{display:flex;gap:8px;flex:0 0 auto}
.wh-tag{font-size:12px;color:#cdd8e4;background:rgba(55,214,198,.08);border:1px solid rgba(55,214,198,.28);padding:4px 10px;border-radius:999px;white-space:nowrap}
.wh-main{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(330px,1fr);gap:14px;padding:12px 20px 8px;overflow:hidden}
.wh-stage-col{min-width:0;min-height:0;display:flex;flex-direction:column}
.wh-compare{position:relative;flex:1 1 auto;min-height:0;border-radius:14px;overflow:hidden;border:1px solid #2a3341;background:#0a0d11;box-shadow:0 18px 40px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.02)}
.wh-layer{position:absolute;inset:0}
.wh-layer svg{width:100%;height:100%;display:block}
.wh-after{will-change:clip-path}
.wh-scan{position:absolute;top:0;bottom:0;left:0;width:140px;background:linear-gradient(90deg,transparent,rgba(120,220,255,.22),transparent);opacity:0;pointer-events:none}
.wh-compare.wh-playing .wh-scan{animation:wh-scan 1.4s linear infinite}
@keyframes wh-scan{0%{transform:translateX(-160px);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateX(120vw);opacity:0}}
.wh-labels{position:absolute;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;pointer-events:none}
.wh-lb{font-size:12px;color:#dfe8f2;background:rgba(8,11,15,.62);border:1px solid rgba(255,255,255,.12);padding:4px 10px;border-radius:999px}
.wh-lb-r{background:rgba(245,154,31,.16);border-color:rgba(245,154,31,.4)}
.wh-handle{position:absolute;top:0;bottom:0;left:50%;width:2px;background:linear-gradient(180deg,rgba(255,255,255,.1),#ffc24b 20%,#ffc24b 80%,rgba(255,255,255,.1));transform:translateX(-1px);cursor:ew-resize;outline:none}
.wh-handle:focus-visible .wh-grip{box-shadow:0 0 0 4px rgba(55,214,198,.35)}
.wh-grip{position:absolute;top:50%;left:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:linear-gradient(135deg,#1d2530,#141a22);border:2px solid #ffc24b;box-shadow:0 6px 16px rgba(0,0,0,.5)}
.wh-grip::before,.wh-grip::after{content:"";position:absolute;top:50%;margin-top:-5px;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent}
.wh-grip::before{left:6px;border-right:6px solid #ffc24b}
.wh-grip::after{right:6px;border-left:6px solid #ffc24b}
.wh-controls{flex:0 0 auto;display:flex;align-items:center;gap:9px;margin-top:10px}
.wh-btn{font-family:inherit;font-size:13.5px;font-weight:600;color:#dbe4ee;background:#1a212b;border:1px solid #2c3745;padding:9px 16px;border-radius:10px;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;white-space:nowrap}
.wh-btn:hover{background:#212a36;border-color:#3a4757}
.wh-btn:active{transform:translateY(1px)}
.wh-btn-primary{color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);border-color:transparent;box-shadow:0 6px 16px rgba(245,154,31,.3)}
.wh-btn-primary:hover{background:linear-gradient(135deg,#ffce64,#ffa62e)}
.wh-badge{font-size:12.5px;font-weight:700;color:#0f1a16;background:linear-gradient(135deg,#5cf0c0,#2ad2a6);padding:7px 12px;border-radius:999px;opacity:0;transform:translateX(-6px);transition:opacity .25s,transform .25s;white-space:nowrap}
.wh-badge.on{opacity:1;transform:none}
.wh-steps{flex:0 0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:10px}
.wh-step{position:relative;padding:9px 11px;border-radius:11px;background:#141a22;border:1px solid #29323e;opacity:.6;transition:opacity .2s,border-color .2s,background .2s}
.wh-step.on{opacity:1;background:linear-gradient(180deg,rgba(245,154,31,.14),rgba(245,154,31,.04));border-color:rgba(245,154,31,.55)}
.wh-step-h{display:flex;align-items:center;gap:8px}
.wh-step-n{width:20px;height:20px;border-radius:50%;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;background:#2a3341;color:#9fb0c2;flex:0 0 auto}
.wh-step.on .wh-step-n{background:linear-gradient(135deg,#ffc24b,#f59a1f);color:#12161c}
.wh-step-t{font-size:13px;font-weight:700;color:#e8eef5}
.wh-step-d{font-size:11.5px;color:#8fa0b2;margin-top:5px;line-height:1.35;min-height:30px}
.wh-side{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:auto}
.wh-panel{background:linear-gradient(180deg,#161c24,#12171e);border:1px solid #28323e;border-radius:14px;padding:13px 14px;box-shadow:0 10px 24px rgba(0,0,0,.28)}
.wh-panel-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:9px;margin-bottom:9px;border-bottom:1px solid #242d38;font-size:14px;font-weight:800;letter-spacing:.4px;color:#eaf1f8}
.wh-scene{font-size:12px;font-weight:600;color:#37d6c6}
.wh-hint{font-size:11px;font-weight:400;color:#7f8f9f}
.wh-params{display:flex;flex-direction:column;gap:2px}
.wh-prow{display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-radius:8px;transition:opacity .28s,transform .28s,background .2s}
.wh-prow.dim{opacity:.22;transform:translateX(6px)}
.wh-prow.on{background:rgba(55,214,198,.07)}
.wh-pk{font-size:12.5px;color:#8fa0b2}
.wh-pv{font-size:14px;font-weight:800;color:#f2f6fa;font-variant-numeric:tabular-nums}
.wh-schemes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wh-scheme{font-family:inherit;text-align:left;cursor:pointer;background:#161d26;border:1px solid #2a3441;border-radius:10px;padding:8px 10px;color:#ccd7e3;transition:border-color .15s,background .15s;min-width:0}
.wh-scheme b{display:block;font-size:15px;color:#e8eef5}
.wh-scheme span{display:block;font-size:11px;color:#8fa0b2;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wh-scheme:hover{background:#1b2330}
.wh-scheme.active{border-color:rgba(245,154,31,.65);background:linear-gradient(180deg,rgba(245,154,31,.16),rgba(245,154,31,.04))}
.wh-scheme.active b{color:#ffc24b}
.wh-rerender{width:100%;margin-top:9px;color:#12161c;background:linear-gradient(135deg,#7ef0d3,#2ad2a6);border-color:transparent;box-shadow:0 6px 16px rgba(42,210,166,.24);text-align:center}
.wh-rerender:hover{background:linear-gradient(135deg,#93f5dd,#3ee0b4)}
.wh-brief{flex:0 0 auto;padding:9px 20px 12px;border-top:1px solid #232c37;background:linear-gradient(180deg,rgba(14,18,24,.6),rgba(10,13,17,.9))}
.wh-brief-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.wh-bi{min-width:0}
.wh-bi h4{margin:0 0 3px;font-size:12px;font-weight:800;color:#ffc24b;letter-spacing:.5px}
.wh-bi p{margin:0;font-size:11.5px;line-height:1.4;color:#a9b7c6}
.wh-disc{margin-top:7px;font-size:11px;color:#6f7f8f;text-align:right}
@media (max-width:1180px){.wh-main{grid-template-columns:minmax(0,1.4fr) minmax(300px,1fr)}.wh-title{font-size:17px}}
@media (max-width:900px){body{overflow:auto}#app{height:auto;min-height:100vh}.wh-main{grid-template-columns:1fr}.wh-steps{grid-template-columns:repeat(2,1fr)}.wh-brief-grid{grid-template-columns:repeat(2,1fr)}}
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
      '<div class="wh-tags">' +
        '<span class="wh-tag">内容创作</span>' +
        '<span class="wh-tag">场景 71</span>' +
        '<span class="wh-tag">归属 活动方</span>' +
      '</div>' +
    '</header>' +
    '<div class="wh-main">' +
      '<div class="wh-stage-col">' +
        '<div class="wh-compare" id="whCompare">' +
          '<div class="wh-layer wh-before" id="whBefore"></div>' +
          '<div class="wh-layer wh-after" id="whAfter"></div>' +
          '<div class="wh-scan" id="whScan"></div>' +
          '<div class="wh-labels">' +
            '<span class="wh-lb">客户现场照片 · 示意</span>' +
            '<span class="wh-lb wh-lb-r">AI 安装效果图</span>' +
          '</div>' +
          '<div class="wh-handle" id="whHandle" tabindex="0" role="slider" aria-label="对比滑块" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span class="wh-grip"></span></div>' +
        '</div>' +
        '<div class="wh-controls">' +
          '<button class="wh-btn wh-btn-primary" id="whPlay" type="button">▶ 播放演示</button>' +
          '<button class="wh-btn" id="whSkip" type="button">⏭ 跳过动画</button>' +
          '<button class="wh-btn" id="whFs" type="button">⛶ 全屏</button>' +
          '<span class="wh-badge" id="whBadge"></span>' +
        '</div>' +
        '<div class="wh-steps" id="whSteps"></div>' +
      '</div>' +
      '<aside class="wh-side">' +
        '<section class="wh-panel">' +
          '<div class="wh-panel-h"><span>识别参数</span><span class="wh-scene" id="whScene"></span></div>' +
          '<div class="wh-params" id="whParams"></div>' +
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
    stepsEl.innerHTML = DATA.steps.map(function (s, i) {
      return '<div class="wh-step" data-i="' + i + '">' +
        '<div class="wh-step-h"><span class="wh-step-n">' + (i + 1) + '</span>' +
        '<span class="wh-step-t">' + esc(s.t) + '</span></div>' +
        '<div class="wh-step-d"></div></div>';
    }).join("");
    steps = [];
    for (var i = 0; i < DATA.steps.length; i++) {
      steps.push(q('.wh-step[data-i="' + i + '"]', stepsEl));
    }
  }

  function buildParams() {
    paramsEl.innerHTML = PARAMS.map(function (pr) {
      return '<div class="wh-prow" data-g="' + pr.g + '">' +
        '<span class="wh-pk">' + esc(pr.label) + '</span>' +
        '<span class="wh-pv" data-k="' + pr.k + '">—</span></div>';
    }).join("");
  }

  function buildSchemes() {
    schemesEl.innerHTML = DATA.configs.map(function (c) {
      return '<button class="wh-scheme" type="button" data-id="' + esc(c.id) + '">' +
        '<b>' + esc(c.id) + '</b><span>' + esc(c.scene) + '</span></button>';
    }).join("");
  }

  function buildBrief() {
    var b = DATA.brief || {};
    var rows = [
      ["问题", b.problem],
      ["方案", b.solution],
      ["价值", b.value],
      ["落地", b.landing]
    ];
    var grid = rows.map(function (r) {
      return '<div class="wh-bi"><h4>' + esc(r[0]) + '</h4><p>' + esc(r[1] || "") + '</p></div>';
    }).join("");
    briefEl.innerHTML = '<div class="wh-brief-grid">' + grid + '</div>' +
      '<div class="wh-disc">示意 / 推算，非真实设备参数 · 本作品为离线演示原型，全程零网络请求</div>';
  }

  /* ---------------- 状态同步 ---------------- */
  function updateParams() {
    var cells = paramsEl.querySelectorAll(".wh-pv");
    for (var i = 0; i < cells.length; i++) {
      var k = cells[i].getAttribute("data-k");
      var pr = PARAMS_BY_K[k];
      if (pr) cells[i].textContent = pr.f(cfg);
    }
  }

  function updateStepsText() {
    for (var i = 0; i < steps.length; i++) {
      if (!steps[i]) continue;
      var d = q(".wh-step-d", steps[i]);
      if (d) d.textContent = fill(DATA.steps[i].d, cfg);
    }
  }

  function updateSchemeActive() {
    var btns = schemesEl.querySelectorAll(".wh-scheme");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-id") === cfg.id);
    }
  }

  function sceneSVG(c, mode) {
    try {
      if (window.WH && typeof window.WH.renderScene === "function") {
        var s = window.WH.renderScene({
          span: c.span, capacity: c.capacity, railHeight: c.railHeight,
          duty: c.duty, agv: c.agv, bayType: c.bayType, mode: mode
        });
        if (s && typeof s === "string" && s.length) return s;
      }
    } catch (e) { /* 渲染模块异常时兜底，不影响外壳 */ }
    return fallbackSVG(mode);
  }
  function fallbackSVG(mode) {
    var fillC = mode === "after" ? "#1c2733" : "#121820";
    return '<svg viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="800" height="420" fill="' + fillC + '"/>' +
      '<text x="400" y="214" fill="#6b7b8c" font-size="18" font-family="sans-serif" text-anchor="middle">渲染模块待接入</text></svg>';
  }

  function renderScenes() {
    beforeEl.innerHTML = sceneSVG(cfg, "before");
    afterEl.innerHTML = sceneSVG(cfg, "after");
  }

  function applyConfig(id) {
    var c = cfgById(id);
    if (!c) return;
    cfg = c;
    sceneEl.textContent = c.scene;
    updateParams();
    updateStepsText();
    updateSchemeActive();
    renderScenes();
  }

  /* ---------------- 滑块 ---------------- */
  function setP(v) {
    p = Math.max(0, Math.min(100, v));
    if (afterEl) {
      var clip = "inset(0 0 0 " + p + "%)";
      afterEl.style.clipPath = clip;
      afterEl.style.webkitClipPath = clip;
    }
    if (handleEl) {
      handleEl.style.left = p + "%";
      handleEl.setAttribute("aria-valuenow", String(Math.round(p)));
    }
  }
  function pointerToP(e) {
    var rect = compareEl.getBoundingClientRect();
    if (!rect.width) return;
    setP(((e.clientX - rect.left) / rect.width) * 100);
  }
  function animateP(from, to, dur) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      // easeInOutQuad
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setP(from + (to - from) * e);
      if (k < 1) { rafId = requestAnimationFrame(frame); }
      else { rafId = null; }
    }
    rafId = requestAnimationFrame(frame);
  }

  /* ---------------- 四步与参数联动 ---------------- */
  function stepsAllOff() {
    for (var i = 0; i < steps.length; i++) if (steps[i]) steps[i].classList.remove("on");
  }
  function lightStep(i) {
    if (steps[i]) steps[i].classList.add("on");
    var rows = paramsEl.querySelectorAll('.wh-prow[data-g="' + i + '"]');
    for (var j = 0; j < rows.length; j++) { rows[j].classList.remove("dim"); rows[j].classList.add("on"); }
  }
  function lightAll() {
    for (var i = 0; i < steps.length; i++) if (steps[i]) steps[i].classList.add("on");
  }
  function paramsDim() {
    var rows = paramsEl.querySelectorAll(".wh-prow");
    for (var i = 0; i < rows.length; i++) { rows[i].classList.add("dim"); rows[i].classList.remove("on"); }
  }
  function paramsRevealAll() {
    var rows = paramsEl.querySelectorAll(".wh-prow");
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove("dim");
  }

  /* ---------------- 动作 ---------------- */
  function clearAll() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function showBadge(text) {
    if (!badgeEl) return;
    badgeEl.textContent = text;
    badgeEl.classList.add("on");
  }
  function hideBadge() {
    if (!badgeEl) return;
    badgeEl.classList.remove("on");
  }

  function play() {
    clearAll();
    hideBadge();
    playing = true;
    compareEl.classList.add("wh-playing");
    stepsAllOff();
    paramsDim();
    setP(100); // 先全露出「现场原貌」
    var n = steps.length || 4;
    for (var i = 0; i < n; i++) {
      (function (i) {
        timers.push(setTimeout(function () { lightStep(i); }, 350 + i * 1150));
      })(i);
    }
    var dur = 350 + n * 1150; // ≈ 4950ms，远小于 20s
    animateP(100, 0, dur);     // 自动走成「安装效果图」
    timers.push(setTimeout(function () {
      playing = false;
      compareEl.classList.remove("wh-playing");
      lightAll();
      paramsRevealAll();
    }, dur + 150));
  }

  function skip() {
    clearAll();
    playing = false;
    compareEl.classList.remove("wh-playing");
    // 若「客户改需求」正在换图，跳过时直接落到终态
    if (rerenderPending) {
      var t = rerenderPending;
      rerenderPending = null;
      applyConfig(t);
    }
    setP(0);           // 终态：完整效果图
    lightAll();
    paramsRevealAll();
    if (cfg && cfg.id === (DATA.rerender && DATA.rerender.target)) {
      showBadge(DATA.rerender.done);
    }
  }

  function rerender() {
    clearAll();
    playing = false;
    compareEl.classList.remove("wh-playing");
    var target = (DATA.rerender && DATA.rerender.target) || "B";
    rerenderPending = target;
    // 轻微过渡：淡入新图，220ms 内完成换图 → 远小于 3 秒
    if (afterEl && afterEl.animate) {
      try { afterEl.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 220 }); } catch (e) {}
    }
    timers.push(setTimeout(function () {
      applyConfig(target);
      setP(0);
      stepsAllOff();
      lightAll();
      paramsRevealAll();
      if (compareEl && compareEl.animate) {
        try { compareEl.animate([{ filter: "brightness(1.28)" }, { filter: "brightness(1)" }], { duration: 420 }); } catch (e) {}
      }
      showBadge(DATA.rerender.done);
      rerenderPending = null;
    }, 220));
  }

  function toggleFs() {
    var d = document;
    var fsEl = d.fullscreenElement || d.webkitFullscreenElement;
    if (!fsEl) {
      var r = d.documentElement;
      if (r.requestFullscreen) { r.requestFullscreen(); }
      else if (r.webkitRequestFullscreen) { r.webkitRequestFullscreen(); }
    } else {
      if (d.exitFullscreen) { d.exitFullscreen(); }
      else if (d.webkitExitFullscreen) { d.webkitExitFullscreen(); }
    }
  }
  function updateFsBtn() {
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (fsBtn) fsBtn.textContent = on ? "⛶ 退出全屏" : "⛶ 全屏";
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    playBtn.addEventListener("click", play);
    skipBtn.addEventListener("click", skip);
    fsBtn.addEventListener("click", toggleFs);
    rerenderBtn.addEventListener("click", rerender);

    document.addEventListener("fullscreenchange", updateFsBtn);
    document.addEventListener("webkitfullscreenchange", updateFsBtn);

    // 对比滑块：指针拖拽
    compareEl.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      if (compareEl.setPointerCapture) { try { compareEl.setPointerCapture(e.pointerId); } catch (x) {} }
      pointerToP(e);
      e.preventDefault();
    });
    compareEl.addEventListener("pointermove", function (e) { if (dragging) pointerToP(e); });
    compareEl.addEventListener("pointerup", function () { dragging = false; });
    compareEl.addEventListener("pointercancel", function () { dragging = false; });
    // 键盘微调
    handleEl.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setP(p + (e.key === "ArrowRight" ? 3 : -3));
        e.preventDefault();
      }
    });

    // 方案切换（事件委托）
    schemesEl.addEventListener("click", function (e) {
      var b = e.target;
      while (b && b !== schemesEl) {
        if (b.classList && b.classList.contains("wh-scheme")) {
          clearAll();
          playing = false;
          compareEl.classList.remove("wh-playing");
          hideBadge();
          applyConfig(b.getAttribute("data-id"));
          setP(50);
          stepsAllOff();
          paramsRevealAll();
          return;
        }
        b = b.parentNode;
      }
    });
  }

  /* ---------------- 初始化 ---------------- */
  function initUI() {
    if (inited) return;
    var root = document.getElementById("app");
    if (!root) { document.addEventListener("DOMContentLoaded", initUI); return; }
    inited = true;
    app = root;

    DATA = window.WH && window.WH.DATA;
    if (!DATA || !DATA.configs || !DATA.configs.length) {
      app.innerHTML = '<div style="padding:40px;color:#f5a524;font-family:sans-serif">缺少 WH.DATA，请确认 src/data.js 已加载。</div>';
      return;
    }

    injectStyle();
    app.innerHTML = HTML;

    compareEl = q("#whCompare"); beforeEl = q("#whBefore"); afterEl = q("#whAfter");
    handleEl = q("#whHandle"); scanEl = q("#whScan");
    playBtn = q("#whPlay"); skipBtn = q("#whSkip"); fsBtn = q("#whFs"); badgeEl = q("#whBadge");
    stepsEl = q("#whSteps"); paramsEl = q("#whParams");
    schemesEl = q("#whSchemes"); rerenderBtn = q("#whRerender");
    sceneEl = q("#whScene"); briefEl = q("#whBrief");

    buildSteps();
    buildParams();
    buildSchemes();
    buildBrief();

    if (rerenderBtn && DATA.rerender) rerenderBtn.textContent = DATA.rerender.label;

    bind();

    applyConfig(DATA.configs[0].id);
    setP(50);
    stepsAllOff();
    paramsRevealAll();
    updateFsBtn();
  }

  /* ---------------- 对外接口 ---------------- */
  WH.initUI = initUI;
  WH.__setConfig = function (id) { applyConfig(id); };

  // 自动启动：脚本在 body 末尾，通常 #app 已存在
  if (document.getElementById("app")) {
    initUI();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }
})();
