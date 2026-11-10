(function () {
  "use strict";
  window.WH = window.WH || {};
  var EPS = 1e-10;
  function fail(reason) { return { ok: false, confidence: 0, reason: reason }; }
  function finite(x) { return typeof x === "number" && isFinite(x); }
  function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function norm(a) { return Math.sqrt(dot(a,a)); }
  function scale(a,s) { return a.map(function (v) { return v*s; }); }
  function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
  function unit(a) { var n=norm(a); return n>EPS?scale(a,1/n):null; }
  function solve(a,b) {
    var n=b.length, m=a.map(function(row,i){return row.slice().concat(b[i]);});
    for(var col=0;col<n;col++){
      var pivot=col;
      for(var r=col+1;r<n;r++) if(Math.abs(m[r][col])>Math.abs(m[pivot][col])) pivot=r;
      if(Math.abs(m[pivot][col])<EPS) return null;
      var tmp=m[col]; m[col]=m[pivot]; m[pivot]=tmp;
      var d=m[col][col]; for(var j=col;j<=n;j++) m[col][j]/=d;
      for(var k=0;k<n;k++) if(k!==col){var v=m[k][col];for(var q=col;q<=n;q++) m[k][q]-=v*m[col][q];}
    }
    return m.map(function(row){return row[n];});
  }
  function dimensions(photo) {
    var w=photo && (photo.naturalWidth || photo.videoWidth || photo.width), h=photo && (photo.naturalHeight || photo.videoHeight || photo.height);
    return finite(w)&&finite(h)&&w>0&&h>0 ? [w,h] : null;
  }
  function homography(points,w,h){
    // Normalising pixels keeps the eight-equation solve stable on large photos.
    var uv=[[0,0],[1,0],[1,1],[0,1]], A=[], b=[];
    for(var i=0;i<4;i++){
      var u=uv[i][0],v=uv[i][1],x=(points[i].x-w/2)/w,y=(points[i].y-h/2)/w;
      A.push([u,v,1,0,0,0,-u*x,-v*x]);b.push(x);
      A.push([0,0,0,u,v,1,-u*y,-v*y]);b.push(y);
    }
    var z=solve(A,b);if(!z)return null;
    return [w*z[0]+w/2*z[6],w*z[1]+w/2*z[7],w*z[2]+w/2,
            w*z[3]+h/2*z[6],w*z[4]+h/2*z[7],w*z[5]+h/2,z[6],z[7],1];
  }
  function fromQuad(photo,points,knownLength){
    var dim=dimensions(photo);
    if(!dim || !Array.isArray(points) || points.length!==4 || !finite(knownLength) || knownLength<=0) return fail("需要照片尺寸、四个有序角点和大于零的已知边长");
    var w=dim[0],h=dim[1],area=0, minEdge=Infinity;
    for(var i=0;i<4;i++){
      var p=points[i],n=points[(i+1)%4],nn=points[(i+2)%4];
      if(!p || !n || !nn || !finite(p.x)||!finite(p.y)||!finite(n.x)||!finite(n.y)||!finite(nn.x)||!finite(nn.y))return fail("角点坐标无效");
      if(p.x<0||p.x>w||p.y<0||p.y>h)return fail("角点必须位于照片内");
      var dx=n.x-p.x,dy=n.y-p.y,turn=dx*(nn.y-n.y)-dy*(nn.x-n.x);
      if(turn<=w*h*1e-8)return fail("角点必须顺时针且组成凸四边形");
      minEdge=Math.min(minEdge,Math.hypot(dx,dy));area+=p.x*n.y-n.x*p.y;
    }
    if(minEdge<4 || area<w*h*0.0002)return fail("角点过近或标定区域过小");
    var H=homography(points,w,h);if(!H)return fail("四点退化，无法解单应矩阵");
    var cx=w/2,cy=h/2, a=[H[0]-cx*H[6],H[3]-cy*H[6],H[6]], b=[H[1]-cx*H[7],H[4]-cy*H[7],H[7]];
    var denom=a[2]*b[2], numerator=-(a[0]*b[0]+a[1]*b[1]);
    if(Math.abs(denom)<1e-12)return fail("透视信息不足，无法估计焦距；请重新选择有两个明显消失方向的矩形");
    var f2=numerator/denom;
    if(!finite(f2)||f2<=0)return fail("四点不符合主点居中、方形像素的矩形相机模型");
    var f=Math.sqrt(f2),fov=2*Math.atan(h/(2*f))*180/Math.PI;
    if(fov<10||fov>140)return fail("估计视场角不合理，请检查选点或镜头畸变");
    var k1=[a[0]/f,a[1]/f,a[2]],k2=[b[0]/f,b[1]/f,b[2]],kt=[(H[2]-cx)/f,(H[5]-cy)/f,1];
    var n1=norm(k1),n2=norm(k2), rx=unit(k1),rz=unit(k2);
    if(!rx||!rz||n1<EPS||n2<EPS)return fail("相机姿态退化");
    var orth=Math.abs(dot(rx,rz));if(orth>1e-5)return fail("估计的地面方向不正交");
    var ry=unit(cross(rz,rx)); if(!ry)return fail("地面方向退化");
    rz=unit(cross(rx,ry));
    var t=scale(kt,knownLength/n1), width=knownLength*n2/n1;
    var position=[-dot(rx,t),-dot(ry,t),-dot(rz,t)];
    if(!position.every(finite)||position[1]<=1e-5||!finite(width)||width<=0)return fail("相机位于地面下方或矩形尺度无效，请检查点序");
    var forward=[rx[2],ry[2],rz[2]], up=[-rx[1],-ry[1],-rz[1]];
    var matrix=[rx[0],ry[0],rz[0],t[0],rx[1],ry[1],rz[1],t[1],rx[2],ry[2],rz[2],t[2]];
    var metricH=[H[0]/knownLength,H[1]/width,H[2],H[3]/knownLength,H[4]/width,H[5],H[6]/knownLength,H[7]/width,H[8]];
    // Confidence reflects geometric conditioning only; four clicks cannot measure real-world point-selection error.
    var confidence=Math.max(0,Math.min(1,Math.min(1,minEdge/(Math.min(w,h)*0.15))*Math.min(1,area/(w*h*0.08))));
    return {ok:true,H:metricH,K:{fx:f,fy:f,cx:cx,cy:cy},camera:{position:position,lookAt:position.map(function(v,i){return v+forward[i];}),up:up,fov:fov,aspect:w/h},
      ground:{normal:[0,1,0],point:[0,0,0]},pixelsPerMeter:Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)/knownLength,
      confidence:confidence,worldToCamera:matrix,rectangle:{length:knownLength,width:width},photo:{width:w,height:h},confidenceMeaning:"仅反映点距和区域大小，不代表实景精度"};
  }
  function project(point,calib){
    if(!calib||!calib.ok||!Array.isArray(point)||point.length!==3||!point.every(finite))return null;
    var m=calib.worldToCamera,k=calib.K, x=m[0]*point[0]+m[1]*point[1]+m[2]*point[2]+m[3], y=m[4]*point[0]+m[5]*point[1]+m[6]*point[2]+m[7], z=m[8]*point[0]+m[9]*point[1]+m[10]*point[2]+m[11];
    return z>EPS?[k.fx*x/z+k.cx,k.fy*y/z+k.cy]:null;
  }
  function scaleFromPoints(points,knownLength){
    if(!Array.isArray(points)||points.length<2||!points[0]||!points[1]||!finite(points[0].x)||!finite(points[0].y)||!finite(points[1].x)||!finite(points[1].y)||!finite(knownLength)||knownLength<=0)return null;
    var pixels=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);return pixels>EPS?knownLength/pixels:null;
  }
  function shadowEllipse(center,radius,calib){
    if(!Array.isArray(center)||center.length!==3||!center.every(finite)||!finite(radius)||radius<=0||!calib||!calib.ok)return null;
    var pts=[];for(var i=0;i<64;i++){var t=2*Math.PI*i/64,p=project([center[0]+radius*Math.cos(t),0,center[2]+radius*Math.sin(t)],calib);if(!p)return null;pts.push(p);}
    var mx=0,my=0;pts.forEach(function(p){mx+=p[0]/64;my+=p[1]/64;});
    var xx=0,yy=0,xy=0;pts.forEach(function(p){var x=p[0]-mx,y=p[1]-my;xx+=x*x/64;yy+=y*y/64;xy+=x*y/64;});
    var d=Math.sqrt((xx-yy)*(xx-yy)+4*xy*xy);
    return {center:[mx,my],radiusX:Math.sqrt(Math.max(0,xx+yy+d)),radiusY:Math.sqrt(Math.max(0,xx+yy-d)),rotation:0.5*Math.atan2(2*xy,xx-yy),approximate:true};
  }
  window.WH.calib={fromQuad:fromQuad,project:project,scaleFromPoints:scaleFromPoints,shadowEllipse:shadowEllipse,auto:function(){return fail("自动灭点尚未实现，请手动标定");}};
})();
