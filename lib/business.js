"use strict";
// Business customer portal (/business): people of a business customer account log in with phone + PIN and
// follow, order and request changes on all of the company's sites. Every change still goes to the office for approval.
//
// Roles: admin (everything, manages the company's users), manager (orders and site changes), accountant (invoices only).
const O = require("./orders");
const S = require("./stock");
const { hashPin, checkPin, validPin, lockMs } = require("./auth");

const { HttpError, str, digits, businessIdOf } = O;
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
    u.locks = 0;
    u.lockedUntil = null;
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
  if (!u) {
    const d = phoneKey(phone);
    const waiting = d.length >= 6 && pendingAccounts(store).some((a) => a.registration && a.registration.admin && phoneKey(a.registration.admin.phone) === d && checkPin(pin, a.registration.admin.pinHash));
    if (waiting) throw new HttpError(403, "account_pending", "Your registration is waiting for approval. We'll call you to confirm it.");
    throw fail();
  }
  if (u.active === false) throw fail();
  const acc = store.get("account", u.accountId);
  if (!acc || acc.active === false) throw new HttpError(403, "account_off", "Your company's account is switched off. Contact TelineKiito.");
  if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) throw new HttpError(429, "locked", "Too many wrong PINs. Try again later or ask your admin for a new PIN.");
  if (!checkPin(pin, u.pinHash)) {
    u.failed = (u.failed || 0) + 1;
    if (u.failed >= 8) { u.locks = (u.locks || 0) + 1; u.lockedUntil = new Date(Date.now() + lockMs(u.locks)).toISOString(); u.failed = 0; }
    store.put("bizuser", u);
    throw fail();
  }
  u.failed = 0;
  u.locks = 0;
  u.lockedUntil = null;
  u.lastLoginAt = new Date().toISOString();
  store.put("bizuser", u);
  return u;
}

/* ---------- Registration ---------- */
/**
 * A company registers itself on the portal: the account waits switched off (pending) with its first admin's details
 * and the PIN they chose (hashed). Nothing is reserved yet, and the answer is the same whether or not the company or
 * the phone is already known, so the form can't be used to find out who is a customer. The office sees any clash,
 * calls the company and approves (the admin's login is created then) or rejects the request.
 */
function parseRegistration(b) {
  const r = {
    name: str(b.company, 120),
    businessId: businessIdOf(b.businessId),
    contactName: str(b.contactName, 80),
    phone: str(b.phone, 40),
    email: str(b.email, 120),
    billingAddress: str(b.billingAddress, 120),
    einvoiceAddress: str(b.einvoiceAddress, 40).replace(/\s/g, "").toUpperCase(),
    message: str(b.message, 600),
    lang: LANGS.includes(b.lang) ? b.lang : "fi"
  };
  if (!r.name) throw new HttpError(400, "company_required", "Add the company name.");
  if (!r.businessId) throw new HttpError(400, "bad_business_id", "Check the business ID (1234567-8).");
  if (!r.contactName) throw new HttpError(400, "name_required", "Add a name.");
  if (phoneKey(r.phone).length < 6) throw new HttpError(400, "phone_required", "Add a phone number – it's the login.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) throw new HttpError(400, "email_invalid", "Check the email address.");
  if (!validPin(b.pin)) throw new HttpError(400, "bad_pin", "The PIN must be 4–8 digits.");
  r.pinHash = hashPin(String(b.pin));
  return r;
}

const pendingAccounts = (store) => store.list("account", { limit: 5000 }).filter((a) => a.pending);

/** What the office should know before approving: the company is already a customer, it has other waiting
 * requests, or the admin's phone already logs in somewhere. */
function registrationConflicts(store, a) {
  const id = businessIdOf(a.businessId);
  const same = id ? store.list("account", { limit: 5000 }).filter((x) => x.id !== a.id && businessIdOf(x.businessId) === id) : [];
  const ad = a.registration && a.registration.admin;
  const user = ad ? findBizUserByPhone(store, ad.phone) : null;
  const owner = user ? store.get("account", user.accountId) : null;
  return { customer: (same.find((x) => !x.pending) || {}).name || null, otherRequests: same.filter((x) => x.pending).length, phoneTaken: user ? (owner && owner.name) || "?" : null };
}

/** The admin's login, created when the office approves the request (with the PIN they chose). */
function adminFromRegistration(store, accountId, ad) {
  return saveBizUser(store, accountId, { name: ad.name, phone: ad.phone, email: ad.email, role: "admin", lang: ad.lang }, { accountId, ver: 0, pinHash: ad.pinHash });
}

/** The message that tells the company its account is open (email and SMS, in the language they registered in). */
function approvedMessage(lang, { name, company, url }) {
  const link = url ? `${url}/business` : "";
  if (lang === "en")
    return { subject: "Your TelineKiito business account is open", body: `Hi ${name},\n\n${company}'s business account is now open. Log in${link ? ` at ${link}` : ""} with your phone number and the PIN you chose. You can order new sites at your company price, follow every site and get your invoices in one place.\n\nTelineKiito`,
      sms: `TelineKiito: ${company}'s business account is open. Log in${link ? ` at ${link}` : ""} with your phone number and your PIN.` };
  if (lang === "ru")
    return { subject: "Ваш корпоративный аккаунт TelineKiito открыт", body: `Здравствуйте, ${name}!\n\nКорпоративный аккаунт ${company} открыт. Входите${link ? ` на ${link}` : ""} по номеру телефона и выбранному PIN-коду. Заказывайте новые объекты по цене компании, следите за всеми объектами и получайте счета в одном месте.\n\nTelineKiito`,
      sms: `TelineKiito: аккаунт ${company} открыт. Вход${link ? ` на ${link}` : ""} по номеру телефона и PIN-коду.` };
  return { subject: "TelineKiiton yritystilinne on avattu", body: `Hei ${name},\n\n${company}:n yritystili on nyt avattu. Kirjaudu${link ? ` osoitteessa ${link}` : ""} puhelinnumerollasi ja valitsemallasi PIN-koodilla. Voit tilata uusia työmaita yrityshinnalla, seurata kaikkia työmaita ja saada laskut samasta paikasta.\n\nTelineKiito`,
    sms: `TelineKiito: ${company}:n yritystili on avattu. Kirjaudu${link ? ` osoitteessa ${link}` : ""} puhelinnumerollasi ja PIN-koodillasi.` };
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

module.exports = { BIZ_ROLES, publicBizUser, findBizUserByPhone, saveBizUser, bizLogin, businessIdOf, parseRegistration, pendingAccounts, registrationConflicts, adminFromRegistration, approvedMessage, parseBizFields, applyBizFields, summary, detail, previewChange, nextEvent };
