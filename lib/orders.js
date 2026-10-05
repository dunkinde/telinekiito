"use strict";
// Order rules shared by the API: validation, server-side pricing, customer and office actions.
const crypto = require("node:crypto");
const E = require("./engine");

const STATUS_KEYS = E.STATUSES.map((s) => s.key);

class HttpError extends Error {
  constructor(status, code, message, info) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.info = info || null;
  }
}

// "Now" as a local Date whose fields are Helsinki wall-clock time, whatever the server timezone.
function helsinkiNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
}
function helsinkiDay(offsetDays) {
  const d = helsinkiNow();
  d.setDate(d.getDate() + offsetDays);
  return E.toISODate(d);
}

function mergePricing(over) {
  const p = JSON.parse(JSON.stringify(E.DEFAULT_PRICING));
  if (!over || typeof over !== "object") return p;
  for (const k of ["rentPerM2Day", "minRentDays", "erectPerM2", "dismantlePerM2", "catchPerMetre", "extraLevelPerM", "truckCapacityKg", "minOrder", "vat", "rangePct"]) {
    const v = Number(over[k]);
    if (Number.isFinite(v) && v >= 0) p[k] = v;
  }
  for (const z of ["A", "B", "C"]) {
    const v = Number(over.zones && over.zones[z] && over.zones[z].trip);
    if (Number.isFinite(v) && v >= 0) p.zones[z].trip = v;
  }
  for (const u of ["express", "emergency"]) {
    const v = Number(over.urgency && over.urgency[u] && over.urgency[u].pct);
    if (Number.isFinite(v) && v >= 0) p.urgency[u].pct = v;
  }
  return p;
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const digits = (v) => String(v || "").replace(/\D/g, "");
function num(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

function parseOrderInput(b) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the order as JSON.");
  const f = {
    length: num(b.length, 3, 60),
    width: num(b.width, 3, 40),
    eave: num(b.eave, 2, 12),
    floors: ["1", "1.5", "2"].includes(String(b.floors)) ? String(b.floors) : null,
    roofType: ["gable", "hip", "flat"].includes(b.roofType) ? b.roofType : null,
    pitch: num(b.pitch, 0, 60),
    jobType: Object.keys(E.JOB_TYPES).includes(b.jobType) ? b.jobType : null,
    gables: Boolean(b.gables),
    zone: ["A", "B", "C"].includes(b.zone) ? b.zone : null,
    urgency: ["standard", "express", "emergency"].includes(b.urgency) ? b.urgency : null,
    start: /^\d{4}-\d{2}-\d{2}$/.test(String(b.start || "")) ? String(b.start) : null,
    days: num(b.days, 1, 365),
    name: str(b.name, 100),
    phone: str(b.phone, 40),
    email: str(b.email, 120),
    address: str(b.address, 200),
    notes: str(b.notes, 1000),
    source: ["form", "address", "ai"].includes(b.source) ? b.source : "form",
    lang: b.lang === "en" ? "en" : "fi",
    geo: geoOf(b.lat, b.lon),
    partnerCode: str(b.partnerCode, 12)
  };
  const missing = [];
  for (const k of ["length", "width", "eave", "floors", "roofType", "pitch", "jobType", "zone", "urgency", "start", "days"]) {
    if (f[k] === null) missing.push(k);
  }
  if (missing.length) throw new HttpError(400, "invalid_fields", "Check these fields: " + missing.join(", "), { fields: missing });
  if (!f.address) throw new HttpError(400, "address_required", "Add the site address.");
  if (!f.name) throw new HttpError(400, "name_required", "Add your name.");
  if (digits(f.phone).length < 6) throw new HttpError(400, "phone_required", "Add a phone number the crew can call.");
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) throw new HttpError(400, "email_invalid", "Check the email address.");
  const earliest = E.earliestStart(f.urgency, helsinkiNow());
  if (f.start < earliest) throw new HttpError(400, "start_too_early", "The earliest start for this option is " + earliest + ".", { date: earliest });
  if (f.roofType !== "gable" || f.jobType !== "roof") f.gables = false;
  if (f.roofType === "flat") f.pitch = 0;
  f.days = Math.round(f.days);
  return f;
}

