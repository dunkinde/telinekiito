"use strict";
// Business customer portal (/business): people of a business customer account log in with phone + PIN and
// follow, order and request changes on all of the company's sites. Every change still goes to the office for approval.
//
// Roles: admin (everything, manages the company's users), manager (orders and site changes), accountant (invoices only).
const O = require("./orders");
const S = require("./stock");
const { hashPin, checkPin, validPin } = require("./auth");

const { HttpError, str, digits } = O;
const BIZ_ROLES = ["admin", "manager", "accountant"];
const LANGS = ["fi", "en", "ru"];
const round2 = (x) => Math.round(x * 100) / 100;
const daysBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + "T00:00:00Z") - Date.parse(String(a).slice(0, 10) + "T00:00:00Z")) / 864e5);

/* ---------- Users ---------- */
function publicBizUser(u) {
  if (!u) return null;
  return { id: u.id, accountId: u.accountId, name: u.name, phone: u.phone, email: u.email || "", role: u.role, lang: u.lang || "fi", active: u.active !== false, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
}

const phoneKey = (p) => digits(p).replace(/^358/, "0");
function findBizUserByPhone(store, phone) {
  const d = phoneKey(phone);
  if (d.length < 6) return null;
  return store.list("bizuser", { limit: 5000 }).find((u) => phoneKey(u.phone) === d) || null;
}

/** Create or update a portal user of one account. `byAdmin` = the company's own admin (can't touch other accounts). */
function saveBizUser(store, accountId, body, existing) {
  const u = existing ? { ...existing } : { accountId, ver: 0 };
  if (body.name !== undefined) u.name = str(body.name, 80);
  if (body.phone !== undefined) u.phone = str(body.phone, 40);
  if (body.email !== undefined) {
    u.email = str(body.email, 120);
    if (u.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) throw new HttpError(400, "email_invalid", "Check the email address.");
  }
  if (body.role !== undefined) {
    if (!BIZ_ROLES.includes(body.role)) throw new HttpError(400, "bad_role", "Role must be admin, manager or accountant.");
    u.role = body.role;
  }
  if (body.lang !== undefined) u.lang = LANGS.includes(body.lang) ? body.lang : "fi";
  if (body.active !== undefined) {
    const active = Boolean(body.active);
    if (u.active !== false && !active) u.ver = (u.ver || 0) + 1; // switching off ends their sessions
    u.active = active;
  }
  if (body.pin !== undefined && body.pin !== "") {
    if (!validPin(body.pin)) throw new HttpError(400, "bad_pin", "The PIN must be 4–8 digits.");
    u.pinHash = hashPin(body.pin);
    u.ver = (u.ver || 0) + 1;
    u.failed = 0;
  }
  if (!u.name) throw new HttpError(400, "name_required", "Add a name.");
  if (phoneKey(u.phone).length < 6) throw new HttpError(400, "phone_required", "Add a phone number – it's the login.");
  if (!u.pinHash) throw new HttpError(400, "pin_required", "Set a PIN (4–8 digits).");
  if (!u.role) u.role = "manager";
  if (!u.lang) u.lang = "fi";
  if (u.active === undefined) u.active = true;
  const clash = findBizUserByPhone(store, u.phone);
  if (clash && clash.id !== u.id) throw new HttpError(409, "phone_taken", "Someone else already logs in with that phone number.");
  return store.put("bizuser", u);
}

function bizLogin(store, phone, pin) {
  const u = findBizUserByPhone(store, phone);
  const fail = () => new HttpError(401, "wrong_login", "Wrong phone number or PIN.");
  if (!u || u.active === false) throw fail();
  const acc = store.get("account", u.accountId);
  if (!acc || acc.active === false) throw new HttpError(403, "account_off", "Your company's account is switched off. Contact TelineKiito.");
  if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) throw new HttpError(429, "locked", "Too many wrong PINs. Try again in 15 minutes or ask your admin for a new PIN.");
  if (!checkPin(pin, u.pinHash)) {
    u.failed = (u.failed || 0) + 1;
    if (u.failed >= 8) { u.lockedUntil = new Date(Date.now() + 15 * 60e3).toISOString(); u.failed = 0; }
    store.put("bizuser", u);
    throw fail();
  }
  u.failed = 0;
  u.lockedUntil = null;
  u.lastLoginAt = new Date().toISOString();
  store.put("bizuser", u);
  return u;
}

/* ---------- Order details a business adds ---------- */
/** Purchase order number, project, cost centre and the site's practical details. */
function parseBizFields(b) {
  const sc = (b && b.siteContact) || {};
  return {
    po: str(b && b.po, 40),
    project: str(b && b.project, 80),
    costCentre: str(b && b.costCentre, 40),
    siteContact: { name: str(sc.name, 80), phone: str(sc.phone, 40) },
    siteInfo: str(b && b.siteInfo, 600)
  };
}
function applyBizFields(o, f) {
  o.business = { ...(o.business || {}), ...f };
}

/* ---------- What the company sees ---------- */
const STEP_OF = { received: 0, confirmed: 1, loading: 2, en_route: 3, erected: 4, pickup_requested: 5, dismantled: 6, closed: 7 };

/** The next thing that happens on this site (for the dashboard). */
function nextEvent(o, rentalEnd) {
  const a = o.assignment || {};
  if (o.status === "cancelled" || o.status === "closed" || o.status === "dismantled") return null;
  if (STEP_OF[o.status] < 4) return { kind: "delivery", date: a.date || o.schedule.start, time: a.time || "", planned: Boolean(a.date) };
  if (a.pickupDate) return { kind: "pickup", date: a.pickupDate, time: a.pickupTime || "", planned: true };
  return { kind: "rentalEnd", date: rentalEnd, time: "", planned: false };
}

