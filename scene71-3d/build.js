/* ============================================================
 * scene71-3d/build.js  ·  合成 3D 单文件产物 + 自检（任务 C9/C10）
 * 用法：node build.js
 * 输出：scene71-3d/dist/作品71-3d.html
 *
 * 模块顺序（不可换）：
 *   three.min.js（内联） → [calib.js 可选] → [model.js 可选]
 *   → view3d.js → glue.js → data.js → render.js → ui.js
 * 说明：data/render/ui 来自 ../weihua-71/src（2D 基座，本任务不改）；
 *       A/B 未交付时对应文件缺失不报错，自动降级（铁律 2）。
 * ========================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
/* --strict：CI 专用。默认宽松，便于 A/B 并行开发早期模块还没交齐。
   开启后 calib.js / model.js 任一缺失就直接非零退出，杜绝
   「模块没接上、页面却画 stub 方块、CI 还全绿」的静默降级。 */
const STRICT = process.argv.indexOf("--strict") !== -1;
/* 2D 基座（data/render/ui）位置：仓库内布局优先（scene71-3d/../src），退回工作区外部布局（../weihua-71/src） */
const APP2D_CANDIDATES = [path.join(ROOT, "..", "src"), path.join(ROOT, "..", "weihua-71", "src")];
const APP2D = APP2D_CANDIDATES.find(p => fs.existsSync(path.join(p, "data.js"))) || APP2D_CANDIDATES[0];
const tplPath = path.join(ROOT, "template3d.html");
const threePath = path.join(ROOT, "vendor", "three.min.js");

function read(p, optional) {
  if (!fs.existsSync(p)) {
    if (optional) return null;
    console.error("MISSING FILE:", p);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

/* ---- 收集模块 ---- */
const threeSrc = read(threePath);
// The integrated repository keeps A/B under ../src; standalone copies may keep them locally.
const OPT_CACHE = Object.create(null);
const OPT_SRC = Object.create(null);
function optional3d(name) {
  if (name in OPT_CACHE) return OPT_CACHE[name];
  var local = path.join(ROOT, "src", name);
  var fallback = path.join(APP2D, name);
  var picked = fs.existsSync(local) ? local : (fs.existsSync(fallback) ? fallback : null);
  OPT_SRC[name] = picked;
  OPT_CACHE[name] = picked ? read(picked, true) : null;
  return OPT_CACHE[name];
}
const c3d = [
  optional3d("calib.js"),                            // A 可选
  optional3d("model.js"),                            // B 可选
  read(path.join(ROOT, "src", "view3d.js")),        // C 核心
  read(path.join(ROOT, "src", "glue.js")),          // C 接线
  read(path.join(ROOT, "src", "calib-ui.js"))      // 标定入口
].filter(Boolean);
const app2d = [
  read(path.join(APP2D, "data.js")),
  read(path.join(APP2D, "brief.js")),   // 技术方案文本 → 参数（规则解析，零依赖）
  read(path.join(APP2D, "render.js")),
  read(path.join(APP2D, "ui.js"))
];
const css = read(path.join(APP2D, "app.css"), true) || "";

if (STRICT) {
  var missing3d = ["calib.js", "model.js"].filter(function (n) { return !OPT_CACHE[n]; });
  if (missing3d.length) {
    console.error("STRICT FAILED: 3D 模块缺失 → " + missing3d.join(", "));
    console.error("  期望目录: " + path.join(ROOT, "src"));
    console.error("  回落目录: " + APP2D);
    console.error("  宽松模式会静默降级成 stub 方块；CI 不允许。");
    process.exit(1);
  }
}

const tpl = read(tplPath);
const block = arr => arr.map(s => "/* ==== module ==== */\n" + s).join("\n");

let out = tpl
  .replace("<!--INJECT_CSS-->", () => css)
  .replace("<!--INJECT_THREE-->", () => "<script>\n" + threeSrc + "\n</script>")
  .replace("<!--INJECT_JS-->", () => "<script>\n" + block(c3d) + "\n</script>\n<script>\n" + block(app2d) + "\n</script>");

/* ---- 自检 ---- */
const urls = (out.match(/https?:\/\/[^"\s)'"]+/g) || [])
  .filter(u => !/w3\.org|threejs\.org|github\.com\/mrdoob|mrdoob\.com|discourse\.threejs|donmccurdy/.test(u));
const badSrc = /<script[^>]+src=|<link[^>]+href=|@import\s+url\(/.test(out);
var required = ["WH.DATA", "WH.view3d", "renderScene", "initUI", "whModeModel"];
if (STRICT) required = required.concat(["WH.model", "WH.calib"]);
const missing = required.filter(k => out.indexOf(k) === -1);
if (out.indexOf("WH.brief") === -1) missing.push("WH.brief");   // 方案解析模块必须内联
const size = Buffer.byteLength(out);

if (urls.length || badSrc || missing.length) {
  console.error("SELF-CHECK FAILED");
  if (urls.length) console.error("  外部 URL:", urls.slice(0, 5));
  if (badSrc) console.error("  存在 <script src> / <link href> / @import url()");
  if (missing.length) console.error("  未内联的模块:", missing);
  process.exit(1);
}
if (size > 900 * 1024) {
  console.error("SELF-CHECK FAILED: 体积超 900KB →", size, "bytes");
  process.exit(1);
}

const distDir = path.join(ROOT, "dist");
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, "作品71-3d.html");
fs.writeFileSync(outPath, out);

console.log("BUILD OK (3D)");
console.log("  mode   :", STRICT ? "strict（CI）" : "宽松（并行开发）");
console.log("  output :", outPath);
console.log("  size   :", size, "bytes (" + (size / 1024).toFixed(0) + " KB)");
console.log("  calib  :", optional3d("calib.js") ? "已接线(A)" : "缺省→示意地面(L2)");
console.log("  model  :", optional3d("model.js") ? "已接线(B)" : "缺省→stub 方块");
if (STRICT) {
  console.log("  calib从:", OPT_SRC["calib.js"]);
  console.log("  model从:", OPT_SRC["model.js"]);
}
