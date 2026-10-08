"use strict";
// TelineKiito platform logic on top of orders: settings, staff and crews, scheduling, the crew job flow,
// change requests, hours, invoices, business accounts, reviews, website content and reports.
// Pure functions over the store; the HTTP layer (server.js) handles who may call what.
const crypto = require("node:crypto");
const E = require("./engine");
const O = require("./orders");
const S = require("./stock");
const { hashPin, checkPin, validPin } = require("./auth");
const { HttpError, str, digits, num } = O;

const today = () => O.helsinkiDay(0);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
const isoTime = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || "")) ? String(v) : "");
const round2 = (x) => Math.round(x * 100) / 100;
const daysBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + "T00:00:00Z") - Date.parse(String(a).slice(0, 10) + "T00:00:00Z")) / 864e5);

/* ======================= Settings ("ops") ======================= */
const DEFAULT_OPS = {
  siteUrl: "",
  officeEmail: "",
  company: { name: "TelineKiito", businessId: "", address: "", phone: "", email: "", iban: "", bic: "", einvoiceAddress: "", einvoiceOperator: "" },
  paymentDays: 14,
  invoiceNote: "",
  jobsPerCrewDay: 2,
  urgencies: { express: true, emergency: true },
  zones: { A: true, B: true, C: true },
  aiDrawing: true,
  smsEvents: ["confirmed", "on_the_way", "ready", "rental_ending", "price_change"],
  windWarnMs: 15,
  crewHourCost: 38,
  truckTripCost: 70,
  rentalReminderDays: 2,
  inspectionEveryDays: 7
};

function mergeOps(over) {
  const o = JSON.parse(JSON.stringify(DEFAULT_OPS));
  if (!over || typeof over !== "object") return o;
  if (typeof over.siteUrl === "string") o.siteUrl = /^https?:\/\/[^\s]+$/.test(over.siteUrl.trim()) ? over.siteUrl.trim().replace(/\/$/, "") : "";
  if (typeof over.officeEmail === "string") o.officeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(over.officeEmail.trim()) ? over.officeEmail.trim() : "";
  if (over.company && typeof over.company === "object") for (const k of Object.keys(o.company)) if (over.company[k] !== undefined) o.company[k] = str(over.company[k], 140);
  if (over.invoiceNote !== undefined) o.invoiceNote = str(over.invoiceNote, 500);
  const n = (k, lo, hi) => { const v = Number(over[k]); if (Number.isFinite(v) && v >= lo && v <= hi) o[k] = v; };
  n("paymentDays", 0, 90); n("jobsPerCrewDay", 1, 10); n("windWarnMs", 5, 60); n("crewHourCost", 0, 500);
  n("truckTripCost", 0, 2000); n("rentalReminderDays", 0, 14); n("inspectionEveryDays", 1, 60);
  if (over.urgencies) for (const u of ["express", "emergency"]) if (over.urgencies[u] !== undefined) o.urgencies[u] = Boolean(over.urgencies[u]);
  if (over.zones) for (const z of ["A", "B", "C"]) if (over.zones[z] !== undefined) o.zones[z] = Boolean(over.zones[z]);
  if (over.aiDrawing !== undefined) o.aiDrawing = Boolean(over.aiDrawing);
  if (Array.isArray(over.smsEvents)) o.smsEvents = over.smsEvents.filter((e) => typeof e === "string").slice(0, 20);
  return o;
}

/* ======================= Activity log ======================= */
function actorOf(user) {
  return user ? { id: user.id, name: user.name, role: user.role } : { id: "customer", name: "Customer", role: "customer" };
}
function audit(store, user, action, ref, detail) {
  store.put("audit", { ref: ref || null, action, actor: actorOf(user), detail: detail || null });
}

/* ======================= Staff and crews ======================= */
const ROLES = ["owner", "leader", "worker"];
const LANGS = ["fi", "en", "ru"];

function publicStaff(s) {
  if (!s) return null;
  return { id: s.id, name: s.name, phone: s.phone, role: s.role, crewId: s.crewId || null, lang: s.lang || "fi", active: s.active !== false, createdAt: s.createdAt, lastLoginAt: s.lastLoginAt || null };
}

function findStaffByPhone(store, phone) {
  const d = digits(phone).replace(/^358/, "0");
  if (d.length < 6) return null;
  return store.list("staff").find((s) => digits(s.phone).replace(/^358/, "0") === d) || null;
}

function saveStaff(store, body, existing) {
  const s = existing ? { ...existing } : { ver: 0 };
  if (body.name !== undefined) s.name = str(body.name, 80);
  if (body.phone !== undefined) s.phone = str(body.phone, 40);
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, "bad_role", "Role must be owner, leader or worker.");
    s.role = body.role;
  }
  if (body.crewId !== undefined) s.crewId = body.crewId ? str(body.crewId, 40) : null;
  if (body.lang !== undefined) s.lang = LANGS.includes(body.lang) ? body.lang : "fi";
  if (body.active !== undefined) {
    const active = Boolean(body.active);
    if (s.active !== false && !active) s.ver = (s.ver || 0) + 1; // switching off ends their sessions
    s.active = active;
  }
  if (body.pin !== undefined && body.pin !== "") {
    if (!validPin(body.pin)) throw new HttpError(400, "bad_pin", "The PIN must be 4–8 digits.");
    s.pinHash = hashPin(body.pin);
    s.ver = (s.ver || 0) + 1;
    s.failed = 0;
    s.lockedUntil = null;
  }
  if (!s.name) throw new HttpError(400, "name_required", "Add a name.");
  if (digits(s.phone).length < 6) throw new HttpError(400, "phone_required", "Add a phone number; it is the login.");
  if (!s.role) s.role = "worker";
  if (!s.lang) s.lang = "fi";
  if (!s.pinHash) throw new HttpError(400, "pin_required", "Set a PIN (4–8 digits).");
  if (s.crewId && !store.get("crew", s.crewId)) throw new HttpError(400, "bad_crew", "That crew doesn't exist.");
  const clash = findStaffByPhone(store, s.phone);
  if (clash && clash.id !== s.id) throw new HttpError(409, "phone_taken", "Someone else already logs in with that phone number.");
  return store.put("staff", s);
}

