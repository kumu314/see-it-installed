/* ============================================================
 * src/glue.js  ·  2D/3D 接线层
 *
 * 职责（W1 后）：
 *   - 只听 wh71:config 一个事件拿当前方案（与 ui.js 同一份已提交状态）
 *   - 只听 wh71:viewmode 一个事件决定 2D / 3D 展示
 *   - 3D 内部工具：方向预设 / 完整显示 / 旋转演示 / 导出
 *   - WebGL 不可用 → 回 2D，并把这个结果回报给 ui（不静默）
 *
 * 契约：不直接读写 ui.js 内部变量，不自己再存一份「当前方案」。
 * ========================================================== */
(function () {
  'use strict';

  var MODE3D = false;
  var curCfg = null;           // 由 wh71:config 推送的已提交方案快照
  var revision = 0;
  var mounted = false;
  var pendingView = null;      // 等待 UI 就绪时缓存的视图请求
  var webglOK = (function () {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  })();

  function p3(c) {
    return c ? {
      span: c.span, capacity: c.capacity, railHeight: c.railHeight,
      productType: c.productType, agv: c.agv
    } : { span: 48, capacity: 2000, railHeight: 30, productType: 'gantry' };
  }

  /* ---------- stub 模型（model.js 未交付时的降级体） ---------- */
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
    if (window.WH.model && typeof window.WH.model.build === 'function') {
      try {
        var g = window.WH.model.build(p);
        if (g) return g;
      } catch (e) { /* 建模失败 → stub，并在状态条标注 */ }
    }
    return stubModel(p);
  }

  /* ---------- 3D 容器（工具条 + 画布槽） ---------- */
  function btnCss(extra) {
    return 'background:#16222f;border:1px solid #2c3a4a;color:#cfd8e3;padding:8px 12px;min-height:40px;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit' + (extra || '');
  }
  function mkBtn(txt, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = txt;
    if (title) b.title = title;
    b.style.cssText = btnCss();
    return b;
  }

  function ensureContainer() {
    var stage = document.getElementById('whCompare');
    if (!stage) return null;
    var box = document.getElementById('whView3dBox');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'whView3dBox';
    box.style.cssText = 'position:absolute;inset:0;display:none;z-index:5;background:#0b1722';

    var tools = document.createElement('div');
    tools.id = 'wh3dTools';
    tools.style.cssText = 'position:absolute;top:10px;right:10px;z-index:8;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 20px)';

    [['front', '正视'], ['side', '侧视'], ['top', '俯视'], ['iso', '45°']].forEach(function (it) {
      var bt = mkBtn(it[1], '切换到' + it[1] + '方向');
      bt.addEventListener('click', function () {
        if (window.WH.view3d) window.WH.view3d.preset(it[0]);
      });
      tools.appendChild(bt);
    });

    var fitBtn = mkBtn('完整显示', '按模型包围盒重新取景');
    fitBtn.id = 'wh3dFit';
    fitBtn.addEventListener('click', function () {
      var v = window.WH.view3d;
      if (!v) return;
      if (typeof v.fit === 'function') v.fit();
      else { v.preset('iso'); v.setOrbit({ radius: 1 }); }
    });
    tools.appendChild(fitBtn);

    var orbitBtn = mkBtn('旋转演示', '自动环绕，可随时停止');
    orbitBtn.id = 'wh3dOrbit';
    orbitBtn.setAttribute('aria-pressed', 'false');
    orbitBtn.addEventListener('click', function () {
      var v = window.WH.view3d;
      if (!v || typeof v.setAutoRotate !== 'function') return;
      var enabled = !v.isAutoRotate();
      v.setAutoRotate(enabled);
      orbitBtn.setAttribute('aria-pressed', String(enabled));
      orbitBtn.textContent = enabled ? '停止旋转' : '旋转演示';
      orbitBtn.style.borderColor = enabled ? '#f0a92e' : '#2c3a4a';
      orbitBtn.style.color = enabled ? '#ffd27a' : '#cfd8e3';
      document.dispatchEvent(new CustomEvent('wh71:motion-state', { detail: { rotating: enabled } }));
    });
    tools.appendChild(orbitBtn);

    var ex = mkBtn('导出', '导出当前 3D 画面（沟通示意）');
    ex.style.cssText = btnCss(';color:#ffd27a;border-color:#f0a92e');
    ex.addEventListener('click', function () {
      if (window.WH.__openExport) window.WH.__openExport();
    });
    tools.appendChild(ex);

    box.appendChild(tools);

    var holder = document.createElement('div');
    holder.id = 'whView3dHolder';
    holder.style.cssText = 'position:absolute;inset:0';
    box.appendChild(holder);

    var hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:10px;bottom:8px;z-index:8;font-size:11px;color:#5a6b7d;pointer-events:none';
    hint.textContent = '左右拖=360°旋转 · 上下拖=俯仰±20° · 滚轮/双指=缩放 · 双击=复位';
    box.appendChild(hint);

    stage.appendChild(box);
    return box;
  }

  function setActiveBtn() {
    var b = document.getElementById('whModeModel');
    if (b) { b.classList.toggle('active', MODE3D); b.setAttribute('aria-pressed', MODE3D ? 'true' : 'false'); }
  }

  /* ---------- 进入 / 退出 3D ---------- */
  function enter3D() {
    if (MODE3D) return true;
    if (!webglOK) return false;
    var box = ensureContainer();
    if (!box) return false;
    ['whBefore', 'whAfter', 'whScan', 'whHandle', 'whRange', 'whLegend'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    box.style.display = 'block';
    MODE3D = true;
    setActiveBtn();
    var holder = document.getElementById('whView3dHolder');
    try {
      window.WH.view3d.mount(holder, {
        photo: window.WH.__photo || null,
        model: buildModel(curCfg),
        calib: window.WH.__calib || null,
        params: p3(curCfg),
        onChange: function () {}
      });
      mounted = true;
      var orbit = document.getElementById('wh3dOrbit');
      if (orbit) {
        orbit.setAttribute('aria-pressed', 'false');
        orbit.textContent = '旋转演示';
        orbit.style.borderColor = '#2c3a4a';
        orbit.style.color = '#cfd8e3';
      }
      document.dispatchEvent(new CustomEvent('wh71:3d-mounted', { detail: { id: curCfg && curCfg.id } }));
      document.dispatchEvent(new CustomEvent('wh71:viewmode-changed', { detail: { mode: 'model' } }));
      return true;
    } catch (e) {
      MODE3D = false;
      mounted = false;
      setActiveBtn();
      box.style.display = 'none';
      ['whBefore', 'whAfter', 'whScan', 'whHandle', 'whRange', 'whLegend'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = '';
      });
      document.dispatchEvent(new CustomEvent('wh71:viewmode-changed', { detail: { mode: 'diagram' } }));
      document.dispatchEvent(new CustomEvent('wh71:3d-error', { detail: { message: (e && e.message) || '3D 初始化失败' } }));
      return false;
    }
  }

  function exit3D() {
    if (!MODE3D) return;
    MODE3D = false;
    setActiveBtn();
    var box = document.getElementById('whView3dBox');
    if (box) box.style.display = 'none';
    if (mounted && window.WH.view3d) {
      try { window.WH.view3d.dispose(); } catch (e) { /* 忽略 */ }
      mounted = false;
    }
    ['whBefore', 'whAfter', 'whScan', 'whHandle', 'whRange', 'whLegend'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = '';
    });
    document.dispatchEvent(new CustomEvent('wh71:viewmode-changed', { detail: { mode: 'diagram' } }));
  }

  /* ---------- 与 2D 层的事件契约 ---------- */
  document.addEventListener('wh71:config', function (e) {
    var d = (e && e.detail) || {};
    if (!d.config) return;
    curCfg = d.config;
    revision = d.revision || 0;
    if (MODE3D && mounted && window.WH.view3d) {
      try {
        window.WH.view3d.replaceModel(buildModel(curCfg));
        document.dispatchEvent(new CustomEvent('wh71:model-updated', { detail: { id: curCfg.id, revision: revision } }));
      } catch (err) {
        document.dispatchEvent(new CustomEvent('wh71:3d-error', { detail: { message: '模型重建失败：' + err.message } }));
      }
    }
  });

  document.addEventListener('wh71:viewmode', function (e) {
    var m = e && e.detail && e.detail.mode;
    if (m === 'model') {
      if (!enter3D()) {
        document.dispatchEvent(new CustomEvent('wh71:3d-error', { detail: { message: webglOK ? '3D 容器未就绪' : '当前浏览器不支持 WebGL，已保持 2D' } }));
      }
    } else {
      exit3D();
    }
  });

  // 全局暂停：停掉旋转（F12：一个按钮停全部动效）
  document.addEventListener('wh71:pause', function () {
    var v = window.WH.view3d;
    if (v && MODE3D && typeof v.setAutoRotate === 'function') {
      v.setAutoRotate(false);
      var orbit = document.getElementById('wh3dOrbit');
      if (orbit) { orbit.setAttribute('aria-pressed', 'false'); orbit.textContent = '旋转演示'; orbit.style.borderColor = '#2c3a4a'; orbit.style.color = '#cfd8e3'; }
    }
  });

  document.addEventListener('wh71:photo-calibrated', function (e) {
    window.WH.__photo = e.detail.photo;
    window.WH.__calib = e.detail.calib;
  });

  /* ---------- 对外：照片 / 导出（供 2D 外壳调用） ---------- */
  window.WH.photo = {
    // 照片入口在主面板；标定必须挂在已挂载的 3D 视图上
    open: function () {
      if (!webglOK) return { ok: false, reason: '当前浏览器不支持 WebGL，无法启用实景照片' };
      if (!window.WH.calib || typeof window.WH.calib.fromQuad !== 'function') {
        return { ok: false, reason: '标定模块未加载' };
      }
      if (!MODE3D) {
        var ok = enter3D();
        if (!ok) return { ok: false, reason: '3D 初始化失败' };
      }
      if (window.WH.calibUI) { window.WH.calibUI.open(); return { ok: true }; }
      return { ok: false, reason: '标定弹层未就绪' };
    }
  };

  window.WH.export3d = function () {
    if (!MODE3D || !mounted || !window.WH.view3d) return null;
    return window.WH.view3d.exportPNG();
  };

  /* ---------- 启动 ---------- */
  function boot() {
    var D = window.WH && window.WH.DATA;
    if (D && D.configs && D.configs[0] && !curCfg) curCfg = D.configs[0];
    var modelBtn = document.getElementById('whModeModel');
    if (modelBtn && !webglOK) {
      modelBtn.disabled = true;
      modelBtn.title = '当前浏览器不支持 WebGL，仅保留 2D 视图';
    }
    ensureContainer();
    window.__scene71_3d = {
      enter: enter3D,
      exit: exit3D,
      state: function () {
        var st = (mounted && window.WH.view3d) ? null : null;
        return {
          mode3d: MODE3D, mounted: mounted, cfg: curCfg && curCfg.id,
          revision: revision, webgl: webglOK,
          model: (function () {
            var h = document.getElementById('whView3dHolder');
            var v = h && h.__view3d;
            return v && v._st && v._st.modelGroup ? v._st.modelGroup.uuid : null;
          })()
        };
      }
    };
    if (pendingView) { var pv = pendingView; pendingView = null; if (pv === 'model') enter3D(); }
    document.dispatchEvent(new CustomEvent('wh71:glue-ready'));
  }

  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', function () { setTimeout(boot, 30); });
})();