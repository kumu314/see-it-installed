const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'D:/AgentHub/cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=require('node:path').resolve(__dirname,'../..');
const url=pathToFileURL(path.join(root,'scene71-3d/dist/作品71-3d.html')).href;
const out=[];
function chk(name,cond,detail){out.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});}
(async()=>{
 const ctx=await chromium.launchPersistentContext(path.join(root,'tests','ui-verify','_artifacts','profile'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:900},args:['--disable-background-networking','--enable-unsafe-swiftshader']});
 const p=ctx.pages()[0]||await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url);await p.waitForTimeout(900);
 // F05：进入 3D
 await p.click('#whModeModel');await p.waitForTimeout(900);
 let st=await p.evaluate(()=>({ui:window.WH.__getState(),glue:window.__scene71_3d.state(),active:[...document.querySelectorAll('.wh-seg.active')].map(e=>e.id)}));
 chk('F05 进入3D后仅一个模式选中',st.active.length===1&&st.active[0]==='whModeModel',JSON.stringify(st.active));
 chk('3D 已挂载',st.glue.mounted===true,JSON.stringify(st.glue));
 const uuidA=st.glue.model;
 // F01：3D 中点“客户改需求”
 await p.click('#whRerender');await p.waitForTimeout(2200);
 st=await p.evaluate(()=>({ui:window.WH.__getState(),glue:window.__scene71_3d.state(),span:document.querySelector('[data-k=span]').textContent,activeScheme:document.querySelector('.wh-scheme.active')?.dataset.id}));
 chk('F01 改需求后 UI 与 3D 同版本',st.ui.id===st.glue.cfg&&st.ui.id==='D',JSON.stringify({ui:st.ui.id,glue:st.glue.cfg}));
 chk('F01 模型已重建',st.glue.model&&st.glue.model!==uuidA,String(st.glue.model));
 chk('F01 参数卡与选中态一致',st.span.indexOf('36')===0&&st.activeScheme==='D',st.span+' / '+st.activeScheme);
 // F02：打开标定弹层后按 2 不应换方案
 const opened=await p.evaluate(()=>{const r=window.WH.photo.open();return r;});
 await p.waitForTimeout(700);
 chk('标定弹层可打开',opened&&opened.ok===true,JSON.stringify(opened));
 const before=await p.evaluate(()=>window.WH.__getState().id);
 await p.keyboard.press('2');
 await p.waitForTimeout(300);
 const after=await p.evaluate(()=>window.WH.__getState().id);
 chk('F02 弹层内数字快捷键不改变背景方案',before===after,before+' -> '+after);
 // F03：Tab 循环
 const loop=await p.evaluate(async()=>{
   const els=[];for(let i=0;i<12;i++){document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));break;}
   return true;
 });
 await p.keyboard.press('Tab');await p.keyboard.press('Tab');await p.keyboard.press('Tab');
 const inside=await p.evaluate(()=>{const o=document.getElementById('whCalibOverlay');return !!(o&&o.contains(document.activeElement));});
 chk('F03 Tab 后焦点仍在弹层内',inside);
 await p.keyboard.press('Escape');await p.waitForTimeout(300);
 const closed=await p.evaluate(()=>({open:!!document.getElementById('whCalibOverlay'),inert:document.getElementById('app').hasAttribute('inert'),focus:document.activeElement&&document.activeElement.id}));
 chk('F03 Esc 关闭并恢复背景可交互',!closed.open&&!closed.inert,JSON.stringify(closed));
 chk('无页面异常',errs.length===0,errs.join(' | '));
 console.log(out.map(r=>(r.pass?'PASS ':'FAIL ')+r.name+(r.detail?'  · '+r.detail:'')).join('\n'));
 console.log('SUMMARY '+(out.filter(r=>r.pass).length)+'/'+out.length);
 await ctx.close();
 process.exit(out.every(r=>r.pass)?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(2)});