/* ============================================================
 * src/render.js  ·  Codex 负责（全项目最难的一块）
 *
 * 契约：WH.renderScene(params) -> 完整 SVG 字符串
 *   params = { span, capacity, railHeight, duty, agv, bayType, mode:'before'|'after' }
 * 详见 CONTRACT.md 第 4 节。
 *
 * ⚠️ 当前是「降级占位实现」，只为让联调能跑起来。
 *    Codex 请整段替换为真正的等轴测/轴测渲染：
 *    - 跨度变化 → 厂房与门机比例跟着变（不是只改数字）
 *    - 起重量变化 → 主梁/小车/吊钩视觉权重变化
 *    - 简单光影：地面阴影 + 受光面
 *    - before：空厂房（灰暗）；after：装好设备（暖光 + 高亮标注）
 *    - 单次 ≤16ms，节点 ≤300，纯函数，无外部资源
 * ========================================================== */
(function () {
  "use strict";
  window.WH = window.WH || {};

  window.WH.renderScene = function (params) {
    var p = params || {};
    var span = Number(p.span) || 22.5;
    var cap = Number(p.capacity) || 32;
    var rail = Number(p.railHeight) || 9;
    var agv = Number(p.agv) || 0;
    var after = p.mode !== "before";

    /* —— 以下为占位几何：只为验证契约，Codex 请替换 —— */
    var W = 800, H = 400;
    var k = Math.max(0.72, Math.min(1.24, span / 22.5));      // 跨度比例
    var beamW = 520 * k;
    var beamY = 128 - (rail - 9) * 6;
    var x0 = (W - beamW) / 2;
    var col = after ? "#ffb02e" : "#3a5573";
    var bg = after ? "#0d1a2a" : "#0a1220";
    var floor = after ? "#122236" : "#101a28";

    var s = '<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">';
    s += '<rect width="800" height="400" fill="' + bg + '"/>';
    s += '<rect y="300" width="800" height="100" fill="' + floor + '"/>';
    /* 主梁 */
    s += '<rect x="' + x0 + '" y="' + beamY + '" width="' + beamW + '" height="14" rx="2" fill="' + col + '"/>';
    /* 支腿 */
    s += '<path d="M' + (x0 + 22) + ' ' + beamY + ' V300 M' + (x0 + beamW - 22) + ' ' + beamY + ' V300" stroke="' + col + '" stroke-width="9" fill="none"/>';
    if (after) {
      /* 小车 + 吊钩 + 重物（占位方块） */
      var cx = W / 2;
      s += '<rect x="' + (cx - 34) + '" y="' + (beamY - 12) + '" width="68" height="24" rx="3" fill="#ffd27a"/>';
      s += '<path d="M' + cx + ' ' + (beamY + 12) + ' V' + (beamY + 90) + '" stroke="#ffd27a" stroke-width="2" fill="none"/>';
      s += '<rect x="' + (cx - 26) + '" y="' + (beamY + 90) + '" width="52" height="26" rx="3" fill="#1b3b56" stroke="#35d6f5"/>';
      /* AGV 路径 */
      if (agv > 0) {
        s += '<path d="M' + (x0 + 60) + ' 332 H' + (x0 + beamW - 60) + '" stroke="#31d6f5" stroke-width="2" stroke-dasharray="8 6" opacity=".8"/>';
        s += '<circle cx="' + (x0 + 60) + '" cy="332" r="4" fill="#35e0a1"/><circle cx="' + (x0 + beamW - 60) + '" cy="332" r="4" fill="#35e0a1"/>';
      }
    }
    s += '<text x="24" y="34" fill="' + (after ? "#ffb02e" : "#5c7591") + '" font-size="12">' +
         (after ? "AI 生成 · 实景安装效果图" : "客户现场实景照片 · 空厂房（示意）") + "</text>";
    s += '<text x="24" y="386" fill="#5f7b98" font-size="10">跨度 ' + span + " m · 起重量 " + cap +
         " t · 轨高 " + rail + " m · AGV " + agv + " 台（示意，非真实参数）</text>";
    s += "</svg>";
    return s;
  };
})();