// A price without an order: house + job + timing only. Used by the website's live price.
function parseQuoteInput(b) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the house as JSON.");
  const f = {
    length: num(b.length, 3, 60),
    width: num(b.width, 3, 40),
    eave: num(b.eave, 2, 12),
    roofType: ["gable", "hip", "flat"].includes(b.roofType) ? b.roofType : null,
    pitch: num(b.pitch, 0, 60),
    jobType: Object.keys(E.JOB_TYPES).includes(b.jobType) ? b.jobType : null,
    gables: Boolean(b.gables),
    zone: ["A", "B", "C"].includes(b.zone) ? b.zone : "A",
    urgency: ["standard", "express", "emergency"].includes(b.urgency) ? b.urgency : "standard",
    days: num(b.days, 1, 365) || 28
  };
  const missing = ["length", "width", "eave", "roofType", "pitch", "jobType"].filter((k) => f[k] === null);
  if (missing.length) throw new HttpError(400, "invalid_fields", "Check these fields: " + missing.join(", "), { fields: missing });
  if (f.roofType !== "gable" || f.jobType !== "roof") f.gables = false;
  if (f.roofType === "flat") f.pitch = 0;
  f.days = Math.round(f.days);
  return f;
}

function quoteFor(f, pricing) {
  const est = E.estimate(houseOf(f));
  return { estimate: compactEstimate(est), quote: E.quote(est, { days: f.days, zone: f.zone, urgency: f.urgency }, pricing) };
}

// Earliest start date for each delivery speed, in Helsinki time.
function earliestDates() {
  const now = helsinkiNow();
  return { standard: E.earliestStart("standard", now), express: E.earliestStart("express", now), emergency: E.earliestStart("emergency", now) };
}

// Prices for a typical house, shown on the website's pricing cards.
const TYPICAL_HOUSE = { length: 15, width: 10, eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: true };
function priceExamples(pricing) {
  const est = E.estimate(TYPICAL_HOUSE);
  const out = { house: { ...TYPICAL_HOUSE, floors: "1" }, days: 28, zone: "A", area: est.totals.area, totals: {} };
  for (const u of ["standard", "express", "emergency"]) out.totals[u] = E.quote(est, { days: 28, zone: "A", urgency: u }, pricing).total;
  return out;
}

// Contact-form message from the website.
function parseLead(b) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the message as JSON.");
  const lead = {
    name: str(b.name, 100),
    email: str(b.email, 120),
    phone: str(b.phone, 40),
    message: str(b.message, 2000),
    lang: b.lang === "en" ? "en" : "fi"
  };
  if (!lead.name) throw new HttpError(400, "name_required", "Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new HttpError(400, "email_invalid", "Check the email address.");
  if (lead.message.length < 2) throw new HttpError(400, "empty_message", "Write a message first.");
  return lead;
}

// Coordinates from the address lookup, kept for the office map (only if they are inside Finland).
function geoOf(lat, lon) {
  const a = Number(lat), o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a > 59 && a < 71 && o > 19 && o < 32.5 ? { lat: Math.round(a * 1e6) / 1e6, lon: Math.round(o * 1e6) / 1e6 } : null;
}

function houseOf(f) {
  return { length: f.length, width: f.width, eave: f.eave, roofType: f.roofType, pitch: f.pitch, jobType: f.jobType, gables: f.gables };
}

function compactEstimate(est) {
  return {
    area: est.totals.area,
    runM: est.totals.runM,
    catchRunM: est.totals.catchRunM,
    extraLevelM: est.totals.extraLevelM,
    weightKg: est.totals.weightKg,
    parts: est.totals.parts,
    sides: est.sides.map((s) => ({
      name: s.name, bays: s.bays, lifts: s.lifts, workH: Math.round(s.workH * 10) / 10, area: Math.round(s.area), catchOn: s.catchOn
    }))
  };
}

function newRef(exists) {
  const rand = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
  for (let i = 0; i < 8; i++) {
    const ref = E.makeRef(rand);
    if (!exists(ref)) return ref;
  }
  throw new HttpError(500, "ref_failed", "Couldn't create an order reference. Try again.");
}

