/* ============================================================
 * src/glue.js  ·  2D/3D 切换与参数联动（任务 C 接线层）
 *
 * 职责：
 *   - 在 2D 产物（data/render/ui）之上注入「3D 实景」视图
 *   - 调 WH.model.build（B 的产物，可选）拿到模型；没有则 stub
 *   - 调 WH.view3d.mount（本任务核心）渲染；WebGL 失败自动回 2D（L3）
 *   - 切方案时重建模型并保留当前旋转角（C6）
 *   - 不碰 ui.js/render.js/data.js 的任何逻辑，只挂自己的 DOM
 * ========================================================== */
(function () {
  "use strict";

  var MODE3D = false;          // 当前是否 3D 模式
  var curCfgId = null;         // 跟踪当前方案
  var mounted = false;         // 3D 是否已 mount
  var hasModelMod = false;     // B 是否已交付
  var hasCalibMod = false;     // A 是否已交付
  var webglOK = (function () {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  })();

  function cfg() {
    var D = window.WH && window.WH.DATA;
    if (!D || !D.configs) return null;
    for (var i = 0; i < D.configs.length; i++) {
      if (D.configs[i].id === curCfgId) return D.configs[i];
    }
    return D.configs[0] || null;
  }

  function p3(c) {
    return c ? {
      span: c.span, capacity: c.capacity, railHeight: c.railHeight,
      productType: c.productType, agv: c.agv
    } : { span: 48, capacity: 2000, railHeight: 30, productType: "gantry" };
  }

  /* ---------- stub 模型（B 未交付时的降级体） ---------- */
  function stubModel(p) {
    var g = new THREE.Group();
    var mSteel = new THREE.MeshStandardMaterial({ color: 0xf0a92e, roughness: .55, metalness: .45 });
    var mTop = new THREE.MeshStandardMaterial({ color: 0xffc45e, roughness: .42, metalness: .5 });
    var mDark = new THREE.MeshStandardMaterial({ color: 0x1b3b56, roughness: .85, metalness: .2 });
    var k = Math.min(2.2, Math.max(.7, Math.sqrt(p.capacity) / 12));
    function box(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); g.add(m); return m;
    }
    [-1, 1].forEach(function (s) {
      box(1.2, p.railHeight, 1.2, mSteel, s * p.span / 2, p.railHeight / 2, -1.5);
      box(1.2, p.railHeight, 1.2, mSteel, s * p.span / 2, p.railHeight / 2, 1.5);
    });
    box(p.span + 3, 1.8 * k, 1.4 * k, mTop, 0, p.railHeight + 0.9 * k, -1.5);
    box(p.span + 3, 1.8 * k, 1.4 * k, mTop, 0, p.railHeight + 0.9 * k, 1.5);
    box(3.4 * k, 1.5 * k, 3.6 * k, mDark, 0, p.railHeight + 2.6 * k, 0);
    var ropeLen = p.railHeight * .5;
    var rope = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, ropeLen, 6), mSteel);
    rope.position.set(0, p.railHeight + 2.6 * k - ropeLen / 2, 0); g.add(rope);
    box(2.6 * k, 1.8 * k, 2.6 * k, mDark, 0, p.railHeight + 2.6 * k - ropeLen - 1 * k, 0);
    return g;
  }

  function buildModel(c) {
    var p = p3(c);
    if (hasModelMod && window.WH.model && typeof window.WH.model.build === "function") {
      try { return window.WH.model.build(p); } catch (e) { /* B 建模失败 → stub */ }
    }
    return stubModel(p);
  }

  /* ---------- DOM 注入 ---------- */
  function ensureButton() {
    var bar = document.getElementById("whModebar");
    if (!bar || document.getElementById("whModeView3d")) return;
    if (!webglOK) {
      // WebGL 不可用：不提供 3D 入口（L3 自动保持 2D）
      var tip = document.createElement("span");
      tip.style.cssText = "font-size:11px;color:#5a6b7d;margin-left:6px";
      tip.textContent = "3D 需 WebGL（当前环境不支持）";
      bar.appendChild(tip);
      return;
    }
    var b = document.createElement("button");
    b.className = "wh-seg";
    b.id = "whModeView3d";
    b.type = "button";
    b.setAttribute("data-mode", "view3d");
    b.textContent = "3D 实景";
    bar.appendChild(b);
    b.addEventListener("click", function () { enter3D(); });
    // 单图/并排按钮点下时退回 2D
    ["whModeSingle", "whModeSbs"].forEach(function (id) {
      var t = document.getElementById(id);
      if (t) t.addEventListener("click", function () { exit3D(); });
    });
  }

  function ensureContainer() {
    var stage = document.getElementById("whCompare");
    if (!stage) return null;
    var box = document.getElementById("whView3dBox");
    if (box) return box;
    box = document.createElement("div");
    box.id = "whView3dBox";
    box.style.cssText = "position:absolute;inset:0;display:none;z-index:5;background:#0b1722";
    /* 工具条 */
    var tools = document.createElement("div");
    tools.style.cssText = "position:absolute;top:10px;right:10px;z-index:8;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end";
    [["front", "正视"], ["side", "侧视"], ["top", "俯视"], ["iso", "45°"]].forEach(function (it) {
      var bt = document.createElement("button");
      bt.textContent = it[1];
      bt.style.cssText = btnCss();
      bt.addEventListener("click", function () { window.WH.view3d.preset(it[0]); });
      tools.appendChild(bt);
    });
    var ex = document.createElement("button");
    ex.textContent = "导出 PNG";
    ex.style.cssText = btnCss() + "color:#ffd27a;border-color:#f0a92e";
    ex.addEventListener("click", exportPNG);
    tools.appendChild(ex);
    box.appendChild(tools);
    var holder = document.createElement("div");
    holder.id = "whView3dHolder";
    holder.style.cssText = "position:absolute;inset:0";
    box.appendChild(holder);
    var hint = document.createElement("div");
    hint.style.cssText = "position:absolute;left:10px;bottom:8px;z-index:8;font-size:11px;color:#5a6b7d;pointer-events:none";
    hint.textContent = "左右拖=360°旋转 · 上下拖=俯仰±20° · 滚轮/双指=缩放 · 双击=复位";
    box.appendChild(hint);
    stage.appendChild(box);
    return box;
  }

  function btnCss() {
    return "background:#16222f;border:1px solid #2c3a4a;color:#cfd8e3;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px";
  }

  function exportPNG() {
    try {
      var url = window.WH.view3d.exportPNG();
      var a = document.createElement("a");
      a.href = url;
      a.download = "场景71_实景效果图_" + (curCfgId || "") + ".png";
      a.click();
    } catch (e) { /* 导出失败静默 */ }
  }

  /* ---------- 进入 / 退出 3D ---------- */
  function setActiveBtn() {
    var b = document.getElementById("whModeView3d");
    if (b) b.classList.toggle("active", MODE3D);
  }

  function enter3D() {
    if (MODE3D || !webglOK) return;
    var box = ensureContainer();
    if (!box) return;
    MODE3D = true;
    setActiveBtn();
    ["whBefore", "whAfter", "whScan", "whHandle", "whRange", "whLegend"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    box.style.display = "block";
    var holder = document.getElementById("whView3dHolder");
    var c = cfg();
    try {
      window.WH.view3d.mount(holder, {
        photo: null,           // A 未接线时降级示意地面（L2）
        model: buildModel(c),
        calib: hasCalibMod ? (window.WH.calib && window.WH.calib._last) || null : null,
        params: p3(c),
        onChange: function () {}
      });
      mounted = true;
    } catch (e) {
      /* L3：3D 失败自动回 2D */
      MODE3D = false;
      setActiveBtn();
      exit3D();
      box.style.display = "none";
      var tip = document.createElement("div");
      tip.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f5a524;font-size:14px;z-index:9";
      tip.textContent = "3D 初始化失败，已回退 2D 视图";
      box.parentNode.appendChild(tip);
      setTimeout(function () { tip.remove(); }, 2500);
    }
  }

  function exit3D() {
    if (!MODE3D) return;
    MODE3D = false;
    setActiveBtn();
    var box = document.getElementById("whView3dBox");
    if (box) box.style.display = "none";
    if (mounted) { window.WH.view3d.dispose(); mounted = false; }
    ["whBefore", "whAfter", "whScan", "whHandle", "whRange", "whLegend"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "";
    });
  }

  /* ---------- 参数联动（C6）：切方案 → 重建模型，保留角度 ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target;
    while (b && b !== document) {
      if (b.classList && b.classList.contains("wh-scheme")) {
        var id = b.getAttribute("data-id");
        if (id && id !== curCfgId) {
          curCfgId = id;
          if (MODE3D && mounted) {
            window.WH.view3d.replaceModel(buildModel(cfg()));
          }
        }
        return;
      }
      b = b.parentNode;
    }
  }, true);

  /* ---------- 启动（ui.js 初始化完成后） ---------- */
  function boot() {
    hasModelMod = !!(window.WH && window.WH.model && typeof window.WH.model.build === "function");
    hasCalibMod = !!(window.WH && window.WH.calib);
    var D = window.WH && window.WH.DATA;
    curCfgId = (D && D.configs && D.configs[0] && D.configs[0].id) || null;
    ensureButton();
    window.__scene71_3d = { enter: enter3D, exit: exit3D, state: function () { return { mode3d: MODE3D, mounted: mounted, cfg: curCfgId, webgl: webglOK }; } };
  }

  if (document.readyState === "complete") {
    setTimeout(boot, 0);
  } else {
    window.addEventListener("load", function () { setTimeout(boot, 50); });
  }
})();
