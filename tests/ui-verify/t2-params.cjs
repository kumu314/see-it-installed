const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'D:/AgentHub/cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=require('node:path').resolve(__dirname,'../..');
const url=pathToFileURL(path.join(root,'scene71-3d/dist/作品71-3d.html')).href;
const out=[];function chk(n,c,d){out.push({n,p:!!c,d:d===undefined?'':String(d)});}
(async()=>{
 const ctx=await chromium.launchPersistentContext(path.join(root,'tests','ui-verify','_artifacts','profile'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:900},args:['--disable-background-networking','--enable-unsafe-swiftshader']});
 const p=ctx.pages()[0]||await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url);await p.waitForTimeout(800);
 // 进入 3D，拿模型 uuid
 await p.click('#whModeModel');await p.waitForTimeout(800);
 const u0=await p.evaluate(()=>window.__scene71_3d.state());
 // 草稿：改跨度
 await p.fill('#whF_span','60');await p.waitForTimeout(200);
 const draftVisible=await p.evaluate(()=>({hidden:document.getElementById('whDraft').hidden,text:document.getElementById('whDraftText').textContent,applyDisabled:document.getElementById('whApply').disabled}));
 chk('草稿条可见且列出差异',draftVisible.hidden===false&&draftVisible.text.indexOf('60')>0,JSON.stringify(draftVisible));
 const mid=await p.evaluate(()=>({ui:window.WH.__getState(),glue:window.__scene71_3d.state(),chip:document.querySelector('[data-k=span]').textContent}));
 chk('草稿不影响已应用状态',mid.ui.id==='A'&&mid.chip.indexOf('48')===0&&mid.glue.model===u0.model,JSON.stringify({ui:mid.ui.id,chip:mid.chip}));
 // 非法值
 await p.fill('#whF_span','999');await p.click('#whApply');await p.waitForTimeout(200);
 const bad=await p.evaluate(()=>({err:document.getElementById('whFieldErr').textContent,id:window.WH.__getState().id}));
 chk('越界值被拦下并提示',bad.err.indexOf('跨度')>=0&&bad.id==='A',JSON.stringify(bad));
 // 合法应用
 await p.fill('#whF_span','60');await p.fill('#whF_capacity','450');await p.fill('#whF_railHeight','45');await p.selectOption('#whF_duty','A7');await p.click('#whApply');await p.waitForTimeout(600);
 const applied=await p.evaluate(()=>({ui:window.WH.__getState(),glue:window.__scene71_3d.state(),chip:document.querySelector('[data-k=span]').textContent,active:document.querySelector('.wh-scheme.active')?.dataset.id,status:document.getElementById('whStatus').textContent}));
 chk('应用后与方案 B 同参数同版本',applied.ui.id==='B'&&applied.glue.cfg==='B'&&applied.active==='B'&&applied.chip.indexOf('60')===0,JSON.stringify({ui:applied.ui.id,glue:applied.glue.cfg,chip:applied.chip}));
 chk('应用后模型已重建',applied.glue.model&&applied.glue.model!==u0.model,applied.glue.model);
 // 导出预览
 await p.click('#whExport');await p.waitForTimeout(900);
 const exp=await p.evaluate(()=>{const m=document.querySelector('[data-wh-modal="1"]');const img=m&&m.querySelector('img');return {open:!!m,img:!!(img&&img.src&&img.src.indexOf('data:image')===0),save:(m&&!m.querySelector('#whExpSave').disabled),text:m?m.textContent.slice(0,120):''};});
 chk('导出预览生成图像且可保存',exp.open&&exp.img&&exp.save,JSON.stringify({img:exp.img,save:exp.save}));
 await p.click('#whExpClose');await p.waitForTimeout(200);
 // 照片入口
 await p.click('#whPhotoPick');await p.waitForTimeout(600);
 const cal=await p.evaluate(()=>({open:!!document.getElementById('whCalibOverlay'),inert:document.getElementById('app').hasAttribute('inert')}));
 chk('主面板照片入口能打开标定',cal.open&&cal.inert,JSON.stringify(cal));
 await p.keyboard.press('Escape');await p.waitForTimeout(200);
 chk('无页面异常',errs.length===0,errs.join(' | '));
 console.log(out.map(r=>(r.p?'PASS ':'FAIL ')+r.n+(r.d?'  · '+r.d:'')).join('\n'));
 console.log('SUMMARY '+out.filter(r=>r.p).length+'/'+out.length);
 await ctx.close();process.exit(out.every(r=>r.p)?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(2)});