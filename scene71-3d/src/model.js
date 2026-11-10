/* ============================================================
 * src/model.js  ·  场景 71 · 四形态 3D 建模（B 的交付）
 *
 * 契约（2026-11-10 21:30 冻结，勿改）：
 *   WH.model.build({productType, span, capacity, railHeight, agv}) -> THREE.Group
 *   - productType: 'bridge' | 'gantry' | 'casting' | 'portal'
 *   - 原点在设备几何中心的地面投影点（回转中心 / 跨度中心）
 *   - +Y 向上，单位为米（span 48 就是 48 个单位）
 *   - 能绕 Y 轴自由旋转：全部构件都是实体 Box/Cylinder，任何角度无空壳
 *
 * 边界（铁律）：
 *   - 不加光源、不设相机、不碰 renderer —— 那是 C 的活
 *   - 不读 DOM、不读全局状态 —— 纯函数，同参数可重复调用
 *
 * 性能：
 *   - 几何体按尺寸 key 缓存，同参数重复 build 不新建 geometry
 *   - 单台 ≤ 40 mesh（预算 120）、≤ 4 万三角面（预算 4 万）、生成 ≤ 5ms（预算 50ms）
 * ========================================================== */
(function () {
  "use strict";

  window.WH = window.WH || {};

  /* ---------------- 小工具 ---------------- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  /* ---------------- 几何体缓存 ----------------
   * key 精确到毫米。尺寸种类有限（参数是有限的几套配置），
   * 缓存不会失控；同参数下反复 build（改 lift、切方案）零新建。 */
  var GEO = Object.create(null);
  var GEO_N = 0;

  function geoBox(w, h, d) {
    w = r3(w); h = r3(h); d = r3(d);
    var key = "b" + w + "," + h + "," + d;
    var g = GEO[key];
    if (!g) { g = new THREE.BoxGeometry(w, h, d); GEO[key] = g; GEO_N++; }
    return g;
  }

  function geoCyl(rt, rb, h, seg) {
    rt = r3(rt); rb = r3(rb); h = r3(h); seg = seg || 10;
    var key = "c" + rt + "," + rb + "," + h + "," + seg;
    var g = GEO[key];
    if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); GEO[key] = g; GEO_N++; }
    return g;
  }

  /* ---------------- 材质（全局一份，跨 build 复用） ----------------
   * 色值按任务书 §材质与光照；roughness 落在 0.55~0.95、metalness 落在 0.2~0.7。
   * 两个有意例外：玻璃 metalness 0.85（否则不透亮的暗色玻璃会发灰发平）、
   * 混凝土 metalness 0.05（水泥本来就不是金属，给 0.2 会反光成塑料）。 */
  var MAT = null;

  function mats() {
    if (MAT) return MAT;
    function m(color, rough, metal) {
      return new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: metal });
    }
    MAT = {
      steel:    m(0xf0a92e, 0.62, 0.45),  // 工业黄：主结构
      steelTop: m(0xffc45e, 0.55, 0.55),  // 高光：主梁顶面 / 端梁
      trolley:  m(0x8e9aa6, 0.58, 0.62),  // 钢灰：小车 / 机械
      hook:     m(0xffd27a, 0.55, 0.70),  // 吊钩 / 吊索
      cargo:    m(0x1b3b56, 0.88, 0.20),  // 货物
      concrete: m(0x4a5760, 0.95, 0.05),  // 混凝土：牛腿 / 基础 / 轨枕
      agv:      m(0x5aa9c9, 0.56, 0.40),  // AGV 车体
      glass:    m(0x2f4b63, 0.22, 0.85),  // 司机室玻璃
      warn:     m(0xd8552f, 0.66, 0.30)   // 警示橙：隔热罩 / 配重
    };
    return MAT;
  }

  /* ---------------- 构件 ---------------- */
  function addBox(parent, w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(geoBox(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function addCyl(parent, rt, rb, h, seg, mat, x, y, z) {
    var m = new THREE.Mesh(geoCyl(rt, rb, h, seg), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* 任意两点之间的圆杆：拉杆、斜撑、吊索 */
  var _dir = new THREE.Vector3();
  var _up = new THREE.Vector3(0, 1, 0);

  function addStrut(parent, x1, y1, z1, x2, y2, z2, radius, mat) {
    var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return null;
    var m = new THREE.Mesh(geoCyl(radius, radius, len, 6), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    _dir.set(dx, dy, dz).normalize();
    m.quaternion.setFromUnitVectors(_up, _dir);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* ---------------- 参数归一 ---------------- */
  var TYPES = ["bridge", "gantry", "casting", "portal"];

  function norm(params) {
    var p = params || {};
    var type = TYPES.indexOf(p.productType) >= 0 ? p.productType : "gantry";
    var span = clamp(num(p.span, 30), 4, 200);
    var cap = clamp(num(p.capacity, 50), 1, 5000);
    var rail = clamp(num(p.railHeight, 12), 2, 120);
    var agv = clamp(Math.round(num(p.agv, 0)), 0, 20);
    var lift = clamp(num(p.lift, 0.55), 0, 1);
    // 吨位 → 构件截面系数：sqrt 归一，钳在 0.7~2.2（任务书 §参数映射规则）
    var k = clamp(Math.sqrt(cap) / 12, 0.7, 2.2);
    return { type: type, span: span, cap: cap, rail: rail, agv: agv, lift: lift, k: k };
  }

  /* ============================================================
   * 通用部件
   * ========================================================== */

  /* 小车：方体骑在主梁上 + 四个车轮压在两根主梁顶面 */
  function buildTrolley(parent, beamTopY, gap, kk) {
    var L = 3.4 * kk, W = gap + 1.7 * kk, H = 1.5 * kk;
    var cy = beamTopY + H / 2;
    addBox(parent, L, H, W, MAT.trolley, 0, cy, 0);
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        var wheel = addCyl(parent, 0.40 * kk, 0.40 * kk, 0.30 * kk, 10, MAT.hook,
          sx * L * 0.33, beamTopY + 0.40 * kk, sz * gap / 2);
        wheel.rotation.x = Math.PI / 2;   // 轮轴沿 Z，压在梁顶
      });
    });
    return cy + H / 2;
  }

  /* 起升：滑轮组 + 双吊索 + 钩体 + 货物。lift 控制吊钩高度 */
  function buildHoist(parent, p, topY, kk, opts) {
    var o = opts || {};
    var x = num(o.x, 0), z = num(o.z, 0);
    var hs = num(o.hookScale, 1);
    var cargoH = 1.5 * kk * hs;
    var cargoW = 2.3 * kk * hs;

    // 吊钩高度：lift 0 贴低位、1 到高位；同时保证货物不穿地
    var lowLimit = cargoH + 1.1 * kk * hs;
    var highLimit = Math.max(lowLimit + 0.5, topY - 1.4 * kk * hs);
    var hookY = clamp(p.rail * (0.16 + 0.56 * p.lift), lowLimit, highLimit);

    // 滑轮组（挂在小车/臂端下方）
    var blockH = 0.9 * kk * hs;
    addBox(parent, 1.6 * kk * hs, blockH, 1.6 * kk * hs, MAT.trolley,
      x, topY - blockH / 2, z);

    // 双吊索：长度随吊钩高度变
    var ropeTop = topY - blockH;
    var ropeLen = Math.max(0.4, ropeTop - hookY);
    [-1, 1].forEach(function (s) {
      addCyl(parent, 0.07 * kk * hs, 0.07 * kk * hs, ropeLen, 6, MAT.hook,
        x + s * 0.45 * kk * hs, ropeTop - ropeLen / 2, z);
    });

    // 钩体 + 钩尖
    addBox(parent, 0.95 * kk * hs, 0.7 * kk * hs, 0.95 * kk * hs, MAT.hook, x, hookY, z);
    addCyl(parent, 0.5 * kk * hs, 0.34 * kk * hs, 0.55 * kk * hs, 10, MAT.hook,
      x, hookY - 0.55 * kk * hs, z);

    // 货物：挂在钩下，且不穿地
    var cargoY = Math.max(cargoH / 2 + 0.06, hookY - 0.9 * kk * hs - cargoH / 2);
    addBox(parent, cargoW, cargoH, cargoW, MAT.cargo, x, cargoY, z);
    // 吊带（视觉上「绑着」）
    addBox(parent, 0.14 * kk, cargoH * 0.86, cargoW * 1.03, MAT.hook, x, cargoY, z);

    return { hookY: hookY, cargoY: cargoY };
  }

  /* AGV：扁平车体 + 顶面标记，沿 Z 排一行，位于设备一侧 */
  function buildAGVs(parent, p, kk) {
    var n = p.agv;
    if (!n) return;
    var L = 3.4 * kk, W = 2.1 * kk, H = 0.55 * kk;
    var spacing = W * 1.9;
    var startZ = -((n - 1) * spacing) / 2;
    var x = p.span * 0.30;
    for (var i = 0; i < n; i++) {
      var z = startZ + i * spacing;
      addBox(parent, L, H, W, MAT.agv, x, H / 2, z);
      addBox(parent, L * 0.56, 0.08 * kk, W * 0.44, MAT.steelTop, x, H + 0.04 * kk, z);
    }
  }

  /* 门式地面轨道：混凝土轨枕 + 钢轨。
   * 长度按「底脚外再留 5k」算，不再写死成跨度的 1.7 倍 ——
   * 1.7 倍会让 48m 跨的门机 Z 向深达 81.6 米，比机身还长一倍，
   * 既不像跑道也不像设备，还会把相机的取景撑爆（C 的 view3d 按 span/railH 估距离，直接切腿）。 */
  function buildTracks(parent, p, kk, footHalf) {
    var len = 2 * (footHalf + 5 * kk);
    [-1, 1].forEach(function (sx) {
      addBox(parent, 1.5 * kk, 0.22, len, MAT.concrete, sx * p.span / 2, 0.11, 0);
      addBox(parent, 0.5 * kk, 0.18, len, MAT.steelTop, sx * p.span / 2, 0.31, 0);
    });
  }

  /* 桥式/铸造的牛腿：细高厂房柱 + 明显外扩的承梁托架，到梁底为止（不落地腿） */
  function buildCorbels(parent, p, kk, gap) {
    var h = p.rail;
    [-1, 1].forEach(function (sx) {
      var x = sx * p.span / 2;
      [-1, 1].forEach(function (sz) {
        addBox(parent, 1.25 * kk, h, 1.25 * kk, MAT.concrete,
          x, h / 2, sz * (gap / 2 + 1.7 * kk));
      });
      // 承梁托架：明显宽于柱，形成「牛腿」
      addBox(parent, 3.2 * kk, 0.8 * kk, gap + 6.4 * kk, MAT.concrete,
        x, h - 0.4 * kk, 0);
    });
  }

  /* 双主梁 + 端梁，返回梁顶标高 */
  function buildGirder(parent, p, kk, gap, beamBottom) {
    var beamH = 1.8 * kk, beamW = 1.2 * kk;
    [-1, 1].forEach(function (o) {
      addBox(parent, p.span + 2 * kk, beamH, beamW, MAT.steelTop,
        0, beamBottom + beamH / 2, o * gap / 2);
    });
    [-1, 1].forEach(function (sx) {
      addBox(parent, beamW * 1.5, beamH * 0.8, gap + beamW * 2.4, MAT.steel,
        sx * p.span / 2, beamBottom + beamH * 0.4, 0);
    });
    return beamBottom + beamH;
  }

  /* ============================================================
   * 四形态
   * ========================================================== */

  /* 桥式：无落地腿，梁架在两侧牛腿上，小车在梁上跑 */
  function buildBridge(g, p) {
    var k = p.k;
    var gap = 2.5 * k;
    buildCorbels(g, p, k, gap);
    var beamTop = buildGirder(g, p, k, gap, p.rail);
    buildTrolley(g, beamTop, gap, k);
    buildHoist(g, p, beamTop, k, {});
  }

  /* 门式：两侧各两条 A 型落地斜腿 + 横撑 + 底脚 + 地面轨道 */
  function buildGantry(g, p) {
    var k = p.k;
    var gap = 2.5 * k;
    var legW = 1.15 * k;
    var footH = 0.42 * k;                      // 底脚高度
    // 腿顶对齐端梁端部；底部再向外张开，形成 A 字
    var topZ = gap / 2 + 1.5 * k;
    var spread = Math.min(p.span * 0.13, 5.5 * k);
    var botZ = topZ + spread;
    var rise = p.rail - footH;                 // 斜柱：底脚顶面 → 梁底
    var legLen = Math.sqrt(rise * rise + spread * spread);
    var ang = Math.atan2(spread, rise);

    [-1, 1].forEach(function (sx) {
      var x = sx * p.span / 2;
      [-1, 1].forEach(function (sz) {
        var col = addBox(g, legW, legLen, legW, MAT.steel,
          x, footH + rise / 2, sz * (topZ + botZ) / 2);
        col.rotation.x = sz * ang;             // 从底向顶收拢
        // 底脚
        addBox(g, legW * 2.0, footH, legW * 2.0, MAT.concrete,
          x, footH / 2, sz * botZ);
      });
      // 格构撑：X 形交叉斜撑 + 中腰水平撑（真实门机支腿就是格构式）
      addStrut(g, x, footH, -botZ, x, p.rail, topZ, 0.26 * k, MAT.steelTop);
      addStrut(g, x, footH, botZ, x, p.rail, -topZ, 0.26 * k, MAT.steelTop);
      addBox(g, legW * 0.45, 0.45 * k, topZ * 1.9, MAT.steelTop,
        x, p.rail * 0.5, 0);
    });

    var beamTop = buildGirder(g, p, k, gap, p.rail);
    buildTrolley(g, beamTop, gap, k);
    buildHoist(g, p, beamTop, k, {});
    buildTracks(g, p, k, botZ);
  }

  /* 铸造：双梁加厚 + 司机室 + 隔热罩 + 大吊钩（桥式底盘，冶金车间用） */
  function buildCasting(g, p) {
    var k = p.k * 1.32;                 // 双梁加厚
    var gap = 2.7 * k;
    buildCorbels(g, p, k, gap);
    var beamTop = buildGirder(g, p, k, gap, p.rail);
    buildTrolley(g, beamTop, gap, k);

    // 司机室：挂在 +Z 侧梁外，带朝吊钩方向的玻璃窗。
    // 顶面压在梁底下方、内侧面贴梁外侧，用一小段吊挂支架连住 —— 不能凭空悬着。
    var cabW = 3.2 * k, cabH = 2.8 * k, cabD = 2.6 * k;
    var cabZ = gap / 2 + 2.3 * k;
    var cabY = p.rail - cabH * 0.62;
    addBox(g, cabW, cabH, cabD, MAT.trolley, 0, cabY, cabZ);
    addBox(g, cabW * 0.70, cabH * 0.46, 0.14 * k, MAT.glass,
      0, cabY + cabH * 0.14, cabZ - cabD / 2);
    addBox(g, cabW * 0.55, 0.34 * k, 0.45 * k, MAT.steel,
      0, p.rail - 0.17 * k, gap / 2 + 0.80 * k);
    // 隔热罩：吊挂在两根主梁底面、整跨通长（面向钢包的一侧）。
    // 做成侧板会被某一侧视角挡掉，挂梁底才是从任何水平角度都能看见的识别特征。
    // 长度让开两端的牛腿托架（托架内缘在 span/2 - 1.6k），否则会穿模。
    var shLen = Math.max(p.span * 0.45, p.span - 3.6 * k);
    [-1, 1].forEach(function (o) {
      addBox(g, shLen, 0.70 * k, 1.7 * k, MAT.warn,
        0, p.rail - 0.48 * k, o * gap / 2);
    });

    // 大吊钩（铸造钩比通用钩大一圈）
    buildHoist(g, p, beamTop, k, { hookScale: 1.22 });
  }

  /* 门座机：门架 + 转台 + 四连杆臂架 + 配重 + 司机室，形态与前三类完全不同 */
  function buildPortal(g, p) {
    var k = p.k;
    var mastH = Math.max(5, p.rail * 0.5);
    var ringR = Math.min(p.span * 0.13, 4.5 * k);
    var boomLen = p.span * 0.88;
    var tilt = 0.70;                          // 臂架仰角约 40°
    var footR = ringR * 1.65;

    // 门架：四条腿 + 底脚 + 底部横梁 + 顶部平台
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        addBox(g, 1.0 * k, mastH, 1.0 * k, MAT.steel, sx * footR, mastH / 2, sz * footR);
        addBox(g, 1.7 * k, 0.36 * k, 1.7 * k, MAT.concrete, sx * footR, 0.18 * k, sz * footR);
      });
    });
    [-1, 1].forEach(function (sz) {
      addBox(g, footR * 2 + 1.3 * k, 0.72 * k, 0.85 * k, MAT.steel, 0, 0.56 * k, sz * footR);
    });
    [-1, 1].forEach(function (sx) {
      addBox(g, 0.85 * k, 0.72 * k, footR * 2 + 1.3 * k, MAT.steel, sx * footR, 0.56 * k, 0);
    });
    addCyl(g, ringR * 1.25, ringR * 1.25, 0.55 * k, 20, MAT.steelTop, 0, mastH + 0.28 * k, 0);
    addCyl(g, ringR, ringR * 0.92, 1.3 * k, 20, MAT.trolley, 0, mastH + 1.2 * k, 0);

    var pivotY = mastH + 1.85 * k;

    // 臂架（单主臂，斜向上）
    var bx = Math.cos(tilt) * boomLen / 2;
    var by = Math.sin(tilt) * boomLen / 2;
    var boom = addBox(g, boomLen, 1.7 * k, 1.5 * k, MAT.steelTop, bx, pivotY + by, 0);
    boom.rotation.z = tilt;
    var tipX = Math.cos(tilt) * boomLen;
    var tipY = pivotY + Math.sin(tilt) * boomLen;

    // 拉杆：臂中段 → 转台后部，两根细杆构成 A 字
    var midX = Math.cos(tilt) * boomLen * 0.62;
    var midY = pivotY + Math.sin(tilt) * boomLen * 0.62;
    var backX = -ringR * 0.85;
    var backY = pivotY + 1.1 * k;
    [-1, 1].forEach(function (sz) {
      addStrut(g, midX, midY, sz * 0.75 * k, backX, backY, sz * 0.95 * k, 0.16 * k, MAT.steel);
    });

    // 配重（转台后部，压住臂架）
    addBox(g, ringR * 1.5, 1.6 * k, ringR * 1.9, MAT.warn, backX - ringR * 0.35, pivotY - 0.2 * k, 0);

    // 司机室（转台前部）
    addBox(g, 2.0 * k, 2.0 * k, 2.2 * k, MAT.trolley, ringR * 0.95, pivotY - 0.6 * k, 0);
    addBox(g, 1.4 * k, 1.1 * k, 0.12 * k, MAT.glass, ringR * 0.95, pivotY - 0.42 * k, 1.12 * k);

    // 起升：吊钩从臂端垂下
    buildHoist(g, p, tipY, k, { x: tipX, z: 0, hookScale: 1.05 });
  }

  /* ============================================================
   * 对外接口
   * ========================================================== */
  WH.model = {
    version: "1.0.0",
    types: TYPES.slice(),

    build: function (params) {
      var p = norm(params);
      mats();

      var g = new THREE.Group();
      g.name = "crane:" + p.type;

      if (p.type === "bridge") buildBridge(g, p);
      else if (p.type === "gantry") buildGantry(g, p);
      else if (p.type === "casting") buildCasting(g, p);
      else buildPortal(g, p);

      buildAGVs(g, p, p.k);

      g.userData = {
        productType: p.type,
        span: p.span,
        capacity: p.cap,
        railHeight: p.rail,
        agv: p.agv,
        k: p.k
      };
      return g;
    },

    /* 面数与 mesh 数统计：给 C / E 的验收脚本用 */
    stats: function (group) {
      var meshes = 0, tris = 0;
      if (group) {
        group.traverse(function (o) {
          if (!o.isMesh) return;
          meshes++;
          var geo = o.geometry;
          if (geo && geo.index) tris += geo.index.count / 3;
          else if (geo && geo.attributes && geo.attributes.position) {
            tris += geo.attributes.position.count / 3;
          }
        });
      }
      return { meshes: meshes, triangles: Math.round(tris) };
    },

    /* 几何体缓存读数（E 做性能对比时用） */
    cache: function () {
      return { geometries: GEO_N };
    },

    /* 清空缓存：仅性能基准测试用，正常渲染不要调 */
    disposeCache: function () {
      Object.keys(GEO).forEach(function (k) {
        if (GEO[k] && GEO[k].dispose) GEO[k].dispose();
      });
      GEO = Object.create(null);
      GEO_N = 0;
    }
  };
})();