/** PIN login with a lockout after repeated wrong PINs. */
function staffLogin(store, phone, pin) {
  const s = findStaffByPhone(store, phone);
  const fail = () => new HttpError(401, "wrong_login", "Wrong phone number or PIN.");
  if (!s || s.active === false) throw fail();
  if (s.lockedUntil && Date.parse(s.lockedUntil) > Date.now()) throw new HttpError(429, "locked", "Too many wrong PINs. Try again in 15 minutes or ask the office to reset your PIN.");
  if (!checkPin(pin, s.pinHash)) {
    s.failed = (s.failed || 0) + 1;
    if (s.failed >= 8) { s.lockedUntil = new Date(Date.now() + 15 * 60e3).toISOString(); s.failed = 0; }
    store.put("staff", s);
    throw fail();
  }
  s.failed = 0;
  s.lockedUntil = null;
  s.lastLoginAt = new Date().toISOString();
  store.put("staff", s);
  return s;
}

const CREW_COLORS = ["#e0a800", "#2f6fde", "#16a34a", "#e5484d", "#8b5cf6", "#0e9aa7", "#f97316", "#64748b"];
function saveCrew(store, body, existing) {
  const c = existing ? { ...existing } : {};
  if (body.name !== undefined) c.name = str(body.name, 60);
  if (body.truck !== undefined) c.truck = str(body.truck, 60);
  if (body.color !== undefined) c.color = /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : c.color;
  if (body.active !== undefined) c.active = Boolean(body.active);
  if (!c.name) throw new HttpError(400, "name_required", "Name the crew.");
  if (!c.color) c.color = CREW_COLORS[store.list("crew").length % CREW_COLORS.length];
  if (c.active === undefined) c.active = true;
  return store.put("crew", c);
}

