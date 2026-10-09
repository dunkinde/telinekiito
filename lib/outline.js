"use strict";
// A house from its outline alone (the city's or the map's, when no 3D model fits it): the walls stand on the outline
// and the roof is its straight skeleton, every roof face rising from its wall at the roof pitch (a hip roof). On a
// gable roof the end walls across the house rise to the ridge instead. The engine then prices it wall by wall like a
// measured house, and the 3D view draws it. The outline is in metres with the house's long side along x, as the
// address lookup gives it (details.outline).
const geo = require("./geo");

const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

/**
 * Straight skeleton of a simple counter-clockwise polygon ([x, y] corners): its nodes ({ x, y, t }, t = how far the
 * walls have moved in when the node forms) and, for each edge, its roof face as node indexes (the edge's own two
 * corners first). Null when it can't be worked out.
 */
function skeleton(P) {
  const n = P.length, D = [], N = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    D.push([(b[0] - a[0]) / L, (b[1] - a[1]) / L]);
    N.push([-(b[1] - a[1]) / L, (b[0] - a[0]) / L]); // inward
  }
  const nodes = P.map((p) => ({ x: p[0], y: p[1], t: 0 }));
  const arcs = [];
  // A wavefront corner between edges l (before it) and r (after it), at (x, y) at time t; v = its speed.
  const speed = (l, r) => { const k = 1 + dot(N[l], N[r]); return k < 1e-6 ? null : [(N[l][0] + N[r][0]) / k, (N[l][1] + N[r][1]) / k]; };
  const corner = (node, x, y, t, l, r) => ({ node, x, y, t, l, r, v: speed(l, r), prev: null, next: null, alive: true });
  const at = (w, t) => (w.v ? [w.x + w.v[0] * (t - w.t), w.y + w.v[1] * (t - w.t)] : [w.x, w.y]);
  const link = (a, b) => { a.next = b; b.prev = a; };
  const arc = (w, node) => { if (w.node !== node) arcs.push({ a: w.node, b: node, l: w.l, r: w.r }); };
  const nodeAt = (p, t, ws) => {
    for (const w of ws) { const q = nodes[w.node]; if (Math.hypot(q.x - p[0], q.y - p[1]) < 1e-6) return w.node; }
    nodes.push({ x: p[0], y: p[1], t });
    return nodes.length - 1;
  };
  const verts = P.map((p, i) => corner(i, p[0], p[1], 0, (i - 1 + n) % n, i));
  verts.forEach((w, i) => link(w, verts[(i + 1) % n]));
  let T = 0;

  // Two edges meeting head on (a wing has closed; nearly parallel walls a few cm apart close at once too, turned the
  // wrong way): the corner runs along them to the nearer neighbour at once.
  const sliver = (w) => !w.v || (1 + dot(N[w.l], N[w.r]) < 0.02 && D[w.l][0] * D[w.r][1] - D[w.l][1] * D[w.r][0] < 0);
  function settle(w) {
    while (w && w.alive && sliver(w) && w.next !== w.prev) {
      const A = at(w.prev, T), B = at(w.next, T);
      const near = Math.hypot(A[0] - w.x, A[1] - w.y) <= Math.hypot(B[0] - w.x, B[1] - w.y);
      const o = near ? w.prev : w.next, q = near ? A : B;
      const node = nodeAt(q, T, [o]);
      arc(w, node); arc(o, node);
      w.alive = o.alive = false;
      const [a, b] = near ? [o, w] : [w, o];
      const u = corner(node, q[0], q[1], T, a.l, b.r);
      link(a.prev, u); link(u, b.next);
      verts.push(u);
      w = u;
    }
    close(w);
  }
  // A wavefront of two corners is a last ridge between them.
  function close(w) {
    if (!w || !w.alive || w.next !== w.prev) return;
    if (w.next !== w) arcs.push({ a: w.node, b: w.next.node, l: w.l, r: w.r });
    w.alive = w.next.alive = false;
  }

  for (let guard = 0; guard < 40 * n; guard++) {
    const live = verts.filter((w) => w.alive);
    if (!live.length) break;
    // Which wavefront each corner is on (a split leaves two).
    const ring = new Map();
    for (const w of live) if (!ring.has(w)) { let k = w, g = 0; do { ring.set(k, w); k = k.next; } while (k !== w && ++g <= live.length); }
    let best = null;
    const consider = (e) => { if (!best || e.t < best.t - 1e-9 || (e.t <= best.t + 1e-9 && e.kind === "edge" && best.kind === "split")) best = e; };
    for (const a of live) {
      const b = a.next, d = D[a.r], va = a.v || [0, 0], vb = b.v || [0, 0];
      // Edge event: the two corners of an edge meet (both stay on the edge's line, so compare along it).
      const den = dot(va, d) - dot(vb, d);
      const gap = dot([b.x, b.y], d) - dot([a.x, a.y], d) + dot(va, d) * a.t - dot(vb, d) * b.t;
      if (Math.abs(den) > 1e-12) {
        const t = gap / den;
        if (t >= T - 1e-7 && (den > 0 || t <= T + 1e-7)) consider({ kind: "edge", t: Math.max(t, T), a, b });
      } else if (Math.abs(gap) < 1e-7) consider({ kind: "edge", t: T, a, b });
      // Split event: a reflex corner runs into another edge of its wavefront.
      if (!a.v || D[a.l][0] * D[a.r][1] - D[a.l][1] * D[a.r][0] > -1e-9) continue;
      for (const x of live) {
        if (ring.get(x) !== ring.get(a)) continue;
        const y = x.next, e = x.r;
        if (x === a || y === a || e === a.l || e === a.r) continue;
        const k = dot(a.v, N[e]) - 1;
        if (k > -1e-9) continue;
        const t = (dot(a.v, N[e]) * a.t - ((a.x - P[e][0]) * N[e][0] + (a.y - P[e][1]) * N[e][1])) / k;
        if (t < T - 1e-9) continue;
        const q = at(a, t), px = at(x, t), py = at(y, t);
        if ((q[0] - px[0]) * D[e][0] + (q[1] - px[1]) * D[e][1] < 1e-7) continue;
        if ((q[0] - py[0]) * D[e][0] + (q[1] - py[1]) * D[e][1] > -1e-7) continue;
        consider({ kind: "split", t, a, x, y, q });
      }
    }
    if (!best) break;
    T = best.t;
    if (best.kind === "edge") {
      const { a, b } = best, A = at(a, T), B = at(b, T);
      const p = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], node = nodeAt(p, T, [a, b]);
      arc(a, node); arc(b, node);
      a.alive = b.alive = false;
      if (a.prev === b) continue;
      if (a.prev === b.next) { arc(a.prev, node); a.prev.alive = false; continue; }
      const u = corner(node, p[0], p[1], T, a.l, b.r);
      link(a.prev, u); link(u, b.next);
      verts.push(u);
      settle(u);
    } else {
      const { a: v, x, y, q } = best, e = x.r, node = nodeAt(q, T, [v]);
      arc(v, node);
      v.alive = false;
      const v1 = corner(node, q[0], q[1], T, e, v.r), v2 = corner(node, q[0], q[1], T, v.l, e);
      const after = v.next, before = v.prev;
      link(x, v1); link(v1, after); link(before, v2); link(v2, y);
      verts.push(v1, v2);
      settle(v1); settle(v2);
    }
  }
  if (verts.some((w) => w.alive)) return null;

  // Each edge's face: from its end corner back to its start along the skeleton arcs between it and its neighbours.
  const faces = [];
  for (let i = 0; i < n; i++) {
    const adj = new Map();
    const add = (p, q) => { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(q); };
    for (const c of arcs) if (c.l === i || c.r === i) { add(c.a, c.b); add(c.b, c.a); }
    const start = i, end = (i + 1) % n, from = new Map([[end, -1]]), queue = [end];
    while (queue.length && !from.has(start)) {
      const p = queue.shift();
      for (const q of adj.get(p) || []) if (!from.has(q) && !(p === end && q === start)) { from.set(q, p); queue.push(q); }
    }
    if (!from.has(start)) return null;
    const back = [];
    for (let p = from.get(start); p !== end; p = from.get(p)) back.push(p);
    faces.push([start, end, ...back.reverse()]);
  }
  // The faces must tile the outline.
  const area = (ids) => ids.reduce((s, id, k) => { const p = nodes[id], q = nodes[ids[(k + 1) % ids.length]]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
  const total = area(P.map((_, i) => i));
  let sum = 0;
  for (const f of faces) { const s = area(f); if (s < -0.01) return null; sum += s; }
  if (Math.abs(sum - total) > 0.01 * total + 0.05) return null;
  if (nodes.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.t))) return null;
  return { nodes, faces, D, N };
}

