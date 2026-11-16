/* CI 浏览器冒烟验收：零本地绝对路径，GitHub Actions 与本机都能跑。
 *
 * 本地跑（用系统 Edge，不下载 chromium）：
 *   PLAYWRIGHT_PATH=D:/AgentHub/.../playwright \
 *   CHROME_PATH='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' \
 *   node tests/browser/smoke.cjs
 *
 * CI 跑：npm i --no-save playwright && npx playwright install --with-deps chromium
 *        node tests/browser/smoke.cjs
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  if (!process.env.PLAYWRIGHT_PATH) throw e;
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH));
}

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = pathToFileURL(path.join(ROOT, 'scene71-3d', 'dist', '作品71-3d.html')).href;
const SAMPLE = '本工程采用门式起重机，跨度 48 m，额定起重量 2000 t，轨面标高 30 m，工作级别 A8，AGV 2 台，露天堆场。';

(async () => {
  const launchOpts = {
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--disable-background-networking']
  };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await page.waitForTimeout(1500);

  const checks = [];
  function chk(name, ok, detail) {
    checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  }

  const boot = await page.evaluate(() => ({
    view3d: !!(window.WH && window.WH.view3d),
    model: !!(window.WH && window.WH.model),
    calib: !!(window.WH && window.WH.calib),
    top: (document.getElementById('whb-top') || {}).textContent || '',
    fab: (document.getElementById('whb-fab') || {}).textContent || '',
    applyParams: typeof window.WH.__applyParams === 'function'
  }));
  chk('三模块已装载', boot.view3d && boot.model && boot.calib, JSON.stringify(boot));
  chk('技术方案双入口就位', boot.top.indexOf('提交技术方案') >= 0 && boot.fab.indexOf('提交技术方案') >= 0,
    boot.top + ' / ' + boot.fab);
  chk('正式应用接口存在', boot.applyParams);

  const parsed = await page.evaluate(t => window.WH.brief.parse(t), SAMPLE);
  chk('真实样例解析 7/7', parsed.summary.matched === 7,
    'matched=' + parsed.summary.matched + ', missing=' + parsed.summary.missing.join(','));

  await page.evaluate(() => { document.getElementById('whb-top').click(); });
  await page.locator('#whb-text').fill(SAMPLE);
  await page.locator('#whb-parse').click();
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    window.__cfgEvents = [];
    document.addEventListener('wh71:config', e => window.__cfgEvents.push(e.detail.reason));
  });
  await page.locator('#whb-apply').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    state: window.WH.__getState().config,
    events: window.__cfgEvents || [],
    msg: (document.getElementById('whb-applied') || {}).textContent || ''
  }));
  const c = after.state || {};
  chk('应用到画面写回同源状态',
    c.span === 48 && c.capacity === 2000 && c.railHeight === 30 && c.duty === 'A8' &&
    c.agv === 2 && c.productType === 'gantry' && c.bayType === 'outdoor', JSON.stringify(c));
  chk('配置事件 reason=brief', after.events.length === 1 && after.events[0] === 'brief',
    JSON.stringify(after.events));
  chk('应用结果文案正确', after.msg.indexOf('参数栏 / 3D / 导出同源') >= 0, after.msg);

  await page.evaluate(() => {
    const m = document.getElementById('whModeModel');
    if (m && !m.disabled) m.click();
  });
  await page.waitForTimeout(700);
  const canvasCount = await page.locator('canvas').count();
  chk('3D 画布已挂载', canvasCount >= 1, 'canvas=' + canvasCount);
  chk('零页面异常', errors.length === 0, JSON.stringify(errors));

  await browser.close();
  checks.forEach(x => console.log((x.ok ? 'PASS  ' : 'FAIL  ') + x.name + (x.detail ? '  · ' + x.detail.slice(0, 160) : '')));
  const passed = checks.filter(x => x.ok).length;
  console.log('SMOKE ' + passed + '/' + checks.length);
  console.log(passed === checks.length ? 'CI_SMOKE PASS' : 'CI_SMOKE FAIL');
  process.exit(passed === checks.length ? 0 : 1);
})().catch(e => { console.error('ERR:', e.message); process.exit(2); });
