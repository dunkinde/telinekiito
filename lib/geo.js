"use strict";
// Small geometry helpers for building outlines (lat/lon -> local metres).
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

function project(points, lat0, lon0) {
  const k = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LON_EQ;
  return points.map((p) => ({ x: (p.lon - lon0) * k, y: (p.lat - lat0) * M_PER_DEG_LAT }));
}

// Drop the repeated closing vertex of a closed OSM way.
function openRing(points) {
  if (points.length > 1) {
    const a = points[0], b = points[points.length - 1];
    if (a.lat === b.lat && a.lon === b.lon) return points.slice(0, -1);
  }
  return points;
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Minimum-area bounding rectangle (rotating the hull edges).
function minRect(pts) {
  const hull = convexHull(pts);
  if (hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of hull) {
      const x = p.x * c - p.y * s, y = p.x * s + p.y * c;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const w = maxX - minX, h = maxY - minY, area = w * h;
    if (!best || area < best.area) best = { area, w, h, ang };
  }
  const length = Math.max(best.w, best.h), width = Math.min(best.w, best.h);
  let bearing = ((best.w >= best.h ? best.ang : best.ang + Math.PI / 2) * 180) / Math.PI;
  bearing = ((bearing % 180) + 180) % 180;
  return { length, width, area: best.area, angleDeg: bearing };
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx, y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

function distToPolygon(pt, poly) {
  if (pointInPolygon(pt, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(pt, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

module.exports = { project, openRing, polygonArea, convexHull, minRect, pointInPolygon, distToPolygon, centroid };
