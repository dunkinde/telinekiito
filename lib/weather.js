"use strict";
// Wind forecasts for sites with scaffolding up or about to go up, from the Finnish Meteorological Institute's
// open data (opendata.fmi.fi, no key needed). Results are cached for an hour per location.
const QUERIES = [
  "fmi::forecast::harmonie::surface::point::simple",
  "fmi::forecast::edited::weather::scandinavia::point::simple"
];

function parse(xml) {
  const out = {};
  const re = /<BsWfs:BsWfsElement[\s\S]*?<BsWfs:Time>([^<]+)<\/BsWfs:Time>[\s\S]*?<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>[\s\S]*?<BsWfs:ParameterValue>([^<]+)<\/BsWfs:ParameterValue>/g;
  let m;
  while ((m = re.exec(xml))) {
    const v = Number(m[3]);
    if (!Number.isFinite(v)) continue;
    (out[m[1]] = out[m[1]] || {})[m[2]] = v;
  }
  return Object.entries(out)
    .map(([time, p]) => ({ time, wind: p.WindSpeedMS, gust: p.WindGust }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function createWeather({ fetchImpl = globalThis.fetch } = {}) {
  const cache = new Map();
  let last = { ok: null, at: null, error: "" };

  /** Hourly wind and gusts for the next `hours` hours at a point. */
  async function forecast(lat, lon, hours = 48) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 3600e3) return hit.data;
    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + hours * 3600e3);
    let error = "";
    for (const q of QUERIES) {
      const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=${encodeURIComponent(q)}` +
        `&latlon=${lat.toFixed(4)},${lon.toFixed(4)}&parameters=WindSpeedMS,WindGust&timestep=60` +
        `&starttime=${start.toISOString()}&endtime=${end.toISOString()}`;
      try {
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(12000) });
        const text = await r.text();
        if (!r.ok || text.includes("ExceptionReport")) throw new Error(`FMI ${r.status}`);
        const series = parse(text);
        if (!series.length) throw new Error("FMI returned no data");
        const data = { series, maxWind: Math.max(...series.map((s) => s.wind || 0)), maxGust: Math.max(...series.map((s) => s.gust || s.wind || 0)) };
        const peak = series.find((s) => (s.gust || s.wind || 0) === data.maxGust);
        data.peakAt = peak && peak.time;
        cache.set(key, { at: Date.now(), data });
        last = { ok: true, at: new Date().toISOString(), error: "" };
        return data;
      } catch (e) {
        error = e.message;
      }
    }
    last = { ok: false, at: new Date().toISOString(), error };
    throw new Error(error || "Weather lookup failed");
  }

  return { forecast, health: () => last };
}

module.exports = { createWeather, parse };
