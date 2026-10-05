"use strict";
// Live scaffold stock. The owner enters how many of each part the company owns. Every order that isn't finished
// or cancelled holds its parts list (from the quote) for its rental dates: from delivery to return, plus a buffer
// day to check and reload the parts. From that we know, for any day, how many of each part are free, and the
// website can refuse dates that would oversell. Crew capacity (jobs per crew per day) is checked the same way.
const E = require("./engine");

const HOLDS_STOCK = new Set(["received", "confirmed", "loading", "en_route", "erected", "pickup_requested"]);
const OUT_ON_SITE = new Set(["loading", "en_route", "erected", "pickup_requested"]);
const PART_KEYS = E.PARTS.map((p) => p.key);

const addDays = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const zeroParts = () => Object.fromEntries(PART_KEYS.map((k) => [k, 0]));

function defaultStock() {
  return { enabled: false, owned: zeroParts(), prices: zeroParts(), bufferDays: 1, lowWarnPct: 15 };
}

function mergeStock(over) {
  const s = defaultStock();
  if (!over || typeof over !== "object") return s;
  s.enabled = Boolean(over.enabled);
  for (const k of PART_KEYS) {
    const o = Number(over.owned && over.owned[k]);
    if (Number.isFinite(o) && o >= 0 && o < 1e6) s.owned[k] = Math.round(o);
    const p = Number(over.prices && over.prices[k]);
    if (Number.isFinite(p) && p >= 0 && p < 1e5) s.prices[k] = Math.round(p * 100) / 100;
  }
  const b = Number(over.bufferDays);
  if (Number.isFinite(b) && b >= 0 && b <= 7) s.bufferDays = Math.round(b);
  const w = Number(over.lowWarnPct);
  if (Number.isFinite(w) && w >= 0 && w <= 100) s.lowWarnPct = Math.round(w);
  return s;
}

/** The days an order holds its parts: [from, to] inclusive, YYYY-MM-DD. */
function holdInterval(o, bufferDays, today) {
  const a = o.assignment || {};
  const from = a.date || (o.schedule && o.schedule.start);
  if (!from) return null;
  let to;
  if (o.rental && o.rental.endedAt) to = o.rental.endedAt.slice(0, 10);
  else if (a.pickupDate) to = a.pickupDate;
  else to = addDays(from, Math.max(1, Number(o.schedule && o.schedule.days) || 28));
  // Still on site after the planned end: the parts are out until they come back.
  if (OUT_ON_SITE.has(o.status) && today && to < today) to = today;
  return { from, to: addDays(to, bufferDays) };
}

const partsOf = (o) => (o.estimate && o.estimate.parts) || zeroParts();

/** Parts in use on each day of [from, to], from all orders that hold stock (optionally leaving one order out). */
function usageByDay(orders, stock, from, to, { exceptRef, today } = {}) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const used = Object.fromEntries(days.map((d) => [d, zeroParts()]));
  for (const o of orders) {
    if (o.ref === exceptRef || !HOLDS_STOCK.has(o.status)) continue;
    const iv = holdInterval(o, stock.bufferDays, today);
    if (!iv || iv.to < from || iv.from > to) continue;
    const p = partsOf(o);
    for (const d of days) {
      if (d < iv.from || d > iv.to) continue;
      for (const k of PART_KEYS) used[d][k] += Number(p[k]) || 0;
    }
  }
  return { days, used };
}

/** Can `need` be supplied for every day of [from, to]? Returns the shortfall per part when not. */
function check(orders, stock, need, from, to, opts = {}) {
  if (!stock.enabled) return { ok: true, checked: false, short: {} };
  const { days, used } = usageByDay(orders, stock, from, to, opts);
  const short = {};
  for (const d of days) {
    for (const k of PART_KEYS) {
      const free = stock.owned[k] - used[d][k];
      const missing = (Number(need[k]) || 0) - free;
      if (missing > 0) short[k] = Math.max(short[k] || 0, missing);
    }
  }
  return { ok: Object.keys(short).length === 0, checked: true, short };
}

/* ---------- Crew capacity ---------- */
/** Deliveries and pickups booked on a day (orders without a crew yet count on their start date). */
function jobsOn(orders, day, exceptRef) {
  let n = 0;
  for (const o of orders) {
    if (o.ref === exceptRef || !HOLDS_STOCK.has(o.status)) continue;
    const a = o.assignment || {};
    if ((a.date || o.schedule.start) === day && !OUT_ON_SITE.has(o.status)) n++;
    if (a.pickupDate === day) n++;
  }
  return n;
}

function capacityPerDay(ops, crews) {
  const active = (crews || []).filter((c) => c.active !== false).length;
  if (!active) return Infinity; // no crews set up yet: don't block orders
  return active * (Number(ops && ops.jobsPerCrewDay) || 2);
}

/**
 * First start date on or after `baseline` with enough parts for the whole rental and a free crew slot.
 * Searches 120 days ahead; null if nothing fits.
 */
function earliestStart(orders, stock, ops, crews, need, days, baseline, today) {
  const cap = capacityPerDay(ops, crews);
  for (let i = 0, d = baseline; i < 120; i++, d = addDays(d, 1)) {
    if (cap !== Infinity && jobsOn(orders, d) >= cap) continue;
    const end = addDays(d, Math.max(1, days) + stock.bufferDays);
    if (check(orders, stock, need, d, end, { today }).ok) return d;
  }
  return null;
}

/* ---------- Office overview ---------- */
function overview(orders, stock, today, horizon = 60) {
  const end = addDays(today, horizon - 1);
  const { days, used } = usageByDay(orders, stock, today, end, { today });
  const onSite = zeroParts(), reserved = zeroParts();
  const holders = [];
  for (const o of orders) {
    if (!HOLDS_STOCK.has(o.status)) continue;
    const p = partsOf(o);
    const target = OUT_ON_SITE.has(o.status) ? onSite : reserved;
    for (const k of PART_KEYS) target[k] += Number(p[k]) || 0;
    const iv = holdInterval(o, stock.bufferDays, today);
    holders.push({ ref: o.ref, status: o.status, address: o.site && o.site.address, from: iv && iv.from, to: iv && iv.to, parts: p, onSite: OUT_ON_SITE.has(o.status) });
  }
  const parts = E.PARTS.map((p) => {
    const owned = stock.owned[p.key];
    const series = days.map((d) => owned - used[d][p.key]);
    const minFree = Math.min(...series);
    return {
      key: p.key, name: p.name, kg: p.kg, owned, price: stock.prices[p.key],
      onSite: onSite[p.key], reserved: reserved[p.key],
      freeToday: series[0], minFree, minFreeOn: days[series.indexOf(minFree)],
      low: owned > 0 && minFree <= (owned * stock.lowWarnPct) / 100
    };
  });
  return {
    enabled: stock.enabled, bufferDays: stock.bufferDays, lowWarnPct: stock.lowWarnPct, today, days,
    free: days.map((d) => Object.fromEntries(PART_KEYS.map((k) => [k, stock.owned[k] - used[d][k]]))),
    parts, holders: holders.sort((a, b) => String(a.from).localeCompare(String(b.from)))
  };
}

module.exports = {
  HOLDS_STOCK, OUT_ON_SITE, PART_KEYS, addDays, zeroParts, defaultStock, mergeStock, holdInterval,
  usageByDay, check, jobsOn, capacityPerDay, earliestStart, overview
};
