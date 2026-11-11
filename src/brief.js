/* ============================================================
 * src/brief.js  ·  技术方案文本 → 结构化参数（规则解析 + 人工确认）
 *
 * 职责边界（重要）：
 *   - 本文件不碰 src/ui.js、不碰 src/data.js、不碰任何建模代码。
 *   - 只做两件事：把一段中文技术方案文本里的关键参数抽出来；给一个人工确认的入口。
 *   - 抽不到就留空，不猜、不补默认值。所有抽到的值都带原文片段，供人核对。
 *
 * 为什么是规则而不是大模型：
 *   BRIEF.md 第 24 行硬约束「零网络请求、零 CDN」，现场只开放办公网。
 *   所以这里只做正则抽取，不做语义推断，也不承诺能读懂任意写法。
 *
 * 对外接口：
 *   WH.brief.parse(text)              -> 结果对象（纯函数，不碰 DOM）
 *   WH.brief.applyTo(result, base)    -> 把结果应用到画面（见 applyTo 注释）
 *   WH.brief.mount(opts)              -> 注入悬浮入口（自动执行一次）
 *   WH.brief.__rules                  -> 规则表，便于测试与扩展
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};

  /* ---------------- 字段定义与取值范围 ----------------
   * 上限与 src/data.js 的 validate、scene71-3d/src/model.js 的 norm 保持一致，
   * 否则会出现「识别成功但建模时被夹回默认值」的静默错位。 */
  var FIELDS = [
    { key: "span",       label: "跨度",     unit: "m",  min: 4,    max: 150, kind: "num" },
    { key: "capacity",   label: "起重量",   unit: "t",  min: 1,    max: 5000, kind: "num" },
    { key: "railHeight", label: "轨高",     unit: "m",  min: 3,    max: 80,  kind: "num" },
    { key: "duty",       label: "工作级别", unit: "",   kind: "duty" },
    { key: "agv",        label: "AGV 数量", unit: "台", min: 0,    max: 8,   kind: "int" },
    { key: "productType", label: "设备类别", unit: "",  kind: "enum" },
    { key: "bayType",    label: "场地形式", unit: "",   kind: "enum" }
  ];

  var PRODUCT_NAMES = { bridge: "桥式", gantry: "门式", casting: "铸造", portal: "门座式" };
  var BAY_NAMES = { single: "单跨厂房", double: "双跨厂房", outdoor: "露天堆场" };

  /* 顺序有讲究：门座式含「门」、铸造常与「冶金/钢包」同现，
     所以先判更具体的，再判桥式与门式。 */
  var PRODUCT_RULES = [
    { value: "portal",  re: /门座式|门座起重机|四连杆|座式起重机/ },
    { value: "casting", re: /铸造起重机|铸造吊|冶金起重机|钢包|铁水|加料起重机/ },
    { value: "bridge",  re: /桥式起重机|桥式吊|双梁桥式|单梁桥式|桥式/ },
    { value: "gantry",  re: /门式起重机|龙门起重机|龙门吊|门式|龙门/ }
  ];
  var BAY_RULES = [
    { value: "outdoor", re: /露天|室外|户外|堆场|船厂|船台|工地/ },
    { value: "double",  re: /双跨|两跨|多跨/ },
    { value: "single",  re: /单跨|车间内|厂房内/ }
  ];

  /* ---------------- 小工具 ---------------- */
  function snippet(text, index, length) {
    var start = Math.max(0, index - 12);
    var end = Math.min(text.length, index + length + 10);
    return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() +
      (end < text.length ? "…" : "");
  }
  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  /* 在文本里找「关键词 + 数值 + 单位」，返回首个命中与全部命中次数。
   * 支持：跨度 48 m / 跨度：48m / 跨度48米 / 跨度约为 48.0 米 / 跨度 48~60 m */
  function grabNumber(text, keys, unitRe) {
    var kw = keys.join("|");
    /* 「约为 / 约是 / 为 / 是 / 冒号」都可能有，也可能是两个字，所以用交替而不是单字符类 */
    var re = new RegExp("(?:" + kw + ")\\s*(?:约为|约是|约|为|是|[:：])?\\s*(\\d+(?:\\.\\d+)?)", "g");
    var hits = [], m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ value: num(m[1]), index: m.index, length: m[0].length, raw: m[0] });
      if (hits.length > 12) break;
    }
    if (!hits.length) return null;

    var first = hits[0];
    var after = text.slice(first.index + first.length, first.index + first.length + 14);

    /* 范围值（48~60 m / 48 至 60 米）：单位落在范围末尾，不能按「紧跟单位」判 */
    var range = after.match(new RegExp("^\\s*(?:" + unitRe + ")?\\s*[~～\\-–—至到]\\s*(\\d+(?:\\.\\d+)?)"));
    var unitOk;
    if (range) {
      var afterRange = after.slice(range[0].length);
      unitOk = new RegExp("^\\s*(?:" + unitRe + ")", "i").test(afterRange) ||
               new RegExp("(?:" + unitRe + ")", "i").test(range[0]);
    } else {
      unitOk = new RegExp("^\\s*(?:" + unitRe + ")", "i").test(after);
    }

    return {
      value: first.value,
      raw: snippet(text, first.index, first.length),
      unitOk: unitOk,
      count: hits.length,
      rangeTo: range ? num(range[1]) : null
    };
  }

  function grabDuty(text) {
    var m = text.match(/(?:工作级别|工作制度|级别)\s*[为是:：]?\s*(A[1-8])/i);
    if (!m) {
      var loose = text.match(/\b(A[1-8])\b/);
      if (!loose) return null;
      return { value: loose[1].toUpperCase(), raw: snippet(text, loose.index, loose[0].length), loose: true };
    }
    return { value: m[1].toUpperCase(), raw: snippet(text, m.index, m[0].length), loose: false };
  }

  function grabAgv(text) {
    var m = text.match(/AGV\s*[为是:：]?\s*(\d+)\s*台/i) || text.match(/(\d+)\s*台\s*AGV/i);
    if (!m) return null;
    return { value: parseInt(m[1], 10), raw: snippet(text, m.index, m[0].length) };
  }

  function matchEnum(text, rules) {
    for (var i = 0; i < rules.length; i++) {
      var m = text.match(rules[i].re);
      if (m) return { value: rules[i].value, raw: snippet(text, m.index, m[0].length) };
    }
    return null;
  }

  /* ---------------- 主解析 ----------------
   * 返回结构：
   * {
   *   ok: 是否至少抽到一项,
   *   fields: { span: { value, raw, status }, ... },
   *   params: { 只含抽到的值 },
   *   summary: { matched, total, missing: [key...] },
   *   warnings: [ "..." ]
   * }
   * status: matched（原文抽到且合法）/ invalid（抽到但超范围）/ missing（没抽到）
   */
  function parse(text) {
    var src = String(text == null ? "" : text);
    var warnings = [];
    var fields = {};
    var matched = 0;

    if (!src.trim()) {
      return {
        ok: false, fields: {}, params: {},
        summary: { matched: 0, total: FIELDS.length, missing: FIELDS.map(function (f) { return f.key; }) },
        warnings: ["输入为空"]
      };
    }

    function accept(def, hit, unitRe) {
      if (!hit) {
        fields[def.key] = { value: null, raw: "", status: "missing" };
        return;
      }
      if (hit.unitOk === false && unitRe) {
        // 数值后面不是期望单位，可能是别的参数误命中，保守丢弃
        fields[def.key] = { value: null, raw: hit.raw, status: "missing" };
        warnings.push(def.label + "：命中「" + hit.raw + "」但单位不是 " + def.unit + "，已忽略");
        return;
      }
      if (def.kind === "num" || def.kind === "int") {
        var v = def.kind === "int" ? Math.round(hit.value) : hit.value;
        if (v < def.min || v > def.max) {
          fields[def.key] = { value: null, raw: hit.raw, status: "invalid" };
          warnings.push(def.label + " " + v + " 超出 " + def.min + " 到 " + def.max + " 的范围，未采用");
          return;
        }
        if (hit.rangeTo != null) {
          warnings.push(def.label + "原文是范围值（到 " + hit.rangeTo + "），已取第一个数 " + v);
        }
        if (hit.count > 1) {
          warnings.push("原文出现 " + hit.count + " 处「" + def.label + "」，已取第一处");
        }
        fields[def.key] = { value: v, raw: hit.raw, status: "matched" };
        matched++;
        return;
      }
      fields[def.key] = { value: hit.value, raw: hit.raw, status: "matched" };
      matched++;
    }

    accept(FIELDS[0], grabNumber(src, ["跨度", "跨距"], "m|米"), "m|米");
    accept(FIELDS[1], grabNumber(src, ["额定起重量", "起重量", "起吊重量", "吊重", "吨位"], "t|吨"), "t|吨");
    accept(FIELDS[2], grabNumber(src, ["轨面标高", "轨顶标高", "轨面高度", "轨高"], "m|米"), "m|米");

    var duty = grabDuty(src);
    if (duty) {
      if (duty.loose) warnings.push("工作级别是从单独的「" + duty.value + "」认出来的，未带「工作级别」字样，请核对");
      accept(FIELDS[3], duty);
    } else {
      accept(FIELDS[3], null);
    }

    accept(FIELDS[4], grabAgv(src));
    accept(FIELDS[5], matchEnum(src, PRODUCT_RULES));
    accept(FIELDS[6], matchEnum(src, BAY_RULES));

    var missing = FIELDS.filter(function (f) {
      return !fields[f.key] || fields[f.key].value == null;
    }).map(function (f) { return f.key; });

    if (matched === 0) warnings.push("没有识别到任何参数，请检查文本里是否写了「跨度 xx m」这类明确数值");

    var params = {};
    FIELDS.forEach(function (f) {
      if (fields[f.key] && fields[f.key].value != null) params[f.key] = fields[f.key].value;
    });

    return {
      ok: matched > 0,
      fields: fields,
      params: params,
      summary: { matched: matched, total: FIELDS.length, missing: missing },
      warnings: warnings
    };
  }

  /* ---------------- 应用到画面 ----------------
   * 优先级：
   *   1) WH.__applyParams(params)   —— 若 ui.js 将来提供正式入口，状态完全一致
   *   2) WH.view3d.setModel(WH.model.build(params))  —— 3D 产物直接换模型
   *   3) #whAfter.innerHTML = WH.renderScene(...)    —— 2D 产物直接换图
   * 后两条是降级路径：只换画面，不改 ui.js 的内部状态，切方案时会被覆盖（这是预期行为）。
   * 缺项用 base 里的对应值补齐，并在返回值里列出「沿用了哪些」。 */
  function applyTo(result, base) {
    var params = {}, filled = [], missing = [];
    var fallback = base || (window.WH && WH.DATA && WH.DATA.configs && WH.DATA.configs[0]) || {};
    FIELDS.forEach(function (f) {
      var v = result && result.params ? result.params[f.key] : undefined;
      if (v != null) {
        params[f.key] = v;
      } else if (fallback[f.key] != null) {
        params[f.key] = fallback[f.key];
        filled.push(f.key);
      } else {
        missing.push(f.key);
      }
    });

    if (typeof window.WH.__applyParams === "function") {
      try {
        window.WH.__applyParams(params);
        return { via: "WH.__applyParams", params: params, filled: filled, missing: missing };
      } catch (e) { /* 落到降级 */ }
    }

    var via = [], errs = [];
    /* view3d 的对外接口是 replaceModel（保留当前视角）；老版本可能叫 setModel，两个都认。 */
    var v3 = window.WH.view3d;
    var setter = v3 && (typeof v3.replaceModel === "function" ? v3.replaceModel
      : (typeof v3.setModel === "function" ? v3.setModel : null));
    if (setter && window.WH.model && typeof window.WH.model.build === "function") {
      try {
        setter.call(v3, window.WH.model.build(params));
        via.push("3D 换模型");
      } catch (e) {
        errs.push("3D 换模型失败：" + (e && e.message ? e.message : String(e)));
      }
    }
    var el = document.getElementById("whAfter");
    if (el && typeof window.WH.renderScene === "function") {
      try {
        var svg = window.WH.renderScene({
          span: params.span, capacity: params.capacity, railHeight: params.railHeight,
          duty: params.duty, agv: params.agv, bayType: params.bayType,
          productType: params.productType, mode: "after"
        });
        el.innerHTML = String(svg).replace(/preserveAspectRatio\s*=\s*["'][^"']*["']/g,
          'preserveAspectRatio="xMidYMid meet"');
        via.push("2D 换图");
      } catch (e) {
        errs.push("2D 换图失败：" + (e && e.message ? e.message : String(e)));
      }
    }

    return { via: via.join(" + ") || "未找到可应用的画面", params: params, filled: filled, missing: missing, errors: errs };
  }

  /* ---------------- 悬浮入口（不依赖 ui.js） ---------------- */
  var CSS = "" +
    ".whb-fab{position:fixed;right:18px;bottom:18px;z-index:9998;display:flex;align-items:center;gap:6px;" +
    "font:600 13px/1 'Microsoft YaHei',sans-serif;color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);" +
    "border:0;border-radius:999px;padding:11px 16px;cursor:pointer;box-shadow:0 8px 22px rgba(245,154,31,.32)}" +
    ".whb-fab:hover{filter:brightness(1.06)}" +
    ".whb-mask{position:fixed;inset:0;z-index:9999;background:rgba(5,10,18,.86);display:flex;align-items:center;justify-content:center;padding:20px}" +
    ".whb-mask[hidden]{display:none}" +
    ".whb-box{width:min(880px,100%);max-height:88vh;overflow:auto;background:#101a23;color:#dce8ee;border:1px solid #2b3b47;" +
    "border-radius:12px;padding:18px 20px;font:14px/1.55 'Microsoft YaHei',sans-serif}" +
    ".whb-box h3{margin:0 0 4px;font-size:17px}" +
    ".whb-hint{color:#8fa8b6;font-size:12.5px;margin:0 0 10px}" +
    ".whb-box textarea{width:100%;min-height:150px;resize:vertical;background:#0b141c;color:#e6f0f5;border:1px solid #33454f;" +
    "border-radius:8px;padding:10px;font:13px/1.5 'Microsoft YaHei',sans-serif}" +
    ".whb-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}" +
    ".whb-btn{font:600 13px 'Microsoft YaHei',sans-serif;color:#dbe4ee;background:#1a212b;border:1px solid #2c3745;" +
    "border-radius:8px;padding:8px 14px;cursor:pointer}" +
    ".whb-btn.primary{color:#12161c;background:linear-gradient(135deg,#ffc24b,#f59a1f);border-color:transparent}" +
    ".whb-btn:disabled{opacity:.45;cursor:not-allowed}" +
    ".whb-sum{margin:12px 0 6px;font-size:13px;color:#9fb6c2}" +
    ".whb-table{width:100%;border-collapse:collapse;font-size:13px}" +
    ".whb-table th,.whb-table td{text-align:left;padding:6px 8px;border-bottom:1px solid #1e2c36;vertical-align:top}" +
    ".whb-table th{color:#8fa8b6;font-weight:600;font-size:12px}" +
    ".whb-st{font-weight:700;white-space:nowrap}" +
    ".whb-st.matched{color:#83d8ad}.whb-st.invalid{color:#f3c34f}.whb-st.missing{color:#ff8d84}" +
    ".whb-raw{color:#7e94a1;font-size:12px}" +
    ".whb-warn{margin:10px 0 0;padding-left:18px;color:#f3c34f;font-size:12.5px}" +
    ".whb-warn li{margin:2px 0}" +
    ".whb-apply{color:#9fb6c2;font-size:12.5px;margin-top:10px}";

  var STATUS_TEXT = { matched: "已识别", invalid: "超范围", missing: "未识别" };

  function injectStyle() {
    if (document.getElementById("whb-style")) return;
    var s = document.createElement("style");
    s.id = "whb-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(opts) {
    opts = opts || {};
    if (typeof document === "undefined") return null;
    if (document.getElementById("whb-fab")) return null;   // 已挂载

    injectStyle();

    var fab = document.createElement("button");
    fab.id = "whb-fab";
    fab.className = "whb-fab";
    fab.type = "button";
    fab.textContent = "📄 技术方案";
    fab.title = "粘贴技术方案里的参数段，自动抽成参数（需人工核对）";

    var mask = document.createElement("div");
    mask.className = "whb-mask";
    mask.hidden = true;
    mask.innerHTML =
      '<div class="whb-box" role="dialog" aria-label="技术方案参数识别">' +
        '<h3>技术方案 → 参数</h3>' +
        '<p class="whb-hint">把方案里写参数的那几句贴进来（如「跨度 48 m，额定起重量 2000 t，轨高 30 m，门式起重机」）。' +
        '只抽明确写出的数值，抽不到就留空，不做推断。识别结果需人工核对后才能使用。</p>' +
        '<textarea id="whb-text" placeholder="示例：本工程采用门式起重机，跨度 48 m，额定起重量 2000 t，轨面标高 30 m，工作级别 A8，AGV 2 台，露天堆场。"></textarea>' +
        '<div class="whb-row">' +
          '<button class="whb-btn primary" id="whb-parse" type="button">解析</button>' +
          '<button class="whb-btn" id="whb-clear" type="button">清空</button>' +
          '<button class="whb-btn" id="whb-close" type="button" style="margin-left:auto">关闭</button>' +
        '</div>' +
        '<div id="whb-out"></div>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(mask);

    var ta = mask.querySelector("#whb-text");
    var out = mask.querySelector("#whb-out");
    var lastResult = null;

    function render(result) {
      var rows = FIELDS.map(function (f) {
        var cell = result.fields[f.key] || { value: null, raw: "", status: "missing" };
        var shown = cell.value == null ? "—" : (f.kind === "enum"
          ? (f.key === "productType" ? PRODUCT_NAMES[cell.value] : BAY_NAMES[cell.value])
          : cell.value + (f.unit ? " " + f.unit : ""));
        return '<tr><td>' + f.label + '</td><td><b>' + shown + '</b></td>' +
          '<td class="whb-st ' + cell.status + '">' + STATUS_TEXT[cell.status] + '</td>' +
          '<td class="whb-raw">' + (cell.raw ? escapeHtml(cell.raw) : "") + '</td></tr>';
      }).join("");

      var warn = result.warnings.length
        ? '<ul class="whb-warn">' + result.warnings.map(function (w) {
            return "<li>" + escapeHtml(w) + "</li>";
          }).join("") + "</ul>"
        : "";

      out.innerHTML =
        '<p class="whb-sum">识别到 ' + result.summary.matched + ' 项，共 ' + result.summary.total + ' 项' +
        (result.summary.missing.length ? "；未识别：" + result.summary.missing.map(function (k) {
          var f = FIELDS.filter(function (x) { return x.key === k; })[0];
          return f ? f.label : k;
        }).join("、") : "") + '</p>' +
        '<table class="whb-table"><thead><tr><th>参数</th><th>识别值</th><th>状态</th><th>原文依据</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' + warn +
        '<div class="whb-row"><button class="whb-btn primary" id="whb-apply" type="button"' +
        (result.summary.matched ? "" : " disabled") + '>应用到画面</button>' +
        '<span class="whb-apply" id="whb-applied"></span></div>';

      var applyBtn = out.querySelector("#whb-apply");
      if (applyBtn) {
        applyBtn.addEventListener("click", function () {
          var res = applyTo(result);
          var msg = "已应用（" + res.via + "）";
          if (res.filled && res.filled.length) {
            msg += "；" + res.filled.length + " 项未识别，沿用当前方案";
          }
          out.querySelector("#whb-applied").textContent = msg;
        });
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    fab.addEventListener("click", function () {
      mask.hidden = false;
      setTimeout(function () { ta.focus(); }, 30);
    });
    mask.querySelector("#whb-close").addEventListener("click", function () { mask.hidden = true; });
    mask.addEventListener("click", function (e) { if (e.target === mask) mask.hidden = true; });
    mask.querySelector("#whb-clear").addEventListener("click", function () {
      ta.value = ""; out.innerHTML = ""; lastResult = null; ta.focus();
    });
    mask.querySelector("#whb-parse").addEventListener("click", function () {
      lastResult = parse(ta.value);
      render(lastResult);
    });

    if (opts.autoOpen) mask.hidden = false;
    return { fab: fab, mask: mask, parse: parse, applyTo: applyTo };
  }

  window.WH.brief = {
    version: "1.0.0",
    fields: FIELDS,
    productNames: PRODUCT_NAMES,
    bayNames: BAY_NAMES,
    parse: parse,
    applyTo: applyTo,
    mount: mount,
    __rules: { product: PRODUCT_RULES, bay: BAY_RULES }
  };

  /* 自动挂载：只在有 body 且页面已有 #app 时注入，避免在 Node 测试环境里报错 */
  if (typeof document !== "undefined" && document.getElementById && document.body) {
    if (document.getElementById("app")) {
      try { mount(); } catch (e) { /* 挂载失败不影响解析能力 */ }
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        if (document.getElementById("app")) {
          try { mount(); } catch (e) { /* 同上 */ }
        }
      });
    }
  }
})();
