/* src/brief.js 的回归测试：零依赖，node tests/brief/parse.cjs
 * 只测纯函数 parse()，不碰 DOM。每条用例给出「期望值」与「期望状态」，
 * 失败时打印实际结果，退出码 1。 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const ctx = { window: { WH: {} }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "brief.js"), "utf8"), ctx, { filename: "brief.js" });
const B = ctx.window.WH.brief;
const parse = B.parse;

let pass = 0, fail = 0;
function eq(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  if (ok) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + "\n        期望 " + JSON.stringify(expect) + "\n        实际 " + JSON.stringify(actual)); }
}
function field(r, k) { return r.fields[k] ? r.fields[k].value : undefined; }
function status(r, k) { return r.fields[k] ? r.fields[k].status : undefined; }

console.log("=== 1. 标准写法（场景里的典型句子）===");
{
  const r = parse("本工程采用门式起重机，跨度 48 m，额定起重量 2000 t，轨面标高 30 m，工作级别 A8，AGV 2 台，露天堆场。");
  eq("span", field(r, "span"), 48);
  eq("capacity", field(r, "capacity"), 2000);
  eq("railHeight", field(r, "railHeight"), 30);
  eq("duty", field(r, "duty"), "A8");
  eq("agv", field(r, "agv"), 2);
  eq("productType", field(r, "productType"), "gantry");
  eq("bayType", field(r, "bayType"), "outdoor");
  eq("七项全中", r.summary.matched, 7);
  eq("无缺失", r.summary.missing, []);
}

console.log("=== 2. 写法变体 ===");
eq("全角冒号+无空格", field(parse("跨度：48m"), "span"), 48);
eq("中文单位", field(parse("跨度 48 米"), "span"), 48);
eq("紧贴无空格", field(parse("跨度48m"), "span"), 48);
eq("带「约为」", field(parse("跨度约为 36.5 m"), "span"), 36.5);
eq("吨的中文", field(parse("起重量 450 吨"), "capacity"), 450);
eq("反序 AGV", field(parse("配置 2 台 AGV"), "agv"), 2);
eq("轨顶标高", field(parse("轨顶标高 45 m"), "railHeight"), 45);

console.log("=== 3. 机型优先级（门座 / 铸造 不能被门式抢走）===");
eq("门座式", field(parse("门座式起重机，跨度 40 m"), "productType"), "portal");
eq("铸造", field(parse("铸造起重机，跨度 28 m"), "productType"), "casting");
eq("桥式", field(parse("桥式起重机，跨度 30 m"), "productType"), "bridge");
eq("门式", field(parse("龙门吊，跨度 60 m"), "productType"), "gantry");

console.log("=== 4. 边界与异常 ===");
{
  const r = parse("跨度 500 m");
  eq("超范围判 invalid", status(r, "span"), "invalid");
  eq("超范围不取值", field(r, "span"), null);
}
{
  const r = parse("跨度 48 t");
  eq("单位不符判 missing", status(r, "span"), "missing");
}
{
  const r = parse("跨度 48~60 m");
  eq("范围值取第一个", field(r, "span"), 48);
  eq("范围值给警告", r.warnings.some(w => w.indexOf("范围值") >= 0), true);
}
{
  const r = parse("厂房跨度 24 m，起重机跨度 22.5 m");
  eq("多处命中取第一处", field(r, "span"), 24);
  eq("多处命中给警告", r.warnings.some(w => w.indexOf("2 处") >= 0), true);
}
eq("空输入 ok=false", parse("").ok, false);
eq("无参数文本 ok=false", parse("这是一段没有数字的说明文字。").ok, false);
{
  const r = parse("随便写点什么");
  eq("无参数时七项全缺", r.summary.missing.length, 7);
}
{
  const r = parse("本设备 A5");
  eq("宽松识别级别", field(r, "duty"), "A5");
  eq("宽松识别给警告", r.warnings.some(w => w.indexOf("未带「工作级别」") >= 0), true);
}

console.log("=== 5. 只抽明确值，不做推断 ===");
{
  const r = parse("跨度 48 m");
  eq("只给跨度时其余为 null", field(r, "capacity"), null);
  eq("只给跨度时只算一项", r.summary.matched, 1);
  eq("params 只含抽到的键", Object.keys(r.params), ["span"]);
}

console.log("\n=== 汇总 ===");
console.log("  pass " + pass + " / " + (pass + fail));
if (fail) { console.log("BRIEF_PARSE_FAIL"); process.exit(1); }
console.log("BRIEF_PARSE_ALL_PASS");
