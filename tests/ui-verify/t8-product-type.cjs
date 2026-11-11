const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'D:/AgentHub/cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=require('node:path').resolve(__dirname,'../..');
const url=pathToFileURL(path.join(root,'scene71-3d/dist/作品71-3d.html')).href;
const out=[];function chk(n,c,d){out.push({n,p:!!c,d:d===undefined?'':String(d)});}
(async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(root,'tests','ui-verify','_artifacts','profile-type'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:900},args:['--disable-background-networking','--enable-unsafe-swiftshader']});
  const p=ctx.pages()[0]||await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(url);await p.waitForTimeout(900);
  const hasSel=await p.evaluate(()=>!!document.getElementById('whF_productType'));
  chk('参数面板有设备类别下拉',hasSel===true);
  const opts=await p.evaluate(()=>[...document.querySelectorAll('#whF_productType option')].map(o=>o.textContent));
  chk('四个机型选项且为中文',JSON.stringify(opts)===JSON.stringify(['门式','桥式','铸造','门座']),JSON.stringify(opts));
  await p.click('#whModeModel');await p.waitForTimeout(800);
  const boxOf=()=>p.evaluate(()=>{
    const h=document.querySelector('#whView3dHolder');
    const st=h.__view3d._st, g=st.modelGroup;
    const b=new THREE.Box3().setFromObject(g);
    return {x:+(b.max.x-b.min.x).toFixed(1),y:+(b.max.y-b.min.y).toFixed(1),z:+(b.max.z-b.min.z).toFixed(1),uuid:g.uuid};
  });
  const g0=await boxOf();
  await p.selectOption('#whF_productType','bridge');await p.waitForTimeout(200);
  const draftTxt=await p.evaluate(()=>document.getElementById('whDraftText').textContent);
  chk('切机型产生草稿差异',draftTxt.indexOf('设备类别')>=0&&draftTxt.indexOf('桥式')>=0,draftTxt);
  await p.click('#whApply');await p.waitForTimeout(800);
  const s1=await p.evaluate(()=>({st:WH.__getState(),chip:document.querySelector('[data-k=type]').textContent,model:document.querySelector('[data-k=model]').textContent}));
  chk('应用后是自定义方案且机型=桥式',s1.st.id==='自定义'&&s1.st.config.productType==='bridge'&&s1.chip==='桥式',JSON.stringify({id:s1.st.id,type:s1.st.config.productType,chip:s1.chip}));
  chk('机型名进入方案标题',s1.model.indexOf('桥式')>=0,s1.model);
  const b1=await boxOf();
  chk('桥式模型已重建且几何不同于门式',b1.uuid!==g0.uuid&&b1.z<g0.z*0.7,JSON.stringify({gantry:g0,bridge:b1}));
  const sigs={gantry:g0,bridge:b1};
  for(const t of ['casting','portal']){
    await p.selectOption('#whF_productType',t);await p.waitForTimeout(150);
    await p.click('#whApply');await p.waitForTimeout(700);
    sigs[t]=await boxOf();
  }
  const zs=[sigs.gantry.z,sigs.bridge.z,sigs.casting.z,sigs.portal.z];
  const uniq=new Set(zs.map(v=>v.toFixed(1))).size;
  chk('四种机型几何各不相同',uniq>=3,JSON.stringify(zs));
  await p.click('.wh-scheme[data-id="D"]');await p.waitForTimeout(600);
  const back=await p.evaluate(()=>({type:document.querySelector('[data-k=type]').textContent,sel:document.getElementById('whF_productType').value,id:WH.__getState().id}));
  chk('选回预设时机型与下拉同步',back.type==='门式'&&back.sel==='gantry'&&back.id==='D',JSON.stringify(back));
  chk('无页面异常',errs.length===0,errs.join(' | '));
  console.log(out.map(r=>(r.p?'PASS ':'FAIL ')+r.n+(r.d?'  · '+r.d:'')).join('\n'));
  console.log('SUMMARY '+out.filter(r=>r.p).length+'/'+out.length);
  await ctx.close();process.exit(out.every(r=>r.p)?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(2)});
