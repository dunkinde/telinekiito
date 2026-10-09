"use strict";
// National Land Survey of Finland 3D buildings (LoD2, made from laser scanning): the real outline of a house and
// the height of each wall, so scaffolding is priced wall by wall instead of from a rectangle.
//
// The data comes per 1:10 000 map sheet (6 × 6 km) from the NLS file service (OGC API Processes) as zipped
// CityGML. Each sheet is downloaded once, reduced to a small index of buildings and cached in <dir>/<sheet>.json;
// sheets without 3D data are remembered too and checked again after 30 days. Needs NLS_API_KEY (free).
// Licence CC BY 4.0: "Contains data from the National Land Survey of Finland, 3D buildings, <date>".
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { Readable } = require("node:stream");

const BASE = "https://avoin-paikkatieto.maanmittauslaitos.fi/tiedostopalvelu/ogcproc/v1";
const PROCESS = "3d-rakennukset_karttalehti";
const RECHECK_NONE_MS = 30 * 24 * 3600e3;
// Index format: v2 adds each building's wall and roof polygons (for the 3D view) and the corner flags e0/e1.
const INDEX_VERSION = 2;

/* ---------- Coordinates: WGS84 -> ETRS-TM35FIN, and the 1:10 000 map sheet ---------- */
function tm35(lat, lon) {
  const a = 6378137.0, f = 1 / 298.257222101, k0 = 0.9996, lon0 = (27 * Math.PI) / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2), T = Math.tan(la) ** 2, C = ep2 * Math.cos(la) ** 2, A = Math.cos(la) * (lo - lon0);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * la - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * la)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * la) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * la));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const Nn = k0 * (M + N * Math.tan(la) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { E, N: Nn };
}

/**
 * TM35 map sheet of a point at 1:10 000, e.g. "L4133D". 1:200 000 sheets are 192 × 96 km (rows K…X from N 6 570 000,
 * columns from E 500 000 = 5); each level halves into quadrants 1 SW, 2 NW, 3 SE, 4 NE down to 1:25 000 (24 × 12 km),
 * which splits into eight 6 × 6 km sheets lettered column by column from the south-west: A B / C D / E F / G H.
 */
function sheetFor(E, N) {
  const rows = "KLMNPQRSTUVWX";
  const ri = Math.floor((N - 6570000) / 96000), col = 5 + Math.floor((E - 500000) / 192000);
  if (ri < 0 || ri >= rows.length || col < 2 || col > 6) return null;
  let e0 = 500000 + (col - 5) * 192000, n0 = 6570000 + ri * 96000, w = 192000, h = 96000;
  let name = rows[ri] + col;
  for (let i = 0; i < 3; i++) {
    const c = Math.floor((E - e0) / (w / 2)), r = Math.floor((N - n0) / (h / 2));
    name += String(1 + r + 2 * c);
    e0 += (c * w) / 2; n0 += (r * h) / 2; w /= 2; h /= 2;
  }
  const c = Math.floor((E - e0) / 6000), r = Math.floor((N - n0) / 6000);
  return name + "ABCDEFGH"[c * 2 + r];
}

/* ---------- CityGML -> compact building records ---------- */
const POS = /<gml:posList[^>]*>([^<]+)<\/gml:posList>/g;
function rings(xml) {
  const out = [];
  for (const m of xml.matchAll(POS)) {
    const v = m[1].trim().split(/\s+/).map(Number), r = [];
    for (let i = 0; i + 2 < v.length; i += 3) r.push([v[i], v[i + 1], v[i + 2]]);
    if (r.length >= 3) out.push(r);
  }
  return out;
}
function surfaces(xml, kind) {
  const out = [], open = `<bldg:${kind}`, close = `</bldg:${kind}>`;
  let i = 0;
  for (;;) {
    const a = xml.indexOf(open, i);
    if (a < 0) break;
    const b = xml.indexOf(close, a);
    if (b < 0) break;
    out.push(...rings(xml.slice(a, b)));
    i = b + close.length;
  }
  return out;
}
const area2 = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; };
const r2 = (x) => Math.round(x * 100) / 100;

