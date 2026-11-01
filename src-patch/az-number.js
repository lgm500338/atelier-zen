/* 멍때리는 아틀리에 — 번호 색칠 엔진 (AZNum)
 * - 기존 도안/내 사진을 번호가 붙은 영역으로 나누고
 * - 탭 한 번으로 영역 전체를 칠하는 번호 색칠 화면을 제공
 */
(function () {
  'use strict';

  var PAPER = '#FAF7F2';
  var VERSION = 3;

  /* ---------- 작은 도우미 ---------- */
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var e = t;
      e = Math.imul(e ^ (e >>> 15), e | 1);
      e ^= e + Math.imul(e ^ (e >>> 7), e | 61);
      return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hex(r, g, b) {
    function c(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + c(r) + c(g) + c(b);
  }
  function parseHex(h) {
    var m = /^#([0-9a-f]{6})/i.exec(h || '');
    if (!m) return [128, 128, 128];
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function lum(rgb) { return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]; }
  function srgbToLab(r, g, b) {
    function f(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var R = f(r), G = f(g), B = f(b);
    var X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    var Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    var Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    function h(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = h(X), fy = h(Y), fz = h(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function boxBlur(data, W, H, rad) {
    // data: Uint8ClampedArray RGBA, 3채널만 블러
    var tmp = new Float32Array(W * H * 3), out = new Uint8ClampedArray(data.length);
    var x, y, c, i, k, sum, cnt;
    for (y = 0; y < H; y++) for (c = 0; c < 3; c++) {
      sum = 0; cnt = 0;
      for (k = -rad; k <= rad; k++) { x = Math.min(W - 1, Math.max(0, k)); sum += data[(y * W + x) * 4 + c]; cnt++; }
      for (x = 0; x < W; x++) {
        tmp[(y * W + x) * 3 + c] = sum / cnt;
        var xo = Math.max(0, x - rad), xi = Math.min(W - 1, x + rad + 1);
        sum += data[(y * W + xi) * 4 + c] - data[(y * W + xo) * 4 + c];
      }
    }
    for (x = 0; x < W; x++) for (c = 0; c < 3; c++) {
      sum = 0; cnt = 0;
      for (k = -rad; k <= rad; k++) { y = Math.min(H - 1, Math.max(0, k)); sum += tmp[(y * W + x) * 3 + c]; cnt++; }
      for (y = 0; y < H; y++) {
        i = (y * W + x) * 4;
        out[i + c] = sum / cnt;
        var yo = Math.max(0, y - rad), yi = Math.min(H - 1, y + rad + 1);
        sum += tmp[(yi * W + x) * 3 + c] - tmp[(yo * W + x) * 3 + c];
      }
    }
    for (i = 3; i < data.length; i += 4) out[i] = 255;
    return out;
  }

  /* ---------- k-means (Lab) ---------- */
  function kmeans(data, W, H, K, mask, seed) {
    var N = W * H, rand = rng(seed);
    var lab = new Float32Array(N * 3);
    for (var p = 0; p < N; p++) {
      var L = srgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
      lab[p * 3] = L[0]; lab[p * 3 + 1] = L[1]; lab[p * 3 + 2] = L[2];
    }
    var samples = [], step = Math.max(1, Math.floor(N / 7000));
    for (p = 0; p < N; p += step) if (!mask || !mask[p]) samples.push(p);
    if (samples.length < K) { samples = []; for (p = 0; p < N; p += step) samples.push(p); }
    // k-means++ 초기화
    var cents = [], first = samples[Math.floor(rand() * samples.length)];
    cents.push([lab[first * 3], lab[first * 3 + 1], lab[first * 3 + 2]]);
    var d2 = new Float32Array(samples.length).fill(1e9);
    while (cents.length < K) {
      var last = cents[cents.length - 1], tot = 0, s;
      for (s = 0; s < samples.length; s++) {
        var q = samples[s] * 3;
        var dd = (lab[q] - last[0]) * (lab[q] - last[0]) + (lab[q + 1] - last[1]) * (lab[q + 1] - last[1]) + (lab[q + 2] - last[2]) * (lab[q + 2] - last[2]);
        if (dd < d2[s]) d2[s] = dd;
        tot += d2[s];
      }
      if (tot <= 0) break;
      var r = rand() * tot;
      for (s = 0; s < samples.length; s++) { r -= d2[s]; if (r <= 0) break; }
      var pick = samples[Math.min(s, samples.length - 1)] * 3;
      cents.push([lab[pick], lab[pick + 1], lab[pick + 2]]);
    }
    K = cents.length;
    for (var it = 0; it < 14; it++) {
      var acc = new Float64Array(K * 4);
      for (s = 0; s < samples.length; s++) {
        var b = samples[s] * 3, best = 0, bd = 1e18;
        for (var k = 0; k < K; k++) {
          var c = cents[k];
          var e = (lab[b] - c[0]) * (lab[b] - c[0]) + (lab[b + 1] - c[1]) * (lab[b + 1] - c[1]) + (lab[b + 2] - c[2]) * (lab[b + 2] - c[2]);
          if (e < bd) { bd = e; best = k; }
        }
        acc[best * 4] += lab[b]; acc[best * 4 + 1] += lab[b + 1]; acc[best * 4 + 2] += lab[b + 2]; acc[best * 4 + 3]++;
      }
      for (k = 0; k < K; k++) if (acc[k * 4 + 3] > 0) cents[k] = [acc[k * 4] / acc[k * 4 + 3], acc[k * 4 + 1] / acc[k * 4 + 3], acc[k * 4 + 2] / acc[k * 4 + 3]];
    }
    var idx = new Uint8Array(N);
    var sumRGB = new Float64Array(K * 4);
    for (p = 0; p < N; p++) {
      var bb = p * 3, bi = 0, bdd = 1e18;
      for (k = 0; k < K; k++) {
        var cc = cents[k];
        var ee = (lab[bb] - cc[0]) * (lab[bb] - cc[0]) + (lab[bb + 1] - cc[1]) * (lab[bb + 1] - cc[1]) + (lab[bb + 2] - cc[2]) * (lab[bb + 2] - cc[2]);
        if (ee < bdd) { bdd = ee; bi = k; }
      }
      idx[p] = bi;
      sumRGB[bi * 4] += data[p * 4]; sumRGB[bi * 4 + 1] += data[p * 4 + 1]; sumRGB[bi * 4 + 2] += data[p * 4 + 2]; sumRGB[bi * 4 + 3]++;
    }
    var colors = [];
    for (k = 0; k < K; k++) {
      var n = sumRGB[k * 4 + 3] || 1;
      colors.push([sumRGB[k * 4] / n, sumRGB[k * 4 + 1] / n, sumRGB[k * 4 + 2] / n]);
    }
    return { idx: idx, colors: colors };
  }

  function modeFilter(idx, W, H, K, passes) {
    var cur = idx, cnt = new Int32Array(K);
    for (var ps = 0; ps < passes; ps++) {
      var out = new Uint8Array(cur.length);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        cnt.fill(0);
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= W) continue;
            cnt[cur[yy * W + xx]]++;
          }
        }
        var me = cur[y * W + x], best = me, bc = cnt[me];
        for (var k = 0; k < K; k++) if (cnt[k] > bc) { bc = cnt[k]; best = k; }
        out[y * W + x] = best;
      }
      cur = out;
    }
    return cur;
  }

  /* ---------- 영역 나누기 ---------- */
  // idx: 색 번호 맵, line: 선(경계) 마스크(선택)
  function segment(idx, line, W, H, minArea, unifySameColor, lr) {
    var N = W * H, lab = new Int32Array(N).fill(-1), comp = 0;
    var stack = new Int32Array(N), csize = [], ccolor = [];
    for (var p = 0; p < N; p++) {
      if (lab[p] >= 0 || (line && line[p])) continue;
      var col = idx[p], sp = 0, sz = 0;
      stack[sp++] = p; lab[p] = comp;
      while (sp) {
        var q = stack[--sp]; sz++;
        var x = q % W, y = (q - x) / W;
        if (x > 0) { var a = q - 1; if (lab[a] < 0 && idx[a] === col && !(line && line[a])) { lab[a] = comp; stack[sp++] = a; } }
        if (x < W - 1) { a = q + 1; if (lab[a] < 0 && idx[a] === col && !(line && line[a])) { lab[a] = comp; stack[sp++] = a; } }
        if (y > 0) { a = q - W; if (lab[a] < 0 && idx[a] === col && !(line && line[a])) { lab[a] = comp; stack[sp++] = a; } }
        if (y < H - 1) { a = q + W; if (lab[a] < 0 && idx[a] === col && !(line && line[a])) { lab[a] = comp; stack[sp++] = a; } }
      }
      csize.push(sz); ccolor.push(col); comp++;
    }
    // 선 픽셀은 가장 가까운 영역으로 채워 넣기 (BFS)
    if (line) {
      var qa = new Int32Array(N), qh = 0, qt = 0;
      for (p = 0; p < N; p++) if (lab[p] >= 0) qa[qt++] = p;
      while (qh < qt) {
        q = qa[qh++]; x = q % W; y = (q - x) / W; var L = lab[q];
        if (x > 0 && lab[q - 1] < 0) { lab[q - 1] = L; csize[L]++; qa[qt++] = q - 1; }
        if (x < W - 1 && lab[q + 1] < 0) { lab[q + 1] = L; csize[L]++; qa[qt++] = q + 1; }
        if (y > 0 && lab[q - W] < 0) { lab[q - W] = L; csize[L]++; qa[qt++] = q - W; }
        if (y < H - 1 && lab[q + W] < 0) { lab[q + W] = L; csize[L]++; qa[qt++] = q + W; }
      }
      if (comp === 0) { lab.fill(0); csize = [N]; ccolor = [0]; comp = 1; }
    }
    // 인접 관계 (경계 길이)
    var adj = [];
    for (var c = 0; c < comp; c++) adj.push(new Map());
    function addEdge(a, b) {
      adj[a].set(b, (adj[a].get(b) || 0) + 1);
      adj[b].set(a, (adj[b].get(a) || 0) + 1);
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      p = y * W + x; var l0 = lab[p];
      if (x < W - 1 && lab[p + 1] !== l0) addEdge(l0, lab[p + 1]);
      if (y < H - 1 && lab[p + W] !== l0) addEdge(l0, lab[p + W]);
    }
    // union-find 병합
    var parent = new Int32Array(comp);
    for (c = 0; c < comp; c++) parent[c] = c;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function merge(a, b) { // b를 a로
      parent[b] = a; csize[a] += csize[b];
      adj[b].forEach(function (w, n) {
        if (n === a) return;
        adj[a].set(n, (adj[a].get(n) || 0) + w);
        var m = adj[n]; var wb = m.get(b) || 0; m.delete(b); m.set(a, (m.get(a) || 0) + wb);
      });
      adj[a].delete(b); adj[b] = new Map();
    }
    if (unifySameColor) {
      for (c = 0; c < comp; c++) {
        var rc = find(c);
        adj[rc].forEach(function (w, n) {
          var rn = find(n);
          if (rn !== rc && ccolor[rn] === ccolor[rc]) merge(rc, rn);
        });
      }
    }
    var order = [];
    for (c = 0; c < comp; c++) order.push(c);
    // 선으로 둘러싸인 칸(lr) 정보: 같은 칸 안의 색 조각은 더 적극적으로 합침
    var lrOf = null, lrCount = null;
    if (lr) {
      lrOf = new Int32Array(comp).fill(-1); lrCount = {};
      for (p = 0; p < N; p++) { var lc = lab[p]; if (lrOf[lc] < 0 && !(line && line[p])) lrOf[lc] = lr[p]; }
      for (c = 0; c < comp; c++) { if (lrOf[c] < 0) lrOf[c] = lr[0]; lrCount[lrOf[c]] = (lrCount[lrOf[c]] || 0) + 1; }
    }
    var changed = true, guard = 0;
    while (changed && guard++ < 8) {
      changed = false;
      order.sort(function (a, b) { return csize[a] - csize[b]; });
      for (var o = 0; o < order.length; o++) {
        c = order[o];
        if (find(c) !== c) continue;
        var isFrag = lr && lrCount[lrOf[c]] > 1;
        if (csize[c] >= (isFrag ? minArea * 5 : minArea)) continue;
        var bestN = -1, bestW = -1;
        adj[c].forEach(function (w, n) {
          var rn = find(n); if (rn === c) return;
          var sc = w * (lr && lrOf[rn] === lrOf[c] ? 20 : 1);
          if (sc > bestW) { bestW = sc; bestN = rn; }
        });
        if (bestN < 0) continue;
        if (isFrag && lrOf[bestN] !== lrOf[c] && csize[c] >= minArea) continue;
        if (lr) { lrCount[lrOf[c]]--; }
        merge(bestN, c); changed = true;
        if (unifySameColor) {
          var rr = bestN;
          adj[rr].forEach(function (w, n) { var rn = find(n); if (rn !== rr && ccolor[rn] === ccolor[rr]) merge(rr, rn); });
        }
      }
    }
    // 최종 라벨
    var remap = new Int32Array(comp).fill(-1), regions = [];
    for (p = 0; p < N; p++) {
      var root = find(lab[p]);
      if (remap[root] < 0) { remap[root] = regions.length; regions.push({ color: ccolor[root], area: 0 }); }
      lab[p] = remap[root]; regions[lab[p]].area++;
    }
    return { lab: lab, regions: regions };
  }

  /* ---------- 경계 추적 (픽셀 모서리 따라가기) ---------- */
  function traceRegion(lab, W, H, id, start) {
    function inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id; }
    var sx = start % W, sy = (start - sx) / W;
    var cx = sx, cy = sy, d = 0, pts = [[cx, cy]];
    var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], guard = 0, limit = W * H * 4;
    do {
      cx += DX[d]; cy += DY[d];
      var R, Lp;
      if (d === 0) { R = inside(cx, cy); Lp = inside(cx, cy - 1); }
      else if (d === 1) { R = inside(cx - 1, cy); Lp = inside(cx, cy); }
      else if (d === 2) { R = inside(cx - 1, cy - 1); Lp = inside(cx - 1, cy); }
      else { R = inside(cx, cy - 1); Lp = inside(cx - 1, cy - 1); }
      var nd;
      if (R) nd = Lp ? (d + 3) % 4 : d; else nd = (d + 1) % 4;
      if (nd !== d) pts.push([cx, cy]);
      d = nd;
    } while (!(cx === sx && cy === sy && d === 0) && guard++ < limit);
    return pts;
  }
  function simplify(pts, eps) {
    if (pts.length < 4) return pts;
    var keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
    var st = [[0, pts.length - 1]];
    while (st.length) {
      var seg = st.pop(), a = seg[0], b = seg[1];
      var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, md = -1, mi = -1;
      for (var i = a + 1; i < b; i++) {
        var dd = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
        if (dd > md) { md = dd; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    var out = [];
    for (i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }
  function toPath(pts, sx, sy, rad) {
    // 닫힌 다각형 → 긴 변은 곧게, 모서리만 살짝 둥글게
    var n = pts.length;
    if (n > 1 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]) { pts = pts.slice(0, -1); n--; }
    function P(i) { var q = pts[((i % n) + n) % n]; return [q[0] * sx, q[1] * sy]; }
    function r(v) { return Math.round(v * 10) / 10; }
    if (n < 3) { var a = P(0); return 'M' + r(a[0]) + ' ' + r(a[1]) + 'Z'; }
    var R = rad || 2.2 * sx, s = '';
    for (var i = 0; i < n; i++) {
      var pv = P(i - 1), c = P(i), nx = P(i + 1);
      var l1 = Math.hypot(c[0] - pv[0], c[1] - pv[1]) || 1, l2 = Math.hypot(nx[0] - c[0], nx[1] - c[1]) || 1;
      var k1 = Math.min(R, l1 * 0.5) / l1, k2 = Math.min(R, l2 * 0.5) / l2;
      var ax = c[0] + (pv[0] - c[0]) * k1, ay = c[1] + (pv[1] - c[1]) * k1;
      var bx = c[0] + (nx[0] - c[0]) * k2, by = c[1] + (nx[1] - c[1]) * k2;
      s += (i === 0 ? 'M' : 'L') + r(ax) + ' ' + r(ay) + 'Q' + r(c[0]) + ' ' + r(c[1]) + ' ' + r(bx) + ' ' + r(by);
    }
    return s + 'Z';
  }
  function polyArea(pts) {
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a / 2);
  }

  /* ---------- 번호 위치 (거리 변환) ---------- */
  function labelPoints(lab, W, H, count) {
    var N = W * H, dist = new Float32Array(N), INF = 1e9;
    for (var p = 0; p < N; p++) {
      var x = p % W, y = (p - x) / W, l = lab[p];
      var edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
        lab[p - 1] !== l || lab[p + 1] !== l || lab[p - W] !== l || lab[p + W] !== l;
      dist[p] = edge ? 1 : INF;
    }
    // 2-pass chamfer (같은 영역 안에서만)
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      p = y * W + x; if (dist[p] === 1) continue; l = lab[p];
      var v = dist[p];
      if (x > 0 && lab[p - 1] === l) v = Math.min(v, dist[p - 1] + 1);
      if (y > 0 && lab[p - W] === l) v = Math.min(v, dist[p - W] + 1);
      if (x > 0 && y > 0 && lab[p - W - 1] === l) v = Math.min(v, dist[p - W - 1] + 1.414);
      if (x < W - 1 && y > 0 && lab[p - W + 1] === l) v = Math.min(v, dist[p - W + 1] + 1.414);
      dist[p] = v;
    }
    for (y = H - 1; y >= 0; y--) for (x = W - 1; x >= 0; x--) {
      p = y * W + x; if (dist[p] === 1) continue; l = lab[p];
      v = dist[p];
      if (x < W - 1 && lab[p + 1] === l) v = Math.min(v, dist[p + 1] + 1);
      if (y < H - 1 && lab[p + W] === l) v = Math.min(v, dist[p + W] + 1);
      if (x < W - 1 && y < H - 1 && lab[p + W + 1] === l) v = Math.min(v, dist[p + W + 1] + 1.414);
      if (x > 0 && y < H - 1 && lab[p + W - 1] === l) v = Math.min(v, dist[p + W - 1] + 1.414);
      dist[p] = v;
    }
    var best = new Float32Array(count), bp = new Int32Array(count).fill(-1), first = new Int32Array(count).fill(-1);
    for (p = 0; p < N; p++) {
      l = lab[p];
      if (first[l] < 0) first[l] = p;
      if (dist[p] > best[l]) { best[l] = dist[p]; bp[l] = p; }
    }
    return { best: best, pos: bp, first: first };
  }

  /* ---------- 도안 → 번호 영역 ---------- */
  function diffParams(diff) {
    if (diff === 'easy') return { K: 8, areaFrac: 1 / 260 };
    if (diff === 'hard') return { K: 20, areaFrac: 1 / 1500 };
    return { K: 14, areaFrac: 1 / 700 };
  }

  function finishRegions(seg, W, H, sx, sy, palette) {
    var regs = seg.regions, lab = seg.lab;
    var lp = labelPoints(lab, W, H, regs.length);
    var used = {}, out = [];
    for (var i = 0; i < regs.length; i++) {
      var raw = traceRegion(lab, W, H, i, lp.first[i]);
      var simp = simplify(raw, 0.9);
      if (simp.length < 3) simp = raw;
      var p = lp.pos[i] >= 0 ? lp.pos[i] : lp.first[i];
      var x = p % W, y = (p - x) / W;
      out.push({
        d: toPath(simp, sx, sy),
        c: regs[i].color,
        lx: Math.round((x + 0.5) * sx * 10) / 10,
        ly: Math.round((y + 0.5) * sy * 10) / 10,
        fs: Math.round(Math.max(5, Math.min(26, lp.best[i] * sx * 1.05)) * 10) / 10,
        a: polyArea(simp) * sx * sy
      });
      used[regs[i].color] = 1;
    }
    // 사용된 색만 번호로, 밝은 색부터
    var keys = Object.keys(used).map(Number);
    keys.sort(function (a, b) { return lum(palette[b]) - lum(palette[a]); });
    var map = {}, pal = [];
    keys.forEach(function (k, j) { map[k] = j; pal.push(hex(palette[k][0], palette[k][1], palette[k][2])); });
    out.forEach(function (r) { r.c = map[r.c]; });
    out.sort(function (a, b) { return b.a - a.a; });
    return { regions: out, palette: pal };
  }

  function canvasOf(W, H) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    return c;
  }

  // 사진(이미지) → 번호 영역
  function fromImage(img, artW, artH, diff) {
    var pr = diffParams(diff);
    var maxSide = diff === 'hard' ? 420 : 360;
    var s = Math.min(1, maxSide / Math.max(artW, artH));
    var W = Math.max(40, Math.round(artW * s)), H = Math.max(40, Math.round(artH * s));
    var cv = canvasOf(W, H), ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    var data = boxBlur(ctx.getImageData(0, 0, W, H).data, W, H, diff === 'hard' ? 1 : 2);
    var km = kmeans(data, W, H, pr.K, null, 12345);
    var idx = modeFilter(km.idx, W, H, km.colors.length, 2);
    var seg = segment(idx, null, W, H, Math.max(12, Math.round(W * H * pr.areaFrac)), true);
    return finishRegions(seg, W, H, artW / W, artH / H, km.colors);
  }

  // 기존 도안 → 번호 영역
  function fromArtwork(art, tt) {
    var diff = art.difficulty || 'medium';
    var pr = diffParams(diff);
    var s = Math.min(1, 380 / Math.max(art.width, art.height));
    var W = Math.round(art.width * s), H = Math.round(art.height * s);
    var colorCv = canvasOf(W, H), cctx = colorCv.getContext('2d', { willReadFrequently: true });
    cctx.fillStyle = PAPER; cctx.fillRect(0, 0, W, H);
    cctx.save(); cctx.scale(s, s);
    var hasColor = false, i = 0;
    art.layers.forEach(function (layer) {
      layer.paths.forEach(function (p) {
        i++;
        if (layer.style === 'pen') return;
        hasColor = true;
        try { tt(cctx, p, layer.style, i, art.width, art.height); } catch (e) { }
      });
    });
    cctx.restore();
    // 선 마스크
    var lineCv = canvasOf(W, H), lctx = lineCv.getContext('2d', { willReadFrequently: true });
    lctx.save(); lctx.scale(s, s); lctx.lineCap = 'round'; lctx.lineJoin = 'round'; lctx.strokeStyle = '#000';
    art.layers.forEach(function (layer) {
      if (layer.style !== 'pen') return;
      layer.paths.forEach(function (p) {
        if (p.type !== 'stroke' || !p.d) return;
        if ((p.lineWidth || 1.8) < 1.0 && p.opacity !== undefined && p.opacity < 0.5) return; // 아주 옅은 해칭 무시
        lctx.lineWidth = Math.max(1.5 / s, p.lineWidth || 1.8);
        try { lctx.stroke(new Path2D(p.d)); } catch (e) { }
      });
    });
    lctx.restore();
    var ld = lctx.getImageData(0, 0, W, H).data, line = new Uint8Array(W * H), lineCount = 0;
    for (var p = 0; p < W * H; p++) if (ld[p * 4 + 3] > 60) { line[p] = 1; lineCount++; }
    var minArea = Math.max(10, Math.round(W * H * pr.areaFrac));
    var seed = hashStr(String(art.id));
    if (hasColor) {
      var data = boxBlur(cctx.getImageData(0, 0, W, H).data, W, H, 2);
      var km = kmeans(data, W, H, pr.K, line, seed);
      var idx = modeFilter(km.idx, W, H, km.colors.length, 1);
      var lrLab = null;
      if (lineCount) lrLab = segment(new Uint8Array(W * H), line, W, H, 1, false).lab;
      var seg = segment(idx, lineCount ? line : null, W, H, minArea, !lineCount, lrLab);
      return finishRegions(seg, W, H, art.width / W, art.height / H, km.colors);
    }
    // 선화만 있는 도안: 선으로 나뉜 칸마다 팔레트 색을 배정
    var zero = new Uint8Array(W * H);
    var seg2 = segment(zero, lineCount ? line : null, W, H, minArea, false);
    var pal = (art.palette && art.palette.length ? art.palette : ['#E9C46A', '#F4A261', '#A8D5BA', '#8AB17D', '#CDB4DB', '#BDE0FE', '#D4A373', '#FAEDCD'])
      .filter(function (c) { return /^#[0-9a-f]{6}/i.test(c); }).slice(0, Math.min(10, pr.K));
    var palRGB = pal.map(parseHex);
    palRGB.unshift(parseHex(PAPER));
    // 인접 칸끼리 다른 색이 되도록 배정
    var lab = seg2.lab, R = seg2.regions.length, nb = [];
    for (var r0 = 0; r0 < R; r0++) nb.push({});
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      p = y * W + x;
      if (x < W - 1 && lab[p + 1] !== lab[p]) { nb[lab[p]][lab[p + 1]] = 1; nb[lab[p + 1]][lab[p]] = 1; }
      if (y < H - 1 && lab[p + W] !== lab[p]) { nb[lab[p]][lab[p + W]] = 1; nb[lab[p + W]][lab[p]] = 1; }
    }
    var rand = rng(seed), biggest = 0;
    for (r0 = 1; r0 < R; r0++) if (seg2.regions[r0].area > seg2.regions[biggest].area) biggest = r0;
    var assign = new Int32Array(R).fill(-1);
    assign[biggest] = 0; // 가장 큰 바탕은 종이색
    var ord = []; for (r0 = 0; r0 < R; r0++) ord.push(r0);
    ord.sort(function (a, b) { return seg2.regions[b].area - seg2.regions[a].area; });
    ord.forEach(function (rg) {
      if (assign[rg] >= 0) return;
      var bad = {};
      Object.keys(nb[rg]).forEach(function (n) { if (assign[n] >= 0) bad[assign[n]] = 1; });
      var opts = [];
      for (var k = 1; k < palRGB.length; k++) if (!bad[k]) opts.push(k);
      if (!opts.length) for (k = 1; k < palRGB.length; k++) opts.push(k);
      assign[rg] = opts[Math.floor(rand() * opts.length)];
    });
    seg2.regions.forEach(function (rg, j) { rg.color = assign[j]; });
    return finishRegions(seg2, W, H, art.width / W, art.height / H, palRGB);
  }

  /* ---------- 내 사진 → 도안(작품) ---------- */
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src;
    });
  }
  function readFile(f) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(f); });
  }
  function photoArtwork(file, opts) {
    opts = opts || {};
    var diff = opts.detailLevel === 'fine' ? 'hard' : opts.detailLevel === 'bold' ? 'easy' : 'medium';
    return readFile(file).then(loadImage).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var s = Math.min(1, 700 / Math.max(w, h));
      var W = Math.round(w * s), H = Math.round(h * s);
      var src = canvasOf(W, H); src.getContext('2d').drawImage(img, 0, 0, W, H);
      var res = fromImage(src, W, H, diff);
      var pen = [], fills = [];
      res.regions.forEach(function (r) {
        fills.push({ type: 'flat', color: res.palette[r.c], opacity: 0.93, stroke: res.palette[r.c], strokeWidth: 1.2, d: r.d, n: r.c, lx: r.lx, ly: r.ly, fs: r.fs });
      });
      // 펜 선은 큰 칸부터 그려지도록
      res.regions.forEach(function (r) {
        pen.push({ type: 'stroke', color: '#3A332E', lineWidth: 1.3, d: r.d });
      });
      var now = new Date();
      var title = '내 사진 · ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일';
      var diffName = diff === 'easy' ? '초급 (편안한 힐링)' : diff === 'hard' ? '고급 (디테일 마스터)' : '중급 (몰입 힐링)';
      return {
        id: 'custom-sketch-' + Date.now(),
        title: title,
        category: 'user',
        categoryName: '내 사진 스케치북',
        difficulty: diff,
        difficultyName: diffName,
        volume: '개인 앨범',
        description: '내 사진이 번호 색칠 도안이 되었어요. 번호에 맞춰 칠하거나 자유롭게 칠해 보세요.',
        durationSeconds: Math.min(70, Math.max(25, Math.round(res.regions.length * 0.18))),
        width: W, height: H,
        palette: res.palette.slice(0, 12),
        numPalette: res.palette,
        numV: VERSION,
        layers: [
          { id: 'photo-pen-sketch', name: '01. 내 사진 윤곽 스케치', style: 'pen', paths: pen },
          { id: 'photo-base-wash', name: '02. 사진 색으로 맑은 수채 채색', style: 'watercolor', paths: fills }
        ],
        isCustom: true,
        sourceImage: src.toDataURL('image/jpeg', 0.8),
        createdAt: now.toLocaleDateString('ko-KR')
      };
    });
  }

  /* ---------- 작품별 번호 데이터 (캐시) ---------- */
  var cache = new Map();
  function getNumberData(art, tt) {
    var key = art.id + '|' + (art.difficulty || '') + '|' + VERSION;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    var p;
    if (art.numV && art.numPalette) {
      var wash = art.layers.find(function (l) { return l.style !== 'pen'; });
      var regs = wash.paths.map(function (q) { return { d: q.d, c: q.n, lx: q.lx, ly: q.ly, fs: q.fs }; });
      p = Promise.resolve({ regions: regs, palette: art.numPalette, ownLines: false });
    } else if (art.isCustom && art.sourceImage) {
      p = loadImage(art.sourceImage).then(function (img) {
        var r = fromImage(img, art.width, art.height, art.difficulty || 'medium');
        r.ownLines = false; return r;
      });
    } else {
      p = new Promise(function (res) {
        setTimeout(function () {
          var r = fromArtwork(art, tt); r.ownLines = true; res(r);
        }, 30);
      });
    }
    return p.then(function (r) {
      r.regions.forEach(function (g) { g.path = new Path2D(g.d); });
      if (cache.size > 12) cache.clear();
      cache.set(key, r);
      return r;
    });
  }

  /* ---------- 번호 색칠 화면 ---------- */
  var CSS = '' +
    '.azn{width:100%;max-width:72rem;padding:0 .5rem;display:flex;flex-direction:column;gap:.6rem;font-family:inherit;color:#292524}' +
    '.azn-bar{display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;padding:0 .25rem}' +
    '.azn-title{font-family:"Cormorant Garamond",serif;font-size:1.25rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}' +
    '.azn-btns{display:flex;gap:.35rem;flex-shrink:0}' +
    '.azn-b{border:1px solid #e7e5e4;background:#fff;border-radius:.6rem;padding:.4rem .65rem;font-size:.75rem;color:#44403c;cursor:pointer;white-space:nowrap}' +
    '.azn-b:disabled{opacity:.35}' +
    '.azn-b.dark{background:#1c1917;color:#fff;border-color:#1c1917;font-weight:600}' +
    '.azn-stage{position:relative;width:100%;border-radius:1rem;border:1px solid rgba(214,211,209,.7);background:#FAF7F2;overflow:hidden;touch-action:none;box-shadow:0 10px 30px -12px rgba(60,40,20,.18)}' +
    '.azn-stage canvas{display:block;width:100%;height:100%}' +
    '.azn-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.85rem;color:#78716c;background:#FAF7F2}' +
    '.azn-toast{position:absolute;left:50%;top:.75rem;transform:translateX(-50%);background:rgba(28,25,23,.86);color:#fff;font-size:.78rem;padding:.4rem .8rem;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .25s}' +
    '.azn-zoom{position:absolute;right:.5rem;bottom:.5rem;display:flex;gap:.3rem}' +
    '.azn-zoom button{width:2.1rem;height:2.1rem;border-radius:999px;border:1px solid #e7e5e4;background:rgba(255,255,255,.92);font-size:1.05rem;color:#44403c;cursor:pointer}' +
    '.azn-info{display:flex;align-items:center;justify-content:space-between;font-size:.75rem;color:#78716c;padding:0 .25rem}' +
    '.azn-prog{flex:1;height:4px;background:#e7e5e4;border-radius:4px;margin:0 .6rem;overflow:hidden}' +
    '.azn-prog i{display:block;height:100%;background:#047857;width:0;transition:width .3s}' +
    '.azn-pal{display:flex;gap:.55rem;overflow-x:auto;padding:.5rem .25rem .7rem;scrollbar-width:none}' +
    '.azn-pal::-webkit-scrollbar{display:none}' +
    '.azn-sw{flex:0 0 auto;width:2.9rem;height:2.9rem;border-radius:999px;border:1.5px solid rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;cursor:pointer;position:relative;transition:transform .15s}' +
    '.azn-sw.on{transform:scale(1.13);box-shadow:0 0 0 3px #fff,0 0 0 5px #1c1917}' +
    '.azn-sw.done{opacity:.45}' +
    '.azn-sw.done:after{content:"✓";position:absolute;right:-3px;top:-3px;width:1.05rem;height:1.05rem;border-radius:999px;background:#047857;color:#fff;font-size:.65rem;display:flex;align-items:center;justify-content:center}' +
    '.azn-done{position:absolute;inset:auto .75rem .75rem .75rem;background:rgba(255,255,255,.95);border:1px solid #e7e5e4;border-radius:1rem;padding:.8rem;display:none;align-items:center;justify-content:space-between;gap:.5rem;box-shadow:0 10px 25px -10px rgba(0,0,0,.25)}' +
    '.azn-done b{font-family:"Cormorant Garamond",serif;font-size:1.15rem;font-weight:600}' +
    '.azn-hint{font-size:.72rem;color:#a8a29e;text-align:center;padding-bottom:.25rem}';

  function injectCSS() {
    if (document.getElementById('azn-css')) return;
    var st = document.createElement('style'); st.id = 'azn-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  function textOn(hexc) { return lum(parseHex(hexc)) > 150 ? '#292524' : '#fff'; }

  function Painter(root, art, env) {
    injectCSS();
    this.art = art; this.env = env; this.root = root;
    this.filled = {}; this.history = []; this.sel = 0;
    this.scale = 1; this.tx = 0; this.ty = 0; this.dead = false;
    this.build();
    var self = this;
    window.AZNum && (window.AZNum._p = this);
    getNumberData(art, env.tt).then(function (data) {
      if (self.dead) return;
      self.data = data;
      self.restore();
      self.loading.style.display = 'none';
      self.renderPalette();
      self.pickFirstOpen();
      self.layout();
    }).catch(function (e) {
      console.error(e);
      self.loading.textContent = '도안을 준비하지 못했어요. 자유 색칠을 이용해 주세요.';
    });
  }
  Painter.prototype.storeKey = function () { return 'atelier_zen_num_' + this.art.id + '_' + (this.art.difficulty || '') + '_v' + VERSION; };
  Painter.prototype.save = function () {
    try { localStorage.setItem(this.storeKey(), JSON.stringify(Object.keys(this.filled))); } catch (e) { }
  };
  Painter.prototype.restore = function () {
    try {
      var v = JSON.parse(localStorage.getItem(this.storeKey()) || '[]');
      var self = this;
      v.forEach(function (i) { if (self.data.regions[i]) self.filled[i] = 1; });
    } catch (e) { }
  };
  Painter.prototype.build = function () {
    var self = this, art = this.art;
    var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    var wrap = el('div', 'azn');
    var bar = el('div', 'azn-bar');
    bar.appendChild(el('div', 'azn-title', art.title));
    var btns = el('div', 'azn-btns');
    this.undoBtn = el('button', 'azn-b', '되돌리기');
    this.undoBtn.onclick = function () { self.undo(); };
    var findBtn = el('button', 'azn-b', '남은 칸 찾기');
    findBtn.onclick = function () { self.findNext(); };
    var saveBtn = el('button', 'azn-b dark', '보관함 저장');
    saveBtn.onclick = function () { self.saveToGallery(); };
    btns.appendChild(this.undoBtn); btns.appendChild(findBtn); btns.appendChild(saveBtn);
    bar.appendChild(btns);
    wrap.appendChild(bar);

    var stage = el('div', 'azn-stage');
    stage.style.aspectRatio = art.width + ' / ' + art.height;
    stage.style.maxHeight = '62vh';
    stage.style.margin = '0 auto';
    this.stage = stage;
    var cv = el('canvas'); this.cv = cv; stage.appendChild(cv);
    this.loading = el('div', 'azn-loading', '번호 도안을 준비하고 있어요…'); stage.appendChild(this.loading);
    this.toastEl = el('div', 'azn-toast'); stage.appendChild(this.toastEl);
    var zoom = el('div', 'azn-zoom');
    var zi = el('button', '', '+'), zo = el('button', '', '−'), zr = el('button', '', '⤢');
    zi.onclick = function () { self.zoomAt(1.5); };
    zo.onclick = function () { self.zoomAt(1 / 1.5); };
    zr.onclick = function () { self.scale = 1; self.tx = 0; self.ty = 0; self.draw(); };
    zoom.appendChild(zo); zoom.appendChild(zi); zoom.appendChild(zr);
    stage.appendChild(zoom);
    this.doneEl = el('div', 'azn-done');
    var dt = el('div'); dt.innerHTML = '<b>완성했어요</b><div style="font-size:.75rem;color:#78716c">마음에 들면 보관함에 간직해 보세요</div>';
    var db = el('div', 'azn-btns');
    var again = el('button', 'azn-b', '다시 칠하기');
    again.onclick = function () {
      if (again.dataset.arm) { delete again.dataset.arm; again.textContent = '다시 칠하기'; self.reset(); return; }
      again.dataset.arm = '1'; again.textContent = '한 번 더 누르면 지워져요';
      setTimeout(function () { delete again.dataset.arm; again.textContent = '다시 칠하기'; }, 2500);
    };
    var keep = el('button', 'azn-b dark', '보관함 저장');
    keep.onclick = function () { self.saveToGallery(); };
    db.appendChild(again); db.appendChild(keep);
    this.doneEl.appendChild(dt); this.doneEl.appendChild(db);
    stage.appendChild(this.doneEl);
    wrap.appendChild(stage);

    var info = el('div', 'azn-info');
    this.countEl = el('span', '', '');
    var prog = el('div', 'azn-prog'); this.progEl = el('i'); prog.appendChild(this.progEl);
    this.pctEl = el('span', '', '0%');
    info.appendChild(this.countEl); info.appendChild(prog); info.appendChild(this.pctEl);
    wrap.appendChild(info);
    this.palEl = el('div', 'azn-pal'); wrap.appendChild(this.palEl);
    wrap.appendChild(el('div', 'azn-hint', '번호를 고르고 같은 번호 칸을 톡 누르세요 · 두 손가락으로 확대'));
    this.root.appendChild(wrap);

    this.bindInput();
    this.onResize = function () { self.layout(); };
    window.addEventListener('resize', this.onResize);
  };
  Painter.prototype.layout = function () {
    var r = this.stage.getBoundingClientRect();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = r.width; this.cssH = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * dpr));
    this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    this.draw();
  };
  Painter.prototype.baseFit = function () {
    return Math.min(this.cssW / this.art.width, this.cssH / this.art.height);
  };
  Painter.prototype.toArt = function (cx, cy) {
    var f = this.baseFit() * this.scale;
    var ox = (this.cssW - this.art.width * this.baseFit()) / 2;
    var oy = (this.cssH - this.art.height * this.baseFit()) / 2;
    // 화면 = ((art*fit + o) - c)*scale + c + t  (c = 중앙)
    var cxm = this.cssW / 2, cym = this.cssH / 2;
    var bx = (cx - this.tx - cxm) / this.scale + cxm;
    var by = (cy - this.ty - cym) / this.scale + cym;
    return { x: (bx - ox) / this.baseFit(), y: (by - oy) / this.baseFit(), f: f };
  };
  Painter.prototype.applyTransform = function (ctx) {
    var fit = this.baseFit();
    var ox = (this.cssW - this.art.width * fit) / 2, oy = (this.cssH - this.art.height * fit) / 2;
    var cxm = this.cssW / 2, cym = this.cssH / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.tx + cxm, this.ty + cym);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-cxm + ox, -cym + oy);
    ctx.scale(fit, fit);
  };
  Painter.prototype.clampPan = function () {
    var maxX = this.cssW * (this.scale - 1) / 2, maxY = this.cssH * (this.scale - 1) / 2;
    this.tx = Math.max(-maxX, Math.min(maxX, this.tx));
    this.ty = Math.max(-maxY, Math.min(maxY, this.ty));
  };
  Painter.prototype.zoomAt = function (k, cx, cy) {
    if (cx === undefined) { cx = this.cssW / 2; cy = this.cssH / 2; }
    var ns = Math.max(1, Math.min(8, this.scale * k));
    var cxm = this.cssW / 2, cym = this.cssH / 2;
    // 손가락 아래 지점 고정
    var bx = (cx - this.tx - cxm) / this.scale, by = (cy - this.ty - cym) / this.scale;
    this.scale = ns;
    this.tx = cx - cxm - bx * ns; this.ty = cy - cym - by * ns;
    this.clampPan(); this.draw();
  };
  Painter.prototype.draw = function () {
    if (!this.data || !this.cssW) return;
    var ctx = this.cv.getContext('2d'), art = this.art, d = this.data, self = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#F3EFE8'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    this.applyTransform(ctx);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, art.width, art.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, art.width, art.height); ctx.clip();
    var f = this.baseFit() * this.scale; // art px → css px
    var lw = 0.9 / f;
    var all = d.regions.length, done = 0;
    var selColor = d.palette[this.sel];
    ctx.lineJoin = 'round';
    for (var i = 0; i < d.regions.length; i++) {
      var r = d.regions[i];
      if (this.filled[i]) {
        done++;
        ctx.fillStyle = d.palette[r.c]; ctx.fill(r.path);
        ctx.strokeStyle = d.palette[r.c]; ctx.lineWidth = 1.2 / f + 0.6; ctx.stroke(r.path);
      } else {
        ctx.fillStyle = r.c === this.sel ? '#EDE6D6' : '#FFFFFF';
        ctx.fill(r.path);
        ctx.strokeStyle = r.c === this.sel ? '#EDE6D6' : '#FFFFFF'; ctx.lineWidth = 1.2 / f + 0.6; ctx.stroke(r.path);
      }
    }
    // 경계선
    ctx.strokeStyle = 'rgba(80,70,60,0.55)'; ctx.lineWidth = lw;
    for (i = 0; i < d.regions.length; i++) {
      if (this.filled[i] && d.ownLines) continue;
      ctx.stroke(d.regions[i].path);
    }
    // 원래 도안의 펜 선
    if (d.ownLines && this.env.tt) {
      var k = 0;
      art.layers.forEach(function (layer) {
        layer.paths.forEach(function (p) {
          k++;
          if (layer.style !== 'pen') return;
          try { self.env.tt(ctx, p, layer.style, k, art.width, art.height); } catch (e) { }
        });
      });
    }
    // 번호
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < d.regions.length; i++) {
      if (this.filled[i]) continue;
      r = d.regions[i];
      var fsPx = r.fs * f;
      if (fsPx < 6.5) {
        if (r.c === this.sel && fsPx * 2 > 1.5) { ctx.fillStyle = 'rgba(4,120,87,0.6)'; ctx.beginPath(); ctx.arc(r.lx, r.ly, Math.max(1.2 / f, r.fs * 0.25), 0, 6.283); ctx.fill(); }
        continue;
      }
      var fs = Math.min(r.fs, 22 / f);
      ctx.font = (r.c === this.sel ? '700 ' : '500 ') + fs + 'px "Plus Jakarta Sans",sans-serif';
      ctx.fillStyle = r.c === this.sel ? '#1c1917' : '#8a8178';
      ctx.fillText(String(r.c + 1), r.lx, r.ly);
    }
    ctx.restore();
    // 진행률
    var pct = all ? Math.round(done / all * 100) : 0;
    this.countEl.textContent = done + ' / ' + all + '칸';
    this.pctEl.textContent = pct + '%';
    this.progEl.style.width = pct + '%';
    this.undoBtn.disabled = !this.history.length;
    this.doneEl.style.display = all && done === all ? 'flex' : 'none';
  };
  Painter.prototype.renderPalette = function () {
    var self = this, d = this.data;
    this.palEl.innerHTML = '';
    this.swatches = d.palette.map(function (c, i) {
      var b = document.createElement('button');
      b.className = 'azn-sw'; b.style.background = c; b.style.color = textOn(c);
      b.textContent = String(i + 1);
      b.onclick = function () { self.select(i); };
      self.palEl.appendChild(b);
      return b;
    });
    this.updatePalette();
  };
  Painter.prototype.remainingOf = function (c) {
    var n = 0, d = this.data;
    for (var i = 0; i < d.regions.length; i++) if (!this.filled[i] && d.regions[i].c === c) n++;
    return n;
  };
  Painter.prototype.updatePalette = function () {
    var self = this;
    if (!this.swatches) return;
    this.swatches.forEach(function (b, i) {
      b.className = 'azn-sw' + (i === self.sel ? ' on' : '') + (self.remainingOf(i) === 0 ? ' done' : '');
    });
  };
  Painter.prototype.select = function (i) {
    this.sel = i; this.updatePalette(); this.draw();
    var b = this.swatches[i];
    if (b && b.scrollIntoView) try { b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { }
  };
  Painter.prototype.pickFirstOpen = function () {
    for (var i = 0; i < this.data.palette.length; i++) if (this.remainingOf(i) > 0) { this.select(i); return; }
    this.select(0);
  };
  Painter.prototype.toast = function (msg) {
    var t = this.toastEl, self = this;
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(this._tt);
    this._tt = setTimeout(function () { t.style.opacity = '0'; }, 1300);
  };
  Painter.prototype.hit = function (x, y) {
    var ctx = this.cv.getContext('2d'), d = this.data;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (var i = d.regions.length - 1; i >= 0; i--) {
      if (ctx.isPointInPath(d.regions[i].path, x, y)) { ctx.restore(); return i; }
    }
    ctx.restore();
    return -1;
  };
  Painter.prototype.tap = function (cx, cy) {
    if (!this.data) return;
    var p = this.toArt(cx, cy);
    var i = this.hit(p.x, p.y);
    if (i < 0) return;
    if (this.filled[i]) return;
    var r = this.data.regions[i];
    if (r.c !== this.sel) { this.toast('이 칸은 ' + (r.c + 1) + '번 색이에요'); return; }
    this.filled[i] = 1; this.history.push(i);
    try { this.env.qe && this.env.qe.playWaterBrush(0.06); } catch (e) { }
    this.save();
    if (this.remainingOf(this.sel) === 0) {
      this.updatePalette();
      for (var k = 1; k <= this.data.palette.length; k++) {
        var c = (this.sel + k) % this.data.palette.length;
        if (this.remainingOf(c) > 0) { this.select(c); break; }
      }
    }
    this.updatePalette();
    this.draw();
  };
  Painter.prototype.undo = function () {
    var i = this.history.pop();
    if (i === undefined) return;
    delete this.filled[i]; this.save();
    this.sel = this.data.regions[i].c;
    this.updatePalette(); this.draw();
  };
  Painter.prototype.reset = function () {
    this.filled = {}; this.history = []; this.save(); this.pickFirstOpen(); this.draw();
  };
  Painter.prototype.findNext = function () {
    var d = this.data, best = -1;
    for (var i = d.regions.length - 1; i >= 0; i--) if (!this.filled[i] && d.regions[i].c === this.sel) { best = i; break; }
    if (best < 0) { this.toast('이 색은 다 칠했어요'); return; }
    var r = d.regions[best];
    // 작은 칸이 보이도록 확대 후 가운데로
    var need = Math.min(8, Math.max(1, 16 / (r.fs * this.baseFit())));
    this.scale = Math.max(this.scale, need);
    var fit = this.baseFit();
    var ox = (this.cssW - this.art.width * fit) / 2, oy = (this.cssH - this.art.height * fit) / 2;
    var bx = r.lx * fit + ox - this.cssW / 2, by = r.ly * fit + oy - this.cssH / 2;
    this.tx = -bx * this.scale; this.ty = -by * this.scale;
    this.clampPan(); this.draw();
    var self = this, n = 0;
    clearInterval(this._blink);
    this._blink = setInterval(function () {
      if (self.dead) return clearInterval(self._blink);
      var ctx = self.cv.getContext('2d');
      self.draw();
      if (n % 2 === 0) {
        self.applyTransform(ctx);
        ctx.fillStyle = 'rgba(4,120,87,0.35)'; ctx.fill(r.path);
      }
      if (++n > 5) { clearInterval(self._blink); self.draw(); }
    }, 220);
  };
  Painter.prototype.renderImage = function (maxSide) {
    var art = this.art, d = this.data;
    var s = Math.min(1, maxSide / Math.max(art.width, art.height));
    var c = canvasOf(Math.round(art.width * s), Math.round(art.height * s)), ctx = c.getContext('2d');
    ctx.scale(s, s);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, art.width, art.height);
    ctx.lineJoin = 'round';
    for (var i = 0; i < d.regions.length; i++) {
      var r = d.regions[i], col = this.filled[i] ? d.palette[r.c] : '#FFFFFF';
      ctx.fillStyle = col; ctx.fill(r.path); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke(r.path);
    }
    ctx.strokeStyle = 'rgba(80,70,60,0.35)'; ctx.lineWidth = 0.7;
    if (!d.ownLines) for (i = 0; i < d.regions.length; i++) if (!this.filled[i]) ctx.stroke(d.regions[i].path);
    if (d.ownLines && this.env.tt) {
      var k = 0, self = this;
      art.layers.forEach(function (layer) {
        layer.paths.forEach(function (p) {
          k++; if (layer.style !== 'pen') return;
          try { self.env.tt(ctx, p, layer.style, k, art.width, art.height); } catch (e) { }
        });
      });
    }
    return c;
  };
  Painter.prototype.saveToGallery = function () {
    if (!this.data || !this.env.onSave) return;
    var c = this.renderImage(600);
    var ok = this.env.onSave({
      id: 'saved-' + Date.now(),
      artworkId: this.art.id,
      title: this.art.title,
      category: this.art.category,
      thumbnail: c.toDataURL('image/jpeg', 0.82),
      completedAt: new Date().toLocaleDateString('ko-KR')
    });
    this.toast(ok === false ? '저장 공간이 가득 찼어요. 스케치북을 정리해 주세요.' : '보관함에 저장했어요');
  };
  Painter.prototype.bindInput = function () {
    var self = this, cv = this.cv, pts = new Map(), start = null, pinch = null, moved = false;
    function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      var p = local(e); pts.set(e.pointerId, p);
      if (pts.size === 1) { start = { x: p.x, y: p.y, tx: self.tx, ty: self.ty, t: Date.now() }; moved = false; }
      if (pts.size === 2) {
        var a = Array.from(pts.values());
        pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: self.scale, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, tx: self.tx, ty: self.ty };
        moved = true;
      }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      var p = local(e); pts.set(e.pointerId, p);
      if (pts.size >= 2 && pinch) {
        var a = Array.from(pts.values());
        var dd = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        var mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
        var ns = Math.max(1, Math.min(8, pinch.s * dd / (pinch.d || 1)));
        var cxm = self.cssW / 2, cym = self.cssH / 2;
        var bx = (pinch.mx - pinch.tx - cxm) / pinch.s, by = (pinch.my - pinch.ty - cym) / pinch.s;
        self.scale = ns;
        self.tx = mx - cxm - bx * ns; self.ty = my - cym - by * ns;
        self.clampPan(); self.draw();
      } else if (start) {
        var dx = p.x - start.x, dy = p.y - start.y;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (moved && self.scale > 1) { self.tx = start.tx + dx; self.ty = start.ty + dy; self.clampPan(); self.draw(); }
      }
    });
    function end(e) {
      if (!pts.has(e.pointerId)) return;
      var p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (start && !moved && Date.now() - start.t < 600) self.tap(p.x, p.y);
        start = null;
      } else if (pts.size === 1) {
        var q = Array.from(pts.values())[0];
        start = { x: q.x, y: q.y, tx: self.tx, ty: self.ty, t: 0 };
      }
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = local(e); self.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });
  };
  Painter.prototype.destroy = function () {
    this.dead = true;
    clearInterval(this._blink);
    window.removeEventListener('resize', this.onResize);
    this.root.innerHTML = '';
  };

  /* ---------- React 연결: 번호 색칠 / 자유 색칠 전환 ---------- */
  var NumberView = null;
  function makeNumberView(React, J) {
    return function AZNumberView(props) {
      var ref = React.useRef(null);
      React.useEffect(function () {
        var p = new Painter(ref.current, props.artwork, { tt: props.tt, qe: props.qe, onSave: props.onSaveToGallery });
        return function () { p.destroy(); };
      }, [props.artwork]);
      return J.jsx('div', { ref: ref, className: 'w-full flex justify-center' });
    };
  }
  window.__AZWrap = function (props, Free, React, J, tt, qe) {
    var st = React.useState(function () {
      try { return localStorage.getItem('atelier_zen_paint_mode') || 'number'; } catch (e) { return 'number'; }
    });
    var mode = st[0], setMode = st[1];
    if (!NumberView) NumberView = makeNumberView(React, J);
    function choose(m) { setMode(m); try { localStorage.setItem('atelier_zen_paint_mode', m); } catch (e) { } }
    function tab(m, label) {
      var on = mode === m;
      return J.jsx('button', {
        onClick: function () { choose(m); },
        style: {
          padding: '.5rem 1.1rem', borderRadius: '.65rem', fontSize: '.8rem', fontWeight: on ? 700 : 500,
          background: on ? '#fff' : 'transparent', color: on ? '#1c1917' : '#78716c',
          boxShadow: on ? '0 1px 3px rgba(0,0,0,.12)' : 'none', border: 0, cursor: 'pointer'
        },
        children: label
      }, m);
    }
    var toggle = J.jsx('div', {
      style: { width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '.75rem' },
      children: J.jsxs('div', {
        style: { display: 'inline-flex', padding: '.25rem', background: '#f0ede8', borderRadius: '.85rem', border: '1px solid #e7e5e4' },
        children: [tab('number', '번호 색칠'), tab('free', '자유 색칠')]
      })
    });
    var body = mode === 'free'
      ? J.jsx(Free, props, 'free')
      : J.jsx(NumberView, { artwork: props.artwork, onSaveToGallery: props.onSaveToGallery, tt: tt, qe: qe }, 'num-' + props.artwork.id);
    return J.jsxs('div', { className: 'w-full flex flex-col items-center', children: [toggle, body] });
  };

  window.AZNum = { photoArtwork: photoArtwork, fromArtwork: fromArtwork, fromImage: fromImage, getNumberData: getNumberData, Painter: Painter };
})();
