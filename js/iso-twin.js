/* IsoTwin: compact isometric digital-twin tile, animated with Remotion-style motion
   (spring entrances, staggers, breathing, sweeping heat wave, parallax). No dependencies. */
(function (global) {
  'use strict';
  var FPS = 30;
  var THEME = {
    spring: { smooth: { damping: 20, stiffness: 90, mass: 1 }, snappy: { damping: 14, stiffness: 160, mass: 0.6 }, bouncy: { damping: 11, stiffness: 170, mass: 0.7 } },
    heat: ['#7ed957', '#d9f542', '#ffd23f', '#ff8a2b', '#ff4d1a'],
    ground: '#0e2a26', accent: '#4fd1a5', text: '#e7f3ef', dim: '#a9c4bd'
  };

  // Remotion-equivalent damped spring, integrated at 120 Hz
  var cache = {};
  function spring(frame, cfg) {
    if (frame <= 0) return 0;
    var key = cfg.damping + '/' + cfg.stiffness + '/' + cfg.mass, tbl = cache[key];
    if (!tbl) {
      tbl = cache[key] = [0]; var x = 0, v = 0, dt = 1 / 120, f = 0;
      for (var i = 1; i <= 400; i++) {
        for (var s = 0; s < 4; s++) { var a = (-cfg.stiffness * (x - 1) - cfg.damping * v) / cfg.mass; v += a * dt; x += v * dt; }
        tbl.push(x);
      }
    }
    var k = Math.min(frame, 399), lo = Math.floor(k), fr = k - lo;
    return tbl[lo] + ((tbl[Math.min(lo + 1, 400)] - tbl[lo]) * fr);
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var easeOut = function (t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4); };
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function ramp(stops, t) {
    t = clamp(t, 0, .9999) * (stops.length - 1); var i = Math.floor(t), f = t - i, a = hex(stops[i]), b = hex(stops[i + 1]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function rgb(c, k, a) { k = k == null ? 1 : k; return 'rgba(' + Math.round(clamp(c[0] * k, 0, 255)) + ',' + Math.round(clamp(c[1] * k, 0, 255)) + ',' + Math.round(clamp(c[2] * k, 0, 255)) + ',' + (a == null ? 1 : a) + ')'; }
  function inPoly(px, py, pts) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // icon painters (stroke-style, drawn in theme colours; no emoji)
  var ICONS = {
    thermo: function (c, r, col) { c.strokeStyle = col; c.fillStyle = col; c.lineWidth = r * .12; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -r * .5); c.lineTo(0, r * .18); c.stroke();
      c.beginPath(); c.arc(0, r * .36, r * .24, 0, 7); c.fill();
      c.beginPath(); c.arc(0, -r * .5, r * .12, Math.PI, 0); c.lineTo(r * .12, r * .1); c.moveTo(-r * .12, -r * .5); c.lineTo(-r * .12, r * .1); c.stroke(); },
    leaf: function (c, r, col) { c.fillStyle = col; c.beginPath(); c.moveTo(-r * .42, r * .38); c.bezierCurveTo(-r * .5, -r * .3, 0, -r * .55, r * .45, -r * .42); c.bezierCurveTo(r * .5, r * .05, r * .05, r * .5, -r * .42, r * .38); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = r * .08; c.beginPath(); c.moveTo(-r * .38, r * .36); c.lineTo(r * .2, -r * .2); c.stroke(); },
    drop: function (c, r, col) { c.fillStyle = col; c.beginPath(); c.moveTo(0, -r * .55); c.bezierCurveTo(r * .55, r * .08, r * .42, r * .52, 0, r * .52); c.bezierCurveTo(-r * .42, r * .52, -r * .55, r * .08, 0, -r * .55); c.fill(); },
    chart: function (c, r, col) { c.fillStyle = col; var w = r * .2; [[-r * .36, .3], [-r * .08, .6], [r * .2, .95]].forEach(function (b) { c.fillRect(b[0], r * .45 - r * b[1] * .95, w, r * b[1] * .95); }); }
  };

  function create(opts) {
    var canvas = opts.canvas, ctx = canvas.getContext('2d'), host = opts.host || canvas.parentElement;
    var reduce = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var S = {
      data: null, n: 7, mode: opts.mode || 'heat', cells: [], W: 0, H: 0, dpr: 1,
      start: performance.now(), visible: true, mouse: { x: .5, y: .5, tx: .5, ty: .5 }, hover: null, sel: null, boost: 0, lastHover: null,
      icons: opts.icons !== false, sweep: opts.sweep !== false, nodes: []
    };
    var A = opts.accentRGB || '79,209,165', G = opts.groundRGB || '14,42,38', NF = opts.nodeRGB || '15,43,38';

    function setData(d) {
      S.data = d; S.n = d.n;
      var lst = d.lst, rng = Math.max(.1, lst[1] - lst[0]);
      var hmax = 1; d.cells.forEach(function (c) { if (c.n) hmax = Math.max(hmax, c.h); });
      S.cells = d.cells.map(function (c) {
        var heat = c.n ? (c.lst - lst[0]) / rng : 0;
        return { c: c, i: c.i, j: c.j, heat: heat, h: c.n ? .22 + (c.h / hmax) * .78 : 0, hover: 0, poly: null };
      });
      S.start = performance.now();
    }
    function resize() {
      var r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
      S.dpr = Math.min(global.devicePixelRatio || 1, 2); S.W = r.width; S.H = r.height;
      canvas.width = Math.round(r.width * S.dpr); canvas.height = Math.round(r.height * S.dpr);
      canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px'; render();
    }
    function layout() {
      var n = S.n, W = S.W, H = S.H, fx = opts.gridCenterX == null ? .5 : opts.gridCenterX, wFrac = opts.gridWidth || .9;
      var tw = Math.min(W * wFrac / n, (H * .84) / (n * .5 + 1.35));
      return { tw: tw, th: tw / 2, cx: W * fx, cy: H * .5 - (n * tw / 4) + tw * .45, zs: tw * 1.35 };
    }
    function colorFor(cell, wave) {
      var c = cell.c, m = S.mode;
      if (m === 'ndvi') return ramp(opts.ndviStops || ['#1d3a30', '#2f7d52', '#7ee08a', '#d6ffd9'], (c.ndvi || 0) / .55);
      if (m === 'height') return ramp(opts.heightStops || ['#1b4a5c', '#4fd1a5', '#e7fff5'], cell.h);
      return ramp(THEME.heat, clamp(cell.heat + wave * .22, 0, 1));
    }

    function render(now) {
      if (!S.data || !S.W) return;
      now = now || performance.now();
      var frame = reduce ? 999 : (now - S.start) * FPS / 1000;
      var m = S.mouse; if (!reduce) { m.x += (m.tx - m.x) * .08; m.y += (m.ty - m.y) * .08; }
      var L = layout(), tw = L.tw, th = L.th, W = S.W, H = S.H, n = S.n;
      var px = (m.x - .5) * 16, py = (m.y - .5) * 8;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, W, H);

      // layer 1: faint grid backdrop
      ctx.strokeStyle = 'rgba('+A+',.07)'; ctx.lineWidth = 1; var gs = 36;
      for (var gx = (px * .3) % gs; gx < W; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (var gy = (py * .3) % gs; gy < H; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

      // heat wave position (diagonal sweep every 8s after intro)
      var idle = Math.max(0, frame - 70), wavePos = -3 + ((idle % 260) / 260) * (n * 2 + 6);
      var cells = S.cells.slice().sort(function (a, b) { return (a.i + a.j) - (b.i + b.j); });
      var cxx = L.cx + px, cyy = L.cy + py, mid = (n - 1) / 2;
      var hoverTarget = S.hover;

      cells.forEach(function (cell) {
        var i = cell.i, j = cell.j;
        var d = Math.hypot(i - mid, j - mid), delay = 6 + d * 5 + ((i * 7 + j * 13) % 5);
        var p = spring(frame - delay, THEME.spring.smooth);
        var pop = spring(frame - delay - 6, THEME.spring.bouncy);
        cell.hover += ((hoverTarget === cell ? 1 : 0) - cell.hover) * .2;
        var sx = cxx + (i - j) * tw / 2, sy = cyy + (i + j) * th / 2;
        var gap = .05, tx0 = tw / 2 * (1 - gap), ty0 = th / 2 * (1 - gap);
        // ground tile
        var gA = clamp(p, 0, 1);
        ctx.fillStyle = 'rgba('+G+',' + (gA * .95) + ')'; ctx.strokeStyle = 'rgba('+A+',' + (.2 * gA) + ')'; ctx.lineWidth = 1;
        // diamond (top vertex at sy, centre at sy+th/2)
        ctx.beginPath(); ctx.moveTo(sx, sy + th / 2 - ty0); ctx.lineTo(sx + tx0, sy + th / 2); ctx.lineTo(sx, sy + th / 2 + ty0); ctx.lineTo(sx - tx0, sy + th / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        var polys = [];
        if (!cell.c.n) {
          // open space: tree / water
          var q = clamp(pop, 0, 1.2);
          if (((i * 3 + j * 5) % 7) === 0) { ctx.fillStyle = 'rgba(47,140,200,' + gA * .75 + ')'; ctx.beginPath(); ctx.moveTo(sx, sy + th / 2 - ty0 * .8); ctx.lineTo(sx + tx0 * .8, sy + th / 2); ctx.lineTo(sx, sy + th / 2 + ty0 * .8); ctx.lineTo(sx - tx0 * .8, sy + th / 2); ctx.closePath(); ctx.fill(); }
          else if ((i + j * 2) % 3 !== 1) {
            var tr = tw * .09 * q, ty = sy + th / 2 - tr * .2 - Math.sin(frame / 25 + i + j) * 1.2 * gA;
            ctx.fillStyle = 'rgba(52,168,110,' + gA + ')'; ctx.beginPath(); ctx.arc(sx, ty - tr * .9, tr, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(90,62,40,' + gA + ')'; ctx.fillRect(sx - tr * .12, ty - tr * .1, tr * .24, tr * .9);
          }
          cell.poly = null; return;
        }
        // block
        var wave = Math.exp(-Math.pow((i + j) - wavePos, 2) / 3.2) * (S.sweep && !reduce && frame > 70 ? 1 : 0);
        var breathe = 1 + Math.sin(frame / 22 + i * .7 + j * .5) * .025 * (frame > 60 ? 1 : 0);
        var z = cell.h * L.zs * clamp(p, 0, 1.0) * (1 + (pop - 1) * .08) * breathe + cell.hover * tw * .12 + wave * tw * .06;
        z = Math.max(1, z);
        var col = colorFor(cell, wave), alpha = clamp(p * 1.4, 0, 1);
        var cy0 = sy + th / 2, top = [[sx, cy0 - ty0 - z], [sx + tx0, cy0 - z], [sx, cy0 + ty0 - z], [sx - tx0, cy0 - z]];
        var left = [[sx - tx0, cy0 - z], [sx, cy0 + ty0 - z], [sx, cy0 + ty0], [sx - tx0, cy0]];
        var right = [[sx + tx0, cy0 - z], [sx, cy0 + ty0 - z], [sx, cy0 + ty0], [sx + tx0, cy0]];
        var lift = 1 + cell.hover * .18 + wave * .18;
        function poly(pts, k) { ctx.fillStyle = rgb(col, k * lift, alpha); ctx.beginPath(); pts.forEach(function (q, a) { a ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill(); }
        // soft glow for hot cells
        if (S.mode === 'heat' && cell.heat > .7) { ctx.save(); ctx.shadowColor = rgb(col, 1, .55); ctx.shadowBlur = tw * .35 * (cell.heat - .6); poly(top, 1.05); ctx.restore(); }
        poly(left, .62); poly(right, .8); poly(top, 1.08);
        // window dots
        ctx.fillStyle = 'rgba(255,255,255,' + .22 * alpha + ')';
        var rows = Math.min(5, Math.floor(z / (tw * .16)));
        for (var rr = 0; rr < rows; rr++) { var zz = cy0 - (rr + .7) * (z / (rows + .4)); ctx.fillRect(sx + tx0 * .38 - 1, zz + ty0 * .55 - 1 + (tx0 * .38) * 0, 2.2, 2.2); ctx.fillRect(sx - tx0 * .4 - 1, zz + ty0 * .55 - 1, 2.2, 2.2); }
        if (cell.hover > .05 || S.sel === cell) {
          ctx.strokeStyle = S.sel === cell ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,' + (.8 * cell.hover) + ')'; ctx.lineWidth = 1.6;
          ctx.beginPath(); top.forEach(function (q, a) { a ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
        }
        cell.poly = [top, left, right]; cell.sx = sx; cell.sy = cy0 - z;
      });

      // icon nodes with dashed connectors (parallax stronger than blocks)
      S.nodes = [];
      if (S.icons) {
        var defs = opts.nodes || [];
        defs.forEach(function (nd, k) {
          var delay = 40 + k * 8, p = clamp(spring(frame - delay, THEME.spring.snappy), 0, 1.1);
          var bx = W * nd.x + px * 1.8, by = H * nd.y + py * 1.8 + Math.sin(frame / 30 + k * 1.7) * 3 * (frame > 70 ? 1 : 0);
          var r = Math.max(22, Math.min(W, H) * .07);
          // connector toward target cell
          var tgt = nd.cell && S.cells.filter(function (c) { return c.i === nd.cell[0] && c.j === nd.cell[1]; })[0];
          if (tgt && tgt.sx != null) {
            var draw = easeOut((frame - delay - 6) / 24);
            ctx.save(); ctx.setLineDash([4, 5]); ctx.lineDashOffset = -frame * .4; ctx.strokeStyle = 'rgba('+A+',' + .55 * draw + ')'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (tgt.sx - bx) * draw, by + (tgt.sy - by) * draw); ctx.stroke(); ctx.restore();
            ctx.fillStyle = 'rgba('+A+',' + draw + ')'; ctx.beginPath(); ctx.arc(bx + (tgt.sx - bx) * draw, by + (tgt.sy - by) * draw, 2.6, 0, 7); ctx.fill();
          }
          var hov = S.hoverNode === k;
          ctx.save(); ctx.translate(bx, by); ctx.scale(p * (hov ? 1.1 : 1), p * (hov ? 1.1 : 1));
          ctx.globalAlpha = clamp(p, 0, 1);
          ctx.fillStyle = hov ? 'rgba('+NF+',.98)' : 'rgba('+NF+',.95)'; ctx.strokeStyle = hov ? 'rgb('+A+')' : 'rgba('+A+',.4)'; ctx.lineWidth = hov ? 2 : 1.4;
          ctx.shadowColor = 'rgba('+A+',.35)'; ctx.shadowBlur = hov ? 22 : 10;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
          ICONS[nd.icon](ctx, r * 1.05, nd.color); ctx.restore();
          S.nodes.push({ x: bx, y: by, r: r, def: nd });
        });
      }
      // layer 5: vignette
      var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    function pick(x, y) {
      for (var a = S.nodes.length - 1; a >= 0; a--) { var nd = S.nodes[a]; if (Math.hypot(x - nd.x, y - nd.y) <= nd.r) return { node: a }; }
      var cells = S.cells.slice().sort(function (a, b) { return (b.i + b.j) - (a.i + a.j); });
      for (var k = 0; k < cells.length; k++) { var c = cells[k]; if (c.poly && (inPoly(x, y, c.poly[0]) || inPoly(x, y, c.poly[1]) || inPoly(x, y, c.poly[2]))) return { cell: c }; }
      return {};
    }
    function pt(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r]; }
    canvas.addEventListener('pointermove', function (e) {
      var p = pt(e); S.mouse.tx = p[0] / p[2].width; S.mouse.ty = p[1] / p[2].height;
      var h = pick(p[0], p[1]); S.hover = h.cell || null; S.hoverNode = h.node != null ? h.node : -1;
      canvas.style.cursor = (S.hover || S.hoverNode >= 0) ? 'pointer' : '';
      if (opts.onHover) opts.onHover(h.cell ? h.cell.c : null, h.node != null ? S.nodes[h.node].def : null, e);
      if (reduce) render();
    });
    canvas.addEventListener('pointerleave', function () { S.hover = null; S.hoverNode = -1; S.mouse.tx = S.mouse.ty = .5; if (opts.onHover) opts.onHover(null, null); if (reduce) render(); });
    canvas.addEventListener('click', function (e) {
      var p = pt(e), h = pick(p[0], p[1]);
      if (h.cell) { S.sel = h.cell; if (opts.onSelect) opts.onSelect(h.cell.c, e); }
      if (reduce) render();
    });

    var raf;
    function loop(t) { raf = requestAnimationFrame(loop); if (S.visible && !reduce) render(t); }
    if ('IntersectionObserver' in global) new IntersectionObserver(function (es) { var v = es[0].isIntersecting; if (v && !S.visible) S.start = S.start; S.visible = v; }).observe(canvas);
    if ('ResizeObserver' in global) new ResizeObserver(resize).observe(host); else global.addEventListener('resize', resize);
    loop();
    return {
      setData: function (d) { setData(d); resize(); },
      setMode: function (m) { S.mode = m; if (reduce) render(); },
      replay: function () { S.start = performance.now(); },
      select: function (i, j) { S.sel = S.cells.filter(function (c) { return c.i === i && c.j === j; })[0] || null; },
      state: S
    };
  }
  global.IsoTwin = { create: create, THEME: THEME };
})(window);