/** Slope of a roof polygon from its normal (Newell's method), in degrees. */
function slopeOf(r) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1, z1] = r[i], [x2, y2, z2] = r[(i + 1) % r.length];
    nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2);
  }
  return (Math.atan2(Math.hypot(nx, ny), Math.abs(nz)) * 180) / Math.PI;
}

/**
 * The walls along one outline edge, in order: neighbouring pieces with about the same eave (±0.4 m) are joined (a
 * gable wall rises to its peak and comes down again),
 * and stretches no wall polygon covers take the height of the nearest piece (or the lowest roof edge).
 */
function wallPieces(e, fallbackEave) {
  const ps = e.pieces.slice().sort((a, b) => a.t0 - b.t0);
  if (!ps.length) { const h = fallbackEave ?? 0; return [{ len: e.len, eave: h, top: h, slope: 0 }]; }
  const out = [];
  let cur = { ...ps[0], t0: 0 };
  for (const p of ps.slice(1)) {
    if (Math.abs(p.eave - cur.eave) < 0.4) {
      cur.t1 = Math.max(cur.t1, p.t1); cur.eave = Math.min(cur.eave, p.eave); cur.top = Math.max(cur.top, p.top); cur.slope = Math.max(cur.slope, p.slope);
    } else {
      const cut = Math.max(cur.t1, p.t0) <= p.t0 ? (cur.t1 + p.t0) / 2 : p.t0; // split any gap between the two
      cur.t1 = Math.max(cut, cur.t0);
      out.push(cur);
      cur = { ...p, t0: cut };
    }
  }
  cur.t1 = e.len;
  out.push(cur);
  return out.map((p) => ({ len: Math.max(0, p.t1 - p.t0), eave: p.eave, top: Math.max(p.top, p.eave), slope: p.slope })).filter((p) => p.len > 0.05);
}

/**
 * One building: its ground outline, and for each outline edge the wall's eave height (top of the wall where the roof
 * starts) and top height (gable peak), in metres above that wall's foot. Walls lie on the outline edges.
 */