function buildOrder(f, pricing, exists) {
  const est = E.estimate(houseOf(f));
  const quote = E.quote(est, { days: f.days, zone: f.zone, urgency: f.urgency }, pricing);
  const now = new Date().toISOString();
  return {
    ref: newRef(exists),
    createdAt: now,
    updatedAt: now,
    status: "received",
    example: false,
    history: [{ status: "received", at: now, by: "customer" }],
    customer: { name: f.name, phone: f.phone, email: f.email },
    site: { address: f.address, zone: f.zone },
    house: { length: f.length, width: f.width, floors: f.floors, eave: f.eave, roofType: f.roofType, pitch: f.pitch, jobType: f.jobType, gables: f.gables },
    schedule: { start: f.start, days: f.days, urgency: f.urgency },
    estimate: compactEstimate(est),
    quote,
    crew: "",
    eta: "",
    notes: f.notes,
    messages: [],
    source: f.source,
    lang: f.lang || "fi",
    geo: f.geo || null
  };
}

function maskPhone(p) {
  const d = digits(p);
  return d.length >= 4 ? "••• " + d.slice(-4) : "";
}

// What a customer sees on the tracking page.
function publicView(o, extra = {}) {
  const a = o.assignment || {};
  return {
    ref: o.ref, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt, example: !!o.example,
    history: (o.history || []).map((h) => ({ status: h.status, event: h.event, code: h.code, days: h.days, at: h.at, by: h.by === "customer" ? "customer" : h.by ? "office" : undefined })),
    customer: { name: o.customer.name, phone: maskPhone(o.customer.phone) },
    site: o.site, house: o.house, schedule: o.schedule, estimate: { area: o.estimate.area, weightKg: o.estimate.weightKg },
    quote: o.quote, crew: o.crew, eta: o.eta, messages: o.messages, lang: o.lang || "fi",
    plan: { date: a.date || null, time: a.time || "", pickupDate: a.pickupDate || null, pickupTime: a.pickupTime || "" },
    rental: o.rental || {}, cancelled: o.status === "cancelled",
    docs: { confirmation: true, inspection: Boolean(o.rental && o.rental.startedAt) },
    ...extra
  };
}

function phoneMatches(o, last4) {
  const d = digits(last4);
  return d.length === 4 && digits(o.customer && o.customer.phone).slice(-4) === d;
}

function pushHistory(o, entry) {
  o.history = (o.history || []).concat([entry]).slice(-200);
}

function customerAction(o, action, body, pricing) {
  const now = new Date().toISOString();
  if (action === "extend") {
    if (o.status === "dismantled" || o.status === "closed") throw new HttpError(409, "order_finished", "This order is already finished.");
    const days = (Number(o.schedule.days) || 0) + 7;
    if (days > 365) throw new HttpError(409, "too_long", "Contact the office for rentals over a year.");
    const est = { totals: { area: o.estimate.area, catchRunM: o.estimate.catchRunM, extraLevelM: o.estimate.extraLevelM || 0, weightKg: o.estimate.weightKg } };
    o.schedule = { ...o.schedule, days };
    o.quote = E.quote(est, { days, zone: o.site.zone, urgency: o.schedule.urgency }, pricing);
    pushHistory(o, { event: `Rental extended to ${days} days`, code: "extended", days, at: now, by: "customer" });
  } else if (action === "pickup") {
    if (o.status !== "erected") throw new HttpError(409, "not_erected", "Pickup can be requested once the scaffold is up.");
    o.status = "pickup_requested";
    pushHistory(o, { status: "pickup_requested", at: now, by: "customer" });
  } else if (action === "message") {
    const text = str(body && body.text, 1000);
    if (!text) throw new HttpError(400, "empty_message", "Write a message first.");
    o.messages = (o.messages || []).concat([{ from: "customer", text, at: now }]).slice(-200);
  } else {
    throw new HttpError(404, "unknown_action", "Unknown action.");
  }
  o.updatedAt = now;
  return o;
}

