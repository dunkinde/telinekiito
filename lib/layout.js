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
  return { walls, roofs, ridge, outline, ccw, shift: [cx, cy] };
}

/** The smallest rectangle around a polygon: centre, direction of its long side, length and width. */
function minRect(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const x = p[0] * c + p[1] * s, y = -p[0] * s + p[1] * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const area = (x1 - x0) * (y1 - y0);
    if (!best || area < best.area) best = { area, ang, c, s, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }
  const long = best.w >= best.h, ang = long ? best.ang : best.ang + Math.PI / 2;
  return { cx: best.x * best.c - best.y * best.s, cy: best.x * best.s + best.y * best.c, dir: [Math.cos(ang), Math.sin(ang)] };
}

/** The plan for a house (as stored on quotes and orders) and its full estimate (E.estimate). */
function planFor(h, est) {
  const sys = E.SYSTEMS[est.system] || E.SYSTEMS.layher;
  const model = Array.isArray(h.walls) && h.walls.length && h.shape && Array.isArray(h.shape.outline) && h.shape.outline.length > 2;
  const house = model ? modelHouse(h) : boxHouse(h);
  // Measured house with a temporary roof: rectangular scaffold round the whole house, placed on its smallest
  // surrounding rectangle (the box sides turned and moved onto it).
  const frame = model ? minRect(house.outline) : { cx: 0, cy: 0, dir: [1, 0] };
  // The same when the engine fell back to a rectangle (a round building: every wall piece is under 0.5 m).
  const box = model && (est.aroundHouse || est.sides.some((s) => s.edge == null && !s.geom)) ? boxHouse(h) : null;
  const place = (p) => [frame.cx + p[0] * frame.dir[0] - p[1] * frame.dir[1], frame.cy + p[0] * frame.dir[1] + p[1] * frame.dir[0]];
  const sides = est.sides.map((s, i) => {
    let a, b, sign = 1;
    if (s.geom && model) {
      // Roof support scaffold: placed by the engine in outline coordinates (shifted to the house centre here).
      const g = s.geom, len = s.run;
      const st = -(s.ext0 || 0); // trimmed where it met a wall scaffold
      a = [g.at[0] - house.shift[0] + g.dir[0] * st, g.at[1] - house.shift[1] + g.dir[1] * st];
      b = [a[0] + g.dir[0] * len, a[1] + g.dir[1] * len];
      return {
        i: i + 1, name: s.name, kind: s.kind, at: pt(a), dir: g.dir.map((x) => Math.round(x * 1e4) / 1e4), out: g.out.map((x) => Math.round(x * 1e4) / 1e4),
        bays: s.bays, run: r2(s.run), lifts: s.lifts, decks: s.deckLevels, catchOn: false, gap: s.gap, half: s.half, inner: s.inner, innerRail: s.innerRail, access: s.accessN, halfDeck: s.halfDeck, catchConsole: s.catchConsole, catchLevel: s.catchLevel, area: Math.round(s.area)
      };
    } else if (box) {
      [a, b] = box.where(s.name).map(place);
    } else if (model && s.edge != null) {
      const o = house.outline;
      a = o[s.edge]; b = o[(s.edge + 1) % o.length];
      sign = house.ccw ? 1 : -1;
    } else {
      [a, b] = house.where(s.name);
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const out = [dir[1] * sign, -dir[0] * sign];
    const start = (model && !box ? s.t0 || 0 : 0) - (s.ext0 != null ? s.ext0 : E.SYS.extend);
    return {
      i: i + 1, name: s.name, kind: s.kind,
      at: pt([a[0] + dir[0] * start, a[1] + dir[1] * start]), dir: dir.map((x) => Math.round(x * 1e4) / 1e4), out: out.map((x) => Math.round(x * 1e4) / 1e4),
      bays: s.bays, run: r2(s.run), lifts: s.lifts,
      decks: s.deckLevels,
      catchOn: Boolean(s.catchOn), gap: s.gap, half: s.half, inner: s.inner, innerRail: s.innerRail, access: s.accessN, halfDeck: s.halfDeck, catchConsole: s.catchConsole, catchLevel: s.catchLevel, area: Math.round(s.area)
    };
  });
  return {
    v: 1, system: sys.key, systemName: sys.name, bay: sys.bay, width: sys.width, gap: 0.3, lift: E.SYS.lift, jack: E.SYS.jack, half: E.SYS.half,
    house: { walls: house.walls.map((w) => w.map(pt)), roofs: house.roofs.map((r) => r.map(pt)), ridge: r2(house.ridge), measured: Boolean(model) },
    sides,
    sheeting: Boolean(est.sheeting),
    roof: est.roof ? roofPlan(est.roof, frame) : null,
    area: est.totals.area, weightKg: est.totals.weightKg
  };
}

/** The temporary roof over the house: centre, ridge direction, span, length, pitch and the level it rests on. */
function roofPlan(r, frame) {
  return { at: pt([frame.cx, frame.cy]), dir: frame.dir.map((x) => Math.round(x * 1e4) / 1e4), span: r.span, length: r.length, pitch: r.pitch, support: r.support, sections: r.sections };
}

module.exports = { planFor };