function buildingRecord(id, xml) {
  const ground = surfaces(xml, "GroundSurface").sort((a, b) => area2(b) - area2(a));
  if (!ground.length) return null;
  const g = ground[0];
  const ring = g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1] ? g.slice(0, -1) : g;
  const gz = Math.min(...g.map((p) => p[2]));
  const edges = ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return { a: p, b: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]), pieces: [] };
  });
  // Each wall polygon stands on one outline edge and covers part of it, with its own eave (where the roof starts)
  // and top (gable peak): a long wall can be low under a porch roof and high elsewhere, so its top edge is followed
  // segment by segment. Walls that don't reach the ground (steps in the roof) aren't facade walls.
  for (const w of surfaces(xml, "WallSurface")) {
    const zb = Math.min(...w.map((p) => p[2]));
    if (zb > gz + 0.5 || !w.some((p) => p[2] > zb + 0.5)) continue;
    let best = null, bestD = 0.35;
    for (const e of edges) {
      if (e.len < 0.05) continue;
      const ux = (e.b[0] - e.a[0]) / e.len, uy = (e.b[1] - e.a[1]) / e.len;
      let dmax = 0, tmin = Infinity, tmax = -Infinity;
      for (const p of w) {
        const dx = p[0] - e.a[0], dy = p[1] - e.a[1];
        dmax = Math.max(dmax, Math.abs(dx * uy - dy * ux));
        const t = dx * ux + dy * uy; tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
      }
      const t0 = Math.max(tmin, 0), t1 = Math.min(tmax, e.len);
      if (dmax < bestD && t1 - t0 > 0.2) { best = { e, ux, uy }; bestD = dmax; }
    }
    if (!best) continue;
    const { e, ux, uy } = best;
    const ts = w.map((p) => (p[0] - e.a[0]) * ux + (p[1] - e.a[1]) * uy);
    for (let i = 0; i < w.length; i++) {
      const j = (i + 1) % w.length;
      if (w[i][2] <= zb + 0.5 || w[j][2] <= zb + 0.5) continue; // only the top edge of the wall
      const t0 = Math.max(Math.min(ts[i], ts[j]), 0), t1 = Math.min(Math.max(ts[i], ts[j]), e.len);
      if (t1 - t0 < 0.05) continue;
      const slope = Math.abs(w[j][2] - w[i][2]) / Math.max(Math.abs(ts[j] - ts[i]), 0.05);
      e.pieces.push({ t0, t1, eave: Math.min(w[i][2], w[j][2]) - zb, top: Math.max(w[i][2], w[j][2]) - zb, slope });
    }
  }
  const roofs = surfaces(xml, "RoofSurface").map((r) => ({ slope: slopeOf(r), plan: area2(r), low: Math.min(...r.map((p) => p[2])) - gz, high: Math.max(...r.map((p) => p[2])) - gz }));
  const tag = (t) => { const m = new RegExp(`<bldg:${t}[^>]*>([^<]+)</bldg:${t}>`).exec(xml); return m ? m[1].trim() : null; };
  const cd = /<creationDate>([^<]+)<\/creationDate>/.exec(xml);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const fallbackEave = roofs.length ? Math.min(...roofs.map((r) => r.low)) : null;
  // Outer corners need the scaffold to run past them; inner corners and height steps along one wall don't.
  const turn = Math.sign(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0));
  const outer = ring.map((p, i) => {
    const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length];
    return Math.sign((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) === turn;
  });
  const walls = edges.flatMap((e, edge) => {
    const ps = wallPieces(e, fallbackEave);
    return ps.map((w, k) => ({
      edge, len: r2(w.len), eave: r2(w.eave), top: r2(w.top),
      // A gable or the sloping side of a lean-to: its top rises (more than 5°) instead of running level under an eave.
      gable: w.top - w.eave > 0.3 && w.slope > 0.087,
      e0: k === 0 && outer[edge] ? 1 : 0,
      e1: k === ps.length - 1 && outer[(edge + 1) % ring.length] ? 1 : 0,
      ext: (k === 0 && outer[edge] ? 1 : 0) + (k === ps.length - 1 && outer[(edge + 1) % ring.length] ? 1 : 0)
    }));
  });
  return {
    id,
    bbox: [r2(Math.min(...xs)), r2(Math.min(...ys)), r2(Math.max(...xs)), r2(Math.max(...ys))],
    outline: ring.map((p) => [r2(p[0]), r2(p[1])]),
    walls,
    shape: shapeOf(xml, ring[0], gz),
    roofs: roofs.map((r) => ({ slope: Math.round(r.slope * 10) / 10, plan: Math.round(r.plan * 10) / 10, low: r2(r.low), high: r2(r.high) })),
    height: Number(tag("measuredHeight")) || null,
    roofType: tag("roofType"),
    created: cd ? cd[1] : null
  };
}

/**
 * The building's wall and roof polygons for drawing it: flat arrays x,y,z,x,y,z… in whole centimetres, relative to
 * the first outline corner (x, y) and the ground (z). Walls that don't reach the ground are kept too (roof steps).
 */
function shapeOf(xml, origin, gz) {
  const pack = (r) => r.flatMap((q) => [Math.round((q[0] - origin[0]) * 100), Math.round((q[1] - origin[1]) * 100), Math.round((q[2] - gz) * 100)]);
  const open = (r) => (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] && r[0][2] === r[r.length - 1][2] ? r.slice(0, -1) : r);
  return { w: surfaces(xml, "WallSurface").map((r) => pack(open(r))), r: surfaces(xml, "RoofSurface").map((r) => pack(open(r))) };
}