/**
 * Cost so far, VAT included: the one-off work (delivery, erection, dismantling…) once the scaffold is up,
 * plus the daily rent for the days it has stood. An estimate – the invoice is made from the final days.
 */
function costToDate(o, today) {
  const q = o.quote || {};
  const started = o.rental && o.rental.startedAt ? o.rental.startedAt.slice(0, 10) : null;
  if (!started || !q.net) return 0;
  const ended = o.rental && o.rental.endedAt ? o.rental.endedAt.slice(0, 10) : today;
  const stood = Math.max(1, daysBetween(started, ended));
  const booked = Math.max(1, Number(o.schedule.days) || 1);
  const rent = (q.lines || []).find((l) => l.key === "rent");
  const rentAmount = rent ? rent.amount : 0;
  const oneOff = q.net - rentAmount;
  const net = oneOff + (rentAmount / booked) * stood;
  return round2(net * (1 + q.vat / q.net));
}

function summary(o, { rentalEnd, today, pending }) {
  const b = o.business || {};
  return {
    ref: o.ref, status: o.status, address: o.site.address, zone: o.site.zone, geo: o.geo || null,
    start: o.schedule.start, days: o.schedule.days, urgency: o.schedule.urgency, jobType: o.house.jobType, area: o.estimate.area,
    total: o.quote.total, plan: { date: (o.assignment || {}).date || null, time: (o.assignment || {}).time || "", pickupDate: (o.assignment || {}).pickupDate || null, pickupTime: (o.assignment || {}).pickupTime || "" },
    rentalEnd, next: nextEvent(o, rentalEnd), costToDate: costToDate(o, today), pendingChanges: pending,
    po: b.po || "", project: b.project || "", costCentre: b.costCentre || "", orderedBy: b.orderedBy || o.customer.name,
    createdAt: o.createdAt, updatedAt: o.updatedAt, example: !!o.example
  };
}

/** Full view of one order for the company: like the customer tracking page plus site work, photos and business fields. */
function detail(o, { store, rentalEnd, today, access, changes, invoices }) {
  const w = o.work || {};
  const insp = w.inspection || {};
  const photos = store.list("file", { ref: o.ref }).filter((f) => f.kind === "photo").map((f) => ({ id: f.id, stage: f.stage, at: f.createdAt }));
  return {
    ...summary(o, { rentalEnd, today, pending: changes.filter((c) => c.status === "pending").length }),
    customer: { name: o.customer.name, phone: o.customer.phone, email: o.customer.email || "" },
    house: o.house, estimate: { area: o.estimate.area, weightKg: o.estimate.weightKg, runM: o.estimate.runM }, quote: o.quote,
    crew: o.crew || "", eta: o.eta || "", notes: o.notes || "", messages: o.messages || [],
    history: (o.history || []).map((h) => ({ status: h.status, code: h.code, event: h.event, days: h.days, at: h.at })),
    rental: o.rental || {},
    work: {
      loadedAt: w.loaded && w.loaded.done ? w.loaded.at : null,
      arrivedAt: w.arrivedAt || null,
      inspectedAt: o.rental && o.rental.startedAt ? o.rental.startedAt : null,
      signer: insp.signer || "", noSignatureReason: insp.noSignatureReason || "",
      dismantledAt: o.rental && o.rental.endedAt ? o.rental.endedAt : null
    },
    business: { ...{ po: "", project: "", costCentre: "", siteContact: { name: "", phone: "" }, siteInfo: "", orderedBy: "" }, ...(o.business || {}) },
    photos, changes, invoices,
    docs: { confirmation: o.status !== "cancelled", inspection: Boolean(o.rental && o.rental.startedAt) },
    access, cancelled: o.status === "cancelled",
    needsReview: Boolean(o.needsReview), needsPhotos: Boolean(o.needsReview) && !photos.some((p) => p.stage === "customer")
  };
}

/** Price and stock check of a change before it is sent (nothing is saved). */
function previewChange(o, body, { pricing, reprice, stockCfg, orders, today }) {
  const type = body.type;
  let days = o.schedule.days;
  if (type === "days") {
    const d = Number(body.days);
    if (!Number.isFinite(d) || d < 1 || d > 365) throw new HttpError(400, "bad_days", "Rental length must be 1–365 days.");
    days = Math.round(d);
  } else if (type === "pickup_date") {
    const start = (o.rental && o.rental.startedAt && o.rental.startedAt.slice(0, 10)) || (o.assignment && o.assignment.date) || o.schedule.start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) || body.date <= start) throw new HttpError(400, "bad_date", "Pick a date after the start.");
    days = daysBetween(start, body.date);
  } else {
    return { before: { days: o.schedule.days, total: o.quote.total }, after: null, stock: null };
  }
  const after = reprice(o, pricing, { days });
  let stock = null;
  if (stockCfg.enabled) {
    const from = (o.assignment && o.assignment.date) || o.schedule.start;
    const r = S.check(orders, stockCfg, after.estimate.parts, from, S.addDays(from, days + stockCfg.bufferDays), { exceptRef: o.ref, today });
    stock = r.checked ? { ok: r.ok } : null;
  }
  return { before: { days: o.schedule.days, total: o.quote.total }, after: { days, total: after.quote.total }, stock };
}

module.exports = { BIZ_ROLES, publicBizUser, findBizUserByPhone, saveBizUser, bizLogin, parseBizFields, applyBizFields, summary, detail, previewChange, nextEvent };
