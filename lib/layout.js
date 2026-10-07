"use strict";
// Scaffold plan for the 3D view: the house (wall and roof polygons) and where each scaffold side of the quote stands,
// in metres around the house centre (x east, y north, z up). Built from the same estimate as the price, so the
// drawing always shows the bays, levels and decks that were priced.
//   - Houses measured in the 3D building model (house.walls + house.shape) are drawn from their real polygons,
//     and each side sits on its own outline edge.
//   - Other houses are drawn as a box with a gable, hip or flat roof from length, width, eave and pitch.
const E = require("./engine");

const r2 = (x) => Math.round(x * 100) / 100;
const pt = (p) => p.map(r2);

function boxHouse(h) {
  const L = h.length, W = h.width, e = h.eave;
  const rise = h.roofType === "flat" ? 0 : (W / 2) * Math.tan(((h.pitch || 0) * Math.PI) / 180);
  const ridge = e + rise;
  const A = [-L / 2, -W / 2], B = [L / 2, -W / 2], C = [L / 2, W / 2], D = [-L / 2, W / 2];
  const rect = (p, q, z) => [[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], z], [p[0], p[1], z]];
  const walls = [rect(A, B, e), rect(C, D, e)];
  const roofs = [];
  if (h.roofType === "gable") {
    walls.push([[D[0], D[1], 0], [A[0], A[1], 0], [A[0], A[1], e], [-L / 2, 0, ridge], [D[0], D[1], e]]);
    walls.push([[B[0], B[1], 0], [C[0], C[1], 0], [C[0], C[1], e], [L / 2, 0, ridge], [B[0], B[1], e]]);
    roofs.push([[A[0], A[1], e], [B[0], B[1], e], [L / 2, 0, ridge], [-L / 2, 0, ridge]]);
    roofs.push([[C[0], C[1], e], [D[0], D[1], e], [-L / 2, 0, ridge], [L / 2, 0, ridge]]);
  } else {
    walls.push(rect(D, A, e), rect(B, C, e));
    if (h.roofType === "hip") {
      const k = Math.max(0, L / 2 - W / 2);
      roofs.push([[A[0], A[1], e], [B[0], B[1], e], [k, 0, ridge], [-k, 0, ridge]]);
      roofs.push([[C[0], C[1], e], [D[0], D[1], e], [-k, 0, ridge], [k, 0, ridge]]);
      roofs.push([[D[0], D[1], e], [A[0], A[1], e], [-k, 0, ridge]]);
      roofs.push([[B[0], B[1], e], [C[0], C[1], e], [k, 0, ridge]]);
    } else {
      roofs.push([[A[0], A[1], e], [B[0], B[1], e], [C[0], C[1], e], [D[0], D[1], e]]);
    }
  }
  // Wall lines the sides stand on, counter-clockwise (outside is to the right of the direction of travel).
  const line = { front: [A, B], right: [B, C], back: [C, D], left: [D, A] };
  const where = (name) => /Long side A/.test(name) ? line.front : /Long side B/.test(name) ? line.back : / A$/.test(name) ? line.left : line.right;
  return { walls, roofs, ridge, where };
}

function modelHouse(h) {
  const o = h.shape.outline;
  const cx = o.reduce((a, p) => a + p[0], 0) / o.length, cy = o.reduce((a, p) => a + p[1], 0) / o.length;
  const poly = (flat) => { const out = []; for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i] / 100 - cx, flat[i + 1] / 100 - cy, flat[i + 2] / 100]); return out; };
  const outline = o.map((p) => [p[0] - cx, p[1] - cy]);
  const ccw = outline.reduce((a, p, i) => { const q = outline[(i + 1) % outline.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) > 0;
  const walls = (h.shape.w || []).map(poly), roofs = (h.shape.r || []).map(poly);
  const ridge = Math.max(0, ...roofs.flat().map((p) => p[2]));
  return { walls, roofs, ridge, outline, ccw };
}

/** The plan for a house (as stored on quotes and orders) and its full estimate (E.estimate). */
function planFor(h, est) {
  const sys = E.SYSTEMS[est.system] || E.SYSTEMS.layher;
  const model = Array.isArray(h.walls) && h.walls.length && h.shape && Array.isArray(h.shape.outline) && h.shape.outline.length > 2;
  const house = model ? modelHouse(h) : boxHouse(h);
  const sides = est.sides.map((s, i) => {
    let a, b, sign = 1;
    if (model && s.edge != null) {
      const o = house.outline;
      a = o[s.edge]; b = o[(s.edge + 1) % o.length];
      sign = house.ccw ? 1 : -1;
    } else {
      [a, b] = house.where(s.name);
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const out = [dir[1] * sign, -dir[0] * sign];
    const start = (model ? s.t0 || 0 : 0) - (model ? (s.e0 ? E.SYS.extend : 0) : E.SYS.extend);
    return {
      i: i + 1, name: s.name, kind: s.kind,
      at: pt([a[0] + dir[0] * start, a[1] + dir[1] * start]), dir: dir.map((x) => Math.round(x * 1e4) / 1e4), out: out.map((x) => Math.round(x * 1e4) / 1e4),
      bays: s.bays, lifts: s.lifts,
      decks: s.deckAll ? Array.from({ length: s.lifts }, (_, k) => k + 1) : [s.lifts],
      catchOn: Boolean(s.catchOn), area: Math.round(s.area)
    };
  });
  return {
    v: 1, system: sys.key, systemName: sys.name, bay: sys.bay, width: sys.width, gap: 0.3, lift: E.SYS.lift, jack: E.SYS.jack,
    house: { walls: house.walls.map((w) => w.map(pt)), roofs: house.roofs.map((r) => r.map(pt)), ridge: r2(house.ridge), measured: Boolean(model) },
    sides,
    area: est.totals.area, weightKg: est.totals.weightKg
  };
}

module.exports = { planFor };
