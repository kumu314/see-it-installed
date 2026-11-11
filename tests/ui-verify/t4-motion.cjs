const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'D:/AgentHub/cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=require('node:path').resolve(__dirname,'../..');
const fx=require('D:/CodexOutputs/黑客松/weihua-71-calib-work/fixture.json');
const url=pathToFileURL(path.join(root,'scene71-3d/dist/作品71-3d.html')).href;
const out=[];function chk(n,c,d){out.push({n,p:!!c,d:d===undefined?'':String(d)});}
(async()=>{
 const ctx=await chromium.launchPersistentContext(path.join(root,'tests','ui-verify','_artifacts','profile'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:900},args:['--disable-background-networking','--enable-unsafe-swiftshader']});
 const p=ctx.pages()[0]||await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url);await p.waitForTimeout(800);
 // 暂停动效阻断播放
 await p.click('#whPause');
 await p.click('#whPlay');await p.waitForTimeout(400);
 const pz=await p.evaluate(()=>({pressed:document.getElementById('whPause').getAttribute('aria-pressed'),playing:document.getElementById('whCompare').classList.contains('wh-play')}));
 chk('暂停后播放不启动',pz.pressed==='true'&&!pz.playing,JSON.stringify(pz));
 await p.click('#whPause');
 // 3D 旋转演示 + 暂停
 await p.click('#whModeModel');await p.waitForTimeout(800);
 await p.click('#wh3dOrbit');await p.waitForTimeout(500);
 const r1=await p.evaluate(()=>document.querySelector('#whView3dHolder').__view3d._st.rotY);
 await p.waitForTimeout(400);
 const r2=await p.evaluate(()=>document.querySelector('#whView3dHolder').__view3d._st.rotY);
 chk('旋转演示在转',r2>r1,JSON.stringify({r1,r2}));
 await p.click('#whPause');await p.waitForTimeout(300);
 const r3=await p.evaluate(()=>document.querySelector('#whView3dHolder').__view3d._st.rotY);
 await p.waitForTimeout(400);
 const r4=await p.evaluate(()=>document.querySelector('#whView3dHolder').__view3d._st.rotY);
 chk('全局暂停停掉 3D 旋转',Math.abs(r4-r3)<1e-9,JSON.stringify({r3,r4}));
 // 草稿冲突
 await p.click('#whPause');
 await p.fill('#whF_span','40');await p.waitForTimeout(150);
 await p.click('.wh-scheme[data-id="C"]');await p.waitForTimeout(200);
 const cf=await p.evaluate(()=>({vis:!document.getElementById('whConflict').hidden,id:window.WH.__getState().id}));
 chk('有草稿时切方案先询问',cf.vis&&cf.id==='A',JSON.stringify(cf));
 await p.click('#whCStay');await p.waitForTimeout(150);
 const stay=await p.evaluate(()=>({id:window.WH.__getState().id,draft:!document.getElementById('whDraft').hidden}));
 chk('留在当前时保留草稿与已应用方案',stay.id==='A'&&stay.draft,JSON.stringify(stay));
 await p.click('.wh-scheme[data-id="C"]');await p.waitForTimeout(150);
 await p.click('#whCDiscard');await p.waitForTimeout(300);
 const disc=await p.evaluate(()=>({id:window.WH.__getState().id,draft:!document.getElementById('whDraft').hidden,span:document.querySelector('[data-k=span]').textContent}));
 chk('放弃修改后切换到新方案',disc.id==='C'&&!disc.draft&&disc.span.indexOf('28')===0,JSON.stringify(disc));
 // 2D 导出
 await p.click('#whModeSingle');await p.waitForTimeout(300);
 await p.click('#whExport');await p.waitForTimeout(900);
 const ex2=await p.evaluate(()=>{const m=document.querySelector('[data-wh-modal="1"]');const i=m&&m.querySelector('img');return {img:!!(i&&i.src.indexOf('data:image')===0),save:(m&&!m.querySelector('#whExpSave').disabled),meta:m?m.textContent.indexOf('示意预览')>=0:false};});
 chk('示意图也能导出且命名正确',ex2.img&&ex2.save&&ex2.meta,JSON.stringify(ex2));
 await p.click('#whExpClose');await p.waitForTimeout(200);
 // 单点替换
 await p.click('#whPhotoPick');await p.waitForTimeout(400);
 await p.setInputFiles('#whCalibFile',path.join(root,'docs/screenshots/test-ground.png'));await p.waitForTimeout(700);
 const box=await p.locator('#whCalibCanvas').boundingBox();
 const pt=async(i)=>p.mouse.click(box.x+fx.points[i].x*box.width/fx.w,box.y+fx.points[i].y*box.height/fx.h);
 await pt(0);await pt(1);await pt(2);await pt(3);
 await p.mouse.click(box.x+fx.points[1].x*box.width/fx.w,box.y+fx.points[1].y*box.height/fx.h);
 const sel=await p.evaluate(()=>document.getElementById('calHint').textContent);
 await p.mouse.click(box.x+fx.points[1].x*box.width/fx.w+6,box.y+fx.points[1].y*box.height/fx.h+6);
 const after=await p.evaluate(()=>({count:document.getElementById('whCalibCount').textContent,hint:document.getElementById('calHint').textContent}));
 chk('点选编号后可原位替换且不增加点数',sel.indexOf('替换')>=0&&after.count.indexOf('4')===0,JSON.stringify({sel,after}));
 await p.keyboard.press('Escape');
 chk('无页面异常',errs.length===0,errs.join(' | '));
 console.log(out.map(r=>(r.p?'PASS ':'FAIL ')+r.n+(r.d?'  · '+r.d:'')).join('\n'));
 console.log('SUMMARY '+out.filter(r=>r.p).length+'/'+out.length);
 await ctx.close();process.exit(out.every(r=>r.p)?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(2)});