/** Corners closer than 5 cm, and corners on a straight wall, are dropped. */
function clean(pts) {
  let out = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) >= 0.05; });
  for (let again = true; again && out.length > 3; ) {
    again = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const u = [p[0] - a[0], p[1] - a[1]], w = [b[0] - p[0], b[1] - p[1]];
      if (Math.abs(u[0] * w[1] - u[1] * w[0]) < 0.02 * Math.hypot(...u) * Math.hypot(...w) && dot(u, w) > 0) { out.splice(i, 1); again = true; break; }
    }
  }
  return out;
}

function crosses(pts) {
  const n = pts.length, side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n];
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
  }
  return false;
}

/**
 * The house of an outline sent back by the page: { walls, shape } in the 3D model's format (walls for the engine,
 * shape.w / shape.r wall and roof polygons in cm for the 3D view), or null when the outline doesn't fit the size
 * entered (it was changed by hand) or is a plain rectangle (the box is the same house).
 */
function outlineHouse(outline, h) {
  if (!Array.isArray(outline) || outline.length < 4 || outline.length > 60) return null;
  let pts = outline.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]));
  if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100)) return null;
  pts = clean(pts);
  if (pts.length < 5 || crosses(pts)) return null;
  const signed = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  if (signed < 0) pts.reverse();
  const rect = geo.minRect(pts.map(([x, y]) => ({ x, y })));
  if (!rect || Math.abs(signed) < 15 || Math.abs(rect.length - h.length) > 0.35 || Math.abs(rect.width - h.width) > 0.35) return null;
  if (Math.abs(signed) / rect.area > 0.95) return null;

  const n = pts.length, E = h.eave, flat = h.roofType === "flat" || !(h.pitch > 1);
  const tan = flat ? 0 : Math.tan((Math.min(60, h.pitch) * Math.PI) / 180);
  const sk = flat ? null : skeleton(pts);
  if (!flat && !sk) return null;
  const z = (p) => E + tan * p.t;
  const turn = (i) => { const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) > 0; };
  // Gable roof: the end wall of each wing (a triangular face between two outer corners, its top on one ridge) rises
  // to the ridge instead.
  const apex = new Array(n).fill(null);
  if (sk && h.roofType === "gable") {
    const moved = new Set(), uses = new Map();
    for (const f of sk.faces) for (const id of f) uses.set(id, (uses.get(id) || 0) + 1);
    sk.faces.forEach((f, i) => {
      const d = sk.D[i], len = Math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]);
      if (f.length !== 3 || !turn(i) || !turn((i + 1) % n) || len < 1.5 || uses.get(f[2]) !== 3 || moved.has(f[2])) return;
      const p = sk.nodes[f[2]], s = (p.x - pts[i][0]) * d[0] + (p.y - pts[i][1]) * d[1];
      if (s < 0 || s > len) return;
      p.x -= sk.N[i][0] * p.t;
      p.y -= sk.N[i][1] * p.t;
      moved.add(f[2]);
      apex[i] = f[2];
    });
  }
  const cm = (ps) => ps.flatMap(([x, y, zz]) => [Math.round(x * 100), Math.round(y * 100), Math.round(zz * 100)]);
  const w = [], r = [], walls = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], top = apex[i] != null ? z(sk.nodes[apex[i]]) : E;
    const ring = [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], E]];
    if (apex[i] != null) { const p = sk.nodes[apex[i]]; ring.push([p.x, p.y, top]); }
    ring.push([a[0], a[1], E]);
    w.push(cm(ring));
    const e0 = turn(i) ? 1 : 0, e1 = turn((i + 1) % n) ? 1 : 0;
    walls.push({ edge: i, len: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100) / 100, eave: E, top: Math.round(top * 100) / 100, gable: apex[i] != null, e0, e1, ext: e0 + e1 });
  }
  if (sk) sk.faces.forEach((f, i) => { if (apex[i] == null) r.push(cm(f.map((id) => { const p = sk.nodes[id]; return [p.x, p.y, z(p)]; }))); });
  else r.push(cm(pts.map(([x, y]) => [x, y, E])));
  const ridge = sk ? Math.max(E, ...sk.nodes.map(z)) : E;
  return { walls, shape: { src: "outline", outline: pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), w, r, ridge: Math.round(ridge * 100) / 100 } };
}

module.exports = { outlineHouse, skeleton };
