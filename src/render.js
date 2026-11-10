(function () {
  "use strict";
  window.WH = window.WH || {};

  window.WH.renderScene = function (params) {
    var input = params && typeof params === "object" ? params : {};
    function read(object, key) {
      try { return object == null ? undefined : object[key]; } catch (error) { return undefined; }
    }
    var configs = read(read(window.WH, "DATA"), "configs");
    var base = Array.isArray(configs) && configs[0] || {};
    function number(value, fallback, min, max) {
      return typeof value === "number" && isFinite(value) && value >= min && value <= max ? value : fallback;
    }
    function value(key, fallback, min, max) {
      return number(read(input, key), number(read(base, key), fallback, min, max), min, max);
    }
    function validBay(value) { return value === "single" || value === "double" || value === "outdoor"; }
    function validDuty(value) { return typeof value === "string" && /^A[1-8]$/.test(value); }
    function escape(value) {
      return value.replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    }
    /* 上限必须覆盖卫华真实产品线：2000t / 60m 跨度 / 45m 轨高。
       原来的 300t/60m/24m 会把 2000t 直接替换成 32t，画出来是台小机器。 */
    var span = value("span", 22.5, 4, 150);
    var capacity = value("capacity", 32, 1, 5000);
    var railHeight = value("railHeight", 9, 3, 80);
    var count = Math.floor(value("agv", 2, 0, 8));
    var requestedBay = read(input, "bayType");
    var baseBay = read(base, "bayType");
    var type = validBay(requestedBay) ? requestedBay : requestedBay === undefined && validBay(baseBay) ? baseBay : "single";
    var requestedDuty = read(input, "duty"), baseDuty = read(base, "duty");
    var duty = validDuty(requestedDuty) ? requestedDuty : validDuty(baseDuty) ? baseDuty : "A5";
    var after = read(input, "mode") !== "before";
    var requestedT = after ? read(input, "t") : undefined;
    var liftT = typeof requestedT === "number" && isFinite(requestedT) ? Math.max(0, Math.min(1, requestedT)) : 1;
    var outdoor = type === "outdoor";
    var doubleBay = type === "double";
    var bayCount = doubleBay ? 2 : 1;
    var width = span * bayCount;
    var length = 24;
    var eave = railHeight + 2.5;
    var ridge = eave + (outdoor ? 0 : 1.6);
    /* 240 而非 278：大吨位门机（60m 跨度 / 45m 轨高）会让主梁顶部顶出画布，留出上方余量 */
    var scale = Math.min(1, 660 / (width * 11.3 + length * 6.3),
      240 / (width * 3 + length * 3.5 + ridge * 9.2));
    var originX = (800 - (width * 11.3 + length * 6.3) * scale) / 2;
    var originY = 48 + (length * 3.5 + ridge * 9.2) * scale;
    var key = [span, capacity, railHeight, count, type, duty, after].join("|");
    var hash = 2166136261;
    for (var k = 0; k < key.length; k++) hash = Math.imul(hash ^ key.charCodeAt(k), 16777619);
    var id = "wh71-" + (hash >>> 0).toString(36) + "-";
    var pieces = [];
    var color = after ? {
      bg: "#0b1722", floor: "#263944", floorEdge: "#142630", grid: "#637b83",
      wall: "#1c2f3b", wallSide: "#233b47", steel: "#617a85", steelSide: "#344c57",
      steelTop: "#91a7ac", line: "#b0c4c6", window: "#a1c6ca", accent: "#f6c35d"
    } : {
      bg: "#0c1721", floor: "#293640", floorEdge: "#182832", grid: "#667780",
      wall: "#22313d", wallSide: "#293c49", steel: "#566d7b", steelSide: "#344b59",
      steelTop: "#8499a6", line: "#9cabb5", window: "#8aa2b1", accent: "#a7bac6"
    };
    function f(n) { return Math.round(n * 100) / 100; }
    function project(x, y, z) {
      return [f(originX + (x * 11.3 + y * 6.3) * scale), f(originY + (x * 3 - y * 3.5 - z * 9.2) * scale)];
    }
    function point(p) { return project(p[0], p[1], p[2] || 0).join(","); }
    function closed(points) { return points.map(function (p, i) { return (i ? "L" : "M") + point(p); }).join(" ") + " Z"; }
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
    function box(x, y, z, dx, dy, dz, front, side, roof, extra) {
      if (extra) pieces.push("<g" + extra + ">");
      polygon([[x, y, z], [x + dx, y, z], [x + dx, y, z + dz], [x, y, z + dz]], front);
      polygon([[x + dx, y, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x + dx, y, z + dz]], side);
      polygon([[x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], roof);
      if (extra) pieces.push("</g>");
    }
    function shadow(x, y, rx, ry, opacity) {
      var p = project(x, y, 0.02);
      pieces.push('<ellipse cx="0" cy="0" rx="' + f(rx) + '" ry="' + f(ry) + '" transform="matrix(' +
        [f(11.3 * scale), f(3 * scale), f(6.3 * scale), f(-3.5 * scale), p[0], p[1]].join(" ") + ')" fill="url(#' + id + 'shadow)" opacity="' + opacity + '"/>');
    }
    function use(name, x, y, extra) {
      var p = project(x, y, 0);
      pieces.push('<use href="#' + id + name + '" transform="translate(' + p.join(" ") + ')"' + (extra || "") + '/>');
    }
    function beginDefinition(name) {
      pieces.push('<g id="' + id + name + '" transform="translate(' + f(-originX) + " " + f(-originY) + ')">');
    }
    var label = (after ? "安装效果" : "现场原貌") + "，" + (outdoor ? "露天堆场" : doubleBay ? "双跨厂房" : "单跨厂房") +
      "，单跨跨度 " + span + " 米" + (after ? "，起重量 " + capacity + " 吨，AGV " + count + " 台" : "，未安装设备") + "，模拟示意";
    pieces.push('<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + escape(label) +
      '" data-mode="' + (after ? "after" : "before") + '" data-bay-type="' + type + '" data-span="' + span +
      '" data-capacity="' + capacity + '" data-rail-height="' + railHeight + '"' + (after ? ' data-t="' + liftT + '"' : "") + ' font-family="Segoe UI, Microsoft YaHei, sans-serif">');
    pieces.push("<title>" + escape(label) + "</title><desc>等轴测结构与安装示意。灰色为厂房或场地，金色为起重设备，青色为AGV。全部为演示模拟参数，非工程图。</desc>");
    pieces.push('<defs><linearGradient id="' + id + 'back" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + color.bg + '"/><stop offset="1" stop-color="#1b303c"/></linearGradient>' +
      '<linearGradient id="' + id + 'floor" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="' + color.floor + '"/><stop offset="1" stop-color="' + color.floorEdge + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'light"><stop stop-color="' + (after ? "#efd29a" : "#8ba2b0") + '" stop-opacity="' + (after ? "0.15" : "0.05") + '"/><stop offset="1" stop-color="#101d27" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'shadow"><stop stop-color="#020a10" stop-opacity="0.72"/><stop offset="0.6" stop-color="#020a10" stop-opacity="0.28"/><stop offset="1" stop-color="#020a10" stop-opacity="0"/></radialGradient>');
    if (!outdoor) {
      beginDefinition("column");
      shadow(0.4, 0.8, 1, 1.8, 0.6);
      box(-0.23, -0.25, 0, 0.46, 0.5, eave, color.steel, color.steelSide, color.steelTop);
      box(-0.52, -0.5, 0, 1.04, 1, 0.18, color.steelSide, color.steelSide, color.steel);
      pieces.push("</g>");
      beginDefinition("runway");
      box(-0.38, 0, railHeight - 0.38, 0.76, length, 0.45, color.steel, color.steelSide, color.steelTop);
      line([[0, 0, railHeight + 0.12], [0, length, railHeight + 0.12]], after ? "#e0d5ae" : "#a5b6c0", 1.2);
      pieces.push("</g>");
    }
    if (after && count > 0) {
      beginDefinition("agv");
      shadow(0.2, 0.3, 1.2, 1.8, 0.7);
      box(-0.8, -1.15, 0.17, 1.6, 2.3, 0.38, "#2b9c92", "#176b6b", "#70d9c2");
      box(-0.6, -0.85, 0.55, 1.2, 1.7, 0.16, "#485d66", "#304850", "#afc4c5");
      line([[-0.5, -1.17, 0.38], [0.5, -1.17, 0.38]], "#c2ffe7", 1.5);
      pieces.push("</g>");
      beginDefinition("agv-x");
      shadow(0.2, 0.3, 1.8, 1.2, 0.7);
      box(-1.15, -0.8, 0.17, 2.3, 1.6, 0.38, "#2b9c92", "#176b6b", "#70d9c2");
      box(-0.85, -0.6, 0.55, 1.7, 1.2, 0.16, "#485d66", "#304850", "#afc4c5");
      line([[1.17, -0.5, 0.38], [1.17, 0.5, 0.38]], "#c2ffe7", 1.5);
      pieces.push("</g>");
    }
    pieces.push('</defs><rect width="800" height="400" fill="url(#' + id + 'back)"/><ellipse cx="435" cy="208" rx="360" ry="210" fill="url(#' + id + 'light)"/>');
    polygon([[-2.2, -3, -0.4], [width + 2.2, -3, -0.4], [width + 2.2, length + 2, -0.4], [-2.2, length + 2, -0.4]], "#071019");
    polygon([[-2, -2.5, 0], [width + 2, -2.5, 0], [width + 2, length + 1.5, 0], [-2, length + 1.5, 0]], "url(#" + id + "floor)");
    var grid = [];
    for (var gx = 0; gx <= width; gx += 3) grid.push("M" + point([gx, 0, 0]) + "L" + point([gx, length, 0]));
    for (var gy = 0; gy <= length; gy += 3) grid.push("M" + point([0, gy, 0]) + "L" + point([width, gy, 0]));
    path(grid.join(" "), color.grid, 0.65, ' opacity="0.23"');

    var columnsY = doubleBay ? [0, 12, 24] : [0, 6, 12, 18, 24];
    function drawColumnRow(x) {
      columnsY.forEach(function (y) {
        use("column", x, y, ' data-component="column" data-world-x="' + f(x) + '" data-world-y="' + y + '"');
      });
      use("runway", x, 0, ' data-component="runway" data-world-x="' + f(x) + '"');
      line([[x, 0, eave], [x, length, eave]], color.steelTop, 1.5);
    }
    function drawRoof(start, index) {
      var middle = start + span / 2;
      pieces.push('<g data-component="roof-bay" data-bay-index="' + index + '">');
      polygon([[start, 18, eave], [middle, 18, ridge], [middle, length, ridge], [start, length, eave]], "#6b8d96", ' opacity="0.15"');
      polygon([[middle, 18, ridge], [start + span, 18, eave], [start + span, length, eave], [middle, length, ridge]], "#3e5968", ' opacity="0.24"');
      [0, 12, 24].forEach(function (y) {
        line([[start, y, eave], [middle, y, ridge], [start + span, y, eave], [start, y, eave]], color.steelTop, 1.2, ' opacity="0.7"');
      });
      line([[middle, 0, ridge], [middle, length, ridge]], color.line, 1.8, ' data-component="ridge"');
      if (doubleBay) {
        pieces.push('<g data-component="skylight">');
        var sw = Math.min(0.8, span * 0.08);
        var lowRoof = ridge - sw * 1.6 / (span / 2);
        polygon([[middle - sw, 0, lowRoof], [middle, 0, ridge], [middle, length, ridge], [middle - sw, length, lowRoof]], "#a1c8ce", ' opacity="0.44"');
        polygon([[middle, 0, ridge], [middle + sw, 0, lowRoof], [middle + sw, length, lowRoof], [middle, length, ridge]], "#5e939f", ' opacity="0.4"');
        var bars = [];
        [0, 6, 12, 18, 24].forEach(function (y) { bars.push("M" + point([middle - sw, y, lowRoof]) + "L" + point([middle + sw, y, lowRoof])); });
        path(bars.join(" "), "#bdd9db", 0.7, ' opacity="0.7"');
        pieces.push("</g>");
      }
      pieces.push("</g>");
    }
    if (!outdoor) {
      pieces.push('<g data-component="building">');
      var wall = closed([[0, length, 0], [width, length, 0], [width, length, eave], [0, length, eave]]);
      for (var door = 0; door < bayCount; door++) {
        var doorLeft = door * span + span * 0.43;
        var doorWidth = Math.min(4.4, span * 0.28);
        var doorHeight = Math.min(4.2, eave * 0.45);
        wall += " " + closed([[doorLeft, length, 0], [doorLeft + doorWidth, length, 0], [doorLeft + doorWidth, length, doorHeight], [doorLeft, length, doorHeight]]);
      }
      pieces.push('<path d="' + wall + '" fill="' + color.wall + '" fill-rule="evenodd" data-component="end-wall"/>');
      polygon([[0, 0, 0], [0, length, 0], [0, length, eave], [0, 0, eave]], color.wallSide, ' opacity="0.6"');
      for (var b = 0; b < bayCount; b++) {
        var dl = b * span + span * 0.43;
        var dw = Math.min(4.4, span * 0.28);
        var dh = Math.min(4.2, eave * 0.45);
        line([[dl, length, 0], [dl, length, dh], [dl + dw, length, dh], [dl + dw, length, 0]], color.steelTop, 1.8, ' data-component="doorway"');
        line([[dl, length - 0.2, 0.03], [dl + dw, length - 0.2, 0.03]], color.accent, 1.2);
        for (var w = 0; w < 4; w++) {
          var wx = b * span + (w + 0.15) * span / 4;
          polygon([[wx, length - 0.03, eave * 0.61], [wx + span * 0.16, length - 0.03, eave * 0.61],
            [wx + span * 0.16, length - 0.03, eave * 0.81], [wx, length - 0.03, eave * 0.81]], color.window, ' opacity="0.34"');
        }
        drawRoof(b * span, b);
      }
      for (var br = 0; br < length; br += doubleBay ? 12 : 6) {
        line([[0, br, eave * 0.23], [0, br + (doubleBay ? 12 : 6), eave * 0.84]], color.line, 0.7, ' opacity="0.28"');
      }
      if (!doubleBay) {
        pieces.push('<g data-component="lighting-tray">');
        var lampX = span * 0.3;
        line([[lampX, 0, eave - 0.6], [lampX, length, eave - 0.6]], color.steelSide, 3);
        line([[lampX, 0, eave - 0.6], [lampX, length, eave - 0.6]], color.steelTop, 0.8);
        [4, 12, 20].forEach(function (y) {
          polygon([[lampX - 0.14, y - 0.8, eave - 0.72], [lampX + 0.14, y - 0.8, eave - 0.72],
            [lampX + 0.14, y + 0.8, eave - 0.72], [lampX - 0.14, y + 0.8, eave - 0.72]], after ? "#fae6b7" : "#a4b2bc");
        });
        pieces.push("</g>");
      }
      drawColumnRow(0);
      pieces.push("</g>");
    } else {
      pieces.push('<g data-component="yard">');
      if (!after) {
        [span * 0.12, span * 0.88].forEach(function (x) {
          line([[x, 2.5, 0.03], [x, 21.5, 0.03]], "#14252e", 1.7, ' stroke-dasharray="6 5" opacity="0.82" data-component="old-rail-trace"');
        });
      }
      [0, span].forEach(function (x) {
        box(x - 0.8, 0, 0, 1.6, length, 0.16, "#465b63", "#2f454e", "#7a8e94", ' data-component="rail-foundation"');
        var sleepers = [];
        for (var sy = 1; sy < length; sy += 3) sleepers.push("M" + point([x - 0.65, sy, 0.17]) + "L" + point([x + 0.65, sy, 0.17]));
        path(sleepers.join(" "), "#435960", 1.2);
        line([[x, 0, 0.23], [x, length, 0.23]], "#b4c5c9", 1.7, ' data-component="ground-rail"');
      });
      line([[span * 0.22, 1.5, 0.03], [span * 0.78, 1.5, 0.03]], "#b9bba3", 1.4, ' stroke-dasharray="7 6"');
      line([[span * 0.2, 22.5, 0.03], [span * 0.8, 22.5, 0.03]], "#b9bba3", 1.2, ' stroke-dasharray="7 6"');
      [[0.05, 17, 0.1, 2.3, 1.3], [0.07, 20, 0.09, 2, 1.9], [0.86, 18, 0.1, 2.6, 1.7], [0.88, 4, 0.08, 2.4, 1.1]].forEach(function (s) {
        var sx = span * s[0], dx = Math.min(3.6, span * s[2]);
        shadow(sx + dx / 2, s[1] + 1, dx, 2, 0.6);
        box(sx, s[1], 0.05, dx, s[3], s[4], "#617984", "#3c5866", "#99abb1", ' data-component="stockpile"');
      });
      pieces.push("</g>");
    }

    function craneY(index) { return index ? 16.8 : length * 0.53; }
    function onRoute(points, fraction) {
      var lengths = [], total = 0;
      for (var i = 1; i < points.length; i++) {
        var dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
        var segment = Math.sqrt(dx * dx + dy * dy);
        lengths.push(segment); total += segment;
      }
      var remaining = total * fraction;
      for (var j = 0; j < lengths.length; j++) {
        if (remaining <= lengths[j] || j === lengths.length - 1) {
          var amount = lengths[j] ? remaining / lengths[j] : 0;
          return { x: points[j][0] + (points[j + 1][0] - points[j][0]) * amount,
            y: points[j][1] + (points[j + 1][1] - points[j][1]) * amount,
            dx: points[j + 1][0] - points[j][0], dy: points[j + 1][1] - points[j][1] };
        }
        remaining -= lengths[j];
      }
    }
    function drawRoute(points, index, bayIndex, routeColor) {
      pieces.push('<g data-component="agv-route" data-route-index="' + index + '" data-bay-index="' + bayIndex +
        '" data-route-color="' + routeColor + '" data-world-path="' + points.map(function (p) { return f(p[0]) + "," + f(p[1]); }).join(";") + '">');
      line(points, "#0a1821", 4.5, ' opacity="0.65"');
      line(points, routeColor, 1.45, ' stroke-dasharray="4 4" opacity="0.95"');
      var arrows = [];
      // One arrow in each third of the world-space route, away from both markers.
      for (var a = 0; a < 3; a++) {
        var position = onRoute(points, (a + 0.5) / 3);
        var center = project(position.x, position.y, 0.08);
        var ahead = project(position.x + position.dx, position.y + position.dy, 0.08);
        var vx = ahead[0] - center[0], vy = ahead[1] - center[1];
        var norm = Math.sqrt(vx * vx + vy * vy) || 1;
        vx /= norm; vy /= norm;
        arrows.push("M" + f(center[0] + vx * 3.6) + "," + f(center[1] + vy * 3.6) +
          "L" + f(center[0] - vx * 2.5 - vy * 2.4) + "," + f(center[1] - vy * 2.5 + vx * 2.4) +
          "L" + f(center[0] - vx * 2.5 + vy * 2.4) + "," + f(center[1] - vy * 2.5 - vx * 2.4) + "Z");
      }
      pieces.push('<path d="' + arrows.join(" ") + '" fill="' + routeColor + '" data-component="route-arrows"/>');
      var start = project(points[0][0], points[0][1], 0.08);
      var end = project(points[points.length - 1][0], points[points.length - 1][1], 0.08);
      pieces.push('<circle cx="' + start[0] + '" cy="' + start[1] + '" r="3.1" fill="#a5edc1" stroke="#152c33" stroke-width="1.1" data-component="pickup-marker"/>');
      pieces.push('<rect x="' + f(end[0] - 3) + '" y="' + f(end[1] - 3) + '" width="6" height="6" rx="0.5" fill="#f1ca7a" stroke="#3f3626" stroke-width="0.8" data-component="dropoff-marker"/>');
      pieces.push("</g>");
    }
    if (after) {
      for (var cast = 0; cast < bayCount; cast++) shadow(cast * span + span * 0.52, craneY(cast) + 1.5, span * 0.62, 2.1, 0.85);
      var routes = [], routeColors = ["#66dbbf", "#8bb9fc", "#e8c17b", "#d8a8ed"];
      for (var a = 0; a < count; a++) {
        var bi = doubleBay ? a % 2 : 0;
        var lane = Math.floor(a / bayCount);
        var lanesInBay = Math.ceil((count - bi) / bayCount);
        var offset = lanesInBay > 1 ? lane * Math.min(2.6, span * 0.13) / (lanesInBay - 1) : 0;
        var bx = bi * span;
        // Parallel offsets change both turns; no segment crosses a column row or end wall.
        var route = [[bx + span * 0.3 + offset, craneY(bi) - 2 + offset * 0.35, 0.08],
          [bx + span * 0.3 + offset, 3 + offset, 0.08],
          [bx + span * 0.7 - offset, 3 + offset, 0.08],
          [bx + span * 0.7 - offset, 17 + offset, 0.08], [bx + span * 0.8, 17 + offset, 0.08]];
        drawRoute(route, a, bi, routeColors[a % routeColors.length]);
        routes.push(route);
      }
      for (var vehicle = 0; vehicle < count; vehicle++) {
        var pose = onRoute(routes[vehicle], 0.13 + (vehicle % 4) * 0.12);
        use(pose.dx ? "agv-x" : "agv", pose.x, pose.y, ' data-component="agv" data-agv-index="' + vehicle +
          '" data-world-x="' + f(pose.x) + '" data-world-y="' + f(pose.y) + '"');
      }
    }

    function drawCrane(start, y, index) {
      var singleBeam = capacity <= 10;
      var beamHeight = 0.38 + Math.sqrt(capacity) * 0.066;
      var spread = singleBeam ? 0 : 2.05;
      var trolleyX = start + span * 0.56;
      var trolleySize = 0.8 + Math.sqrt(capacity) * 0.08;
      var upperHook = railHeight * 0.41;
      // The load rests on the floor at t=0; the rigging keeps the hook above it.
      // t=1 preserves the original default hook position for existing callers.
      var lowerHook = Math.min(1.7, upperHook);
      var hookZ = lowerHook + (upperHook - lowerHook) * liftT;
      var cargoSize = 1.4 + Math.sqrt(capacity) * 0.11;
      pieces.push('<g data-component="crane" data-bay-index="' + index + '">');
      if (outdoor) {
        box(start - 0.9, y - 1.1, 0.24, 1.8, 3.4, 0.6, "#aa6b20", "#724617", "#e9ad42");
        polygon([[start - 0.7, y - 0.9, 0.7], [start + 0.25, y - 0.9, railHeight], [start + 1, y - 0.9, railHeight], [start + 0.1, y - 0.9, 0.7]], "#cf902a");
        polygon([[start + 0.1, y - 0.9, 0.7], [start + 1, y - 0.9, railHeight], [start + 1, y + 1.9, railHeight], [start + 0.1, y + 1.9, 0.7]], "#9b631d");
        line([[start + 0.3, y - 0.8, 1], [start + 0.65, y - 0.8, railHeight - 0.7]], "#ffd37c", 1.1);
      }
      if (!singleBeam) box(start - 0.7, y + spread, railHeight, span + 1.4, 0.85, beamHeight, "#bb7c20", "#80531b", "#edb951");
      box(start - 0.7, y, railHeight, span + 1.4, singleBeam ? 1.05 : 0.85, beamHeight,
        "#e7a935", "#9d651d", "#ffe09a", ' data-component="bridge" data-beam-height="' + f(beamHeight) + '"');
      line([[start, y - 0.01, railHeight + beamHeight * 0.22], [start + span, y - 0.01, railHeight + beamHeight * 0.22]], "#7f541d", 1);
      [start, start + span].forEach(function (x) {
        box(x - 0.6, y - 0.5, railHeight - 0.25, 1.2, spread + 2, 0.45, "#b57d2b", "#725020", "#f1bf5e");
      });
      var trolleyZ = railHeight + beamHeight;
      box(trolleyX - trolleySize / 2, y - 0.2, trolleyZ, trolleySize, spread + 1.4, trolleySize * 0.46, "#eac162", "#a07129", "#ffe5a5");
      pieces.push('<g data-component="hoist" data-hook-z="' + f(hookZ) + '" data-lift-t="' + liftT + '">');
      line([[trolleyX - 0.18, y + 0.35, trolleyZ], [trolleyX - 0.18, y + 0.35, hookZ + 0.55]], "#c2cfd0", 1.1);
      line([[trolleyX + 0.18, y + 0.35, trolleyZ], [trolleyX + 0.18, y + 0.35, hookZ + 0.55]], "#839ba2", 1.1);
      box(trolleyX - 0.38, y, hookZ + 0.25, 0.76, 0.7, 0.65, "#edbd56", "#a47329", "#ffe3a0");
      var hook = project(trolleyX, y + 0.35, hookZ);
      path("M" + hook[0] + "," + f(hook[1] - 1) + "v4c0,7 9,7 9,0", "#f6cf7b", f(2 + Math.sqrt(capacity) * 0.17), ' data-component="hook"');
      var loadZ = Math.max(0, hookZ - 1.7);
      box(trolleyX - cargoSize / 2, y + 0.5, loadZ, cargoSize, 1.7, 1, "#738994", "#415d69", "#a0b2b8", ' data-component="load" data-load-z="' + f(loadZ) + '"');
      line([[trolleyX - cargoSize / 2, y + 0.5, loadZ + 1], [trolleyX, y + 0.35, hookZ - 0.25], [trolleyX + cargoSize / 2, y + 0.5, loadZ + 1]], "#b3c5c8", 1);
      pieces.push("</g>");
      if (outdoor) {
        box(start + span - 0.9, y - 1.1, 0.24, 1.8, 3.4, 0.6, "#c28a2d", "#87551d", "#f7c363");
        polygon([[start + span - 0.1, y - 0.9, 0.7], [start + span - 1, y - 0.9, railHeight], [start + span - 0.25, y - 0.9, railHeight], [start + span + 0.7, y - 0.9, 0.7]], "#e8ac3a");
        polygon([[start + span + 0.7, y - 0.9, 0.7], [start + span - 0.25, y - 0.9, railHeight], [start + span - 0.25, y + 1.9, railHeight], [start + span + 0.7, y + 1.9, 0.7]], "#a16a21");
        line([[start + span + 0.3, y - 0.92, 1.1], [start + span - 0.6, y - 0.92, railHeight - 0.65]], "#ffe2a2", 1.2);
      }
      pieces.push("</g>");
    }
    for (var bayIndex = 0; bayIndex < bayCount; bayIndex++) {
      if (after) drawCrane(bayIndex * span, craneY(bayIndex), bayIndex);
      if (!outdoor) drawColumnRow((bayIndex + 1) * span);
    }

    pieces.push('<g data-component="dimensions">');
    line([[0, -5.6, 0.04], [span, -5.6, 0.04]], color.accent, 1, ' opacity="0.85"');
    [0, span].forEach(function (x) { line([[x, -6.2, 0.04], [x, -4.8, 0.04]], color.accent, 1.1); });
    var dimension = project(span / 2, -5.6, 0.04);
    pieces.push('<rect x="' + f(dimension[0] - 48) + '" y="' + f(dimension[1] - 9) + '" width="96" height="18" rx="3" fill="#101e28"/>');
    text(dimension[0], dimension[1] + 3, (doubleBay ? "单跨 " : "跨度 ") + span.toFixed(1) + " m", after ? "#ffdaa0" : "#b5c7d2", 10, ' text-anchor="middle"');
    pieces.push('</g><rect x="20" y="18" width="4" height="12" rx="1" fill="' + (after ? "#f4c362" : "#8b9da8") + '"/>');
    text(32, 28, after ? "方案安装 · 效果示意" : "客户现场 · 结构示意", "#e0eaf0", 12, ' font-weight="600"');
    text(778, 27, outdoor ? "露天堆场 · 双轨基础" : doubleBay ? "双跨厂房 · 双屋脊天窗" : "单跨厂房 · 桥架 / 门洞", "#b0c3cb", 10, ' text-anchor="end"');
    if (after) {
      text(22, 355, capacity + " t  /  " + duty, "#f8d48a", 12, ' font-weight="600"');
      text(22, 373, "轨高 " + railHeight.toFixed(1) + " m · " + (outdoor ? "轨道式门机" : capacity <= 10 ? "单梁起重" : doubleBay ? "双跨起重" : "双梁起重"), "#b0c3cd", 10);
      /* 吊装对象随吨位/轨高变化：2000t 门机吊船体分段，32t 桥机吊物料，不该都写「轻载仓储」 */
      var liftTarget = (capacity >= 1000 || railHeight >= 40) ? "船体分段 / 重型构件"
        : (doubleBay && capacity >= 300 ? "钢包 / 铸件"
        : (capacity >= 300 ? "大型构件"
        : "物料搬运"));
      text(778, 355, count ? "吊装 → AGV 搬运 → 入库" : "吊装 → " + liftTarget, "#bdd6d4", 10, ' text-anchor="end"');
      var routeText = count ? (outdoor ? "多段路线 · 起吊点 → 终点" : count + " 条路线 / 起点圆点 · 终点方块") : "未配置自动搬运";
      text(778, 373, "AGV " + count + " 台 · " + routeText, "#98b0bc", 9, ' text-anchor="end"');
    } else {
      text(22, 373, outdoor ? "旧轨痕迹 / 堆料区 · 改造前示意" : "已有厂房结构 / 待安装起重设备", "#a3b7c3", 10);
    }
    text(400, 393, "模拟示意，非真实设备参数 · 非工程图", "#9fb3be", 9, ' text-anchor="middle"');
    pieces.push("</svg>");
    return pieces.join("");
  };
  window.WH.__bench = function () {
    var now = typeof performance === "object" && typeof performance.now === "function"
      ? function () { return performance.now(); } : function () { return Date.now(); };
    var start = now();
    for (var i = 0; i < 100; i++) {
      window.WH.renderScene({ span: 22.5, capacity: 32, railHeight: 9, duty: "A5", agv: 2, bayType: "single", mode: "after" });
    }
    return (now() - start) / 100;
  };
})();
