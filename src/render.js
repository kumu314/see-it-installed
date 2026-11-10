(function () {
  "use strict";
  window.WH = window.WH || {};

  // Local geometry only: no DOM, timers, random values or persistent scene state.
  window.WH.renderScene = function (params) {
    var input = params && typeof params === "object" ? params : {};
    var data = window.WH.DATA;
    var base = data && Array.isArray(data.configs) && data.configs[0] || {};

    function number(value, fallback, min, max) {
      return typeof value === "number" && isFinite(value) && value >= min && value <= max
        ? value : fallback;
    }
    function value(key, fallback, min, max) {
      return number(input[key], number(base[key], fallback, min, max), min, max);
    }
    function bay(value) {
      return value === "single" || value === "double" || value === "outdoor";
    }
    function escape(value) {
      return value.replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    }

    var span = value("span", 22.5, 4, 60);
    var capacity = value("capacity", 32, 1, 300);
    var railHeight = value("railHeight", 9, 3, 24);
    var count = Math.floor(value("agv", 2, 0, 8));
    var type = bay(input.bayType) ? input.bayType : bay(base.bayType) ? base.bayType : "single";
    function validDuty(value) { return typeof value === "string" && /^A[1-8]$/.test(value); }
    var duty = validDuty(input.duty) ? input.duty : validDuty(base.duty) ? base.duty : "A5";
    var after = input.mode !== "before";
    var outdoor = type === "outdoor";
    var doubleBay = type === "double";
    var singleBeam = capacity <= 10;
    var width = span * (doubleBay ? 1.48 : 1);
    var length = 24;
    var eave = railHeight + 2.5;
    var top = eave + (doubleBay || outdoor ? 0 : 1.6);
    // Keep one metre at the same scale for normal presets; fit larger custom scenes.
    var scale = Math.min(1, 662 / (width * 11.3 + length * 6.3),
      303 / (width * 3 + length * 3.5 + top * 9.2));
    var originX = (800 - (width * 11.3 + length * 6.3) * scale) / 2;
    var originY = 46 + (length * 3.5 + top * 9.2) * scale;
    var key = [span, capacity, railHeight, count, type, duty, after].join("|");
    var hash = 2166136261;
    for (var k = 0; k < key.length; k++) hash = Math.imul(hash ^ key.charCodeAt(k), 16777619);
    // Equal inputs deliberately produce equal definitions, including in side-by-side SVGs.
    var id = "wh71-" + (hash >>> 0).toString(36) + "-";
    var pieces = [];
    var color = after ? {
      bg: "#0b1722", floor: "#233642", floorEdge: "#132630", grid: "#5b727c",
      wall: "#192b37", wallSide: "#203442", steel: "#536c79", steelSide: "#2c444f",
      steelTop: "#8196a0", line: "#a0b6bd", window: "#8dafba", accent: "#f6c35d"
    } : {
      bg: "#0b151f", floor: "#24313b", floorEdge: "#15232c", grid: "#53626c",
      wall: "#1b2935", wallSide: "#22323e", steel: "#475b69", steelSide: "#293d49",
      steelTop: "#6a7e8c", line: "#7d94a3", window: "#738f9f", accent: "#9aafbe"
    };

    function f(n) { return Math.round(n * 100) / 100; }
    function project(x, y, z) {
      return [f(originX + (x * 11.3 + y * 6.3) * scale),
        f(originY + (x * 3 - y * 3.5 - z * 9.2) * scale)];
    }
    function point(p) { return project(p[0], p[1], p[2] || 0).join(","); }
    function polygon(points, fill, extra) {
      pieces.push('<polygon points="' + points.map(point).join(" ") + '" fill="' + fill + '"' + (extra || "") + '/>');
    }
    function path(d, stroke, weight, extra) {
      pieces.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + weight + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + '/>');
    }
    function line(points, stroke, weight, extra) {
      path(points.map(function (p, i) { return (i ? "L" : "M") + point(p); }).join(" "), stroke, weight, extra);
    }
    function text(x, y, content, fill, size, extra) {
      pieces.push('<text x="' + f(x) + '" y="' + f(y) + '" fill="' + fill + '" font-size="' + size + '"' + (extra || "") + '>' + escape(content) + '</text>');
    }
    function worldText(x, y, z, content, fill, size, extra) {
      var p = project(x, y, z);
      text(p[0], p[1], content, fill, size, extra);
    }
    function box(x, y, z, dx, dy, dz, front, side, roof, extra) {
      if (extra) pieces.push("<g" + extra + ">");
      polygon([[x, y, z], [x + dx, y, z], [x + dx, y, z + dz], [x, y, z + dz]], front);
      polygon([[x + dx, y, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x + dx, y, z + dz]], side);
      polygon([[x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], roof);
      if (extra) pieces.push("</g>");
    }
    function column(x, y) {
      polygon([[x - 0.6, y - 0.5, 0.01], [x + 0.8, y - 0.5, 0.01],
        [x + 1.6, y + 1.7, 0.01], [x - 0.1, y + 1.7, 0.01]], "#050e16", ' opacity="0.32"');
      box(x - 0.23, y - 0.25, 0, 0.46, 0.5, eave, color.steel, color.steelSide, color.steelTop);
      box(x - 0.52, y - 0.5, 0, 1.04, 1, 0.18, color.steelSide, color.steelSide, color.steel);
    }

    var label = (after ? "安装效果" : "现场原貌") + "，" +
      (outdoor ? "露天堆场" : doubleBay ? "双跨重装车间" : "单跨厂房") +
      "，跨度 " + span + " 米" + (after ? "，起重量 " + capacity + " 吨，AGV " + count + " 台" : "，未安装设备") + "，模拟示意";
    pieces.push('<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + escape(label) +
      '" data-mode="' + (after ? "after" : "before") + '" data-bay-type="' + type + '" data-span="' + span +
      '" data-capacity="' + capacity + '" data-rail-height="' + railHeight + '" font-family="Segoe UI, Microsoft YaHei, sans-serif">');
    pieces.push("<title>" + escape(label) + "</title><desc>等轴测安装示意。灰色为厂房结构，金色为起重设备，青色为 AGV。全部参数为演示模拟值，非工程图。</desc>");
    pieces.push('<defs><linearGradient id="' + id + 'back" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + color.bg + '"/><stop offset="1" stop-color="#172b37"/></linearGradient>' +
      '<linearGradient id="' + id + 'floor" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="' + color.floor + '"/><stop offset="1" stop-color="' + color.floorEdge + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'light"><stop stop-color="' + (after ? "#efd29a" : "#7197aa") + '" stop-opacity="' + (after ? "0.13" : "0.05") + '"/><stop offset="1" stop-color="#101d27" stop-opacity="0"/></radialGradient></defs>');
    pieces.push('<rect width="800" height="400" fill="url(#' + id + 'back)"/><ellipse cx="435" cy="208" rx="360" ry="210" fill="url(#' + id + 'light)"/>');

    // Shared camera and architecture align the before/after comparison exactly.
    polygon([[-2.2, -3, -0.4], [width + 2.2, -3, -0.4], [width + 2.2, length + 2, -0.4], [-2.2, length + 2, -0.4]], "#060f17");
    polygon([[-2, -2.5, 0], [width + 2, -2.5, 0], [width + 2, length + 1.5, 0], [-2, length + 1.5, 0]], "url(#" + id + "floor)");
    var grid = [];
    for (var gx = 0; gx <= width; gx += 3) grid.push("M" + point([gx, 0, 0]) + "L" + point([gx, length, 0]));
    for (var gy = 0; gy <= length; gy += 3) grid.push("M" + point([0, gy, 0]) + "L" + point([width, gy, 0]));
    path(grid.join(" "), color.grid, 0.65, ' opacity="0.24"');

    if (!outdoor) {
      pieces.push('<g data-component="building">');
      polygon([[0, length, 0], [width, length, 0], [width, length, eave], [0, length, eave]], color.wall);
      polygon([[0, 0, 0], [0, length, 0], [0, length, eave], [0, 0, eave]], color.wallSide, ' opacity="0.65"');
      var windowCount = doubleBay ? 7 : 5;
      for (var w = 0; w < windowCount; w++) {
        var wx = (w + 0.18) * width / windowCount;
        polygon([[wx, length - 0.03, eave * 0.59], [wx + width / windowCount * 0.62, length - 0.03, eave * 0.59],
          [wx + width / windowCount * 0.62, length - 0.03, eave * 0.81], [wx, length - 0.03, eave * 0.81]], color.window, ' opacity="0.36"');
      }
      var bays = doubleBay ? [0, 12, 24] : [0, 6, 12, 18, 24];
      bays.forEach(function (y) { column(0, y); });
      line([[0, 0, eave], [0, length, eave]], color.steelTop, 2);
      line([[0, 0, 0.5], [0, length, 0.5]], color.steel, 1);
      for (var br = 0; br < length; br += doubleBay ? 12 : 6) {
        line([[0, br, eave * 0.23], [0, br + (doubleBay ? 12 : 6), eave * 0.84]], color.line, 0.7, ' opacity="0.32"');
      }
      // A roof cutaway leaves the working envelope visible.
      if (doubleBay) {
        polygon([[0, 19, eave], [width, 19, eave], [width, length, eave], [0, length, eave]], "#4b737f", ' opacity="0.13"');
        [19, 24].forEach(function (y) {
          var zigzag = [[0, y, eave]];
          for (var z = 1; z <= 10; z++) zigzag.push([width * z / 10, y, eave + (z % 2 ? -0.6 : 0)]);
          line(zigzag, color.steelTop, 1.2);
        });
        line([[span, 0, eave], [span, length, eave]], color.steelTop, 1.5);
      } else {
        polygon([[0, 19, eave], [span / 2, 19, top], [span / 2, length, top], [0, length, eave]], "#63858c", ' opacity="0.18"');
        polygon([[span / 2, 19, top], [span, 19, eave], [span, length, eave], [span / 2, length, top]], "#324d5c", ' opacity="0.24"');
        [0, 12, 24].forEach(function (y) {
          line([[0, y, eave], [span / 2, y, top], [span, y, eave], [0, y, eave]], color.steelTop, 1.1, ' opacity="0.65"');
        });
        line([[span / 2, 0, top], [span / 2, length, top]], color.line, 0.9, ' opacity="0.3"');
      }
      pieces.push("</g>");
    } else {
      // The outdoor baseline has ground rails, no factory columns or roof.
      pieces.push('<g data-component="yard">');
      [0, span].forEach(function (x) {
        polygon([[x - 0.6, 0, 0.01], [x + 0.6, 0, 0.01], [x + 0.6, length, 0.01], [x - 0.6, length, 0.01]], "#3c515a");
        line([[x, 0, 0.14], [x, length, 0.14]], "#90a5ab", 1.6);
      });
      line([[1.5, length - 2, 0.02], [span - 1.5, length - 2, 0.02]], color.grid, 1.3, ' stroke-dasharray="6 6"');
      pieces.push("</g>");
    }

    var craneY = length * 0.53;
    var beamHeight = 0.38 + Math.sqrt(capacity) * 0.066;
    var beamDepth = singleBeam ? 1.05 : 0.85;
    var spread = singleBeam ? 0 : 2.05;
    var trolleyX = span * 0.56;
    var trolleySize = 0.8 + Math.sqrt(capacity) * 0.08;
    var hookZ = railHeight * 0.41;
    var cargoSize = 1.4 + Math.sqrt(capacity) * 0.11;

    if (after) {
      pieces.push('<g data-component="installation">');
      // Cast shadows are simple polygons rather than expensive blur filters.
      polygon([[-0.7, craneY - 1, 0.02], [span + 1.2, craneY - 1, 0.02],
        [span + 3.1, craneY + 2.8, 0.02], [1.3, craneY + 2.8, 0.02]], "#020a0f", ' opacity="0.42"');
      // Loading and storage pads, both on the same floor as the AGVs.
      polygon([[span * 0.42, craneY - 6, 0.03], [span * 0.65, craneY - 6, 0.03],
        [span * 0.65, craneY - 2.5, 0.03], [span * 0.42, craneY - 2.5, 0.03]], "#ba8e39", ' opacity="0.15" stroke="#d8b661" stroke-width="0.8"');
      polygon([[span * 0.72, 17, 0.03], [span * 0.91, 17, 0.03], [span * 0.91, 22, 0.03], [span * 0.72, 22, 0.03]], "#31b7a3", ' opacity="0.12" stroke="#59c9b8" stroke-width="0.8"');

      if (count > 0) {
        pieces.push('<g data-component="agv-route">');
        var route = [[span * 0.55, craneY - 5, 0.08], [span * 0.55, 4, 0.08],
          [span * 0.82, 4, 0.08], [span * 0.82, 20, 0.08]];
        line(route, "#092e34", 8, ' opacity="0.5"');
        line(route, "#58d6bc", 1.6, ' stroke-dasharray="5 5" opacity="0.9"');
        polygon([[span * 0.82, 20.6, 0.1], [span * 0.82 - 0.5, 19.3, 0.1], [span * 0.82 + 0.5, 19.3, 0.1]], "#8af2d4");
        pieces.push("</g>");
      }

      // Far runway first, then the hoist, then foreground structure (painter order).
      if (!outdoor) {
        box(-0.36, 0, railHeight - 0.35, 0.72, length, 0.4, "#6b7b7d", "#3f575f", "#9baba8");
        line([[0, 0, railHeight + 0.08], [0, length, railHeight + 0.08]], "#e0d5ae", 1.3);
      } else {
        // Far leg of the rail-mounted gantry; the near leg is drawn last.
        box(-0.9, craneY - 1.1, 0.24, 1.8, 3.4, 0.6, "#aa6b20", "#724617", "#e9ad42");
        polygon([[-0.7, craneY - 0.9, 0.7], [0.25, craneY - 0.9, railHeight],
          [1, craneY - 0.9, railHeight], [0.1, craneY - 0.9, 0.7]], "#cf902a");
        polygon([[0.1, craneY - 0.9, 0.7], [1, craneY - 0.9, railHeight],
          [1, craneY + 1.9, railHeight], [0.1, craneY + 1.9, 0.7]], "#9b631d");
        line([[0.3, craneY - 0.8, 1], [0.65, craneY - 0.8, railHeight - 0.7]], "#ffd37c", 1.1);
      }

      // The rear bridge girder disappears for the light single-girder preset.
      if (!singleBeam) box(-0.7, craneY + spread, railHeight, span + 1.4, beamDepth, beamHeight,
        "#bb7c20", "#80531b", "#edb951");
      box(-0.7, craneY, railHeight, span + 1.4, beamDepth, beamHeight,
        "#e7a935", "#9d651d", "#ffe09a", ' data-component="bridge" data-beam-height="' + f(beamHeight) + '"');
      line([[0, craneY - 0.01, railHeight + beamHeight * 0.22], [span, craneY - 0.01, railHeight + beamHeight * 0.22]], "#7f541d", 1.1);
      // End carriages join the two girders and rest on the runway/gantry legs.
      [0, span].forEach(function (x) {
        box(x - 0.6, craneY - 0.5, railHeight - 0.25, 1.2, spread + 2, 0.45, "#b57d2b", "#725020", "#f1bf5e");
      });

      var trolleyZ = railHeight + beamHeight;
      box(trolleyX - trolleySize / 2, craneY - 0.2, trolleyZ, trolleySize, spread + 1.4,
        trolleySize * 0.46, "#eac162", "#a07129", "#ffe5a5", ' data-component="trolley"');
      var hook = project(trolleyX, craneY + 0.35, hookZ);
      line([[trolleyX - 0.18, craneY + 0.35, trolleyZ], [trolleyX - 0.18, craneY + 0.35, hookZ + 0.55]], "#c2cfd0", 1.1);
      line([[trolleyX + 0.18, craneY + 0.35, trolleyZ], [trolleyX + 0.18, craneY + 0.35, hookZ + 0.55]], "#839ba2", 1.1);
      box(trolleyX - 0.38, craneY, hookZ + 0.25, 0.76, 0.7, 0.65, "#edbd56", "#a47329", "#ffe3a0");
      path("M" + hook[0] + "," + f(hook[1] - 1) + "v4c0,7 9,7 9,0", "#f6cf7b", f(2 + Math.sqrt(capacity) * 0.17));
      // A slung demonstration load makes the full lifting-to-storage story legible.
      var loadZ = Math.max(0.2, hookZ - 1.7);
      box(trolleyX - cargoSize / 2, craneY + 0.5, loadZ, cargoSize, 1.7, 1,
        "#738994", "#415d69", "#a0b2b8", ' data-component="load"');
      line([[trolleyX - cargoSize / 2, craneY + 0.5, loadZ + 1], [trolleyX, craneY + 0.35, hookZ - 0.25],
        [trolleyX + cargoSize / 2, craneY + 0.5, loadZ + 1]], "#b3c5c8", 1);
      var capacityPoint = project(span * 0.25, craneY - 0.04, railHeight + beamHeight * 0.45);
      text(capacityPoint[0], capacityPoint[1] + 2.5, capacity + " t", "#382b17", 9, ' font-weight="700" text-anchor="middle"');

      // Fixed poses only. UI owns all animation and can reach a still end state immediately.
      for (var a = 0; a < count; a++) {
        var ax = a % 2 === 0 ? span * 0.55 : span * 0.82;
        var ay = a % 2 === 0 ? craneY - 5 - Math.floor(a / 2) * 2.8 : 18 - Math.floor(a / 2) * 3.2;
        pieces.push('<g data-component="agv" data-agv-index="' + a + '">');
        polygon([[ax - 1, ay - 1.3, 0.03], [ax + 1.5, ay - 1.3, 0.03], [ax + 2, ay + 1.5, 0.03], [ax - 0.5, ay + 1.5, 0.03]], "#020c13", ' opacity="0.55"');
        box(ax - 0.8, ay - 1.15, 0.17, 1.6, 2.3, 0.38, "#2b9c92", "#176b6b", "#70d9c2");
        box(ax - 0.6, ay - 0.85, 0.55, 1.2, 1.7, 0.16, "#485d66", "#304850", "#afc4c5");
        line([[ax - 0.5, ay - 1.17, 0.38], [ax + 0.5, ay - 1.17, 0.38]], "#c2ffe7", 1.5);
        pieces.push("</g>");
      }
      if (outdoor) {
        box(span - 0.9, craneY - 1.1, 0.24, 1.8, 3.4, 0.6, "#c28a2d", "#87551d", "#f7c363");
        polygon([[span - 0.1, craneY - 0.9, 0.7], [span - 1, craneY - 0.9, railHeight],
          [span - 0.25, craneY - 0.9, railHeight], [span + 0.7, craneY - 0.9, 0.7]], "#e8ac3a");
        polygon([[span + 0.7, craneY - 0.9, 0.7], [span - 0.25, craneY - 0.9, railHeight],
          [span - 0.25, craneY + 1.9, railHeight], [span + 0.7, craneY + 1.9, 0.7]], "#a16a21");
        line([[span + 0.3, craneY - 0.92, 1.1], [span - 0.6, craneY - 0.92, railHeight - 0.65]], "#ffe2a2", 1.2);
      } else {
        // Foreground runway and shared columns in the double-span factory.
        var frontBays = doubleBay ? [0, 12, 24] : [0, 6, 12, 18, 24];
        frontBays.forEach(function (y) { column(span, y); });
        box(span - 0.36, 0, railHeight - 0.35, 0.72, length, 0.4, "#72858a", "#405862", "#adbbb5");
        line([[span, 0, railHeight + 0.08], [span, length, railHeight + 0.08]], "#ecdbae", 1.3);
      }
      pieces.push("</g>");
    } else if (!outdoor) {
      // Existing architectural columns, with the exact same placement as after.
      (doubleBay ? [0, 12, 24] : [0, 6, 12, 18, 24]).forEach(function (y) { column(span, y); });
    }

    if (!outdoor) {
      if (doubleBay) [0, 12, 24].forEach(function (y) { column(width, y); });
      line([[width, 0, eave], [width, length, eave]], color.steelTop, 1.5);
    }

    // Dimension marks are projected from real geometry, not a fixed screen label.
    pieces.push('<g data-component="dimensions">');
    line([[0, -1.7, 0.04], [span, -1.7, 0.04]], color.accent, 1, ' opacity="0.85"');
    [0, span].forEach(function (x) {
      line([[x, -2.3, 0.04], [x, -0.9, 0.04]], color.accent, 1.1);
    });
    var dimension = project(span / 2, -1.7, 0.04);
    pieces.push('<rect x="' + f(dimension[0] - 42) + '" y="' + f(dimension[1] - 9) + '" width="84" height="18" rx="3" fill="#101e28"/>');
    text(dimension[0], dimension[1] + 3, "跨度 " + span.toFixed(1) + " m", after ? "#ffdaa0" : "#b5c7d2", 10, ' text-anchor="middle"');
    pieces.push("</g>");

    // Screen-space labels remain readable regardless of the camera fitting factor.
    pieces.push('<rect x="20" y="18" width="4" height="12" rx="1" fill="' + (after ? "#f4c362" : "#8b9da8") + '"/>');
    text(32, 28, after ? "方案安装 · 效果示意" : "客户现场 · 结构示意", "#e0eaf0", 12, ' font-weight="600"');
    text(778, 27, outdoor ? "露天轨道门机" : doubleBay ? "双跨重装车间 · 网架" : "单跨厂房 · 双坡屋面", "#a3bbc6", 10, ' text-anchor="end"');
    if (after) {
      text(22, 355, capacity + " t  /  " + duty, "#f8d48a", 12, ' font-weight="600"');
      text(22, 373, "轨高 " + railHeight.toFixed(1) + " m · " + (singleBeam ? "单梁起重" : outdoor ? "轨道式门机" : "双梁起重"), "#a5bac4", 10);
      text(778, 355, count ? "吊装 → AGV 搬运 → 入库" : "吊装 → 轻载仓储", "#a9c9c9", 10, ' text-anchor="end"');
      text(778, 373, "AGV " + count + " 台 · 路径为流程示意", "#809ba7", 9, ' text-anchor="end"');
    } else {
      text(22, 373, "空场结构 / 待安装设备", "#90a8b6", 10);
    }
    text(400, 393, "模拟示意，非真实设备参数 · 非工程图", "#91a6b2", 9, ' text-anchor="middle"');
    pieces.push("</svg>");
    return pieces.join("");
  };
})();
