/* ============================================================
 * src/ui.js  ·  队友 A 负责
 *
 * 职责：对比滑块、四步进度、参数卡、方案切换、改需求桥段、
 *       播放 / 跳过 / 全屏、一页说明。
 * 契约：WH.initUI() 自动调用一次；只读 WH.DATA，只调 WH.renderScene。
 * 详见 CONTRACT.md 第 5 节。
 *
 * ⚠️ 当前是「降级占位实现」，能跑但粗糙，队友 A 请按 BRIEF 第 3 节重做。
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};
  var D = window.WH.DATA;
  var cur = 0, T = [];

  function q(s) { return document.querySelector(s); }
  function at(ms, fn) { T.push(setTimeout(fn, ms)); }
  function clr() { T.forEach(clearTimeout); T = []; }
  function cfg() { return D.configs[cur]; }
  function fmt(c) {
    return { span: c.span.toFixed(1), railHeight: c.railHeight.toFixed(1), duty: c.duty, renderSec: c.renderSec };
  }
  function stepText(tpl, c) {
    var v = fmt(c);
    return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return v[k] !== undefined ? v[k] : ""; });
  }

  /* ---------- 结构 ---------- */
  function build() {
    var app = q("#app");
    app.innerHTML =
      '<div class="card left">' +
        '<div class="cap">客户现场照片 → AI 安装效果图（示意）</div>' +
        '<div class="compare" id="cmp" style="--pos:50%"></div>' +
        '<input class="slider" id="pos" type="range" min="0" max="100" value="50">' +
        '<div class="steps" id="steps"></div>' +
        '<div class="row">' +
          '<button class="btn p" id="play">▶ 播放演示</button>' +
          '<button class="btn" id="skip">跳过动画</button>' +
          '<button class="btn" id="full">全屏</button>' +
        '</div>' +
      '</div>' +
      '<div class="card right">' +
        '<div class="cap">方案参数</div>' +
        '<div id="params"></div>' +
        '<div class="cfg" id="cfg"></div>' +
        '<button class="btn rerender" id="btnRerender"></button>' +
        '<div class="badge" id="badge"></div>' +
        '<div class="brief" id="brief"></div>' +
      '</div>';

    /* 四步 */
    q("#steps").innerHTML = D.steps.map(function (s, i) {
      return '<div class="step" data-i="' + i + '"><b>' + (i + 1) + "</b><span>" + s.t + "</span></div>";
    }).join("");

    /* 方案按钮 */
    q("#cfg").innerHTML = D.configs.map(function (c, i) {
      return '<button data-i="' + i + '">' + c.id + " · " + c.capacity + "t</button>";
    }).join("");

    q("#btnRerender").textContent = D.rerender.label;
    q("#brief").innerHTML = "<b>问题</b>　" + D.brief.problem + "<br><b>价值</b>　" + D.brief.value +
      '<div class="note">' + D.meta.disclaimer + "</div>";

    bind();
  }

  /* ---------- 渲染 ---------- */
  function draw(animateSteps) {
    var c = cfg();
    var before = WH.renderScene({ span: c.span, capacity: c.capacity, railHeight: c.railHeight, duty: c.duty, agv: c.agv, bayType: c.bayType, mode: "before" });
    var after = WH.renderScene({ span: c.span, capacity: c.capacity, railHeight: c.railHeight, duty: c.duty, agv: c.agv, bayType: c.bayType, mode: "after" });
    q("#cmp").innerHTML =
      '<div class="layer before">' + before + "</div>" +
      '<div class="layer after">' + after + "</div>" +
      '<div class="beam" id="beam"></div>' +
      '<span class="tag l">BEFORE · 现场</span><span class="tag r">AFTER · AI 效果图</span>' +
      '<div class="handle"></div>';

    /* 参数卡 7 值 */
    var rows = [
      ["设备型号", c.model], ["厂房跨度", c.span.toFixed(1) + " m"], ["起重量", c.capacity + " t"],
      ["轨顶标高", c.railHeight.toFixed(1) + " m"], ["工作级别", c.duty],
      ["搬运配置", c.agv ? "AGV × " + c.agv : "无 AGV"], ["出图用时", c.renderSec + " s"]
    ];
    q("#params").innerHTML = rows.map(function (r) {
      return '<div class="param"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>";
    }).join("");

    /* 四步文案（替换占位符） */
    D.steps.forEach(function (s, i) {
      var el = document.querySelector('.step[data-i="' + i + '"] span');
      if (el) el.textContent = stepText(s.t, c);
      var d = document.querySelector('.step[data-i="' + i + '"]');
      if (d) d.title = stepText(s.d, c);
    });

    $$("#cfg button").forEach(function (b, i) { b.classList.toggle("on", i === cur); });
    q("#badge").classList.remove("on");

    if (animateSteps) playSteps();
    else setSteps(true);
  }
  function $$(s) { return [].slice.call(document.querySelectorAll(s)); }

  function setSteps(all) {
    $$(".step").forEach(function (s) { s.classList.toggle("on", !!all); });
  }
  function playSteps() {
    clr(); setSteps(false);
    var i = 0;
    (function next() {
      if (i >= 4) return;
      at(420, function () {
        $$(".step")[i].classList.add("on");
        i++;
        if (i === 4) at(220, sweep);
        next();
      });
    })();
  }
  function sweep() {
    var b = q("#beam"); if (!b) return;
    b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
  }

  /* ---------- 播放 / 跳过 ---------- */
  function play() {
    clr(); draw(false); setSteps(false);
    q("#cmp").style.setProperty("--pos", "50%"); q("#pos").value = 50;
    at(260, playSteps);
    at(2200, function () { slide(50, 18); });
    at(3400, function () { slide(18, 82); });
    at(4400, function () { slide(82, 50); });
  }
  function slide(from, to) {
    var st = performance.now(), dur = 900;
    (function step(now) {
      var p = Math.min(1, (now - st) / dur), v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      q("#cmp").style.setProperty("--pos", v + "%"); q("#pos").value = Math.round(v);
      if (p < 1) requestAnimationFrame(step);
    })(st);
  }
  function skip() {
    clr(); draw(false); setSteps(true); sweep();
    q("#cmp").style.setProperty("--pos", "12%"); q("#pos").value = 12;
    q("#badge").textContent = "已显示终态"; q("#badge").classList.add("on");
  }

  /* ---------- 改需求 ---------- */
  function rerender() {
    clr();
    var t = D.configs.filter(function (c) { return c.id === D.rerender.target; })[0];
    var idx = D.configs.indexOf(t);
    if (idx < 0) return;
    q("#badge").textContent = "正在按新需求重出图…"; q("#badge").classList.add("on");
    at(260, function () { cur = idx; draw(false); setSteps(false); });
    at(700, function () { setSteps(true); sweep(); });
    at(1100, function () {
      q("#badge").textContent = D.rerender.done;
      q("#cmp").style.setProperty("--pos", "12%"); q("#pos").value = 12;
    });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    q("#play").addEventListener("click", play);
    q("#skip").addEventListener("click", skip);
    q("#full").addEventListener("click", function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    });
    q("#pos").addEventListener("input", function (e) { clr(); q("#cmp").style.setProperty("--pos", e.target.value + "%"); });
    q("#cfg").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      cur = Number(b.dataset.i); clr(); draw(false); sweep();
    });
    q("#btnRerender").addEventListener("click", rerender);
    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT") return;
      if (e.key === " ") { e.preventDefault(); play(); }
      else if (e.key === "f" || e.key === "F") q("#full").click();
      else if (e.key === "Escape") location.reload();
    });
  }

  var booted = false, tries = 0;
  window.WH.initUI = function () {
    if (booted) return;
    if (!document.getElementById("app")) { if (++tries < 200) setTimeout(window.WH.initUI, 30); return; }
    booted = true;
    build(); draw(false);
  };

  /* 兼容两种加载场景：正常 file:// 打开，以及 CDP setDocumentContent 注入
     （后者 readyState 可能停在 loading 且不再触发 DOMContentLoaded） */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { window.WH.initUI(); });
    setTimeout(function () { window.WH.initUI(); }, 0);
  } else {
    window.WH.initUI();
  }
})();
