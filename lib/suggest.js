"use strict";
// Address suggestions while typing, from the National Land Survey's geocoding service (official addresses with
// postal codes). Uses the same key as the 3D buildings (NLS_API_KEY); without it there are no suggestions.
const URL_SEARCH = "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search";
const MAX = 6;

/** "Päätie 39, 0059" → "0059": a postal code (or its start) typed after the street, used to sort the matches. */
function typedPostcode(q) {
  const m = /(?:^|[\s,])(\d{3,5})(?:\s|,|$)/g;
  let last = null, hit;
  const parts = q.split(",");
  if (parts.length < 2) return null;
  while ((hit = m.exec(parts.slice(1).join(",")))) last = hit[1];
  return last;
}

/** One line per address: same street, number and postal code only once (the service lists Finnish and Swedish rows). */
function toSuggestions(features, q) {
  const seen = new Set(), out = [];
  for (const f of features || []) {
    const p = f.properties || {};
    if (!p.katunimi) continue;
    const key = [p.katunimi, p.katunumero || "", p.postinumero || ""].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const [lon, lat] = (f.geometry && f.geometry.coordinates) || [];
    const street = [p.katunimi, p.katunumero].filter(Boolean).join(" ");
    const city = p.kuntanimiFin || p["label:municipality"] || "";
    out.push({
      label: [street, [p.postinumero, city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      street, postcode: p.postinumero || "", city,
      lat: Number.isFinite(lat) ? Math.round(lat * 1e6) / 1e6 : null,
      lon: Number.isFinite(lon) ? Math.round(lon * 1e6) / 1e6 : null
    });
  }
  // The service ignores a typed postal code and doesn't always favour a typed town ("vene 7 ham"): those go first.
  const pc = typedPostcode(q);
  const words = q.toLowerCase().split(/[\s,]+/).slice(1).filter((w) => /^\p{L}{2,}$/u.test(w));
  const score = (s) => (pc && s.postcode.startsWith(pc) ? 2 : 0) + (words.some((w) => s.city.toLowerCase().startsWith(w)) ? 1 : 0);
  out.sort((a, b) => score(b) - score(a));
  return out.slice(0, MAX);
}

function createSuggest({ apiKey, fetchImpl = fetch, log = () => {} } = {}) {
  const enabled = Boolean(apiKey);
  const cache = new Map();
  async function suggest(text) {
    const q = String(text || "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!enabled || q.length < 3) return [];
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 3600e3) return hit.list;
    try {
      const url = `${URL_SEARCH}?text=${encodeURIComponent(q)}&sources=addresses&lang=fin&size=20&api-key=${encodeURIComponent(apiKey)}`;
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = toSuggestions((await r.json()).features, q);
      if (cache.size > 1000) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), list });
      return list;
    } catch (e) {
      log(`suggest failed: ${e.message}`);
      return [];
    }
  }
  return { enabled, suggest };
}

module.exports = { createSuggest, toSuggestions, typedPostcode };
