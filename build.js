/* ============================================================
 * build.js  ·  合成单文件 + 三项自检
 * 用法：node build.js
 * 输出：dist/作品71.html
 * ========================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const tplPath = path.join(ROOT, "template.html");
const mods = ["data.js", "brief.js", "render.js", "ui.js"]; // 顺序不可换，见 CONTRACT.md
const cssPath = path.join(ROOT, "src", "app.css");

function read(p) {
  if (!fs.existsSync(p)) {
    console.error("MISSING FILE:", p);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

const tpl = read(tplPath);
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
const js = mods.map(function (f) {
  return "\n/* ===== src/" + f + " ===== */\n" + read(path.join(ROOT, "src", f));
}).join("\n");

let out = tpl
  .replace("<!--INJECT_CSS-->", css)
  .replace("<!--INJECT_JS-->", "<script>\n" + js + "\n</script>");

/* ---- 三项自检 ---- */
const extAll = (out.match(/https?:\/\/[^"\s)]+/g) || []);
const ext = extAll.filter(function (u) { return u.indexOf("www.w3.org/2000/svg") === -1; });
const badSrc = /<script[^>]+src=|<link[^>]+href=|@import\s+url\(/.test(out);
const missing = ["WH.DATA", "WH.brief", "renderScene", "initUI"].filter(function (k) {
  return out.indexOf(k) === -1;
});

if (ext.length || badSrc || missing.length) {
  console.error("SELF-CHECK FAILED");
  if (ext.length) console.error("  外部 URL:", ext.slice(0, 5));
  if (badSrc) console.error("  存在 <script src> / <link href> / @import url()");
  if (missing.length) console.error("  未内联的模块:", missing);
  process.exit(1);
}

const distDir = path.join(ROOT, "dist");
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, "作品71.html");
fs.writeFileSync(outPath, out);

console.log("BUILD OK");
console.log("  output :", outPath);
console.log("  size   :", Buffer.byteLength(out), "bytes");
console.log("  modules:", mods.join(" → "));
console.log("  extern :", ext.length, "| script-src:", badSrc, "| missing:", missing.length);