/** Streams a CityGML text and calls onBuilding(id, xml) for every <bldg:Building>…</bldg:Building>. */
async function scanCityGml(textStream, onBuilding) {
  let buf = "";
  const OPEN = "<bldg:Building ", CLOSE = "</bldg:Building>";
  for await (const chunk of textStream) {
    buf += chunk;
    for (;;) {
      const a = buf.indexOf(OPEN);
      if (a < 0) { buf = buf.slice(Math.max(0, buf.length - OPEN.length)); break; }
      const b = buf.indexOf(CLOSE, a);
      if (b < 0) { buf = buf.slice(a); break; }
      const block = buf.slice(a, b + CLOSE.length);
      const id = /gml:id="([^"]+)"/.exec(block);
      onBuilding(id ? id[1] : "", block);
      buf = buf.slice(b + CLOSE.length);
    }
  }
}

/** The first file of a zip as a text stream (local file header + deflate data). */
function zipFirstEntryStream(buffer) {
  if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip file");
  const method = buffer.readUInt16LE(8), nameLen = buffer.readUInt16LE(26), extraLen = buffer.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  // The entry's compressed size may be in a data descriptor; inflate stops by itself at the end of the deflate stream.
  const body = Readable.from([buffer.subarray(start)]);
  const out = method === 8 ? body.pipe(zlib.createInflateRaw()) : body;
  out.setEncoding("utf8");
  return out;
}

