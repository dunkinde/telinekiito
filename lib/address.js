"use strict";
// Address -> house size from open data:
//   1. Nominatim (OpenStreetMap) geocodes the address. In Finland the address is often tagged on the
//      building itself, and then Nominatim returns its outline directly.
//   2. Otherwise Overpass (OpenStreetMap) lists the buildings around the address point. Public Overpass
//      servers are often busy, so several are tried in turn.
//   3. Last map fallback: Nominatim reverse lookup of the building at the address point.
//   4. Ryhti (national building register, Syke) gives floors, floor area and year built. If no outline
//      was found at all, the size is estimated from the register floor area and clearly marked.
//   5. Where the National Land Survey's 3D building model covers the address (LoD2, mostly cities), its measured
//      outline and wall heights replace all of the above: the price is then worked out wall by wall.
//      Elsewhere the eave height is estimated from floors.
const geo = require("./geo");
const { roofTypeOf, tm35 } = require("./nls3d");

const UA = process.env.CONTACT_UA || "Telinekiito-MVP/0.1 (scaffolding quotes)";
const NOMINATIM = (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search").replace(/\/search$/, "");
const OVERPASS = (
  process.env.OVERPASS_URL ||
  "https://overpass.private.coffee/api/interpreter,https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter"
).split(",").map((s) => s.trim()).filter(Boolean);
const RYHTI =
  process.env.RYHTI_URL ||
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_building/items";

// Helsinki's own building outlines (open data, kept current by the city): the reference for its 3D models.
const HEL_WFS = process.env.HEL_WFS_URL || "https://kartta.hel.fi/ws/geoserver/avoindata/wfs";
const NOT_RECT = "The building is not a simple rectangle (L-shape or extensions). The size is its outer box, so check it.";

const MINOR = /^(garage|garages|shed|carport|hut|roof|greenhouse|kiosk|service|outbuilding|sauna|storage_tank|cabin)$/;
const ZONE_A = ["helsinki", "helsingfors", "espoo", "esbo", "vantaa", "vanda", "kauniainen", "grankulla"];

function ringFromGeojson(gj) {
  if (!gj) return null;
  let coords = null;
  if (gj.type === "Polygon") coords = gj.coordinates[0];
  else if (gj.type === "MultiPolygon") {
    // Largest outer ring.
    let best = 0;
    for (const poly of gj.coordinates) {
      const ring = poly[0] || [];
      if (ring.length > best) { best = ring.length; coords = ring; }
    }
  }
  if (!coords || coords.length < 4) return null;
  return coords.map(([lon, lat]) => ({ lat, lon }));
}

function shortAddress(a, fallback) {
  const street = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(" ");
  const city = [a.postcode, a.city || a.town || a.municipality || a.village].filter(Boolean).join(" ");
  const s = [street, city].filter(Boolean).join(", ");
  return s || String(fallback || "").split(",").slice(0, 3).join(",");
}

function createAddressService(opts = {}) {
  const doFetch = opts.fetchImpl || fetch;
  const log = opts.log || ((m) => console.warn("[address] " + m));
  const cache = new Map();
  let lastNominatim = 0;
  let gate = Promise.resolve();

  async function fetchJson(url, init = {}, ms = 15000) {
    const r = await doFetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    if (!r.ok) {
      const e = new Error(`upstream ${r.status} from ${new URL(url).host}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  // Nominatim usage policy: at most one request per second.
  function throttled(fn) {
    const turn = gate.then(async () => {
      const wait = Math.max(0, lastNominatim + 1100 - Date.now());
      if (wait) await new Promise((res) => setTimeout(res, wait));
      lastNominatim = Date.now();
    });
    gate = turn.catch(() => {});
    return turn.then(fn);
  }

  function nominatim(path, params) {
    const p = new URLSearchParams({ format: "jsonv2", addressdetails: "1", polygon_geojson: "1", extratags: "1", ...params });
    if (process.env.NOMINATIM_EMAIL) p.set("email", process.env.NOMINATIM_EMAIL);
    return throttled(() =>
      fetchJson(`${NOMINATIM}/${path}?${p}`, { headers: { "User-Agent": UA, "Accept-Language": "fi" } })
    );
  }

  function asPlace(g) {
    return {
      lat: Number(g.lat),
      lon: Number(g.lon),
      osmType: g.osm_type,
      osmId: Number(g.osm_id),
      category: g.category || g.class,
      type: g.type,
      display: g.display_name,
      address: g.address || {},
      ring: ringFromGeojson(g.geojson),
      tags: g.extratags || {}
    };
  }

  async function geocode(text) {
    const r = await nominatim("search", { q: text, limit: "1", countrycodes: "fi" });
    if (!Array.isArray(r) || !r.length) return null;
    return asPlace(r[0]);
  }

  // An official address (National Land Survey register, via opts.official) in the shape of a geocoded place.
  function officialPlace(o) {
    return {
      lat: o.lat, lon: o.lon, osmType: null, osmId: NaN, category: "place", type: "address", display: o.label,
      address: { road: o.road || o.street, house_number: o.number || "", postcode: o.postcode, city: o.city }, ring: null, tags: {}
    };
  }

  // The address point. The official register is the reference when it knows the address: Nominatim (one request a
  // second, often slow) still runs for the building it may return, but a slow, failed or distant answer doesn't hold
  // the lookup up. { g, official }
  async function locate(text) {
    const geoP = geocode(text).then((g) => ({ g }), (e) => ({ e }));
    const off = opts.official ? await opts.official(text).catch(() => null) : null;
    const ok = off && Number.isFinite(off.lat) && Number.isFinite(off.lon);
    if (!ok) {
      const r = await geoP;
      if (r.e) throw r.e;
      return { g: r.g, official: null };
    }
    const r = await Promise.race([geoP, new Promise((res) => setTimeout(() => res({ e: new Error("timeout") }), opts.geocodeWaitMs ?? 6000))]);
    if (r.e) log(`geocode failed, using the official address point: ${r.e.message}`);
    const far = r.g && Math.hypot((r.g.lat - off.lat) * 110574, (r.g.lon - off.lon) * 111320 * Math.cos((off.lat * Math.PI) / 180)) > 150;
    return { g: !r.g || far ? officialPlace(off) : r.g, official: off };
  }

  // A Nominatim building result in the same shape as an Overpass way.
  function placeAsWay(p) {
    if (!p || !p.ring || p.category !== "building") return null;
    return { type: "way", id: p.osmId, osmType: p.osmType, tags: { ...p.tags, building: p.type || "yes" }, geometry: p.ring };
  }

  async function buildingsNear(lat, lon, radius) {
    const q = `[out:json][timeout:12];way(around:${radius},${lat.toFixed(7)},${lon.toFixed(7)})[building];out tags geom;`;
    let lastErr = null;
    for (const url of OVERPASS) {
      try {
        const r = await fetchJson(
          url,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: "data=" + encodeURIComponent(q) },
          15000
        );
        if (!Array.isArray(r.elements)) throw new Error(`no elements from ${new URL(url).host}`);
        return r.elements.filter((e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 4);
      } catch (e) {
        lastErr = e;
        log(`overpass ${new URL(url).host} failed: ${e.message}`);
      }
    }
    throw lastErr || new Error("no overpass server");
  }

  async function reverseBuilding(lat, lon) {
    const r = await nominatim("reverse", { lat: String(lat), lon: String(lon), zoom: "18" });
    if (!r || r.error) return null;
    return placeAsWay(asPlace(r));
  }

  function pickBuilding(ways, g) {
    const origin = { x: 0, y: 0 };
    const cands = ways.map((w) => {
      const ring = geo.openRing(w.geometry);
      const pts = geo.project(ring, g.lat, g.lon);
      const tag = (w.tags && w.tags.building) || "yes";
      return {
        way: w,
        ring,
        pts,
        tag,
        minor: MINOR.test(tag),
        area: geo.polygonArea(pts),
        dist: geo.distToPolygon(origin, pts),
        isGeocoded: g.osmType === (w.osmType || "way") && Number(w.id) === g.osmId
      };
    });
    const direct = cands.find((c) => c.isGeocoded);
    if (direct) return direct;
    const inside = cands.filter((c) => c.dist === 0).sort((a, b) => b.area - a.area);
    if (inside.length) return inside[0];
    const main = cands.filter((c) => !c.minor && c.area >= 40 && c.dist <= 30).sort((a, b) => a.dist - b.dist);
    if (main.length) return main[0];
    const any = cands.filter((c) => c.dist <= 20).sort((a, b) => a.dist - b.dist);
    return any[0] || null;
  }

  async function ryhtiItems(bbox) {
    const base = { bbox, limit: "200" };
    try {
      return await fetchJson(`${RYHTI}?${new URLSearchParams({ ...base, f: "application/geo+json" })}`, { headers: { Accept: "application/geo+json", "User-Agent": UA } });
    } catch (e) {
      log(`ryhti failed: ${e.message}, retrying`);
      return fetchJson(`${RYHTI}?${new URLSearchParams(base)}`, { headers: { Accept: "application/geo+json, application/json", "User-Agent": UA } });
    }
  }

  async function registerInfo(centerLat, centerLon, ring) {
    const dLat = 0.0006, dLon = 0.0012;
    const bbox = [centerLon - dLon, centerLat - dLat, centerLon + dLon, centerLat + dLat].map((v) => v.toFixed(6)).join(",");
    const r = await ryhtiItems(bbox);
    const feats = (r.features || []).filter(
      (f) => f.geometry && f.geometry.type === "Point" && f.properties && !f.properties.demolition_date
    );
    if (!feats.length) return null;
    const poly = ring ? geo.project(ring, centerLat, centerLon) : null;
    let best = null;
    for (const f of feats) {
      const [lon, lat] = f.geometry.coordinates;
      const p = geo.project([{ lat, lon }], centerLat, centerLon)[0];
      const d = poly ? geo.distToPolygon(p, poly) : Math.hypot(p.x, p.y);
      // Without an outline, prefer real buildings with floor area over small sheds at the same distance.
      const score = d - (!poly && Number(f.properties.gross_floor_area) >= 40 ? 10 : 0);
      if (!best || score < best.score) best = { d, score, f };
    }
    if (!best || best.d > (poly ? 20 : 35)) return null;
    const p = best.f.properties;
    return {
      storeys: Number.isFinite(Number(p.number_of_storeys)) && Number(p.number_of_storeys) > 0 ? Number(p.number_of_storeys) : null,
      floorArea: Number(p.floor_area) || null,
      grossFloorArea: Number(p.gross_floor_area) || null,
      completed: p.completion_date ? String(p.completion_date).slice(0, 4) : null,
      distanceM: Math.round(best.d)
    };
  }

  function roofFromTags(t) {
    const shape = String((t && t["roof:shape"]) || "").toLowerCase();
    if (shape === "gabled") return "gable";
    if (["hipped", "half-hipped", "pyramidal"].includes(shape)) return "hip";
    if (["flat", "skillion"].includes(shape)) return "flat";
    return null;
  }

  function zoneFor(a) {
    const city = String(a.city || a.town || a.municipality || a.village || "").toLowerCase();
    if (ZONE_A.includes(city)) return "A";
    const state = String(a.state || a.region || "").toLowerCase();
    if (state.includes("uusimaa") || state.includes("nyland")) return "B";
    return "C";
  }

  async function findOutline(g) {
    // 1. The address point is the building itself.
    const own = placeAsWay(g);
    if (own) return { picked: pickBuilding([own], g), failed: false };
    // 2. Buildings around the address point.
    let failed = false;
    try {
      const picked = pickBuilding(await buildingsNear(g.lat, g.lon, 45), g);
      if (picked) return { picked, failed };
    } catch {
      failed = true;
    }
    // 3. The building Nominatim finds at the address point.
    try {
      const w = await reverseBuilding(g.lat, g.lon);
      const picked = w ? pickBuilding([w], g) : null;
      if (picked) return { picked, failed: false };
    } catch (e) {
      log(`reverse failed: ${e.message}`);
    }
    return { picked: null, failed };
  }

  async function lookup(text) {
    const key = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (key.length < 5) return { found: false, reason: "too_short" };
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.value;

    // Notes go out both as English text and as codes the page translates.
    const notes = [], noteCodes = [];
    const note = (code, text, vars) => { notes.push(text); noteCodes.push({ code, ...(vars || {}) }); };
    const { g, official } = await locate(key);
    if (!g) return { found: false, reason: "address_not_found" };
    const houseLevel = Boolean(g.address.house_number) || g.category === "building";
    if (!houseLevel) note("street_only", "The address matched a street, not a house number. Check that the right building was found.");

    // The 3D model download runs alongside the map lookups (a new map sheet takes a few seconds the first time).
    const modelP = opts.nls3d ? opts.nls3d.lookup(g.lat, g.lon, { waitMs: opts.modelWaitMs ?? 8000 }).catch(() => ({ status: "error" })) : null;
    const { picked, failed } = await findOutline(g);

    const result = {
      found: true,
      match: { display: g.display, short: shortAddress(g.address, g.display), houseLevel, lat: g.lat, lon: g.lon },
      zone: (official && official.zone) || zoneFor(g.address),
      house: { length: null, width: null, floors: null, roofType: null, pitch: null, eave: null },
      details: {},
      notes,
      noteCodes
    };

    let center = { lat: g.lat, lon: g.lon };
    let regFailed = false;
    if (picked) {
      const fill = setOutline(result, picked.pts, "OpenStreetMap");
      if (fill != null && fill < 0.8) note("not_rectangle", NOT_RECT);
      result.details.osmType = picked.way.osmType || "way";
      result.details.osmWayId = picked.way.id;
      result.details.buildingTag = picked.tag;
      if (picked.minor) note("outbuilding", "The nearest building looks like an outbuilding. Check that this is the house.");
      const t = picked.way.tags || {};
      const roof = roofFromTags(t);
      if (roof) {
        result.house.roofType = roof;
        result.details.roofSource = "OpenStreetMap";
      }
      const angle = Number(t["roof:angle"]);
      if (Number.isFinite(angle) && angle > 0 && angle < 60) result.house.pitch = Math.round(angle);
      const h = Number(t.height || t["building:height"]), rh = Number(t["roof:height"]);
      if (Number.isFinite(h) && Number.isFinite(rh) && h - rh > 2) {
        result.house.eave = Math.round((h - rh) * 10) / 10;
        result.details.eaveSource = "OpenStreetMap height tags";
      }
      const lv = Number(t["building:levels"]);
      if (Number.isFinite(lv) && lv > 0) {
        result.house.floors = lv >= 2 ? "2" : "1";
        result.details.floorsSource = "OpenStreetMap";
      }
      const c = geo.centroid(picked.pts);
      const k = Math.cos((g.lat * Math.PI) / 180) * 111320;
      center = { lat: g.lat + c.y / 110574, lon: g.lon + c.x / k };
    }

    try {
      const reg = await registerInfo(center.lat, center.lon, picked ? picked.ring : null);
      if (reg) {
        result.details.register = reg;
        if (reg.storeys) {
          result.house.floors = reg.storeys >= 2 ? "2" : "1";
          result.details.floorsSource = "Building register";
          if (reg.storeys >= 3) note("storeys_many", "The register lists " + reg.storeys + " storeys. This tool handles houses up to 2 storeys; the office will check.", { n: reg.storeys });
        }
      }
    } catch (e) {
      log(`register failed: ${e.message}`);
      regFailed = true;
      note("register_down", "The building register couldn't be reached right now.");
    }

    // No outline anywhere: estimate a rectangle from the register floor area (ground floor ≈ area / storeys).
    const reg = result.details.register;
    if (!result.house.length && reg && (reg.grossFloorArea || reg.floorArea)) {
      const footprint = (reg.grossFloorArea || reg.floorArea * 1.15) / Math.max(1, reg.storeys || 1);
      if (footprint >= 30 && footprint <= 600) {
        const L = Math.sqrt(footprint * 1.5);
        result.house.length = Math.round(L * 2) / 2;
        result.house.width = Math.round((footprint / L) * 2) / 2;
        result.details.sizeSource = "estimate";
        result.details.footprintM2 = Math.round(footprint);
        note("size_estimated", "The size is estimated from the floor area in the building register, not measured. Check length and width.");
      }
    }
    // The map outline and the register floor area disagree: one of them is wrong (a rough box drawn on the map,
    // an extension, a 1.5-storey house…). The office checks the real shape before the price is confirmed.
    if (result.details.sizeSource === "OpenStreetMap" && reg && (reg.grossFloorArea || reg.floorArea) && result.details.footprintM2) {
      const perFloor = (reg.grossFloorArea || reg.floorArea * 1.15) / Math.max(1, reg.storeys || 1);
      result.details.registerFootprintM2 = Math.round(perFloor);
      if (Math.abs(result.details.footprintM2 - perFloor) / perFloor > 0.2) {
        note("size_mismatch", `The map outline (about ${result.details.footprintM2} m²) and the building register (about ${Math.round(perFloor)} m² per floor) disagree. The house shape will be checked before the price is confirmed.`, { map: result.details.footprintM2, reg: Math.round(perFloor) });
      }
    }
    // A plain 4-corner outline is often a box drawn by hand: right for a rectangular house, but worth a look.
    if (result.details.outline && result.details.outline.length === 4) result.details.simpleOutline = true;

    const model = modelP ? await modelP : null;
    if (model && model.status === "found") {
      // The model can be older or simpler than the house (rebuilt, extended): then its walls and roof would price the
      // wrong house. It isn't used at all, the size comes from the city's outline (or the map), and the customer is
      // asked for photos or drawings.
      const check = await modelCheck(model.building, g, reg).catch((e) => (log(`model check failed: ${e.message}`), null));
      if (check && check.fit != null) result.details.modelMatch = check.fit;
      const off = Boolean(check && check.off);
      if (!off) applyModel(result, model, g, notes, noteCodes);
      if (off && check.ring) {
        const [E0, N0] = check.ring[0];
        const fill = setOutline(result, check.ring.map(([x, y]) => ({ x: x - E0, y: y - N0 })), "City of Helsinki");
        const drop = new Set(["not_rectangle", "size_mismatch", "size_estimated"]);
        for (let i = noteCodes.length - 1; i >= 0; i--) if (drop.has(noteCodes[i].code)) { noteCodes.splice(i, 1); notes.splice(i, 1); }
        if (fill != null && fill < 0.8) note("not_rectangle", NOT_RECT);
        note("model_mismatch", `The 3D model doesn't match the city's current outline of the house (about ${Math.round(check.fit * 100)} % overlap), so it is probably out of date. The size is taken from the city's outline; the house shape will be checked before the price is confirmed, and photos or drawings of the house help.`, { pct: Math.round(check.fit * 100) });
      } else if (off) note("model_old", `The house was completed in ${check.completed}, after the 3D model was measured (${check.year}), so the model may show an older building. The size is taken from the map; the house shape will be checked before the price is confirmed, and photos or drawings of the house help.`, { year: check.completed, model: check.year });
      // The model's walls stand on its lowest ground point: on a sloping plot the uphill walls come out too tall.
      const ew = (model.building.walls || []).filter((w) => !w.gable && w.len >= 2);
      const top = ew.length && !off ? Math.max(...ew.map((w) => w.eave)) : null, st = reg && reg.storeys;
      if (top && st && st <= 2 && top > st * 3 + 4) note("model_slope", `The 3D model's walls reach ${Math.round(top * 10) / 10} m, high for a ${st}-storey house: the plot probably slopes, and the model measures every wall from its lowest ground point. The scaffold heights will be checked on site.`, { h: Math.round(top * 10) / 10, n: st });
    } else if (model && model.status === "pending") result.modelPending = true;
    // Bigger than the online price covers (the engine is for houses): the office prices it by hand.
    if (result.house.length > 60 || result.house.width > 40) {
      note("too_large", `The building is about ${Math.round(result.house.length)} × ${Math.round(result.house.width)} m – larger than the online price covers (up to 60 × 40 m).`, { l: Math.round(result.house.length), w: Math.round(result.house.width) });
    }
    if (!result.house.length) {
      if (failed) note("map_busy", "The map service is busy right now. Try again in a minute, or enter the size by hand.");
      else note("no_outline", "No building outline was found at this address. Enter the size by hand.");
    }
    if (!result.house.floors) note("no_floors", "Number of floors wasn't found. Choose it below.");
    if (!result.house.roofType) note("roof_assumed", "Roof shape isn't in the open data, so a gable roof is assumed.");

    // Don't keep a result that is incomplete only because a service was down.
    if (!regFailed && !result.modelPending && !(failed && !["OpenStreetMap", "NLS 3D model", "City of Helsinki"].includes(result.details.sizeSource))) {
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value: result });
    }
    return result;
  }

  /** The house size from an outline (points in metres): its outer box, area and shape. Returns area / box area. */
  function setOutline(result, pts, source) {
    const rect = geo.minRect(pts);
    if (!rect) return null;
    const area = geo.polygonArea(pts);
    result.house.length = Math.round(rect.length * 10) / 10;
    result.house.width = Math.round(rect.width * 10) / 10;
    result.details.sizeSource = source;
    result.details.footprintM2 = Math.round(area);
    result.details.rectangularity = Math.round((area / rect.area) * 100) / 100;
    result.details.ridgeBearingDeg = Math.round(rect.angleDeg);
    result.details.outline = geo.orientOutline(pts, rect.angleDeg);
    return area / rect.area;
  }

  /** Helsinki's outlines (TM35FIN) of the buildings around a point, with their street addresses. */
  async function helsinkiOutlines(E, N, r = 40) {
    const q = new URLSearchParams({
      service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "avoindata:Rakennukset_alue_rekisteritiedot",
      outputFormat: "application/json", srsName: "EPSG:3067", count: "100",
      bbox: [E - r, N - r, E + r, N + r].map((v) => v.toFixed(1)).join(",") + ",EPSG:3067"
    });
    const j = await fetchJson(`${HEL_WFS}?${q}`, { headers: { Accept: "application/json", "User-Agent": UA } }, 8000);
    return (j.features || []).filter((f) => f.geometry && /Polygon$/.test(f.geometry.type)).map((f) => {
      const p = f.properties || {}, c = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates[0];
      return { ring: (c[0] || []).slice(0, -1), street: String(p.katunimi_suomi || "").toLowerCase(), no: String(p.osoitenumero || "").replace(/\s+/g, "").toLowerCase() };
    }).filter((b) => b.ring.length >= 3);
  }

  /**
   * Is the 3D model still the house? Helsinki keeps its own outlines current: a model clearly smaller than the city's
   * outline of the house is older than it (rebuilt, extended). Elsewhere a house completed after the model was measured
   * may not be in it. The map outline is no reference: it often covers a whole row block or the carport.
   * { off, fit, ring } | { off, year, completed } | null
   */
  async function modelCheck(b, g, reg) {
    if (!b.outline || b.outline.length < 3) return null;
    const city = g.address.city || g.address.town || g.address.municipality || "";
    if (/^(helsinki|helsingfors)$/i.test(city)) {
      const [E0, N0] = b.outline[0];
      const rel = (ring) => ring.map(([x, y]) => ({ x: x - E0, y: y - N0 }));
      const M = rel(b.outline), c = geo.centroid(M);
      const list = await helsinkiOutlines(E0 + c.x, N0 + c.y).catch((e) => (log(`helsinki outlines failed: ${e.message}`), []));
      // The city's outlines at this street address (the house, its garage…; "1 A" may be listed as just "1"),
      // else the ones at the address point.
      const street = String(g.address.road || "").toLowerCase(), no = String(g.address.house_number || "").replace(/\s+/g, "").toLowerCase();
      const lead = (n) => (n.match(/^\d+/) || [""])[0];
      const at = tm35(g.lat, g.lon), pt = { x: at.E - E0, y: at.N - N0 };
      const onStreet = no ? list.filter((x) => x.street === street) : [];
      let cands = onStreet.filter((x) => x.no === no);
      if (!cands.length) cands = onStreet.filter((x) => lead(x.no) && lead(x.no) === lead(no));
      if (!cands.length) cands = list.filter((x) => geo.distToPolygon(pt, rel(x.ring)) < 5);
      let best = null;
      for (const x of cands) {
        const C = rel(x.ring), fit = geo.overlap(M, C), area = geo.polygonArea(C);
        if (fit == null) continue;
        if (!best || (best.fit < 0.3 && fit < 0.3 ? area > best.area : fit > best.fit)) best = { fit, area, ring: x.ring };
      }
      // A semi-detached house is one model but two city outlines: a model bigger than the outline is not out of date.
      if (best) return { off: best.fit < 0.8 && geo.polygonArea(M) < 0.95 * best.area, fit: best.fit, ring: best.ring };
    }
    const year = Number(((b.id || "").match(/_((?:19|20)\d\d)_/) || [])[1]) || Number(String(b.created || "").slice(0, 4)) || null;
    const completed = reg && Number(reg.completed);
    if (year && completed && completed > year) return { off: true, year, completed };
    return null;
  }

  /**
   * The measured 3D building: its real outline, wall heights and roof. The size warnings about the map box no longer
   * apply; the website sends model.id back with the order and the server prices the walls from its own copy.
   */
  function applyModel(result, model, g, notes, noteCodes) {
    const b = model.building;
    const [E0, N0] = b.outline[0];
    const pts = b.outline.map(([x, y]) => ({ x: x - E0, y: y - N0 }));
    const rect = geo.minRect(pts);
    if (!rect) return;
    const walls = b.walls || [];
    const eaves = walls.filter((w) => !w.gable && w.len >= 2);
    const eaveLen = eaves.reduce((a, w) => a + w.len, 0);
    const eave = eaveLen ? eaves.reduce((a, w) => a + w.eave * w.len, 0) / eaveLen : null;
    const roofs = (b.roofs || []).filter((r) => r.plan > 2);
    const plan = roofs.reduce((a, r) => a + r.plan, 0);
    const pitch = plan ? roofs.reduce((a, r) => a + r.slope * r.plan, 0) / plan : null;
    if (eave) result.house.eave = Math.min(12, Math.max(2, Math.round(eave * 10) / 10));
    if (pitch != null) result.house.pitch = Math.min(60, Math.round(pitch));
    // The measured roof surfaces beat the roof-type code: under 5° the roof is flat whatever the code says.
    const rt = pitch != null && pitch < 5 ? "flat" : roofTypeOf(b.roofType);
    if (rt) { result.house.roofType = rt; result.details.roofSource = "NLS 3D model"; }
    result.details.eaveSource = "NLS 3D model";
    result.house.length = Math.round(rect.length * 10) / 10;
    result.house.width = Math.round(rect.width * 10) / 10;
    result.details.sizeSource = "NLS 3D model";
    result.details.footprintM2 = Math.round(geo.polygonArea(pts));
    result.details.rectangularity = Math.round((geo.polygonArea(pts) / rect.area) * 100) / 100;
    result.details.ridgeBearingDeg = Math.round(rect.angleDeg);
    result.details.outline = geo.orientOutline(pts, rect.angleDeg);
    delete result.details.simpleOutline;
    const perimeter = walls.reduce((a, w) => a + w.len, 0);
    result.model = {
      id: b.id, lat: g.lat, lon: g.lon, sheet: model.sheet,
      date: (model.modelDate || b.created || "").slice(0, 10) || null,
      walls,
      perimeterM: Math.round(perimeter * 10) / 10,
      corners: b.outline.length,
      eaveMin: eaves.length ? Math.min(...eaves.map((w) => w.eave)) : null,
      eaveMax: eaves.length ? Math.max(...eaves.map((w) => w.eave)) : null,
      ridge: walls.length ? Math.max(...walls.map((w) => w.top)) : b.height,
      height: b.height
    };
    // The measured shape answers the map's size questions.
    const drop = new Set(["not_rectangle", "size_mismatch", "size_estimated", "roof_assumed"]);
    for (let i = noteCodes.length - 1; i >= 0; i--) if (drop.has(noteCodes[i].code)) { noteCodes.splice(i, 1); notes.splice(i, 1); }
  }

  /** Coordinates only (for the office map), or null. */
  async function point(text) {
    try {
      const g = await geocode(String(text || "").trim().slice(0, 200));
      return g && Number.isFinite(g.lat) && Number.isFinite(g.lon) ? { lat: g.lat, lon: g.lon } : null;
    } catch {
      return null;
    }
  }

  return { lookup, point, _internals: { pickBuilding, zoneFor, roofFromTags, shortAddress, ringFromGeojson } };
}

module.exports = { createAddressService };