function officePatch(o, body) {
  const now = new Date().toISOString();
  if (body.status !== undefined) {
    if (!STATUS_KEYS.includes(body.status)) throw new HttpError(400, "bad_status", "Unknown status.");
    if (body.status !== o.status) {
      o.status = body.status;
      pushHistory(o, { status: body.status, at: now, by: "office" });
    }
  }
  if (body.crew !== undefined) o.crew = str(body.crew, 100);
  if (body.eta !== undefined) o.eta = str(body.eta, 100);
  if (body.message !== undefined) {
    const text = str(body.message, 1000);
    if (text) o.messages = (o.messages || []).concat([{ from: "office", text, at: now }]).slice(-200);
  }
  o.updatedAt = now;
  return o;
}

// Three clearly marked example orders so a fresh install isn't empty.
function exampleOrders(pricing) {
  const H = 3600e3, D = 24 * H, t = Date.now();
  const iso = (ms) => new Date(t + ms).toISOString();
  const defs = [
    {
      ref: "TK-DEMO24", status: "received", created: -1 * H,
      history: [["received", -1 * H, "customer"]],
      customer: { name: "Example: Laine household", phone: "040 000 0124", email: "" },
      site: { address: "Esimerkkitie 4, Espoo", zone: "A" },
      house: { length: 10, width: 8, floors: "2", eave: 5.8, roofType: "gable", pitch: 30, jobType: "roof", gables: true },
      schedule: { start: helsinkiDay(2), days: 28, urgency: "express" },
      notes: "Storm damage on the north side. Gate code 2468.", crew: "", eta: "", messages: []
    },
    {
      ref: "TK-DEMO37", status: "confirmed", created: -26 * H,
      history: [["received", -26 * H, "customer"], ["confirmed", -20 * H, "office"]],
      customer: { name: "Example: partner roofer, Vantaa", phone: "040 000 0137", email: "" },
      site: { address: "Kokeilukatu 12, Vantaa", zone: "A" },
      house: { length: 15, width: 10, floors: "1", eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: true },
      schedule: { start: helsinkiDay(3), days: 28, urgency: "standard" },
      notes: "", crew: "Team 1", eta: "Morning, 7–9",
      messages: [{ from: "office", text: "Confirmed. The crew calls 30 minutes before arrival.", at: -20 * H }]
    },
    {
      ref: "TK-DEMO58", status: "erected", created: -8 * D,
      history: [["received", -8 * D, "customer"], ["confirmed", -8 * D + 3 * H, "office"], ["loading", -5 * D - 2 * H, "office"], ["en_route", -5 * D - 1 * H, "office"], ["erected", -5 * D + 5 * H, "office"]],
      customer: { name: "Example: Mäkinen", phone: "040 000 0158", email: "" },
      site: { address: "Mallitie 7, Kerava", zone: "B" },
      house: { length: 12, width: 9, floors: "1.5", eave: 4.3, roofType: "gable", pitch: 40, jobType: "facade", gables: false },
      schedule: { start: helsinkiDay(-5), days: 42, urgency: "standard" },
      notes: "", crew: "Team 2", eta: "Done",
      messages: [
        { from: "customer", text: "Painter starts Monday. Can we keep it six weeks?", at: -4 * D },
        { from: "office", text: "Yes, booked for 42 days. Use Request pickup when the painter is done.", at: -4 * D + 2 * H }
      ]
    }
  ];
  return defs.map((d) => {
    const est = E.estimate(d.house);
    return {
      ref: d.ref, createdAt: iso(d.created), updatedAt: iso(d.history[d.history.length - 1][1]), status: d.status, example: true,
      history: d.history.map(([status, at, by]) => ({ status, at: iso(at), by })),
      customer: d.customer, site: d.site, house: d.house, schedule: d.schedule,
      estimate: compactEstimate(est),
      quote: E.quote(est, { days: d.schedule.days, zone: d.site.zone, urgency: d.schedule.urgency }, pricing),
      crew: d.crew, eta: d.eta, notes: d.notes,
      messages: d.messages.map((m) => ({ ...m, at: iso(m.at) })), source: "form"
    };
  });
}

module.exports = {
  HttpError, helsinkiNow, mergePricing, parseOrderInput, buildOrder, publicView, phoneMatches,
  parseQuoteInput, quoteFor, earliestDates, priceExamples, parseLead,
  customerAction, officePatch, exampleOrders, STATUS_KEYS,
  pushHistory, compactEstimate, houseOf, str, digits, num, helsinkiDay
};
