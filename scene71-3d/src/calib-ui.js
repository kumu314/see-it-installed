/* ============================================================
 * src/calib-ui.js  ·  现场照片标定任务区
 *
 * W4 要点：
 *   - 模态焦点约束：Tab/Shift+Tab 循环、背景 inert、关闭后焦点回到触发入口（F03）
 *   - 快捷键作用域：弹层打开时背景快捷键失效（F02）
 *   - 步骤状态：选择照片 → 标记角点 → 输入边长 → 应用
 *   - 单点纠错：撤销上一点、点选编号后重点替换、重选全部（F10）
 *   - 状态常驻：已选 n/4、已知边 1→2、图片名与像素尺寸
 * ========================================================== */
(function () {
  'use strict';
  window.WH = window.WH || {};

  var overlay = null, activeURL = null, resizeObserver = null, resizeTimer = null;
  var activePhoto = null, activeCalib = null, lastSize = '', returnFocus = null;

  function toast(message) {
    var old = document.getElementById('whCalibToast');
    if (old) old.remove();
    var tip = document.createElement('div');
    tip.id = 'whCalibToast';
    tip.setAttribute('role', 'status');
    tip.textContent = message;
    tip.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:10001;padding:12px 18px;border-radius:8px;background:#243946;color:#fff;max-width:90vw;font-size:14px';
    document.body.appendChild(tip);
    setTimeout(function () { tip.remove(); }, 3600);
  }

  function holder() { return document.getElementById('whView3dHolder'); }
  function mounted() { var h = holder(); return !!(h && h.__view3d); }

  function fitCalib(c, img, el) {
    var imageAspect = img.naturalWidth / img.naturalHeight;
    var viewportAspect = el.clientWidth / el.clientHeight;
    var factor = Math.min(1, imageAspect / viewportAspect);
    var adjusted = 2 * Math.atan(Math.tan(c.camera.fov * Math.PI / 360) * factor) * 180 / Math.PI;
    return Object.assign({}, c, { camera: Object.assign({}, c.camera, { fov: adjusted }) });
  }

  function setPhotoAndReleasePrevious(view, img, c, el) {
    var st = el.__view3d && el.__view3d._st, scene = st && st.modelGroup && st.modelGroup.parent;
    var previous = scene && scene.background;
    view.setPhoto(img, fitCalib(c, img, el));
    if (previous && previous.isTexture && scene.background !== previous && typeof previous.dispose === 'function') previous.dispose();
  }

  function refit() {
    var el = holder(), view = window.WH.view3d;
    if (!activePhoto || !activeCalib || !el || !el.clientWidth || !el.clientHeight) { lastSize = ''; return; }
    if (!el.__view3d || !el.__view3d._st || !el.__view3d._st.photoMode || !view || typeof view.setPhoto !== 'function') return;
    var size = el.clientWidth + 'x' + el.clientHeight;
    if (size === lastSize) return;
    lastSize = size;
    setPhotoAndReleasePrevious(view, activePhoto, activeCalib, el);
  }

  function watchViewport() {
    if (resizeObserver) resizeObserver.disconnect();
    var el = holder();
    if (!el) return;
    lastSize = el.clientWidth + 'x' + el.clientHeight;
    if (typeof ResizeObserver === 'function') { resizeObserver = new ResizeObserver(scheduleRefit); resizeObserver.observe(el); }
    else { window.removeEventListener('resize', scheduleRefit); window.addEventListener('resize', scheduleRefit); }
  }
  function scheduleRefit() { clearTimeout(resizeTimer); resizeTimer = setTimeout(refit, 120); }
  document.addEventListener('wh71:3d-mounted', function () { lastSize = ''; scheduleRefit(); });

  /* ---------- 模态隔离 ---------- */
  function setBackgroundInert(on) {
    var app = document.getElementById('app');
    if (!app) return;
    if (on) {
      app.setAttribute('inert', '');
      app.setAttribute('aria-hidden', 'true');
    } else {
      app.removeAttribute('inert');
      app.removeAttribute('aria-hidden');
    }
  }

  var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function open() {
    if (overlay) return;
    var oldToast = document.getElementById('whCalibToast');
    if (oldToast) oldToast.remove();
    if (!window.WH.calib || typeof window.WH.calib.fromQuad !== 'function') { toast('标定模块未加载'); return; }
    if (!mounted() || !window.WH.view3d || typeof window.WH.view3d.setPhoto !== 'function') {
      toast('3D 视图未就绪，请稍后重试');
      return;
    }

    returnFocus = document.activeElement;
    var img = new Image(), points = [], tempURL = null, replaceIndex = -1, committed = false;
    var root = document.createElement('div');
    overlay = root;
    root.id = 'whCalibOverlay';
    root.setAttribute('data-wh-modal', '1');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '现场照片标定');

    root.innerHTML = [
      '<style>',
      '#whCalibOverlay{position:fixed;inset:0;z-index:9999;background:rgba(5,10,18,.97);color:#dce8ee;font:15px "Microsoft YaHei",sans-serif;display:flex;flex-direction:column;overflow:auto}',
      '#whCalibOverlay *{box-sizing:border-box}',
      '#whCalibOverlay .cal-head{padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #30404a;background:#0b141b}',
      '#whCalibOverlay h2{font-size:18px;margin:0}',
      '#whCalibOverlay .cal-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
      '#whCalibOverlay .cal-step{font-size:12px;padding:4px 10px;border-radius:999px;background:#12202a;border:1px solid #2b3d4a;color:#7d93a3}',
      '#whCalibOverlay .cal-step.on{background:#2a2312;border-color:#f0a92e;color:#ffd27a}',
      '#whCalibOverlay .cal-step.done{color:#69d7ad;border-color:rgba(105,215,173,.45)}',
      '#whCalibOverlay .cal-body{width:min(1100px,100%);margin:auto;padding:16px;display:flex;flex-direction:column;gap:12px;flex:1}',
      '#whCalibOverlay p{margin:0;line-height:1.5;color:#a8b6c6}',
      '#whCalibOverlay .photo{position:relative;margin:auto;max-width:100%;max-height:62vh;line-height:0;background:#050a12;border:1px solid #24333f;border-radius:8px;overflow:hidden}',
      '#whCalibOverlay img{display:block;max-width:100%;max-height:62vh;width:auto;height:auto}',
      '#whCalibOverlay canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}',
      '#whCalibOverlay .cal-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '#whCalibOverlay button,#whCalibOverlay input{min-height:44px;border-radius:8px;font:inherit}',
      '#whCalibOverlay button{background:#172b38;color:#e2eef3;border:1px solid #577482;padding:8px 16px;cursor:pointer}',
      '#whCalibOverlay button:hover:not(:disabled){background:#1e3746}',
      '#whCalibOverlay button:disabled{opacity:.45;cursor:not-allowed}',
      '#whCalibOverlay button.primary{background:#f0a92e;color:#111;border-color:#f0a92e;font-weight:bold}',
      '#whCalibOverlay input[type=number]{width:120px;background:#101d26;color:white;border:1px solid #577482;padding:8px}',
      '#whCalibOverlay .cal-side{display:flex;flex-direction:column;gap:10px;padding:14px;background:#101a22;border:1px solid #24333f;border-radius:10px;min-width:220px;max-width:280px}',
      '#whCalibOverlay .cal-side h3{margin:0;font-size:14px;color:#ffd27a}',
      '#whCalibOverlay .cal-side .k{font-size:12px;color:#7d93a3}',
      '#whCalibOverlay .cal-side .v{font-size:14px;color:#e8eef5;font-variant-numeric:tabular-nums}',
      '#whCalibOverlay .cal-main{display:flex;gap:14px;align-items:stretch;flex-wrap:wrap}',
      '#whCalibOverlay [hidden]{display:none!important}',
      '#whCalibOverlay .cal-err{color:#ff9b9b;min-height:22px;font-size:13px}',
      '#whCalibOverlay .cal-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 20px;border-top:1px solid #30404a;background:#0b141b;position:sticky;bottom:0}',
      '#whCalibOverlay :focus-visible{outline:2px solid #6ec8fa;outline-offset:2px}',
      '</style>',
      '<header class="cal-head"><div><h2>现场照片标定</h2>',
      '<div class="cal-steps" id="calSteps">',
      '<span class="cal-step on" data-s="1">① 选择照片</span>',
      '<span class="cal-step" data-s="2">② 标记角点</span>',
      '<span class="cal-step" data-s="3">③ 输入边长</span>',
      '<span class="cal-step" data-s="4">④ 应用</span>',
      '</div></div>',
      '<button type="button" id="whCalibClose" aria-label="关闭标定">关闭</button></header>',
      '<div class="cal-body">',
      '<p>在地面上选一块清晰的矩形区域：现实中相邻边互相垂直，照片里通常呈梯形。从任意一角开始按 <b>顺时针</b> 依次点 4 个角，第 1→2 点那条边填真实长度（米）。</p>',
      '<div class="cal-bar"><button type="button" id="whCalibChoose">选择照片</button>',
      '<input type="file" id="whCalibFile" accept="image/jpeg,image/png,image/webp" hidden>',
      '<span class="k" id="whCalibFileInfo" style="font-size:12px;color:#7d93a3">未选择照片</span></div>',
      '<div class="cal-main">',
      '<div class="photo" id="whCalibPhoto" hidden><img id="whCalibImage" alt="待标定现场照片"><canvas id="whCalibCanvas" aria-label="点击照片标记四个地面角点"></canvas></div>',
      '<div class="cal-side">',
      '<h3 id="calHint">标记第 1 个角点</h3>',
      '<div><div class="k">已选角点</div><div class="v" id="whCalibCount">0 / 4</div></div>',
      '<div><div class="k">已知边（第 1 → 2 点）</div><div class="v" id="calEdge">待 4 点齐全</div></div>',
      '<div><div class="k">操作</div><div class="v" style="font-size:13px;line-height:1.5">点号可再次点击选中，再点新位置即可替换；也可用下方按钮撤销。</div></div>',
      '</div></div>',
      '<div class="cal-bar" id="whCalibLengthControls" hidden>',
      '<label>已知边长（米） <input type="number" id="whCalibLength" min="0.01" max="500" step="0.1" value="6"></label>',
      '<button type="button" class="primary" id="whCalibApply">开始标定并应用</button>',
      '</div>',
      '<div class="cal-err" id="whCalibError" role="alert"></div>',
      '</div>',
      '<footer class="cal-foot">',
      '<span id="whCalibStatus" style="font-size:13px;color:#7d93a3">等待选择照片</span>',
      '<button type="button" id="whCalibUndo" disabled style="margin-left:auto">撤销上一点</button>',
      '<button type="button" id="whCalibReset" disabled>重选全部</button>',
      '<button type="button" class="primary" id="whCalibDone" disabled>完成</button>',
      '</footer>'
    ].join('');

    document.body.appendChild(root);
    setBackgroundInert(true);

    var file = root.querySelector('#whCalibFile'),
        picture = root.querySelector('#whCalibPhoto'),
        image = root.querySelector('#whCalibImage'),
        canvas = root.querySelector('#whCalibCanvas'),
        reset = root.querySelector('#whCalibReset'),
        undo = root.querySelector('#whCalibUndo'),
        doneBtn = root.querySelector('#whCalibDone'),
        controls = root.querySelector('#whCalibLengthControls'),
        error = root.querySelector('#whCalibError'),
        count = root.querySelector('#whCalibCount'),
        status = root.querySelector('#whCalibStatus'),
        hint = root.querySelector('#calHint'),
        edge = root.querySelector('#calEdge'),
        fileInfo = root.querySelector('#whCalibFileInfo');

    function steps(n) {
      root.querySelectorAll('.cal-step').forEach(function (el) {
        var s = Number(el.getAttribute('data-s'));
        el.classList.toggle('on', s === n);
        el.classList.toggle('done', s < n);
      });
    }

    function syncUI() {
      count.textContent = points.length + ' / 4';
      undo.disabled = points.length === 0;
      reset.disabled = points.length === 0;
      doneBtn.disabled = !committed;
      controls.hidden = points.length !== 4;
      var n = points.length;
      if (n === 0) { hint.textContent = '标记第 1 个角点'; steps(file.hidden ? 1 : 2); }
      else if (n < 4) { hint.textContent = '标记第 ' + (n + 1) + ' 个角点（顺时针）'; steps(2); }
      else { hint.textContent = '4 点已齐全，填入已知边长后应用'; steps(3); }
      edge.textContent = n >= 2 ? '第 1 → 2 点（第 3 步填入）' : '待 4 点齐全';
      status.textContent = n === 0 ? (file.hidden ? '等待选择照片' : '已选 0 / 4 个角点') : '已选 ' + n + ' / 4 个角点';
    }

    function close() {
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', draw);
      if (tempURL && !committed) URL.revokeObjectURL(tempURL);
      if (overlay === root) overlay = null;
      root.remove();
      setBackgroundInert(false);
      var back = returnFocus;
      returnFocus = null;
      if (back && typeof back.focus === 'function' && document.contains(back)) {
        try { back.focus(); } catch (e) { /* 忽略 */ }
      }
      document.dispatchEvent(new CustomEvent('wh71:modal-closed', { detail: { name: 'calib' } }));
    }

    function focusables() {
      return Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE)).filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
    }

    function keydown(e) {
      // 捕获阶段拦住，背景快捷键不再生效（F02）
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function draw() {
      if (picture.hidden || !img.naturalWidth) return;
      var rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      var ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      var x = rect.width / img.naturalWidth, y = rect.height / img.naturalHeight;
      if (points.length > 1) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#f0a92e';
        ctx.beginPath(); ctx.moveTo(points[0].x * x, points[0].y * y); ctx.lineTo(points[1].x * x, points[1].y * y); ctx.stroke();
        ctx.strokeStyle = '#5aa9c9';
        ctx.beginPath(); ctx.moveTo(points[1].x * x, points[1].y * y);
        for (var i = 2; i < points.length; i++) ctx.lineTo(points[i].x * x, points[i].y * y);
        if (points.length === 4) ctx.lineTo(points[0].x * x, points[0].y * y);
        ctx.stroke();
      }
      points.forEach(function (pt, i) {
        var cx = pt.x * x, cy = pt.y * y;
        ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fillStyle = (i === replaceIndex) ? '#6ec8fa' : '#f0a92e';
        ctx.fill();
        ctx.strokeStyle = '#0b141b'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#17222a'; ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), cx, cy);
      });
    }

    root.querySelector('#whCalibClose').addEventListener('click', close);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', draw);
    document.dispatchEvent(new CustomEvent('wh71:modal-open', { detail: { name: 'calib' } }));

    root.querySelector('#whCalibChoose').addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (!f.type || ['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) === -1) {
        error.textContent = '仅支持 JPEG / PNG / WebP 照片，请重新选择';
        return;
      }
      if (tempURL) URL.revokeObjectURL(tempURL);
      tempURL = URL.createObjectURL(f);
      img.onload = function () {
        img.__whName = f.name;
        image.src = tempURL;
        picture.hidden = false;
        points.length = 0; replaceIndex = -1; committed = false;
        error.textContent = '';
        fileInfo.textContent = f.name + ' · ' + img.naturalWidth + '×' + img.naturalHeight + ' px';
        syncUI();
        requestAnimationFrame(draw);
      };
      img.onerror = function () { error.textContent = '图片无法解码，请换一张照片'; };
      img.src = tempURL;
    });

    reset.addEventListener('click', function () {
      points.length = 0; replaceIndex = -1; committed = false;
      error.textContent = ''; syncUI(); draw();
    });
    undo.addEventListener('click', function () {
      if (!points.length) return;
      points.pop(); replaceIndex = -1; committed = false; error.textContent = ''; syncUI(); draw();
    });

    canvas.addEventListener('pointerdown', function (e) {
      if (!img.naturalWidth) return;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var nx = (e.clientX - rect.left) * img.naturalWidth / rect.width;
      var ny = (e.clientY - rect.top) * img.naturalHeight / rect.height;
      var tol = 18 * img.naturalWidth / rect.width;
      var hit = -1;
      for (var i = 0; i < points.length; i++) {
        if (Math.hypot(points[i].x - nx, points[i].y - ny) <= tol) { hit = i; break; }
      }
      // 已选中某个角点：这次点击就是「替换到新位置」，必须先于命中判定
      if (replaceIndex >= 0) {
        points[replaceIndex] = { x: nx, y: ny };
        replaceIndex = -1; committed = false; error.textContent = ''; syncUI(); draw();
        return;
      }
      if (hit >= 0 && points.length === 4) {
        // 点现有编号 = 选中替换，避免重做整组
        replaceIndex = hit;
        hint.textContent = '正在替换第 ' + (hit + 1) + ' 个角点，请点击新位置';
        draw();
        return;
      }
      if (points.length >= 4) return;
      points.push({ x: nx, y: ny });
      committed = false; error.textContent = ''; syncUI(); draw();
      e.preventDefault();
    });

    root.querySelector('#whCalibApply').addEventListener('click', function () {
      if (points.length !== 4) { error.textContent = '请先标完 4 个角点'; return; }
      if (!mounted() || !window.WH.view3d || typeof window.WH.view3d.setPhoto !== 'function') {
        error.textContent = '3D 视图未就绪，请关闭后重新进入 3D';
        return;
      }
      var length = Number(root.querySelector('#whCalibLength').value);
      if (!isFinite(length) || length <= 0 || length > 500) {
        error.textContent = '已知边长需要是 0.01–500 米之间的数字';
        root.querySelector('#whCalibLength').focus();
        return;
      }
      var result;
      try { result = window.WH.calib.fromQuad(img, points, length); }
      catch (e2) { error.textContent = '标定计算失败：' + ((e2 && e2.message) || e2); return; }
      if (!result || !result.ok) {
        error.textContent = (result && result.reason) || '标定失败';
        return;
      }
      try { setPhotoAndReleasePrevious(window.WH.view3d, img, result, holder()); }
      catch (e3) { error.textContent = '应用失败：' + ((e3 && e3.message) || e3); return; }
      if (activeURL) URL.revokeObjectURL(activeURL);
      activeURL = tempURL;
      activePhoto = img;
      activeCalib = result;
      committed = true;
      watchViewport();
      document.dispatchEvent(new CustomEvent('wh71:photo-calibrated', {
        detail: { photo: img, calib: result, name: img.__whName || '现场照片', width: img.naturalWidth, height: img.naturalHeight }
      }));
      steps(4);
      syncUI();
      status.textContent = '已应用：照片与设备已按标定尺贴合，请检查贴合度';
      toast('实景照片已应用，可拖动检查设备与地面贴合度');
      setTimeout(close, 700);
    });

    doneBtn.addEventListener('click', close);
    syncUI();
    root.querySelector('#whCalibChoose').focus();
  }

  window.WH.calibUI = { open: open, isOpen: function () { return !!overlay; } };
})();