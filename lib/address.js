"use strict";
// Address -> house size from open data:
//   1. Nominatim (OpenStreetMap) geocodes the address.
//   2. Overpass (OpenStreetMap) gives the building outline -> length and width.
//   3. Ryhti (national building register, Syke) gives the number of floors.
// Heights from 3D city models / laser data are a later step; eave height is estimated from floors.
const geo = require("./geo");

const UA = process.env.CONTACT_UA || "Telinekiito-MVP/0.1 (scaffolding quotes)";
const NOMINATIM = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const RYHTI =
  process.env.RYHTI_URL ||
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_building/items";

const MINOR = /^(garage|garages|shed|carport|hut|roof|greenhouse|kiosk|service|outbuilding|sauna|storage_tank|cabin)$/;
const ZONE_A = ["helsinki", "helsingfors", "espoo", "esbo", "vantaa", "vanda", "kauniainen", "grankulla"];

function createAddressService(opts = {}) {
  const doFetch = opts.fetchImpl || fetch;
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

  async function geocode(text) {
    const params = new URLSearchParams({ q: text, format: "jsonv2", limit: "1", countrycodes: "fi", addressdetails: "1" });
    if (process.env.NOMINATIM_EMAIL) params.set("email", process.env.NOMINATIM_EMAIL);
    const r = await throttled(() =>
      fetchJson(`${NOMINATIM}?${params}`, { headers: { "User-Agent": UA, "Accept-Language": "fi" } })
    );
    if (!Array.isArray(r) || !r.length) return null;
    const g = r[0];
    return {
      lat: Number(g.lat),
      lon: Number(g.lon),
      osmType: g.osm_type,
      osmId: Number(g.osm_id),
      category: g.category || g.class,
      display: g.display_name,
      address: g.address || {}
    };
  }

  async function buildingsNear(lat, lon, radius) {
    const q = `[out:json][timeout:20];way(around:${radius},${lat.toFixed(7)},${lon.toFixed(7)})[building];out tags geom;`;
    const r = await fetchJson(
      OVERPASS,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: "data=" + encodeURIComponent(q)
      },
      25000
    );
    return (r.elements || []).filter((e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 4);
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
        isGeocoded: g.osmType === "way" && Number(w.id) === g.osmId
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

  async function registerInfo(centerLat, centerLon, ring) {
    const dLat = 0.0006, dLon = 0.0012;
    const bbox = [centerLon - dLon, centerLat - dLat, centerLon + dLon, centerLat + dLat].map((v) => v.toFixed(6)).join(",");
    const url = `${RYHTI}?${new URLSearchParams({ bbox, limit: "200", f: "application/geo+json" })}`;
    const r = await fetchJson(url, { headers: { Accept: "application/geo+json", "User-Agent": UA } });
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
      if (!best || d < best.d) best = { d, f };
    }
    if (!best || best.d > 20) return null;
    const p = best.f.properties;
    return {
      storeys: Number.isFinite(Number(p.number_of_storeys)) ? Number(p.number_of_storeys) : null,
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

    let picked = null;
    try {
      picked = pickBuilding(await buildingsNear(g.lat, g.lon, 45), g);
    } catch (e) {
      notes.push("Map outlines couldn't be loaded right now.");
    }

    const result = {
      found: true,
      match: { display: g.display, houseLevel, lat: g.lat, lon: g.lon },
      zone: zoneFor(g.address),
      house: { length: null, width: null, floors: null, roofType: null, pitch: null, eave: null },
      details: {},
      notes
    };

    let center = { lat: g.lat, lon: g.lon };
    if (picked) {
      const rect = geo.minRect(picked.pts);
      if (rect) {
        result.house.length = Math.round(rect.length * 10) / 10;
        result.house.width = Math.round(rect.width * 10) / 10;
        result.details.footprintM2 = Math.round(picked.area);
        result.details.rectangularity = Math.round((picked.area / rect.area) * 100) / 100;
        result.details.ridgeBearingDeg = Math.round(rect.angleDeg);
        if (picked.area / rect.area < 0.8) notes.push("The building is not a simple rectangle (L-shape or extensions). The size is its outer box, so check it.");
      }
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
    } else {
      notes.push("No building outline was found at this address. Enter the size by hand.");
    }

    try {
      const reg = await registerInfo(center.lat, center.lon, picked ? picked.ring : null);
      if (reg && reg.storeys) {
        result.house.floors = reg.storeys >= 2 ? "2" : "1";
        result.details.floorsSource = "Building register (Ryhti)";
        result.details.register = reg;
        if (reg.storeys >= 3) notes.push("The register lists " + reg.storeys + " storeys. This tool handles houses up to 2 storeys; the office will check.");
      }
    } catch (e) {
      notes.push("The building register couldn't be reached right now.");
    }
    if (!result.house.floors) notes.push("Number of floors wasn't found. Choose it below.");
    if (!result.house.roofType) notes.push("Roof shape isn't in the open data. Gable is assumed; change it if needed.");

    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value: result });
    return result;
  }

  return { lookup, _internals: { pickBuilding, zoneFor, roofFromTags } };
}

module.exports = { createAddressService };
