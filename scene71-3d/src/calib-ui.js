(function () {
  "use strict";
  window.WH = window.WH || {};
  var overlay = null, activeURL = null, resizeObserver = null, resizeTimer = null, activePhoto = null, activeCalib = null, lastSize = "";
  function toast(message) {
    var old = document.getElementById("whCalibToast"); if (old) old.remove();
    var tip = document.createElement("div");
    tip.id = "whCalibToast"; tip.setAttribute("role", "status"); tip.textContent = message;
    tip.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:10001;padding:12px 18px;border-radius:8px;background:#243946;color:#fff;max-width:90vw";
    document.body.appendChild(tip); setTimeout(function () { tip.remove(); }, 3200);
  }
  function holder() { return document.getElementById("whView3dHolder"); }
  function mounted() { var h = holder(); return !!(h && h.__view3d); }
  // View3d covers the viewport with the photo. If height is cropped, reduce the
  // vertical FOV to match that same crop; retain the original calibration.
  function fitCalib(c, img, el) {
    var imageAspect = img.naturalWidth / img.naturalHeight;
    var viewportAspect = el.clientWidth / el.clientHeight;
    var factor = Math.min(1, imageAspect / viewportAspect);
    var adjusted = 2 * Math.atan(Math.tan(c.camera.fov * Math.PI / 360) * factor) * 180 / Math.PI;
    return Object.assign({}, c, { camera: Object.assign({}, c.camera, { fov: adjusted }) });
  }
  function setPhotoAndReleasePrevious(view, img, c, el) {
    // The current shell exposes its model through _st; its parent is the scene.
    // Dispose the replaced photo texture when the shell exposes it.
    var st = el.__view3d && el.__view3d._st, scene = st && st.modelGroup && st.modelGroup.parent;
    var previous = scene && scene.background;
    view.setPhoto(img, fitCalib(c, img, el));
    if (previous && previous.isTexture && scene.background !== previous && typeof previous.dispose === "function") previous.dispose();
  }
  function refit() {
    var el = holder(), view = window.WH.view3d;
    if (!activePhoto || !activeCalib || !el || !el.clientWidth || !el.clientHeight) { lastSize = ""; return; }
    if (!el.__view3d || !el.__view3d._st || !el.__view3d._st.photoMode || !view || typeof view.setPhoto !== "function") return;
    var size = el.clientWidth + "x" + el.clientHeight;
    if (size === lastSize) return;
    lastSize = size; setPhotoAndReleasePrevious(view, activePhoto, activeCalib, el);
  }
  function watchViewport() {
    if (resizeObserver) resizeObserver.disconnect();
    var el = holder(); lastSize = el.clientWidth + "x" + el.clientHeight;
    if (typeof ResizeObserver === "function") { resizeObserver = new ResizeObserver(scheduleRefit); resizeObserver.observe(el); }
    else { window.removeEventListener("resize", scheduleRefit); window.addEventListener("resize", scheduleRefit); }
  }
  function scheduleRefit() { clearTimeout(resizeTimer); resizeTimer = setTimeout(refit, 120); }
  // A fast 2D -> 3D round trip may not produce an observable zero-size event.
  document.addEventListener("wh71:3d-mounted", function () { lastSize = ""; scheduleRefit(); });
  function open() {
    if (overlay) return;
    var oldToast = document.getElementById("whCalibToast"); if (oldToast) oldToast.remove();
    if (!window.WH.calib || typeof window.WH.calib.fromQuad !== "function") { toast("标定模块未加载"); return; }
    if (!mounted() || !window.WH.view3d || typeof window.WH.view3d.setPhoto !== "function") { toast("3D 视图未就绪，请先进入3D并确认照片功能已接入"); return; }
    var img = new Image(), points = [], tempURL = null, committed = false;
    var root = document.createElement("div"); overlay = root; root.id = "whCalibOverlay";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "实景照片配准");
    root.innerHTML = '<style>#whCalibOverlay{position:fixed;inset:0;z-index:9999;background:rgba(5,10,18,.96);color:#dce8ee;font:15px "Microsoft YaHei",sans-serif;display:flex;flex-direction:column;overflow:auto}#whCalibOverlay *{box-sizing:border-box}#whCalibOverlay header{padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #30404a}#whCalibOverlay h2{font-size:19px;margin:0}#whCalibOverlay .steps{color:#79bbd1;font-size:13px;margin:5px 0}#whCalibOverlay main{width:min(1100px,100%);margin:auto;padding:16px;display:flex;flex-direction:column;gap:12px}#whCalibOverlay p{margin:0;line-height:1.5}#whCalibOverlay .photo{position:relative;margin:auto;max-width:100%;max-height:65vh;line-height:0}#whCalibOverlay img{display:block;max-width:100%;max-height:65vh;width:auto;height:auto}#whCalibOverlay canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}#whCalibOverlay .controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}#whCalibOverlay button,#whCalibOverlay input{min-height:44px;border-radius:5px;font:inherit}#whCalibOverlay button{background:#172b38;color:#e2eef3;border:1px solid #577482;padding:8px 16px;cursor:pointer}#whCalibOverlay button.primary{background:#f0a92e;color:#111;border-color:#f0a92e;font-weight:bold}#whCalibOverlay input[type=number]{width:100px;background:#101d26;color:white;border:1px solid #577482;padding:8px}#whCalibOverlay [hidden]{display:none!important}#whCalibOverlay .error{color:#ff8d84;min-height:22px}#whCalibOverlay .photo[hidden]{display:none}</style><header><div><h2>实景照片配准</h2><div class="steps" id="whCalibSteps">1 选择照片 → 2 标记角点 → 3 输入边长 → 4 应用</div></div><button type="button" id="whCalibClose" aria-label="关闭">关闭</button></header><main><p>选点口诀：找地面、找大块、找斜的。在地面上选一块面积较大、往远处收拢的矩形，按顺时针依次点 4 个角；第 1→2 点之间那条边填真实长度（米）。</p><div class="controls"><button type="button" id="whCalibChoose">选择照片</button><input type="file" id="whCalibFile" accept="image/*" hidden><button type="button" id="whCalibReset" disabled>重选角点</button><span id="whCalibCount">等待选择照片</span></div><div class="photo" id="whCalibPhoto" hidden><img id="whCalibImage" alt="待配准照片"><canvas id="whCalibCanvas" aria-label="点击照片标记四个地面角点"></canvas></div><div class="controls" id="whCalibLengthControls" hidden><label>已知边长（米） <input type="number" id="whCalibLength" min="0.01" step="0.1" value="6"></label><button type="button" class="primary" id="whCalibApply">开始配准</button></div><div class="error" id="whCalibError" role="alert"></div></main>';
    document.body.appendChild(root);
    var file = root.querySelector("#whCalibFile"), picture = root.querySelector("#whCalibPhoto"), image = root.querySelector("#whCalibImage"), canvas = root.querySelector("#whCalibCanvas"), reset = root.querySelector("#whCalibReset"), controls = root.querySelector("#whCalibLengthControls"), error = root.querySelector("#whCalibError"), count = root.querySelector("#whCalibCount");
    function close() {
      document.removeEventListener("keydown", keydown); window.removeEventListener("resize", draw);
      if (tempURL && !committed) URL.revokeObjectURL(tempURL);
      if (overlay === root) overlay = null; root.remove();
    }
    function keydown(e) { if (e.key === "Escape") close(); }
    function draw() {
      if (picture.hidden || !img.naturalWidth) return;
      var rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
      var ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio);
      var x = rect.width / img.naturalWidth, y = rect.height / img.naturalHeight;
      if (points.length > 1) {
        ctx.lineWidth = 3; ctx.strokeStyle = "#f0a92e"; ctx.beginPath(); ctx.moveTo(points[0].x*x, points[0].y*y); ctx.lineTo(points[1].x*x, points[1].y*y); ctx.stroke();
        ctx.strokeStyle = "#5aa9c9"; ctx.beginPath(); ctx.moveTo(points[1].x*x, points[1].y*y);
        for (var i=2;i<points.length;i++) ctx.lineTo(points[i].x*x, points[i].y*y);
        if (points.length === 4) ctx.lineTo(points[0].x*x, points[0].y*y); ctx.stroke();
      }
      points.forEach(function(p,i){ctx.beginPath();ctx.arc(p.x*x,p.y*y,14,0,Math.PI*2);ctx.fillStyle="#f0a92e";ctx.fill();ctx.fillStyle="#17222a";ctx.font="bold 16px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(i+1),p.x*x,p.y*y);});
    }
    root.querySelector("#whCalibClose").addEventListener("click", close);
    document.addEventListener("keydown", keydown); window.addEventListener("resize", draw);
    root.querySelector("#whCalibChoose").addEventListener("click", function(){file.click();});
    file.addEventListener("cancel", close);
    file.addEventListener("change", function(){
      var f = file.files && file.files[0]; if (!f) { close(); return; }
      if (!f.type || f.type.indexOf("image/") !== 0) { error.textContent = "请选择图片文件"; return; }
      if (tempURL) URL.revokeObjectURL(tempURL); tempURL = URL.createObjectURL(f);
      img.onload = function(){image.src=tempURL;picture.hidden=false;points=[];reset.disabled=false;controls.hidden=true;error.textContent="";count.textContent="已选 0 / 4 个角点";requestAnimationFrame(draw);};
      img.onerror = function(){error.textContent="图片无法读取，请选择其他文件";}; img.src=tempURL;
    });
    reset.addEventListener("click",function(){points=[];controls.hidden=true;error.textContent="";count.textContent="已选 0 / 4 个角点";draw();});
    canvas.addEventListener("pointerdown", function(e){
      if (points.length >= 4 || !img.naturalWidth) return;
      var rect=canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      points.push({x:(e.clientX-rect.left)*img.naturalWidth/rect.width,y:(e.clientY-rect.top)*img.naturalHeight/rect.height});
      count.textContent="已选 " + points.length + " / 4 个角点"; controls.hidden=points.length!==4; error.textContent=""; draw(); e.preventDefault();
    });
    root.querySelector("#whCalibApply").addEventListener("click",function(){
      if (points.length !== 4) return;
      if (!mounted() || !window.WH.view3d || typeof window.WH.view3d.setPhoto !== "function") {error.textContent="3D 视图未就绪，请重新进入3D";return;}
      var length=Number(root.querySelector("#whCalibLength").value), result;
      try { result=window.WH.calib.fromQuad(img,points,length); } catch(e) { error.textContent="标定失败："+e.message;return; }
      if (!result || !result.ok) {error.textContent=(result && result.reason) || "标定失败，请检查角点和边长";return;}
      try { setPhotoAndReleasePrevious(window.WH.view3d,img,result,holder()); } catch(e) {error.textContent="应用失败："+e.message;return;}
      if (activeURL) URL.revokeObjectURL(activeURL);
      activeURL=tempURL; activePhoto=img; activeCalib=result; committed=true; watchViewport();
      document.dispatchEvent(new CustomEvent("wh71:photo-calibrated",{detail:{photo:img,calib:result}}));
      close(); toast("实景模式已开启，拖动画面检查贴合度");
    });
    root.querySelector("#whCalibClose").focus(); file.click();
  }
  window.WH.calibUI = { open: open, isOpen: function(){return !!overlay;} };
})();
