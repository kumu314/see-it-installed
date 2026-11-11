const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'D:/AgentHub/cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=require('node:path').resolve(__dirname,'../..');
const fx=require('D:/CodexOutputs/黑客松/weihua-71-calib-work/fixture.json');
const url=pathToFileURL(path.join(root,'scene71-3d/dist/作品71-3d.html')).href;
const out=[];function chk(n,c,d){out.push({n,p:!!c,d:d===undefined?'':String(d)});}
(async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(root,'tests','ui-verify','_artifacts','profile-zoom'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:900},args:['--disable-background-networking','--enable-unsafe-swiftshader']});
  const p=ctx.pages()[0]||await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(url);await p.waitForTimeout(800);
  await p.evaluate(()=>{const o=THREE.PerspectiveCamera.prototype.updateProjectionMatrix;THREE.PerspectiveCamera.prototype.updateProjectionMatrix=function(){window.__cam=this;return o.apply(this,arguments);};});
  await p.click('#whPhotoPick');await p.waitForTimeout(400);
  await p.setInputFiles('#whCalibFile',path.join(root,'docs/screenshots/test-ground.png'));
  await p.waitForTimeout(700);
  const box=await p.locator('#whCalibCanvas').boundingBox();
  const cx=box.x+box.width/2, cy=box.y+box.height/2;
  // 在画布中心滚轮放大两次：k = 1.18^2
  await p.mouse.move(cx,cy);
  await p.mouse.wheel(0,-100);await p.waitForTimeout(120);
  await p.mouse.wheel(0,-100);await p.waitForTimeout(200);
  const st1=await p.evaluate(()=>{const i=document.getElementById('whCalibImage');return i.style.transform;});
  chk('滚轮缩放生效',/scale\(1\.39/.test(st1)||/scale\(1\.[2-9]/.test(st1),st1);
  // 用与实现相同的公式算出 fixture 4 点在屏幕的位置
  const f=1.18*1.18, k=f;
  const vx=cx-box.x-(cx-box.x)*k, vy=cy-box.y-(cy-box.y)*k;
  const toScreen=(pt)=>({x:box.x+vx+(pt.x*box.width/fx.w)*k, y:box.y+vy+(pt.y*box.height/fx.h)*k});
  for(const q of fx.points){const s=toScreen(q); await p.mouse.click(s.x,s.y);}
  const cnt=await p.evaluate(()=>document.getElementById('whCalibCount').textContent);
  chk('缩放后点选仍落在 4 点',cnt.indexOf('4')===0,cnt);
  await p.fill('#whCalibLength','6');
  await p.click('#whCalibApply');await p.waitForTimeout(1600);
  const cam=await p.evaluate(()=>window.WH.__calib&&window.WH.__calib.camera);
  const want=fx.calib.camera.position;
  const err=cam?Math.hypot(cam.position[0]-want[0],cam.position[1]-want[1],cam.position[2]-want[2]):999;
  chk('放大后坐标换算回原图正确（相机偏差<0.6m）',err<0.6,'err='+err.toFixed(3));

  // 照片模式：相机级缩放，模型与照片同倍率
  const probe=async()=>p.evaluate(()=>{
    const h=document.querySelector('#whView3dHolder');
    const v=h.__view3d, st=v._st, g=st.modelGroup, cam=window.__cam;
    if(!g||!cam) return null;
    cam.updateMatrixWorld(true);
    const P=g.position.clone(),R=g.rotation.clone(),S=g.scale.clone();
    g.position.set(0,0,0);g.rotation.set(0,0,0);g.scale.set(1,1,1);g.updateMatrixWorld(true);
    const lb=new THREE.Box3().setFromObject(g);
    g.position.copy(P);g.rotation.copy(R);g.scale.copy(S);g.updateMatrixWorld(true);
    const top=new THREE.Vector3((lb.min.x+lb.max.x)/2,lb.max.y,(lb.min.z+lb.max.z)/2).applyMatrix4(g.matrixWorld);
    const bot=new THREE.Vector3((lb.min.x+lb.max.x)/2,lb.min.y,(lb.min.z+lb.max.z)/2).applyMatrix4(g.matrixWorld);
    const hh=h.clientHeight;
    const sy=vv=>{const q=vv.clone().project(cam);return (1-q.y)*hh/2;};
    return {fov:cam.fov, zoom:st.zoom, photoZoom:st.photoZoom, h:Math.abs(sy(bot)-sy(top))};
  });
  const a=await probe();
  await p.click('#wh3dZoomIn');await p.waitForTimeout(400);
  const b=await probe();
  chk('放大按钮降低 fov 且模型变大',b.fov<a.fov&&b.h>a.h,JSON.stringify({fov:[a.fov,b.fov],h:[a.h,b.h]}));
  chk('照片模式不改变模型独立缩放（尺度关系不变）',b.zoom===a.zoom,JSON.stringify({za:a.zoom,zb:b.zoom}));
  const ratio=(b.h/a.h)/(a.fov/b.fov);
  chk('模型屏幕尺寸与 fov 变化同比例',Math.abs(ratio-1)<0.25,'ratio='+ratio.toFixed(3));
  await p.click('#wh3dZoomFit');await p.waitForTimeout(300);
  const c2=await probe();
  chk('100% 恢复原始视角',Math.abs(c2.fov-a.fov)<0.01,JSON.stringify({fov:c2.fov,want:a.fov}));
  chk('无页面异常',errs.length===0,errs.join(' | '));
  console.log(out.map(r=>(r.p?'PASS ':'FAIL ')+r.n+(r.d?'  · '+r.d:'')).join('\n'));
  console.log('SUMMARY '+out.filter(r=>r.p).length+'/'+out.length);
  await ctx.close();process.exit(out.every(r=>r.p)?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(2)});