/* ======================= Partner accounts ======================= */
function saveAccount(store, body, existing) {
  const a = existing ? { ...existing } : {};
  for (const k of ["name", "businessId", "contactName", "email", "phone", "notes", "billingAddress", "einvoiceAddress", "einvoiceOperator"]) if (body[k] !== undefined) a[k] = str(body[k], k === "notes" ? 1000 : 120);
  // E-invoice (verkkolasku) address: OVT code (0037 + business ID …) or an IBAN-style address; operator ID such as 003721291126.
  if (a.einvoiceAddress) a.einvoiceAddress = a.einvoiceAddress.replace(/\s/g, "").toUpperCase();
  if (a.einvoiceOperator) a.einvoiceOperator = a.einvoiceOperator.replace(/\s/g, "").toUpperCase();
  if (body.code !== undefined) a.code = str(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (body.discountPct !== undefined) { const v = num(body.discountPct, 0, 50); if (v === null) throw new HttpError(400, "bad_discount", "Discount must be 0–50 %."); a.discountPct = v; }
  if (body.paymentDays !== undefined) { const v = num(body.paymentDays, 0, 90); a.paymentDays = v === null ? 14 : v; }
  if (body.active !== undefined) a.active = Boolean(body.active);
  if (!a.name) throw new HttpError(400, "name_required", "Add the company name.");
  if (!a.code) a.code = (a.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "TK") + String(Math.floor(100 + Math.random() * 900));
  if (a.code.length < 4) throw new HttpError(400, "bad_code", "The partner code needs at least 4 letters or digits.");
  if (a.discountPct === undefined) a.discountPct = 0;
  if (a.paymentDays === undefined) a.paymentDays = 14;
  if (a.active === undefined) a.active = true;
  const clash = store.list("account").find((x) => x.code === a.code && x.id !== a.id);
  if (clash) throw new HttpError(409, "code_taken", "Another account already uses that code.");
  return store.put("account", a);
}

function accountByCode(store, code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return null;
  return store.list("account").find((a) => a.code === c && a.active !== false) || null;
}

/** Partner discount on the whole quote (before VAT). */
function applyDiscount(q, pct, pricing) {
  if (!pct) return q;
  const net0 = q.net;
  const cut = round2((net0 * pct) / 100);
  const net = round2(net0 - cut);
  const vat = round2((net * pricing.vat) / 100);
  const total = round2(net + vat);
  return {
    ...q,
    lines: q.lines.concat([{ key: "discount", label: `Partner discount −${pct} %`, amount: -cut, vars: { pct } }]),
    net, vat, total,
    low: round2(total * (1 - pricing.rangePct / 100)),
    high: round2(total * (1 + pricing.rangePct / 100)),
    labourGross: round2(q.labourGross * (1 - pct / 100)),
    discountPct: pct
  };
}

/** Price an order's current house/days with its account discount. */
function repriceOrder(o, pricing, { days, house } = {}) {
  const h = house || o.house;
  const est = E.estimate(O.houseOf(h));
  const q = E.quote(est, { days: days || o.schedule.days, zone: o.site.zone, urgency: o.schedule.urgency }, pricing);
  return { estimate: O.compactEstimate(est), quote: applyDiscount(q, o.discountPct || 0, pricing) };
}

/* ======================= Scheduling ======================= */
function setAssignment(store, o, body, user) {
  const a = { ...(o.assignment || {}) };
  const changed = [];
  const set = (k, v) => { if (a[k] !== v) { a[k] = v; changed.push(k); } };
  if (body.date !== undefined) set("date", isoDate(body.date));
  if (body.time !== undefined) set("time", isoTime(body.time));
  if (body.crewId !== undefined) {
    if (body.crewId && !store.get("crew", body.crewId)) throw new HttpError(400, "bad_crew", "That crew doesn't exist.");
    set("crewId", body.crewId || null);
  }
  if (body.pickupDate !== undefined) set("pickupDate", isoDate(body.pickupDate));
  if (body.pickupTime !== undefined) set("pickupTime", isoTime(body.pickupTime));
  if (body.pickupCrewId !== undefined) {
    if (body.pickupCrewId && !store.get("crew", body.pickupCrewId)) throw new HttpError(400, "bad_crew", "That crew doesn't exist.");
    set("pickupCrewId", body.pickupCrewId || null);
  }
  if (!changed.length) return [];
  o.assignment = a;
  const crew = a.crewId ? store.get("crew", a.crewId) : null;
  if (changed.includes("crewId") || changed.includes("date")) o.crew = crew ? crew.name : o.crew;
  if (a.time && (changed.includes("time") || changed.includes("date"))) o.eta = a.time;
  O.pushHistory(o, { event: "Schedule updated", code: "scheduled", at: new Date().toISOString(), by: user ? user.name : "office", detail: { ...a } });
  o.updatedAt = new Date().toISOString();
  return changed;
}

/* ======================= Crew jobs ======================= */
const INSPECTION_ITEMS = ["ground", "bracing", "anchors", "decks", "guardrails", "access", "catch", "clearance", "tag"];
const requiredItems = (o) => INSPECTION_ITEMS.filter((k) => k !== "catch" || (o.estimate && o.estimate.catchRunM > 0));

/** Jobs for a crew app user between two dates. Workers see their crew's jobs; leaders and owners can see all. */
function jobsFor(orders, user, from, to, { all = false } = {}) {
  const mine = (crewId) => all || user.role === "owner" || (user.crewId && crewId === user.crewId);
  const jobs = [];
  for (const o of orders) {
    if (o.example && user.role === "worker") continue;
    if (o.status === "cancelled" || o.status === "closed") continue;
    const a = o.assignment || {};
    const base = {
      ref: o.ref, status: o.status, address: o.site.address, zone: o.site.zone, geo: o.geo || null,
      customer: o.customer.name, jobType: o.house.jobType, area: o.estimate.area, urgency: o.schedule.urgency, example: !!o.example
    };
    if (a.date && a.date >= from && a.date <= to && mine(a.crewId) && ["confirmed", "loading", "en_route", "erected", "received"].includes(o.status)) {
      jobs.push({ ...base, kind: "delivery", date: a.date, time: a.time || "", crewId: a.crewId || null, done: o.status === "erected" || o.status === "pickup_requested" });
    }
    if (a.pickupDate && a.pickupDate >= from && a.pickupDate <= to && mine(a.pickupCrewId || a.crewId) && ["erected", "pickup_requested", "dismantled"].includes(o.status)) {
      jobs.push({ ...base, kind: "pickup", date: a.pickupDate, time: a.pickupTime || "", crewId: a.pickupCrewId || a.crewId || null, done: o.status === "dismantled" });
    }
  }
  return jobs.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
}

/** Everything a worker needs on site. */
function jobCard(store, o) {
  const changes = store.list("change", { ref: o.ref }).map(publicChange);
  const time = store.list("time", { ref: o.ref });
  const minutes = time.reduce((m, t) => m + (t.end ? (Date.parse(t.end) - Date.parse(t.start)) / 60e3 : 0), 0);
  return {
    ref: o.ref, status: o.status, example: !!o.example, history: o.history,
    customer: o.customer, site: o.site, geo: o.geo || null, house: o.house, schedule: o.schedule,
    estimate: o.estimate, notes: o.notes, internalNotes: o.internalNotes || "",
    assignment: o.assignment || {}, crew: o.crew, eta: o.eta,
    work: o.work || {}, photos: o.photos || [], rental: o.rental || {},
    inspectionItems: requiredItems(o), parts: E.PARTS.map((p) => ({ key: p.key, name: p.name, qty: (o.estimate.parts || {})[p.key] || 0 })).filter((p) => p.qty > 0),
    changes, messages: o.messages || [], minutes: Math.round(minutes),
    timeEntries: time.map((t) => ({ id: t.id, staffId: t.staffId, staffName: t.staffName, start: t.start, end: t.end || null }))
  };
}

function rentalEnd(o) {
  const start = (o.rental && o.rental.startedAt && o.rental.startedAt.slice(0, 10)) || (o.assignment && o.assignment.date) || o.schedule.start;
  return S.addDays(start, Math.max(1, Number(o.schedule.days) || 1));
}

/**
 * A crew tap on a job. Moves the order forward and records who did it.
 * Returns the customer event to send (if any).
 */
function crewAction(store, o, action, body, user) {
  const now = new Date().toISOString();
  const by = user.name;
  const w = (o.work = o.work || {});
  const move = (status) => {
    if (o.status !== status) { o.status = status; O.pushHistory(o, { status, at: now, by }); }
  };
  let notify = null;
  switch (action) {
    case "loaded": {
      if (!["received", "confirmed", "loading"].includes(o.status)) throw new HttpError(409, "wrong_step", "This job is past loading.");
      w.loaded = { ...(w.loaded || {}), done: true, at: now, by };
      move("loading");
      break;
    }
    case "on_the_way": {
      if (!["confirmed", "loading", "en_route"].includes(o.status)) throw new HttpError(409, "wrong_step", "Load the truck first.");
      const eta = str(body.eta, 40);
      if (eta) o.eta = eta;
      move("en_route");
      notify = "on_the_way";
      break;
    }
    case "arrived": {
      if (!["loading", "en_route"].includes(o.status)) throw new HttpError(409, "wrong_step", "Tap On the way first.");
      w.arrivedAt = now;
      O.pushHistory(o, { event: "Crew arrived on site", code: "arrived", at: now, by });
      break;
    }
    case "erected": {
      if (!["loading", "en_route"].includes(o.status)) throw new HttpError(409, "wrong_step", "This job isn't being built.");
      const insp = w.inspection || {};
      const missing = requiredItems(o).filter((k) => !(insp.items && insp.items[k]));
      if (missing.length) throw new HttpError(409, "inspection_incomplete", "Finish the inspection checklist first.", { missing });
      if (!insp.signature && !insp.noSignatureReason) throw new HttpError(409, "signature_missing", "Get the customer's signature, or note why it wasn't possible.");
      o.rental = { ...(o.rental || {}), startedAt: now };
      move("erected");
      notify = "ready";
      break;
    }
    case "visit": {
      if (!["erected", "pickup_requested"].includes(o.status)) throw new HttpError(409, "wrong_step", "Visits are for scaffolds that are up.");
      w.visits = (w.visits || []).concat([{ at: now, by, ok: body.ok !== false, notes: str(body.notes, 500) }]).slice(-100);
      O.pushHistory(o, { event: body.ok === false ? "Inspection visit: problems found" : "Inspection visit: OK", code: "visit", at: now, by });
      break;
    }
    case "dismantled": {
      if (!["erected", "pickup_requested"].includes(o.status)) throw new HttpError(409, "wrong_step", "This scaffold isn't up.");
      if (!w.pickup || !w.pickup.at) throw new HttpError(409, "count_missing", "Count the parts back first.");
      o.rental = { ...(o.rental || {}), endedAt: now };
      move("dismantled");
      notify = "collected";
      break;
    }
    default:
      throw new HttpError(404, "unknown_action", "Unknown action.");
  }
  o.updatedAt = now;
  return notify;
}

function saveLoadList(o, body, user) {
  const checked = {};
  for (const p of E.PARTS) { const v = num(body.checked && body.checked[p.key], 0, 1e5); if (v !== null) checked[p.key] = Math.round(v); }
  o.work = o.work || {};
  o.work.loaded = { ...(o.work.loaded || {}), checked, notes: str(body.notes, 500), at: new Date().toISOString(), by: user.name };
  o.updatedAt = new Date().toISOString();
}

function saveInspection(o, body, user) {
  o.work = o.work || {};
  const prev = o.work.inspection || {};
  const items = {};
  for (const k of INSPECTION_ITEMS) items[k] = Boolean(body.items && body.items[k]);
  o.work.inspection = {
    ...prev, items, notes: str(body.notes, 1000), signer: str(body.signer, 80) || prev.signer || "",
    noSignatureReason: str(body.noSignatureReason, 200), at: new Date().toISOString(), by: user.name
  };
  o.updatedAt = new Date().toISOString();
}

function savePickupCount(o, body, user) {
  const read = (obj) => {
    const out = {};
    for (const p of E.PARTS) { const v = num(obj && obj[p.key], 0, 1e5); if (v) out[p.key] = Math.round(v); }
    return out;
  };
  o.work = o.work || {};
  o.work.pickup = { counted: read(body.counted), missing: read(body.missing), damaged: read(body.damaged), notes: str(body.notes, 1000), at: new Date().toISOString(), by: user.name };
  o.updatedAt = new Date().toISOString();
}

/* ======================= Hours ======================= */
function timer(store, o, user, action) {
  const running = store.list("time", { status: "running" }).filter((t) => t.staffId === user.id);
  const now = new Date().toISOString();
  for (const t of running) { t.end = now; t.status = "done"; store.put("time", t); }
  if (action === "start") store.put("time", { ref: o.ref, staffId: user.id, staffName: user.name, start: now, status: "running" });
  else if (action !== "stop") throw new HttpError(400, "bad_action", "Use start or stop.");
}

function minutesByOrder(store) {
  const out = {};
  for (const t of store.list("time", { limit: 20000 })) {
    const end = t.end ? Date.parse(t.end) : Date.now();
    out[t.ref] = (out[t.ref] || 0) + Math.max(0, (end - Date.parse(t.start)) / 60e3);
  }
  return out;
}

/* ======================= Change requests ======================= */
const CHANGE_TYPES = ["days", "pickup_date", "house", "other"];

function publicChange(c) {
  return {
    id: c.id, ref: c.ref, type: c.type, source: c.source, status: c.status, createdAt: c.createdAt, note: c.note || "",
    proposed: c.proposed, before: c.before, after: c.after, stock: c.stock || null, photos: c.photos || [],
    by: c.by || null, decidedAt: c.decidedAt || null, decidedBy: c.decidedBy || null, reason: c.reason || ""
  };
}

function describeChange(c, lang = "fi") {
  const fi = lang === "fi";
  if (c.type === "days") return fi ? `vuokra-aika ${c.proposed.days} päivää` : `rental ${c.proposed.days} days`;
  if (c.type === "pickup_date") return fi ? `nouto ${c.proposed.date}` : `pickup on ${c.proposed.date}`;
  if (c.type === "house") return fi ? "telineen koko muuttuu" : "scaffold size changes";
  return fi ? "muu muutos" : "other change";
}

function createChange(store, o, body, { source, user, pricing, orders }) {
  const type = CHANGE_TYPES.includes(body.type) ? body.type : null;
  if (!type) throw new HttpError(400, "bad_type", "Unknown change type.");
  if (["dismantled", "closed", "cancelled"].includes(o.status)) throw new HttpError(409, "order_finished", "This order is already finished.");
  const proposed = {};
  let days = o.schedule.days, house = o.house;
  if (type === "days") {
    const d = num(body.days, 1, 365);
    if (d === null) throw new HttpError(400, "bad_days", "Rental length must be 1–365 days.");
    days = proposed.days = Math.round(d);
  } else if (type === "pickup_date") {
    const date = isoDate(body.date);
    const start = (o.rental && o.rental.startedAt && o.rental.startedAt.slice(0, 10)) || (o.assignment && o.assignment.date) || o.schedule.start;
    if (!date || date <= start) throw new HttpError(400, "bad_date", "Pick a date after the start.");
    proposed.date = date;
    days = proposed.days = daysBetween(start, date);
  } else if (type === "house") {
    const h = { ...o.house };
    for (const [k, lo, hi] of [["length", 3, 60], ["width", 3, 40], ["eave", 2, 12], ["pitch", 0, 60]]) {
      if (body.house && body.house[k] !== undefined) { const v = num(body.house[k], lo, hi); if (v === null) throw new HttpError(400, "invalid_fields", `Check ${k}.`); h[k] = v; }
    }
    if (body.house && ["gable", "hip", "flat"].includes(body.house.roofType)) h.roofType = body.house.roofType;
    if (body.house && Object.keys(E.JOB_TYPES).includes(body.house.jobType)) h.jobType = body.house.jobType;
    if (body.house && body.house.gables !== undefined) h.gables = Boolean(body.house.gables);
    if (body.house && E.SYSTEM_KEYS.includes(body.house.system)) h.system = body.house.system;
    for (const k of ["sheeting", "weatherRoof"]) if (body.house && body.house[k] !== undefined) { if (body.house[k]) h[k] = true; else delete h[k]; }
    const w = E.weatherOptions(h);
    if (!w.sheeting) delete h.sheeting;
    if (!w.weatherRoof) delete h.weatherRoof;
    // A size measured by hand replaces the 3D model's walls; the job type alone keeps them.
    if (["length", "width", "eave", "pitch", "roofType"].some((k) => h[k] !== o.house[k])) { delete h.walls; delete h.model; delete h.shape; delete h.adjust; }
    house = proposed.house = h;
  }
  const after = type === "other" ? null : repriceOrder(o, pricing, { days, house });
  let stock = null;
  if (after && orders) {
    const st = S.mergeStock(store.getSetting("stock"));
    const from = (o.assignment && o.assignment.date) || o.schedule.start;
    stock = S.check(orders, st, after.estimate.parts, from, S.addDays(from, days + st.bufferDays), { exceptRef: o.ref, today: today() });
  }
  const c = store.put("change", {
    ref: o.ref, type, source, status: "pending", proposed, note: str(body.note, 1000),
    photos: Array.isArray(body.photos) ? body.photos.filter((x) => typeof x === "string").slice(0, 10) : [],
    before: { days: o.schedule.days, total: o.quote.total, house: o.house },
    after: after ? { total: after.quote.total, days, area: after.estimate.area, quote: after.quote } : null,
    stock: stock && stock.checked ? { ok: stock.ok, short: stock.short } : null,
    by: user ? { id: user.id, name: user.name, role: user.role } : { name: o.customer.name, role: "customer" }
  });
  O.pushHistory(o, { event: "Change requested", code: "change_requested", at: c.createdAt, by: c.by.name, detail: { id: c.id, type } });
  o.updatedAt = new Date().toISOString();
  return c;
}

/** apply: false = approve the request but leave the price to the customer (an office price change, below). */
function decideChange(store, o, c, approve, { user, pricing, reason, apply = true }) {
  if (c.status !== "pending") throw new HttpError(409, "already_decided", "This change has already been decided.");
  const now = new Date().toISOString();
  if (approve && apply && c.type !== "other") {
    const days = c.proposed.days || o.schedule.days;
    const house = c.proposed.house || o.house;
    const r = repriceOrder(o, pricing, { days, house });
    o.schedule = { ...o.schedule, days };
    if (c.proposed.house) o.house = { ...house };
    o.estimate = r.estimate;
    o.quote = r.quote;
    if (c.type === "pickup_date") o.assignment = { ...(o.assignment || {}), pickupDate: c.proposed.date };
  }
  c.status = approve ? "approved" : "rejected";
  c.decidedAt = now;
  c.decidedBy = { id: user.id, name: user.name, role: user.role };
  c.reason = str(reason, 500);
  store.put("change", c);
  O.pushHistory(o, { event: approve ? "Change approved" : "Change declined", code: approve ? "change_approved" : "change_rejected", at: now, by: user.name, detail: { id: c.id, type: c.type } });
  o.updatedAt = now;
  return c;
}

/* ======================= Office price changes ======================= */
// When the office changes an order so that its total moves (layout, scaffold system, a size found on site), the
// customer accepts the new price first. The old price stays valid until then; declining keeps it.
const PRICE_CHANGE_SOURCES = ["layout", "change"];

function publicPriceChange(pc) {
  if (!pc) return null;
  const side = (x) => ({ total: x.total, area: x.area, quote: x.quote });
  return {
    id: pc.id, status: pc.status, source: pc.source, reason: pc.reason || "", at: pc.at, by: pc.by ? pc.by.name : "",
    before: side(pc.before), after: side(pc.after),
    decidedAt: pc.decidedAt || null, decidedBy: pc.decidedBy || null, note: pc.note || ""
  };
}

/** Close a waiting price change without the customer (replaced by a newer one, or taken back by the office). */
function closePriceChange(o, status, { by }) {
  const pc = o.priceChange;
  if (!pc || pc.status !== "pending") return null;
  const now = new Date().toISOString();
  Object.assign(pc, { status, decidedAt: now, decidedBy: by });
  O.pushHistory(o, { event: status === "withdrawn" ? "Price change withdrawn" : "Price change replaced", code: `price_change_${status}`, at: now, by, detail: { id: pc.id } });
  return pc;
}

function proposePriceChange(o, { house, estimate, quote, reason, user, source, changeId }) {
  const now = new Date().toISOString();
  closePriceChange(o, "replaced", { by: user.name });
  const pc = {
    id: `pc_${crypto.randomBytes(6).toString("base64url")}`, status: "pending",
    source: PRICE_CHANGE_SOURCES.includes(source) ? source : "layout", changeId: changeId || null,
    reason: str(reason, 500), at: now, by: { id: user.id, name: user.name },
    before: { total: o.quote.total, area: o.estimate.area, quote: o.quote },
    after: { total: quote.total, area: estimate.area, quote, estimate, house }
  };
  o.priceChange = pc;
  O.pushHistory(o, { event: "Price change sent to the customer", code: "price_change_proposed", at: now, by: user.name, detail: { id: pc.id, before: pc.before.total, after: pc.after.total, reason: pc.reason } });
  o.updatedAt = now;
  return pc;
}

/**
 * The customer's answer. Accepting applies the new layout and price; declining keeps the old ones. If the order's
 * price has changed since the proposal (another approved change), the proposal is outdated and nothing is applied.
 */
function decidePriceChange(o, accept, { id, by, note }) {
  const pc = o.priceChange;
  if (!pc || pc.status !== "pending") throw new HttpError(409, "no_price_change", "There is no price change waiting for you.");
  if (id && id !== pc.id) throw new HttpError(409, "price_change_changed", "The office has updated the price change. Check the new one.");
  const now = new Date().toISOString();
  if (accept && o.quote.total !== pc.before.total) {
    Object.assign(pc, { status: "outdated", decidedAt: now, decidedBy: by });
    O.pushHistory(o, { event: "Price change outdated", code: "price_change_outdated", at: now, by, detail: { id: pc.id } });
    o.updatedAt = now;
    return pc;
  }
  if (accept) {
    o.house = { ...pc.after.house };
    o.estimate = pc.after.estimate;
    o.quote = pc.after.quote;
  }
  Object.assign(pc, { status: accept ? "accepted" : "declined", decidedAt: now, decidedBy: by, note: str(note, 500) });
  O.pushHistory(o, {
    event: accept ? "Price change accepted" : "Price change declined", code: accept ? "price_change_accepted" : "price_change_declined",
    at: now, by: "customer", detail: { id: pc.id, before: pc.before.total, after: pc.after.total, who: by }
  });
  o.updatedAt = now;
  return pc;
}

/* ======================= Invoices ======================= */
/** Finnish bank reference number: digits + check digit (weights 7, 3, 1 from the right). */
function finnishReference(base) {
  const d = String(base).replace(/\D/g, "").replace(/^0+/, "") || "1";
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += Number(d[d.length - 1 - i]) * w[i % 3];
  return d + String((10 - (sum % 10)) % 10);
}

function nextInvoiceNo(store) {
  const n = Number(store.getSetting("invoiceSeq")) || 1000;
  store.setSetting("invoiceSeq", n + 1);
  return String(n + 1);
}

function buildInvoice(store, o, { pricing, ops, stock }) {
  // Rent for the days actually used (at least the booked days).
  const startedAt = o.rental && o.rental.startedAt;
  const endedAt = o.rental && o.rental.endedAt;
  const used = startedAt && endedAt ? Math.max(1, Math.ceil((Date.parse(endedAt) - Date.parse(startedAt)) / 864e5)) : 0;
  const days = Math.max(o.schedule.days, used);
  const r = repriceOrder(o, pricing, { days });
  const lines = r.quote.lines.map((l) => ({
    key: l.key, label: l.label, vars: l.vars || null, qty: 1, unit: "", unitPrice: l.amount, net: l.amount,
    labour: l.key === "erect" || l.key === "dismantle"
  }));
  const pickup = (o.work && o.work.pickup) || {};
  for (const [kind, parts] of [["missing", pickup.missing], ["damaged", pickup.damaged]]) {
    for (const [k, qty] of Object.entries(parts || {})) {
      const price = Number(stock.prices[k]) || 0;
      if (!qty || !price) continue;
      const part = E.PARTS.find((p) => p.key === k);
      lines.push({ key: `${kind}_${k}`, label: `${kind === "missing" ? "Missing" : "Damaged"}: ${part ? part.name : k}`, vars: { kind, part: k }, qty, unit: "pcs", unitPrice: price, net: round2(qty * price), labour: false });
    }
  }
  const net = round2(lines.reduce((s, l) => s + l.net, 0));
  const vat = round2((net * pricing.vat) / 100);
  const account = o.accountId ? store.get("account", o.accountId) : null;
  const no = nextInvoiceNo(store);
  const date = today();
  const due = S.addDays(date, account ? account.paymentDays : ops.paymentDays);
  return {
    id: no, no, ref: o.ref, status: "draft", date, due, reference: finnishReference(no), vatPct: pricing.vat,
    customer: account ? { name: account.name, businessId: account.businessId, contact: account.contactName, email: account.email || o.customer.email, phone: account.phone || o.customer.phone }
      : { name: o.customer.name, email: o.customer.email, phone: o.customer.phone },
    site: o.site.address, lang: o.lang || "fi", accountId: o.accountId || null,
    lines, net, vat, total: round2(net + vat), labourGross: r.quote.labourGross, rentDays: days, usedDays: used || null
  };
}

/* ======================= Reviews ======================= */
function saveReview(store, o, body) {
  if (!["dismantled", "closed"].includes(o.status)) throw new HttpError(409, "too_early", "You can rate us once the scaffolding has been collected.");
  const stars = num(body.stars, 1, 5);
  if (stars === null) throw new HttpError(400, "bad_rating", "Choose 1–5 stars.");
  const town = String(o.site.address || "").split(",").map((x) => x.trim()).filter(Boolean).pop() || "";
  const rec = store.get("review", `rev_${o.ref}`) || { id: `rev_${o.ref}`, ref: o.ref, published: false };
  Object.assign(rec, {
    stars: Math.round(stars), text: str(body.text, 1000), consent: Boolean(body.consent), lang: o.lang || "fi",
    name: `${String(o.customer.name || "").split(" ")[0]}${town ? ", " + town.replace(/\d+/g, "").trim() : ""}`, status: rec.published ? "published" : "new"
  });
  if (!rec.consent) rec.published = false;
  return store.put("review", rec);
}

/* ======================= Website content ======================= */
function mergeContent(over) {
  const out = { faq: null, contact: null };
  if (!over || typeof over !== "object") return out;
  if (Array.isArray(over.faq)) {
    out.faq = over.faq.slice(0, 30).map((f) => ({
      q: { fi: str(f && f.q && f.q.fi, 200), en: str(f && f.q && f.q.en, 200) },
      a: { fi: str(f && f.a && f.a.fi, 2000), en: str(f && f.a && f.a.en, 2000) }
    })).filter((f) => f.q.fi || f.q.en);
    if (!out.faq.length) out.faq = null;
  }
  if (over.contact && typeof over.contact === "object") {
    const c = over.contact;
    out.contact = {
      phone: str(c.phone, 40), email: str(c.email, 120),
      hours: { fi: str(c.hours && c.hours.fi, 120), en: str(c.hours && c.hours.en, 120) },
      area: { fi: str(c.area && c.area.fi, 120), en: str(c.area && c.area.en, 120) }
    };
  }
  return out;
}

/* ======================= Reports ======================= */
function weekStart(iso) {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  const wd = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

function dashboard(store, orders, { ops, crews }) {
  const t = today();
  const real = orders.filter((o) => !o.example);
  const month = t.slice(0, 7);
  const thisWeek = weekStart(t), lastWeek = S.addDays(thisWeek, -7);
  const created = (o) => o.createdAt.slice(0, 10);
  const live = (o) => o.status !== "cancelled";
  const invoices = store.list("invoice", { limit: 5000 });
  const stats = store.list("stat", { limit: 400 });
  const since30 = S.addDays(t, -30);
  const lookups30 = stats.filter((s) => s.day >= since30).reduce((n, s) => n + (s.counts.address || 0), 0);
  const orders30 = real.filter((o) => created(o) >= since30).length;
  const toErected = real.map((o) => {
    const e = (o.history || []).find((h) => h.status === "erected");
    return e ? (Date.parse(e.at) - Date.parse(o.createdAt)) / 864e5 : null;
  }).filter((x) => x !== null);
  const deliveriesToday = real.filter((o) => o.assignment && o.assignment.date === t && live(o)).length;
  const pickupsToday = real.filter((o) => o.assignment && o.assignment.pickupDate === t && live(o)).length;
  const busyCrews = new Set(real.flatMap((o) => {
    const a = o.assignment || {};
    return [a.date === t ? a.crewId : null, a.pickupDate === t ? a.pickupCrewId || a.crewId : null].filter(Boolean);
  }));
  const onRent = real.filter((o) => S.OUT_ON_SITE.has(o.status));
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const ws = S.addDays(thisWeek, -7 * i), we = S.addDays(ws, 6);
    weeks.push({ week: ws, orders: real.filter((o) => created(o) >= ws && created(o) <= we && live(o)).length });
  }
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(t + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    const m = d.toISOString().slice(0, 7);
    months.push({
      month: m,
      booked: round2(real.filter((o) => live(o) && created(o).slice(0, 7) === m).reduce((s, o) => s + o.quote.total, 0)),
      invoiced: round2(invoices.filter((iv) => iv.status !== "draft" && iv.date.slice(0, 7) === m).reduce((s, iv) => s + iv.total, 0))
    });
  }
  const byStatus = {};
  for (const o of real) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  return {
    today: t,
    kpis: {
      ordersThisWeek: real.filter((o) => created(o) >= thisWeek && live(o)).length,
      ordersLastWeek: real.filter((o) => created(o) >= lastWeek && created(o) < thisWeek && live(o)).length,
      bookedThisMonth: round2(real.filter((o) => live(o) && created(o).slice(0, 7) === month).reduce((s, o) => s + o.quote.total, 0)),
      invoicedThisMonth: round2(invoices.filter((iv) => iv.status !== "draft" && iv.date.slice(0, 7) === month).reduce((s, iv) => s + iv.total, 0)),
      outstanding: round2(invoices.filter((iv) => iv.status === "sent").reduce((s, iv) => s + iv.total, 0)),
      m2OnRent: Math.round(onRent.reduce((s, o) => s + (o.estimate.area || 0), 0)),
      activeSites: onRent.length,
      deliveriesToday, pickupsToday,
      crewsBusy: busyCrews.size, crewsTotal: (crews || []).filter((c) => c.active !== false).length,
      quoteToOrderPct: lookups30 ? Math.round((orders30 / lookups30) * 100) : null,
      lookups30, orders30,
      avgDaysToErected: toErected.length ? Math.round((toErected.reduce((a, b) => a + b, 0) / toErected.length) * 10) / 10 : null,
      pendingChanges: store.count("change", "pending"),
      waitingMessages: store.count("msg", "waiting") + store.count("msg", "failed"),
      newAlerts: store.count("alert", "new")
    },
    weeks, months, byStatus
  };
}

function margins(store, orders, { ops }) {
  const mins = minutesByOrder(store);
  const invoices = store.list("invoice", { limit: 5000 });
  const stock = S.mergeStock(store.getSetting("stock"));
  const rows = orders
    .filter((o) => !o.example && ["erected", "pickup_requested", "dismantled", "closed"].includes(o.status))
    .map((o) => {
      const iv = invoices.find((x) => x.ref === o.ref && x.status !== "void");
      const revenue = iv ? iv.net : o.quote.net;
      const hours = (mins[o.ref] || 0) / 60;
      const trips = 2 * (o.quote.trucks || 1);
      const p = (o.work && o.work.pickup) || {};
      const damages = Object.entries({ ...(p.missing || {}) }).concat(Object.entries(p.damaged || {}))
        .reduce((s, [k, q]) => s + q * (Number(stock.prices[k]) || 0), 0);
      const recovered = iv ? iv.lines.filter((l) => /^(missing|damaged)_/.test(l.key)).reduce((s, l) => s + l.net, 0) : 0;
      const cost = hours * ops.crewHourCost + trips * ops.truckTripCost + Math.max(0, damages - recovered);
      return {
        ref: o.ref, address: o.site.address, zone: o.site.zone, status: o.status, area: o.estimate.area,
        revenue: round2(revenue), hours: Math.round(hours * 10) / 10, crewCost: round2(hours * ops.crewHourCost),
        transportCost: round2(trips * ops.truckTripCost), damages: round2(Math.max(0, damages - recovered)),
        margin: round2(revenue - cost), marginPct: revenue ? Math.round(((revenue - cost) / revenue) * 100) : null,
        invoiced: Boolean(iv), hoursLogged: hours > 0
      };
    });
  const byZone = ["A", "B", "C"].map((z) => {
    const r = rows.filter((x) => x.zone === z);
    const revenue = r.reduce((s, x) => s + x.revenue, 0), margin = r.reduce((s, x) => s + x.margin, 0);
    return { zone: z, jobs: r.length, revenue: round2(revenue), margin: round2(margin), marginPct: revenue ? Math.round((margin / revenue) * 100) : null };
  });
  return { rows, byZone, costs: { crewHourCost: ops.crewHourCost, truckTripCost: ops.truckTripCost } };
}

module.exports = {
  DEFAULT_OPS, mergeOps, audit, actorOf, ROLES, LANGS, publicStaff, findStaffByPhone, saveStaff, staffLogin, saveCrew,
  saveAccount, accountByCode, applyDiscount, repriceOrder, setAssignment, INSPECTION_ITEMS, requiredItems,
  jobsFor, jobCard, rentalEnd, crewAction, saveLoadList, saveInspection, savePickupCount, timer, minutesByOrder,
  CHANGE_TYPES, publicChange, describeChange, createChange, decideChange, publicPriceChange, proposePriceChange, closePriceChange,
  decidePriceChange, finnishReference, buildInvoice,
  saveReview, mergeContent, dashboard, margins, weekStart, daysBetween, isoDate, today
};