/* ---------- The service ---------- */
function createNls3d({ apiKey, dir, log = () => {}, fetchImpl = fetch } = {}) {
  const enabled = Boolean(apiKey && dir);
  if (enabled) fs.mkdirSync(dir, { recursive: true });
  const inflight = new Map();
  const memo = new Map(); // sheet -> loaded index (small LRU)

  const url = (p) => `${BASE}${p}${p.includes("?") ? "&" : "?"}api-key=${encodeURIComponent(apiKey)}`;
  const file = (sheet) => path.join(dir, `${sheet}.json`);

  function readIndex(sheet) {
    if (memo.has(sheet)) return memo.get(sheet);
    try {
      const idx = JSON.parse(fs.readFileSync(file(sheet), "utf8"));
      if (idx.none && Date.now() - Date.parse(idx.checkedAt) > RECHECK_NONE_MS) return null;
      if (!idx.none && idx.v !== INDEX_VERSION) return null; // older format: download again
      memo.set(sheet, idx);
      if (memo.size > 4) memo.delete(memo.keys().next().value);
      return idx;
    } catch {
      return null;
    }
  }

  async function fetchSheet(sheet) {
    const t0 = Date.now();
    const exec = await fetchImpl(url(`/processes/${PROCESS}/execution`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: PROCESS, inputs: { mapSheetInput: [sheet], fileFormatInput: "CityGML", levelOfDetailInput: "LOD2" } })
    });
    if (!exec.ok) throw new Error(`execution HTTP ${exec.status}`);
    const job = await exec.json();
    let status = job.status, message = "";
    for (let i = 0; i < 90 && (status === "accepted" || status === "running"); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await (await fetchImpl(url(`/jobs/${job.jobID}`))).json();
      status = s.status; message = s.message || s.statusMessage || "";
    }
    const index = { v: INDEX_VERSION, sheet, checkedAt: new Date().toISOString(), buildings: [] };
    if (status !== "successful") {
      if (/not found/i.test(message)) { index.none = true; fs.writeFileSync(file(sheet), JSON.stringify(index)); log(`3D ${sheet}: no data`); return index; }
      throw new Error(`job ${status}: ${message}`);
    }
    const res = await (await fetchImpl(url(`/jobs/${job.jobID}/results`))).json();
    const zip = (res.results || []).find((r) => r.path && /\.zip$/i.test(r.path));
    if (!zip) throw new Error("no zip in results");
    index.modelDate = zip.lastModified || null;
    // The key goes only to the land survey's own server, whatever address the job result names.
    if (new URL(zip.path, BASE).host !== new URL(BASE).host) throw new Error("download from an unexpected host");
    const dl = await fetchImpl(`${zip.path}${zip.path.includes("?") ? "&" : "?"}api-key=${encodeURIComponent(apiKey)}`);
    if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    await scanCityGml(zipFirstEntryStream(buf), (id, xml) => {
      try {
        const b = buildingRecord(id, xml);
        if (b) index.buildings.push(b);
      } catch (e) {
        log(`3D ${sheet}: skipped ${id}: ${e.message}`);
      }
    });
    const tmp = file(sheet) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(index));
    fs.renameSync(tmp, file(sheet));
    log(`3D ${sheet}: ${index.buildings.length} buildings in ${Math.round((Date.now() - t0) / 1000)} s`);
    return index;
  }

  // At most two sheets download at a time and 20 wait, so a flood of lookups can't use up memory or the API quota.
  let running = 0;
  const waiting = [];
  function slot() {
    if (running < 2) return running++, Promise.resolve();
    if (waiting.length >= 20) return Promise.reject(new Error("too many 3D downloads waiting"));
    return new Promise((r) => waiting.push(r));
  }
  function release() {
    const next = waiting.shift();
    if (next) next(); else running--;
  }
  function loadSheet(sheet) {
    const have = readIndex(sheet);
    if (have) return Promise.resolve(have);
    if (!inflight.has(sheet)) {
      inflight.set(sheet, slot().then(() => fetchSheet(sheet).finally(release)).finally(() => inflight.delete(sheet)));
    }
    return inflight.get(sheet);
  }

  /** The building at a point: inside its outline, or within 8 m of it. */
  function pick(index, E, N) {
    let best = null, bestD = 8;
    for (const b of index.buildings) {
      const [x0, y0, x1, y1] = b.bbox;
      if (E < x0 - 10 || E > x1 + 10 || N < y0 - 10 || N > y1 + 10) continue;
      const pts = b.outline.map(([x, y]) => ({ x, y }));
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], c = pts[j];
        if (a.y > N !== c.y > N && E < ((c.x - a.x) * (N - a.y)) / (c.y - a.y) + a.x) inside = !inside;
      }
      if (inside) return b;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length], dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((E - a.x) * dx + (N - a.y) * dy) / L2));
        const d = Math.hypot(E - (a.x + t * dx), N - (a.y + t * dy));
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }

  /**
   * { status: "found", building, sheet, modelDate } | { status: "none" } (no 3D data here yet) |
   * { status: "pending" } (sheet still downloading; ask again shortly) | { status: "off" } | { status: "error" }
   */
  /** `cachedOnly`: answer from sheets already downloaded, never start a download (public price requests). */
  async function lookup(lat, lon, { waitMs = 0, cachedOnly = false } = {}) {
    if (!enabled) return { status: "off" };
    const { E, N } = tm35(lat, lon);
    const sheet = sheetFor(E, N);
    if (!sheet) return { status: "none" };
    let index = readIndex(sheet);
    if (!index && cachedOnly) return { status: "pending", sheet };
    if (!index) {
      const p = loadSheet(sheet);
      p.catch((e) => log(`3D ${sheet} failed: ${e.message}`));
      if (!waitMs) return { status: "pending", sheet };
      index = await Promise.race([p.catch(() => "error"), new Promise((r) => setTimeout(() => r(null), waitMs))]);
      if (index === "error") return { status: "error", sheet };
      if (!index) return { status: "pending", sheet };
    }
    if (index.none) return { status: "none", sheet };
    const building = pick(index, E, N);
    return building ? { status: "found", building, sheet, modelDate: index.modelDate || null, E, N } : { status: "none", sheet };
  }

  return { enabled, lookup, loadSheet };
}

/** Roof type codes in the model (CityGML/AdV list): the ones the price engine knows. */
function roofTypeOf(code) {
  return { 1000: "flat", 1010: "flat", 1030: "gable", 1040: "hip", 1050: "hip", 1070: "hip", 1120: "hip" }[Number(code)] || null;
}

module.exports = { createNls3d, tm35, sheetFor, buildingRecord, scanCityGml, roofTypeOf };
