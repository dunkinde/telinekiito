"use strict";
// Address -> house size from open data:
//   1. Nominatim (OpenStreetMap) geocodes the address. In Finland the address is often tagged on the
//      building itself, and then Nominatim returns its outline directly.
//   2. Otherwise Overpass (OpenStreetMap) lists the buildings around the address point. Public Overpass
//      servers are often busy, so several are tried in turn.
//   3. Last map fallback: Nominatim reverse lookup of the building at the address point.
//   4. Ryhti (national building register, Syke) gives floors, floor area and year built. If no outline
//      was found at all, the size is estimated from the register floor area and clearly marked.
// Heights from 3D city models / laser data are a later step; eave height is estimated from floors.
const geo = require("./geo");

const UA = process.env.CONTACT_UA || "Telinekiito-MVP/0.1 (scaffolding quotes)";
const NOMINATIM = (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search").replace(/\/search$/, "");
const OVERPASS = (
  process.env.OVERPASS_URL ||
  "https://overpass.private.coffee/api/interpreter,https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter"
).split(",").map((s) => s.trim()).filter(Boolean);
const RYHTI =
  process.env.RYHTI_URL ||
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_building/items";

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

    const notes = [];
    const g = await geocode(key);
    if (!g) return { found: false, reason: "address_not_found" };
    const houseLevel = Boolean(g.address.house_number) || g.category === "building";
    if (!houseLevel) notes.push("The address matched a street, not a house number. Check that the right building was found.");

    const { picked, failed } = await findOutline(g);

    const result = {
      found: true,
      match: { display: g.display, short: shortAddress(g.address, g.display), houseLevel, lat: g.lat, lon: g.lon },
      zone: zoneFor(g.address),
      house: { length: null, width: null, floors: null, roofType: null, pitch: null, eave: null },
      details: {},
      notes
    };

    let center = { lat: g.lat, lon: g.lon };
    let regFailed = false;
    if (picked) {
      const rect = geo.minRect(picked.pts);
      if (rect) {
        result.house.length = Math.round(rect.length * 10) / 10;
        result.house.width = Math.round(rect.width * 10) / 10;
        result.details.sizeSource = "OpenStreetMap";
        result.details.footprintM2 = Math.round(picked.area);
        result.details.rectangularity = Math.round((picked.area / rect.area) * 100) / 100;
        result.details.ridgeBearingDeg = Math.round(rect.angleDeg);
        result.details.outline = geo.orientOutline(picked.pts, rect.angleDeg);
        if (picked.area / rect.area < 0.8) notes.push("The building is not a simple rectangle (L-shape or extensions). The size is its outer box, so check it.");
      }
      result.details.osmType = picked.way.osmType || "way";
      result.details.osmWayId = picked.way.id;
      result.details.buildingTag = picked.tag;
      if (picked.minor) notes.push("The nearest building looks like an outbuilding. Check that this is the house.");
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
          if (reg.storeys >= 3) notes.push("The register lists " + reg.storeys + " storeys. This tool handles houses up to 2 storeys; the office will check.");
        }
      }
    } catch (e) {
      log(`register failed: ${e.message}`);
      regFailed = true;
      notes.push("The building register couldn't be reached right now.");
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
        notes.push("The size is estimated from the floor area in the building register, not measured. Check length and width.");
      }
    }
    if (!result.house.length) {
      notes.push(failed ? "The map service is busy right now. Try again in a minute, or enter the size by hand." : "No building outline was found at this address. Enter the size by hand.");
    }
    if (!result.house.floors) notes.push("Number of floors wasn't found. Choose it below.");
    if (!result.house.roofType) notes.push("Roof shape isn't in the open data, so a gable roof is assumed.");

    // Don't keep a result that is incomplete only because a service was down.
    if (!regFailed && !(failed && result.details.sizeSource !== "OpenStreetMap")) {
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value: result });
    }
    return result;
  }

  return { lookup, _internals: { pickBuilding, zoneFor, roofFromTags, shortAddress, ringFromGeojson } };
}

module.exports = { createAddressService };
