/* ============================================================
 * src/view3d.js  ·  场景壳 / 交互 / 导出（任务 C 唯一核心文件）
 *
 * 契约（冻结于 2026-11-10 21:30）：
 *   WH.view3d.mount(containerEl, { photo, model, calib, params, onChange }) -> { dispose }
 *   WH.view3d.setOrbit({ theta, phi, radius })
 *   WH.view3d.preset('front'|'side'|'top'|'iso')
 *   WH.view3d.exportPNG() -> dataURL
 *   WH.view3d.dispose()
 * 额外（C6 参数联动用，不改契约）：
 *   WH.view3d.replaceModel(group)   // 换模型但保留当前 rotation
 *
 * 设计核心：**转的是模型，不是相机**。
 *   - 有照片时相机钉死在照片透视上，背景永远不动、不穿帮；
 *   - 左右拖 = modelGroup.rotation.y（无限制 360°）；
 *   - 上下拖 = modelGroup.rotation.x（限 ±20°，超限像设备翻倒）；
 *   - 滚轮 / 双指 = 模型缩放（0.6×–2.4×）；
 *   - calib 为 null：示意地面（网格 + 轨道）+ 相机可环绕（降级 L2）。
 *
 * 照片模式适配（2026-11-11 实测修复，见 _diag_scale.js / _diag_cam.js）：
 *   - A 的标定相机与 A.project() 完全自洽，相机参数一个都不动；
 *   - 但标定世界尺度 = 用户填的 knownLength（如 6），B 模型尺度 = span 米（如 48），
 *     1:1 渲染会把设备放大约 8 倍并穿进相机，近平面把模型切成巨大斜面糊住照片；
 *   - 且 A 的世界 +Y 在照片里朝下，B 模型 +Y 向上会「倒插进地里」；
 *   - 故照片模式把模型整体缩放进标定矩形、平移到矩形中心、Y 取负立起来。
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};

  /* ---------- 模块级单例状态 ---------- */
  var inst = null;
  var scene = null, camera = null, renderer = null, canvas = null;
  var st = null;      // 运行状态
  var photo = null, calib = null, params = null;
  var ro = null;      // ResizeObserver

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* 默认相机参数（降级 L2：示意地面模式） */
  var CAM = { fov: 42, phi: 1.08, theta: 0.62, radius: 1.0 };

  /* 预设：theta/phi 供降级模式转相机；rotY 供照片模式转模型 */
  var PRESETS = {
    front: { theta: 0,           phi: 1.42, rotY: 0 },
    side:  { theta: Math.PI / 2, phi: 1.42, rotY: Math.PI / 2 },
    top:   { theta: 0.62,        phi: 0.18, rotY: 0 },
    iso:   { theta: 0.62,        phi: 1.08, rotY: 0.62 }
  };

  function instance() {
    if (!inst) throw new Error("view3d: 先 mount() 再调用");
    return inst;
  }

  /* ---------- 相机（模块级，preset/setOrbit 直接可调） ---------- */
  function applyCamera() {
    if (!camera || !st) return;
    if (st.photoMode) {
      var b = st.camBase;
      if (!b) return;
      var up = (calib && calib.camera && calib.camera.up) || null;
      if (up && up.length === 3) camera.up.set(up[0], up[1], up[2]);
      else camera.up.set(0, 1, 0);
      camera.position.copy(b.pos);
      camera.lookAt(b.look);
    } else {
      var dist = Math.max(st.span * 1.35, st.railH * 2.6, 24) * st.camRadius * st.zoom;
      var x = dist * Math.sin(st.camPhi) * Math.cos(st.camTheta);
      var y = dist * Math.cos(st.camPhi) + st.target.y;
      var z = dist * Math.sin(st.camPhi) * Math.sin(st.camTheta);
      camera.position.set(x, Math.max(y, 2), z);
      camera.lookAt(st.target);
    }
    camera.updateProjectionMatrix();
  }

  /* ---------- 照片模式：模型对齐到标定地面矩形（C 层适配，不动 A/B） ----------
   * 实测（_diag_scale.js / _diag_cam.js）：
   *   - A 的世界系：原点 = 标定第 1 点，+X → 第 2 点，+Z → 第 4 点，地面 y=0；
   *   - A 的相机与 project() 完全自洽，pos/look/up/fov 一个都不改；
   *   - A 的世界 +Y 在照片里朝「下」，B 模型 +Y 向上 → Y 需取负；
   *   - 标定矩形尺度 = knownLength（如 6），B 模型尺度 = span 米（如 48），
   *     1:1 渲染时模型 8 角投影 x∈[-2843,5575] 且相机落在模型内部，
   *     近平面把模型切成巨大斜面糊住照片 —— 必须整体缩放进矩形。
   * 相机保持不动，照片透视不穿帮。 */
  function applyModelTransform() {
    if (!st || !st.modelGroup) return;
    var g = st.modelGroup, s = (st.fitScale || 1) * st.zoom;
    if (st.fitFlipY) {
      g.scale.set(s, -s, s);          // Y 取负：设备朝照片上方（天花板）立起
      if (st.fitPos) g.position.copy(st.fitPos);
    } else {
      g.scale.setScalar(s);
      g.position.set(0, 0, 0);
    }
    g.rotation.set(st.rotX, st.rotY, 0);
  }

  function applyFit() {
    st.fitScale = 1;
    st.fitFlipY = false;
    if (st.fitPos) st.fitPos.set(0, 0, 0);
    if (!st.photoMode || !calib || !calib.ok) { applyModelTransform(); return; }
    var L = (calib.rectangle && calib.rectangle.length) || 0;
    var W = (calib.rectangle && calib.rectangle.width) || 0;
    if (!(L > 0) || !(W > 0) || !isFinite(L * W)) { applyModelTransform(); return; }
    st.fitFlipY = true;
    st.fitPos.set(L / 2, 0, W / 2);   // 矩形中心（地面）
    var g = st.modelGroup;
    if (g) {
      /* 量「未变换」的局部包围盒：临时清空 TRS 再恢复 */
      var p0 = g.position.clone(), r0 = g.rotation.clone(), s0 = g.scale.clone();
      g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
      var box = new THREE.Box3().setFromObject(g);
      g.position.copy(p0); g.rotation.copy(r0); g.scale.copy(s0);
      if (box && isFinite(box.min.x) && isFinite(box.max.x)) {
        var dx = Math.max(box.max.x - box.min.x, 1e-3);
        var dz = Math.max(box.max.z - box.min.z, 1e-3);
        /* 跨度对齐 L、进深对齐 W，取更严者并留 20% 余量；高度不压扁 */
        st.fitScale = clamp(Math.min(L / dx, W / dz) * 0.8, 1e-4, 100);
      }
    }
    applyModelTransform();
  }

  /* ---------- 模型装载 ---------- */
  function setModel(group, keepRot) {
    if (!scene || !st) return;
    if (st.modelGroup) {
      scene.remove(st.modelGroup);
      st.modelGroup.traverse && st.modelGroup.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
    }
    st.modelGroup = group || null;
    if (group) {
      if (!keepRot) { st.rotX = 0; st.rotY = 0; }
      scene.add(group);
      try {
        var box = new THREE.Box3().setFromObject(group);
        if (box && isFinite(box.max.y)) {
          st.target.set(0, Math.max(2, box.max.y * 0.45), 0);
        }
      } catch (e) { /* 空 group 忽略 */ }
      /* 照片模式下按新模型重新求适配尺度（换方案也要贴合） */
      if (st.photoMode && calib && calib.ok) applyFit();
      else applyModelTransform();
    }
    applyCamera();
  }

  /* ---------- 背景与地面（C2/C3） ----------
   * 降级元素全部收进 st.fallback 组，setPhoto 切实景时整体移除 */
  function setupBackground() {
    st.fallback = new THREE.Group();
    if (photo && photo.src) {
      try {
        var tex = new THREE.Texture(photo);
        tex.needsUpdate = true;
        tex.minFilter = THREE.LinearFilter;
        if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
        scene.background = tex;
        st.photoMode = true;
      } catch (e) { /* 贴图失败 → 降级示意地面 */ }
    }
    if (!st.photoMode) {
      scene.background = new THREE.Color(0x0b1722);
      scene.fog = new THREE.Fog(0x0b1722, 100, 300);
      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 300),
        new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 1, metalness: 0 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      st.fallback.add(ground);
      var grid = new THREE.GridHelper(400, 100, 0x33414f, 0x222c37);
      grid.position.y = 0.02;
      st.fallback.add(grid);
      var railMat = new THREE.MeshStandardMaterial({ color: 0x4a5760, roughness: 0.9, metalness: 0.1 });
      var railSpan = (params && params.span) || 48;
      [-1, 1].forEach(function (s) {
        var rail = new THREE.Mesh(new THREE.BoxGeometry(railSpan * 2.4, 0.4, 1.6), railMat);
        rail.position.set(0, 0.2, s * railSpan * 0.42);
        st.fallback.add(rail);
      });
      scene.add(st.fallback);
    }
  }

  /* ---------- L1 实景切换：照片背景 + 标定相机（不重建壳，保留交互状态） ---------- */
  function applyPhoto(photoImg, calibObj) {
    if (!photoImg || !photoImg.src) throw new Error("view3d: setPhoto 需要已加载的 HTMLImageElement");
    photo = photoImg;
    calib = calibObj || null;
    /* 移除示意地面/装饰 */
    if (st.fallback && st.fallback.parent) scene.remove(st.fallback);
    st.fallback = null;
    st.decor = null;
    /* 照片纹理 */
    var tex = new THREE.Texture(photoImg);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    scene.fog = null;
    st.photoMode = true;
    computeBase();
    applyFit();          // 尺度 + 朝向对齐标定矩形（相机不动）
    resize();
  }

  /* ---------- C 层动画装饰（不碰 A/B 模型） ----------
   * 降级模式下：AGV 小车沿轨道往返 + 地面扫描光带（示意作业区） */
  function setupDecor() {
    if (st.photoMode) return; // 照片实景模式不加装饰，避免穿帮
    var span = st.span;
    var decor = { agv: null, agvDir: 1, agvX: -span * 1.1, scan: null, scanX: 0 };
    /* AGV：青色车体 + 驮货箱 */
    var agvMat = new THREE.MeshStandardMaterial({ color: 0x5aa9c9, roughness: .5, metalness: .4 });
    var cargoMat = new THREE.MeshStandardMaterial({ color: 0x1b3b56, roughness: .85 });
    var agv = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 2.4), agvMat);
    body.position.y = 0.9; agv.add(body);
    var load = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 2.2), cargoMat);
    load.position.y = 2.2; agv.add(load);
    agv.position.set(decor.agvX, 0, span * 0.42);
    st.fallback.add(agv);
    decor.agv = agv;
    /* 扫描光带：半透明青色细条，沿 x 循环 */
    var scan = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, span * 1.9),
      new THREE.MeshBasicMaterial({ color: 0x5aa9c9, transparent: true, opacity: 0.14 }));
    scan.rotation.x = -Math.PI / 2;
    scan.position.y = 0.06;
    st.fallback.add(scan);
    decor.scan = scan;
    st.decor = decor;
  }

  function tickDecor(t) {
    var d = st.decor;
    if (!d) return;
    var span = st.span, lim = span * 1.15;
    /* AGV 往返：速度随跨度归一（大跨慢些，观感一致） */
    d.agvX += d.agvDir * Math.max(0.25, 26 / Math.max(span, 20)) * 0.16;
    if (d.agvX > lim) { d.agvX = lim; d.agvDir = -1; }
    if (d.agvX < -lim) { d.agvX = -lim; d.agvDir = 1; }
    d.agv.position.x = d.agvX;
    d.agv.rotation.y = d.agvDir > 0 ? 0 : Math.PI;
    /* 扫描光带循环 */
    d.scanX += 0.35;
    if (d.scanX > span * 1.4) d.scanX = -span * 1.4;
    d.scan.position.x = d.scanX;
  }

  /* ---------- 相机基准 ---------- */
  function computeBase() {
    if (st.photoMode) {
      var c = (calib && calib.camera) || null;
      var fov = (c && c.fov) || 46;
      var pos = (c && c.position) ? new THREE.Vector3().fromArray(c.position) : new THREE.Vector3(0, st.railH * 0.7, st.span * 1.15);
      var look = (c && c.lookAt) ? new THREE.Vector3().fromArray(c.lookAt) : new THREE.Vector3(0, st.railH * 0.45, 0);
      st.camBase = { fov: fov, pos: pos, look: look };
      camera.fov = fov;
    } else {
      st.camBase = null;
      st.target.set(0, Math.max(2, st.railH * 0.5), 0);
    }
    applyCamera();
  }

  /* ---------- 尺寸自适应 + 照片 cover 适配 ---------- */
  function resize() {
    if (!st || st.disposed) return;
    var w = st.el.clientWidth || 640, h = st.el.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    if (st.photoMode && scene.background && scene.background.isTexture) {
      var tex = scene.background;
      var ia = (photo.naturalWidth || photo.width || 16) / (photo.naturalHeight || photo.height || 9);
      var ca = camera.aspect;
      if (ia > ca) {
        tex.repeat.set(ca / ia, 1);
        tex.offset.set((1 - ca / ia) / 2, 0);
      } else {
        tex.repeat.set(1, ia / ca);
        tex.offset.set(0, (1 - ia / ca) / 2);
      }
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      if (tex.updateMatrix) tex.updateMatrix();
    }
  }

  /* ============================================================
   * mount：建壳
   * ========================================================== */
  function mount(containerEl, opts) {
    if (!window.THREE) throw new Error("view3d: three.js 未加载");
    if (!containerEl || !containerEl.nodeType) throw new Error("view3d: containerEl 无效");
    if (inst) inst.dispose(); // 重复 mount = 换壳

    opts = opts || {};
    photo = opts.photo || null;
    calib = opts.calib || null;
    params = opts.params || {};

    /* WebGL 能力探测：失败直接抛，由调用方切回 2D（C8/L3） */
    var probe = document.createElement("canvas");
    var gl = probe.getContext("webgl") || probe.getContext("experimental-webgl");
    if (!gl) throw new Error("view3d: WebGL 不可用");

    var el = containerEl;
    el.innerHTML = "";
    el.style.position = el.style.position || "relative";
    el.style.overflow = "hidden";

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.1, 4000);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;cursor:grab";
    el.appendChild(renderer.domElement);
    canvas = renderer.domElement;

    /* 光照 */
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var sun = new THREE.DirectionalLight(0xfff0d0, 1.15); sun.position.set(60, 90, 50); scene.add(sun);
    var fill = new THREE.DirectionalLight(0x5aa9c9, 0.45); fill.position.set(-70, 40, -60); scene.add(fill);

    st = {
      el: el,
      modelGroup: null,
      rotX: 0, rotY: 0,
      zoom: 1,
      photoMode: false,
      camPhi: CAM.phi, camTheta: CAM.theta, camRadius: 1,
      camBase: null,
      target: new THREE.Vector3(0, 6, 0),
      span: (params && params.span) || 48,
      railH: (params && params.railHeight) || 30,
      autoRotate: false,          // 自动环绕开关
      orbitWave: 0,               // 航拍振荡相位
      decor: null,                // C 层动画装饰（AGV/扫描光带）
      fitScale: 1,                // 照片模式：模型 → 标定矩形的缩放
      fitFlipY: false,            // 照片模式：A 的世界 +Y 朝下，需翻转
      fitPos: new THREE.Vector3(0, 0, 0),
      disposed: false, raf: null
    };

    setupBackground();
    computeBase();
    setupDecor();
    if (opts.model) setModel(opts.model, false);

    /* ---------- 交互（C4）：转模型不转相机 ---------- */
    var pointers = new Map();
    var pinchD0 = 0, zoom0 = 1;
    var dragging = false, lx = 0, ly = 0;

    canvas.addEventListener("pointerdown", function (e) {
      if (st.disposed) return;
      try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成/已失效指针忽略 */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true; lx = e.clientX; ly = e.clientY;
        canvas.style.cursor = "grabbing";
      } else if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        pinchD0 = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        zoom0 = st.zoom;
        dragging = false;
      }
      e.preventDefault();
    });

    canvas.addEventListener("pointermove", function (e) {
      if (st.disposed) return;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchD0 > 0) {
        var p = Array.from(pointers.values());
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        st.zoom = clamp(zoom0 * (d / pinchD0), 0.6, 2.4);
        applyModelTransform();
        if (!st.photoMode) applyCamera();
        return;
      }
      if (!dragging) return;
      var dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      st.rotY += dx * 0.01;                       // 左右：360° 自由转
      st.rotX = clamp(st.rotX + dy * 0.006, -Math.PI / 9, Math.PI / 9); // 上下：±20°
      applyModelTransform();
    });

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchD0 = 0;
      if (pointers.size === 0) { dragging = false; canvas.style.cursor = "grab"; }
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", endPointer);

    canvas.addEventListener("wheel", function (e) {
      if (st.disposed) return;
      e.preventDefault();
      st.zoom = clamp(st.zoom + e.deltaY * 0.0012, 0.6, 2.4);
      applyModelTransform();
      if (!st.photoMode) applyCamera();
    }, { passive: false });

    canvas.addEventListener("dblclick", function () {
      if (st.disposed) return;
      st.rotY = 0; st.rotX = 0;
      st.zoom = 1;
      applyModelTransform();
      if (!st.photoMode) applyCamera();
    });

    ro = (typeof ResizeObserver === "function") ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener("resize", resize);
    resize();

    (function loop(now) {
      if (st.disposed) return;
      st.raf = requestAnimationFrame(loop);
      /* 自动环绕：转模型不转相机；用户拖拽时自动暂停 */
      if (st.autoRotate) {
        if (!dragging) {
          st.rotY += 0.006;
          applyModelTransform();
          /* 航拍振荡：环绕时相机高度缓慢起伏 */
          st.orbitWave += 0.008;
          st.camPhi = st._waveBasePhi + Math.sin(st.orbitWave) * 0.07;
          applyCamera();
        }
      }
      tickDecor(now || 0);
      renderer.render(scene, camera);
    })(0);

    inst = {
      get _st() { return st; },   // 只读内部状态（验收/调试用）
      setModel: function (group, keepRot) { setModel(group, keepRot !== false); },
      dispose: function () {
        if (!st || st.disposed) return;
        st.disposed = true;
        if (st.raf) cancelAnimationFrame(st.raf);
        if (ro) { ro.disconnect(); ro = null; } else window.removeEventListener("resize", resize);
        try { renderer.dispose(); } catch (e) {}
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        el.__view3d = null;
        inst = null; scene = null; camera = null; renderer = null; canvas = null; st = null;
      }
    };
    el.__view3d = inst;
    return inst;
  }

  /* ============================================================
   * exportPNG（C7）：当前帧 + 参数水印
   * ========================================================== */
  function exportPNG() {
    instance();
    if (!canvas) throw new Error("view3d: 无可导出画布");
    var out = document.createElement("canvas");
    out.width = canvas.width; out.height = canvas.height;
    var ctx = out.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    var p = params || {};
    var lines = [];
    if (p.span != null) lines.push("跨度 " + p.span + " m");
    if (p.capacity != null) lines.push("吨位 " + p.capacity + " t");
    if (p.railHeight != null) lines.push("轨高 " + p.railHeight + " m");
    if (p.productType) lines.push({ bridge: "桥式", gantry: "门式", casting: "铸造", portal: "门座" }[p.productType] || String(p.productType));
    var fs = Math.max(14, Math.round(out.width * 0.016));
    var pad = fs * 0.6;
    ctx.font = fs + 'px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = "bottom";
    var w = 0;
    lines.forEach(function (t) { w = Math.max(w, ctx.measureText(t).width); });
    var barH = pad * 1.6 * Math.max(1, lines.length) + pad;
    ctx.fillStyle = "rgba(10,16,24,0.72)";
    ctx.fillRect(pad, out.height - barH - pad, w + pad * 2, barH);
    ctx.fillStyle = "#ffd27a";
    lines.forEach(function (t, i) {
      ctx.fillText(t, pad * 2, out.height - pad * 1.2 - (lines.length - 1 - i) * fs * 1.4);
    });
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = (fs * 0.8) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText("卫华 · 场景71 · " + (st && st.photoMode ? "照片安装预览" : "3D 示意预览"), pad * 2, pad + fs);
    return out.toDataURL("image/png");
  }

  /* ============================================================
   * 对外接口（契约）
   * ========================================================== */
  WH.view3d = {
    mount: mount,
    setOrbit: function (o) {
      instance();
      o = o || {};
      if (o.theta != null) st.camTheta = o.theta;
      if (o.phi != null) st.camPhi = clamp(o.phi, 0.12, 1.52);
      if (o.radius != null) st.camRadius = clamp(o.radius, 0.6, 2.4);
      applyCamera();
    },
    preset: function (name) {
      instance();
      var p = PRESETS[name] || PRESETS.iso;
      if (!st.photoMode) {
        st.camTheta = p.theta; st.camPhi = p.phi;
      }
      /* 照片模式：相机不动，把模型转到对应姿态 */
      st.rotY = p.rotY; st.rotX = 0;
      applyModelTransform();
      applyCamera();
    },
    // 完整显示：示寏模式按包围盒/默认参数重新取景；照片模式只重算模型贴合，不动相机
    fit: function () {
      instance();
      if (st.photoMode) { applyFit(); }
      else { st.camRadius = 1; st.zoom = 1; st.rotX = 0; st.rotY = 0; applyModelTransform(); applyCamera(); }
    },
    exportPNG: function () { return exportPNG(); },
    setPhoto: function (photoImg, calibObj) {
      instance();
      applyPhoto(photoImg, calibObj); // L1：照片实景 + 标定相机，保留当前模型与交互状态
    },
    setAutoRotate: function (on) {
      instance();
      st.autoRotate = !!on;
      st._waveBasePhi = st.camPhi;
      st.orbitWave = 0;
    },
    isAutoRotate: function () { return inst ? st.autoRotate : false; },
    replaceModel: function (group) {
      instance();
      /* C6：换模型保留当前角度；同步参数，保证导出水印 / 降级相机 / 装饰用新方案 */
      if (group && group.userData) {
        var u = group.userData;
        params = {
          span: u.span != null ? u.span : (params && params.span),
          capacity: u.capacity != null ? u.capacity : (params && params.capacity),
          railHeight: u.railHeight != null ? u.railHeight : (params && params.railHeight),
          productType: u.productType || (params && params.productType),
          agv: u.agv != null ? u.agv : (params && params.agv)
        };
        if (isFinite(u.span)) st.span = u.span;
        if (isFinite(u.railHeight)) st.railH = u.railHeight;
      }
      setModel(group, true);
    },
    dispose: function () {
      if (inst) inst.dispose();
      inst = null;
    }
  };
})();
