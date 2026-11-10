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
const c3d = [
  read(path.join(ROOT, "src", "calib.js"), true),   // A 可选
  read(path.join(ROOT, "src", "model.js"), true),   // B 可选
  read(path.join(ROOT, "src", "view3d.js")),        // C 核心
  read(path.join(ROOT, "src", "glue.js"))           // C 接线
].filter(Boolean);
const app2d = [
  read(path.join(APP2D, "data.js")),
  read(path.join(APP2D, "render.js")),
  read(path.join(APP2D, "ui.js"))
];
const css = read(path.join(APP2D, "app.css"), true) || "";

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
const missing = ["WH.DATA", "WH.view3d", "renderScene", "initUI", "whModeView3d"]
  .filter(k => out.indexOf(k) === -1);
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
console.log("  output :", outPath);
console.log("  size   :", size, "bytes (" + (size / 1024).toFixed(0) + " KB)");
console.log("  calib  :", fs.existsSync(path.join(ROOT, "src", "calib.js")) ? "已接线(A)" : "缺省→示意地面(L2)");
console.log("  model  :", fs.existsSync(path.join(ROOT, "src", "model.js")) ? "已接线(B)" : "缺省→stub 方块");
