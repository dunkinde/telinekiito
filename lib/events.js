"use strict";
// Anonymous, cookie-free visit statistics for the sales funnel.
// The website sends a small fixed set of events with a random per-visit id (kept in sessionStorage, never a cookie).
// The id is only used in memory to count each event once per visit; the database keeps daily counts by
// event, source (utm / referrer domain / landing path), delivery zone, job type and weather option – no ids,
// no IP addresses, no personal data.
const { HttpError } = require("./orders");

const EVENTS = [
  "calculator_opened", "address_looked_up", "model_found", "price_shown", "step_job", "step_timing", "step_contact",
  "order_placed", "tracking_opened", "view_3d_opened", "weather_option_ticked"
];
/** The funnel steps in order; the other events are shown beside it. */
const FUNNEL = ["calculator_opened", "address_looked_up", "price_shown", "step_job", "step_timing", "step_contact", "order_placed"];
const SIDE = ["model_found", "view_3d_opened", "weather_option_ticked", "tracking_opened"];
const ZONES = ["A", "B", "C"];
const JOBS = ["roof", "facade", "roof_facade", "gutters"];
const DIMS = ["source", "campaign", "referrer", "landing", "zone", "job", "weather"];

/** A utm value: short, plain characters only; anything that could be an email, phone or id is dropped. */
function utm(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase().slice(0, 60);
  if (!s || !/^[a-z0-9._+\- ]+$/.test(s) || /\d{5,}/.test(s)) return "";
  return s.replace(/ +/g, "_");
}
/** Referrer domain only (no path or query); our own site doesn't count as a referrer. */
function refDomain(v, ownHost) {
  let s = String(v == null ? "" : v).trim().toLowerCase().slice(0, 300);
  if (!s) return "";
  if (s.includes("://")) {
    try { s = new URL(s).hostname; } catch { return ""; }
  }
  s = s.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || s.length > 80) return "";
  const own = String(ownHost || "").toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  return s === own ? "" : s;
}
/** Landing page path without query or hash. */
function landing(v) {
  const s = String(v == null ? "" : v).split(/[?#]/)[0].trim().toLowerCase();
  if (!s.startsWith("/") || s.length > 80 || !/^\/[a-z0-9/._-]*$/.test(s) || /\d{5,}/.test(s)) return "";
  return s;
}

/** Checks one event from the website; throws 400 for an unknown event or a malformed visit id. */
function parseEvent(body, { ownHost } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const event = String(b.event || "");
  if (!EVENTS.includes(event)) throw new HttpError(400, "bad_event", "Unknown event.");
  const vid = String(b.vid || "");
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(vid)) throw new HttpError(400, "bad_visit", "Missing visit id.");
  return {
    event,
    vid,
    dims: {
      source: utm(b.utm_source),
      campaign: utm(b.utm_campaign),
      referrer: refDomain(b.referrer, ownHost),
      landing: landing(b.landing),
      zone: ZONES.includes(b.zone) ? b.zone : "",
      job: JOBS.includes(b.job) ? b.job : "",
      weather: b.weather === true ? "1" : b.weather === false ? "0" : ""
    }
  };
}

/**
 * Counts events once per visit and day. `today()` gives the day (Helsinki). The visit ids live only in memory
 * (a restart forgets them) and are capped so a flood of fake ids can't grow memory without limit.
 */
function createEventCounter(store, { today, maxVisits = 200000 } = {}) {
  let day = "", seen = new Set();
  return function record(ev) {
    const d = today();
    if (d !== day) {
      day = d;
      seen = new Set();
    }
    const key = `${ev.vid}|${ev.event}`;
    if (seen.has(key)) return false;
    if (seen.size >= maxVisits) return false;
    seen.add(key);
    store.countEvent(d, ev.event, ev.dims);
    return true;
  };
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** The "Myyntisuppilo" report from the daily rows of a period. */
function funnelReport(rows, { from, to }) {
  const sum = (filter) => rows.reduce((n, r) => n + (filter(r) ? r.n : 0), 0);
  const tot = {};
  for (const e of EVENTS) tot[e] = 0;
  for (const r of rows) if (r.event in tot) tot[r.event] += r.n;

  const start = tot[FUNNEL[0]];
  const steps = FUNNEL.map((event, k) => ({
    event,
    visits: tot[event],
    ofPrev: k ? pct(tot[event], tot[FUNNEL[k - 1]]) : null,
    ofStart: pct(tot[event], start)
  }));

  // Source: the campaign's utm_source, else the referring site, else direct (typed address, bookmark, app).
  const bySourceMap = new Map();
  for (const r of rows) {
    const kind = r.source ? "utm" : r.referrer ? "referrer" : "direct";
    const source = r.source || r.referrer || "";
    const k = `${kind}|${source}|${r.campaign}`;
    if (!bySourceMap.has(k)) bySourceMap.set(k, { kind, source, campaign: r.campaign, opened: 0, quotes: 0, orders: 0 });
    const x = bySourceMap.get(k);
    if (r.event === "calculator_opened") x.opened += r.n;
    if (r.event === "price_shown") x.quotes += r.n;
    if (r.event === "order_placed") x.orders += r.n;
  }
  const bySource = [...bySourceMap.values()]
    .filter((x) => x.opened || x.quotes || x.orders)
    .map((x) => ({ ...x, conv: pct(x.orders, x.opened) }))
    .sort((a, b) => b.opened - a.opened || b.orders - a.orders);

  // Zone is known once the price is shown; the job once it's chosen (step_timing comes after the job step).
  const byZone = ZONES.map((zone) => {
    const c = (e) => sum((r) => r.event === e && r.zone === zone);
    const quotes = c("price_shown"), orders = c("order_placed");
    return { zone, quotes, contact: c("step_contact"), orders, conv: pct(orders, quotes) };
  });
  const byJob = JOBS.map((job) => {
    const c = (e) => sum((r) => r.event === e && r.job === job);
    const chosen = c("step_timing"), orders = c("order_placed");
    return { job, chosen, contact: c("step_contact"), orders, conv: pct(orders, chosen) };
  });

  const ordersWithWeather = sum((r) => r.event === "order_placed" && r.weather === "1");
  const weather = {
    quotes: tot.price_shown,
    ticked: tot.weather_option_ticked,
    tickedPct: pct(tot.weather_option_ticked, tot.price_shown),
    orders: tot.order_placed,
    ordersWithWeather,
    ordersPct: pct(ordersWithWeather, tot.order_placed)
  };

  const landMap = new Map();
  for (const r of rows) {
    if (!r.landing || (r.event !== "calculator_opened" && r.event !== "order_placed")) continue;
    const x = landMap.get(r.landing) || { path: r.landing, opened: 0, orders: 0 };
    if (r.event === "calculator_opened") x.opened += r.n;
    else x.orders += r.n;
    landMap.set(r.landing, x);
  }
  const landings = [...landMap.values()].sort((a, b) => b.opened - a.opened || b.orders - a.orders).slice(0, 10);

  const side = Object.fromEntries(SIDE.map((e) => [e, tot[e]]));
  return { from, to, steps, side, bySource, byZone, byJob, weather, landings };
}

module.exports = { EVENTS, FUNNEL, SIDE, DIMS, parseEvent, createEventCounter, funnelReport, utm, refDomain, landing };
