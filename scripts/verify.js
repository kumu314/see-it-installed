/* ============================================================
 * scripts/verify.js  ·  验收执行器（纯检查，不含任何实现代码）
 *
 * 用法：
 *   node scripts/verify.js             # 静态检查 + 浏览器断言 + 截图
 *   node scripts/verify.js --offline   # 只做静态检查（没有 Chrome 时）
 *   node scripts/verify.js --file=dist/作品71.html
 *
 * 前置：需要一个开着 9223 端口的 Chrome（本地断言用）
 *   chrome.exe --headless=new --remote-debugging-port=9223 \
 *     --user-data-dir=<临时目录> about:blank
 *
 * 设计原则：只断言「行为存在」，不绑定具体 DOM 类名/id，
 * 以免变相规定开工者的实现方式。
 * ========================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const fileArg = args.find(a => a.startsWith("--file="));
const target = fileArg
  ? path.resolve(ROOT, fileArg.slice(7))
  : path.join(ROOT, "dist", "作品71.html");

const results = [];
function ok(name, detail) { results.push({ pass: true, name, detail: detail || "" }); }
function bad(name, detail) { results.push({ pass: false, name, detail: detail || "" }); }

function finish() {
  const failed = results.filter(r => !r.pass);
  console.log("\n验收结果");
  console.log("─".repeat(52));
  results.forEach(r => {
    console.log((r.pass ? "  PASS  " : "  FAIL  ") + r.name + (r.detail ? "  · " + r.detail : ""));
  });
  console.log("─".repeat(52));
  console.log(failed.length ? "FAILED " + failed.length + " / " + results.length : "ALL PASS " + results.length);
  process.exit(failed.length ? 1 : 0);
}

/* ---------- 1. 静态检查 ---------- */
if (!fs.existsSync(target)) {
  console.error("NOT_BUILT: 找不到 " + path.relative(ROOT, target));
  console.error("先跑：node build.js");
  process.exit(2);
}
const html = fs.readFileSync(target, "utf8");
const bytes = Buffer.byteLength(html);

ok("产物存在", path.relative(ROOT, target) + " · " + bytes + " bytes");

const extAll = (html.match(/https?:\/\/[^"\s)]+/g) || []);
const ext = extAll.filter(u => u.indexOf("www.w3.org/2000/svg") === -1);
ext.length ? bad("零外部引用", ext.slice(0, 3).join(", ")) : ok("零外部引用");

/<script[^>]+src=|<link[^>]+href=|@import\s+url\(/.test(html)
  ? bad("无 <script src> / <link href> / @import")
  : ok("无 <script src> / <link href> / @import");

const mods = ["WH.DATA", "renderScene", "initUI"].filter(k => html.indexOf(k) === -1);
mods.length ? bad("三个模块已内联", "缺 " + mods.join(", ")) : ok("三个模块已内联");

if (bytes > 400 * 1024) bad("体积预算 ≤ 400KB", bytes + " bytes");
else ok("体积预算 ≤ 400KB", bytes + " bytes");

if (offline) finish();

/* ---------- 2. 浏览器断言 ---------- */
const PORT = Number(process.env.CDP_PORT || 9223);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  let targets = null;
  for (let i = 0; i < 12; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); break; }
    catch (e) { await sleep(400); }
  }
  if (!targets) {
    console.error("\nSKIP_BROWSER: 连不上 127.0.0.1:" + PORT + " 的 Chrome。");
    console.error("静态检查已通过；要跑浏览器断言，请先启动 Chrome：");
    console.error("  chrome.exe --headless=new --remote-debugging-port=" + PORT +
      " --user-data-dir=<临时目录> about:blank");
    console.error("或只跑静态检查：node scripts/verify.js --offline\n");
    process.exit(3);
  }

  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pend = new Map();
  const runtimeErrors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    } else if (m.method === "Runtime.exceptionThrown") {
      runtimeErrors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      runtimeErrors.push(m.params.args.map(a => a.value).join(" "));
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const tree = await send("Page.getFrameTree");
  await sleep(300);
  runtimeErrors.length = 0;
  await send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html });
  await sleep(900);

  const dom = await ev(`(function(){
    var app=document.getElementById('app');
    return {
      appLen: app ? app.innerHTML.length : -1,
      svgs: document.querySelectorAll('svg').length,
      ranges: document.querySelectorAll('input[type=range]').length,
      buttons: document.querySelectorAll('button').length,
      bodyH: document.body.scrollHeight,
      textLen: (document.body.innerText||'').length
    };
  })()`);

  dom.appLen > 500 ? ok("#app 已渲染", dom.appLen + " chars") : bad("#app 已渲染", "只有 " + dom.appLen + " chars");
  dom.svgs >= 1 ? ok("存在 SVG（对比图）", dom.svgs + " 个") : bad("存在 SVG（对比图）", "0 个");
  dom.ranges >= 1 ? ok("存在滑块", dom.ranges + " 个") : bad("存在滑块", "0 个");
  dom.buttons >= 3 ? ok("按钮 ≥ 3（播放/跳过/全屏）", dom.buttons + " 个") : bad("按钮 ≥ 3（播放/跳过/全屏）", dom.buttons + " 个");
  dom.bodyH > 300 ? ok("页面非白屏", "高度 " + dom.bodyH + "px") : bad("页面非白屏", "高度 " + dom.bodyH + "px");
  dom.textLen > 80 ? ok("有可读文案", dom.textLen + " 字") : bad("有可读文案", dom.textLen + " 字");

  runtimeErrors.length
    ? bad("运行时无报错", runtimeErrors.slice(0, 2).join(" | ").slice(0, 160))
    : ok("运行时无报错");

  /* 截图存档 */
  const shotDir = path.join(ROOT, "shots");
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const shotPath = path.join(shotDir, "verify-" + Date.now() + ".png");
  fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
  ok("已截图存档", path.relative(ROOT, shotPath));

  ws.close();
  finish();
}

main().catch(e => { console.error("VERIFY_CRASH:", e.message); process.exit(1); });
