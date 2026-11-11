const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'D:/AgentHub/cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=require('node:path').resolve(__dirname,'../..');
const fx=require('D:/CodexOutputs/黑客松/weihua-71-calib-work/fixture.json');
const url=pathToFileURL(path.join(root,'scene71-3d/dist/作品71-3d.html')).href;
const out=[];function chk(n,c,d){out.push({n,p:!!c,d:d===undefined?'':String(d)});}
(async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(root,'tests','ui-verify','_artifacts','profile-compare'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:900},args:['--disable-background-networking','--enable-unsafe-swiftshader']});
  const p=ctx.pages()[0]||await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(url);await p.waitForTimeout(800);
  const btns=await p.evaluate(()=>[...document.querySelectorAll('.wh-modebar .wh-seg')].map(b=>({id:b.id,t:b.textContent,disabled:b.disabled})));
  chk('四个视图入口都存在',btns.length===4&&btns.some(b=>b.id==='whModeCompare')&&btns.some(b=>b.id==='whModeBa'),JSON.stringify(btns.map(b=>b.t)));
  const baDisabled=btns.find(b=>b.id==='whModeBa').disabled;
  chk('无照片时前后对比置灰',baDisabled===true,String(baDisabled));
  // 方案对比
  await p.click('#whModeCompare');await p.waitForTimeout(600);
  const cmp=await p.evaluate(()=>({
    active:[...document.querySelectorAll('.wh-seg.active')].map(e=>e.id),
    panes:document.querySelectorAll('.wh-pane-h').length,
    labels:[...document.querySelectorAll('.wh-pane-h em')].map(e=>e.textContent),
    box:getComputedStyle(document.getElementById('whView3dBox')).display,
    status:document.getElementById('whStatus').textContent
  }));
  chk('方案对比：唯一选中且双栏渲染',cmp.active.length===1&&cmp.active[0]==='whModeCompare'&&cmp.panes===2,JSON.stringify(cmp.active)+' panes='+cmp.panes);
  chk('两栏标明基准/对比且状态条为方案对比',cmp.labels.join(',')==='基准方案,对比方案'&&cmp.status.indexOf('方案对比')>=0,JSON.stringify(cmp.labels)+' / '+cmp.status);
  // 准备照片
  await p.click('#whModeModel');await p.waitForTimeout(500);
  await p.click('#whPhotoPick');await p.waitForTimeout(400);
  await p.setInputFiles('#whCalibFile',path.join(root,'docs/screenshots/test-ground.png'));
  await p.waitForTimeout(700);
  const box=await p.locator('#whCalibCanvas').boundingBox();
  for(const q of fx.points) await p.mouse.click(box.x+q.x*box.width/fx.w,box.y+q.y*box.height/fx.h);
  await p.fill('#whCalibLength','6');await p.click('#whCalibApply');await p.waitForTimeout(1600);
  const baEnabled=await p.evaluate(()=>!document.getElementById('whModeBa').disabled);
  chk('照片标定后前后对比可用',baEnabled===true);
  await p.click('#whModeBa');await p.waitForTimeout(700);
  const ba=await p.evaluate(()=>{
    const img=document.getElementById('whBaPhoto'), bar=document.getElementById('whBaBar'), box=document.getElementById('whView3dBox');
    return {img:!!img&&img.style.display!=='none'&&(img.src||'').length>10,bar:!!bar&&bar.style.display!=='none',clip:box.style.clipPath,active:[...document.querySelectorAll('.wh-seg.active')].map(e=>e.id)};
  });
  chk('前后对比：原图层+滑块+3D裁剪同时存在',ba.img&&ba.bar&&/inset/.test(ba.clip),JSON.stringify(ba));
  chk('前后对比唯一选中',ba.active.length===1&&ba.active[0]==='whModeBa',JSON.stringify(ba.active));
  await p.evaluate(()=>{const r=document.getElementById('whBaRange');r.value='20';r.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForTimeout(200);
  const clip2=await p.evaluate(()=>document.getElementById('whView3dBox').style.clipPath);
  chk('滑块改变裁剪位置',clip2.indexOf('20%')>=0,clip2);
  await p.click('#whModeSingle');await p.waitForTimeout(400);
  const off=await p.evaluate(()=>({img:document.getElementById('whBaPhoto').style.display,bar:document.getElementById('whBaBar').style.display}));
  chk('离开前后对比后叠加层隐藏',off.img==='none'&&off.bar==='none',JSON.stringify(off));
  chk('无页面异常',errs.length===0,errs.join(' | '));
  console.log(out.map(r=>(r.p?'PASS ':'FAIL ')+r.n+(r.d?'  · '+r.d:'')).join('\n'));
  console.log('SUMMARY '+out.filter(r=>r.p).length+'/'+out.length);
  await ctx.close();process.exit(out.every(r=>r.p)?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(2)});