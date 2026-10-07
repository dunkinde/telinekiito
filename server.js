"use strict";
// TelineKiito platform server. Built-in Node modules only (Node 22+): http, sqlite, crypto, tls.
// Serves the website (static Next.js export), the office (/office), the crew app (/crew) and their API.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const crypto = require("node:crypto");
const E = require("./lib/engine");
const Store = require("./lib/store");
const { makeAuth, MASTER_ID } = require("./lib/auth");
const { makeLimiter } = require("./lib/ratelimit");
const { createAddressService } = require("./lib/address");
const { createNls3d } = require("./lib/nls3d");
const { createSuggest } = require("./lib/suggest");
const { createAI } = require("./lib/ai");
const { createNotifier, mergeTemplates } = require("./lib/notify");
const { createWeather } = require("./lib/weather");
const O = require("./lib/orders");
const P = require("./lib/platform");
const S = require("./lib/stock");
const Docs = require("./lib/docs");
const B = require("./lib/business");
const { finvoice } = require("./lib/finvoice");
const { HttpError } = O;

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const PUBLIC_DIR = path.join(__dirname, "public");
// The website, office and crew app (Next.js static export, built into ./site by the Dockerfile).
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, "site");
const DEPLOY_DIR = process.env.DEPLOY_DIR || "/deploy";
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 40;

fs.mkdirSync(FILES_DIR, { recursive: true });
const store = Store.open(DATA_DIR);
const auth = makeAuth({ password: process.env.OFFICE_PASSWORD, secret: process.env.SESSION_SECRET });
const allow = makeLimiter();
// National Land Survey 3D buildings (needs NLS_API_KEY); map sheets are cached in DATA_DIR/nls3d.
const nls3d = createNls3d({ apiKey: process.env.NLS_API_KEY, dir: path.join(DATA_DIR, "nls3d"), log: (m) => console.log("[3d] " + m) });
const addressSvc = createAddressService({ nls3d });
const suggestSvc = createSuggest({ apiKey: process.env.NLS_API_KEY, log: (m) => console.warn("[suggest] " + m) });
const ai = createAI({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-6-luna" });
const weather = createWeather();

if (!auth.enabled) console.warn("[warn] OFFICE_PASSWORD missing or shorter than 8 characters: office and crew logins are disabled.");
if (!ai.enabled) console.warn("[info] OPENAI_API_KEY not set: drawing reading is switched off.");

const pricing = () => O.mergePricing(store.getSetting("pricing"));
const ops = () => P.mergeOps(store.getSetting("ops"));
const stockCfg = () => S.mergeStock(store.getSetting("stock"));
const crews = () => store.list("crew").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const notify = createNotifier({ store, getOps: ops });

if (store.countOrders() === 0 && process.env.SEED_EXAMPLES !== "0") {
  for (const o of O.exampleOrders(pricing())) store.insertOrder(o);
  console.log("[info] Added 3 example orders.");
}

/* ---------- HTTP helpers ---------- */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ")
};
// Printable documents: their only script is the print button.
const DOC_HEADERS = {
  ...SECURITY_HEADERS,
  "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  const data = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": isJson ? "application/json; charset=utf-8" : headers["Content-Type"] || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(data);
}
// A route can return raw content instead of JSON.
class Raw {
  constructor(body, headers, status = 200) { this.body = body; this.headers = headers; this.status = status; }
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket.remoteAddress || "unknown";
}
function isSecure(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

function readJson(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers["content-type"] || "");
    if (!type.includes("application/json")) return reject(new HttpError(415, "json_required", "Send JSON."));
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new HttpError(413, "too_large", "The upload is too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new HttpError(400, "bad_json", "The request body isn't valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function limit(req, bucket, max, windowMs) {
  if (!allow(`${bucket}:${clientIp(req)}`, max, windowMs)) {
    throw new HttpError(429, "rate_limited", "Too many requests. Wait a moment and try again.");
  }
}

/* ---------- Sessions and roles ---------- */
function sessionUser(req) {
  const s = auth.verify(cookies(req)[auth.COOKIE]);
  if (!s || !s.sid) return null;
  if (s.sid === MASTER_ID) return { id: MASTER_ID, name: "Owner", role: "owner", lang: "fi", crewId: null, master: true };
  const st = store.get("staff", s.sid);
  if (!st || st.active === false || (st.ver || 0) !== (s.ver || 0)) return null;
  return P.publicStaff(st);
}
function requireStaff(req, roles) {
  const u = sessionUser(req);
  if (!u) throw new HttpError(401, "login_required", "Log in first.");
  if (roles && !roles.includes(u.role)) throw new HttpError(403, "forbidden", "Your role can't do that.");
  return u;
}
const requireOffice = (req) => requireStaff(req, ["owner", "leader"]);
const requireOwner = (req) => requireStaff(req, ["owner"]);

function getOrderOr404(ref) {
  const o = /^T[KP]-[A-Z0-9]{4,10}$/.test(ref) ? store.getOrder(ref) : null;
  if (!o) throw new HttpError(404, "not_found", "No order matches that reference and phone number.");
  return o;
}
function customerOrder(ref, phone) {
  const o = getOrderOr404(ref);
  if (!O.phoneMatches(o, phone)) throw new HttpError(404, "not_found", "No order matches that reference and phone number.");
  return o;
}
/** Crew members only reach jobs of their own crew; leaders and owners reach all. */
function crewOrder(user, ref) {
  const o = getOrderOr404(ref);
  if (user.role === "worker") {
    const a = o.assignment || {};
    if (!user.crewId || (a.crewId !== user.crewId && a.pickupCrewId !== user.crewId)) throw new HttpError(403, "not_your_job", "This job isn't assigned to your crew.");
  }
  return o;
}
function saveOrder(o) {
  store.saveOrder(o);
  return o;
}

/* ---------- Notifications for status changes ---------- */
function afterStatusChange(o, prev, user) {
  if (o.status === prev) return;
  const now = new Date().toISOString();
  if (o.status === "confirmed" && prev === "received") notify.event(o, "confirmed");
  if (o.status === "en_route") notify.event(o, "on_the_way");
  if (o.status === "erected") {
    if (!o.rental || !o.rental.startedAt) o.rental = { ...(o.rental || {}), startedAt: now };
    notify.event(o, "ready", { date: o.rental.startedAt.slice(0, 10), endDate: P.rentalEnd(o) });
  }
  if (o.status === "pickup_requested") notify.alert("pickup_requested", o.ref, `${o.ref}: pickup requested – ${o.site.address}`);
  if (o.status === "dismantled") {
    if (!o.rental || !o.rental.endedAt) o.rental = { ...(o.rental || {}), endedAt: now };
    notify.event(o, "collected");
  }
  P.audit(store, user, "status", o.ref, { from: prev, to: o.status });
}

function customerView(o) {
  const changes = store.list("change", { ref: o.ref }).map(P.publicChange).map((c) => ({ ...c, by: c.by && c.by.role === "customer" ? { role: "customer" } : { role: "office" } }));
  const invoices = store.list("invoice", { ref: o.ref }).filter((iv) => iv.status === "sent" || iv.status === "paid")
    .map((iv) => ({ id: iv.id, no: iv.no, date: iv.date, due: iv.due, total: iv.total, status: iv.status, reference: iv.reference }));
  const review = store.get("review", `rev_${o.ref}`);
  const photos = store.list("file", { ref: o.ref }).filter((f) => f.kind === "photo" && f.stage === "customer").map((f) => ({ id: f.id, at: f.createdAt }));
  return O.publicView(o, {
    changes, invoices, photos, needsPhotos: Boolean(o.needsReview) && !photos.length, review: review ? { stars: review.stars, text: review.text } : null,
    rentalEnd: P.rentalEnd(o),
    // Signed link key for this order's documents and photos (so phone digits never go into web addresses).
    access: auth.enabled ? auth.issue(`c:${o.ref}`, 0) : null
  });
}

/* ---------- Files (photos, signatures) ---------- */
const IMG = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
function saveImage(ref, dataUrl, { kind, stage, user }) {
  const m = typeof dataUrl === "string" ? dataUrl.match(IMG) : null;
  if (!m) throw new HttpError(400, "bad_image", "Use a JPEG, PNG or WebP image.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(413, "too_large", "Images must be under 5 MB.");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const rec = store.put("file", { ref, kind, stage: stage || "", mime: `image/${m[1]}`, ext, size: buf.length, by: user ? user.name : "customer" });
  fs.writeFileSync(path.join(FILES_DIR, `${rec.id}.${ext}`), buf);
  return rec;
}

/* ---------- Availability for the website ---------- */
function availableDates(needParts, days, extraOrders) {
  const orders = (extraOrders || store.listOrders());
  const st = stockCfg(), o = ops(), cr = crews();
  const base = O.earliestDates();
  const t = P.today();
  const out = {};
  for (const u of ["standard", "express", "emergency"]) {
    if (u !== "standard" && !o.urgencies[u]) { out[u] = null; continue; }
    out[u] = needParts ? S.earliestStart(orders, st, o, cr, needParts, days, base[u], t) : base[u];
  }
  return out;
}

/* ---------- API routes ---------- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route("GET", /^\/healthz$/, () => ({ ok: true }));

route("GET", /^\/api\/config$/, () => {
  const p = pricing(), o = ops();
  // Without a specific house, earliest dates follow crew capacity only; the quote checks the parts.
  const cr = crews();
  const base = O.earliestDates();
  const earliest = {};
  for (const u of ["standard", "express", "emergency"]) {
    earliest[u] = u !== "standard" && !o.urgencies[u] ? null : S.earliestStart(store.listOrders(), { ...stockCfg(), enabled: false }, o, cr, {}, 1, base[u], P.today()) || base[u];
  }
  return {
    pricing: p,
    features: { ai: ai.enabled && o.aiDrawing, address: true, office: auth.enabled },
    urgencies: { standard: true, express: o.urgencies.express, emergency: o.urgencies.emergency },
    zones: o.zones,
    earliest,
    examples: O.priceExamples(p),
    systems: E.SYSTEM_KEYS.map((k) => ({ key: k, name: E.SYSTEMS[k].name, enabled: Boolean(p.systems[k].enabled) }))
  };
});

// Build status written by deploy/autodeploy.sh on the host (mounted read-only into /deploy).
route("GET", /^\/healthz\/deploy$/, () => {
  let status = null, log = "";
  try { status = JSON.parse(fs.readFileSync(path.join(DEPLOY_DIR, "status.json"), "utf8")); } catch {}
  try {
    log = fs.readFileSync(path.join(DEPLOY_DIR, "build.log"), "utf8")
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
      .split("\n").slice(-150).join("\n");
  } catch {}
  return { status, log, site: fs.existsSync(path.join(SITE_DIR, "index.html")) };
});
// Whether the weather service and messaging work (no customer data).
route("GET", /^\/healthz\/services$/, () => {
  const n = notify.status();
  return { weather: weather.health(), email: n.email.connected, sms: n.sms.connected };
});

/**
 * The measured walls of a building in the 3D model, when the address lookup found one: the page sends back only the
 * building id and point, and the walls come from the server's own copy (never priced from walls sent by the page).
 */
async function withModel(f, body) {
  const m = body && body.model;
  if (!m || typeof m.id !== "string" || !nls3d.enabled) return f;
  const lat = Number(m.lat), lon = Number(m.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return f;
  const r = await nls3d.lookup(lat, lon, { waitMs: 0 }).catch(() => null);
  if (r && r.status === "found" && r.building.id === m.id && r.building.walls && r.building.walls.length) {
    f.walls = r.building.walls;
    f.model = { id: r.building.id, date: (r.modelDate || r.building.created || "").slice(0, 10) || null };
    // The measured walls and roof for the 3D view, in metres from the first outline corner.
    const b = r.building, [x0, y0] = b.outline[0];
    if (b.shape) f.shape = { outline: b.outline.map(([x, y]) => [Math.round((x - x0) * 100) / 100, Math.round((y - y0) * 100) / 100]), w: b.shape.w, r: b.shape.r };
  }
  return f;
}

// Live price for the website's quote wizard, with the first dates that have enough scaffolding and crews.
route("POST", /^\/api\/quote$/, async (req) => {
  limit(req, "quote", 600, 10 * 60e3);
  const body = await readJson(req, 4096);
  const f = await withModel(O.parseQuoteInput(body), body);
  const p = pricing();
  if (!O.systemsOn(p).includes(f.system)) f.system = O.systemsOn(p)[0];
  const out = O.quoteFor(f, p);
  const account = body.partnerCode ? P.accountByCode(store, body.partnerCode) : null;
  if (account && account.discountPct) out.quote = P.applyDiscount(out.quote, account.discountPct, p);
  // The same house with each scaffold system, so the customer can pick one.
  out.options = O.quoteOptions(f, p).map((o) => (account && account.discountPct ? { ...o, total: P.applyDiscount({ net: o.net, lines: [], labourGross: 0 }, account.discountPct, p).total } : o));
  out.partner = account ? { name: account.name, discountPct: account.discountPct } : body.partnerCode ? { invalid: true } : null;
  out.available = availableDates(out.estimate.parts, f.days);
  return out;
});

// Contact form on the website. Messages show in the office.
route("POST", /^\/api\/contact$/, async (req) => {
  limit(req, "contact", 5, 60 * 60e3);
  const body = await readJson(req, 8192);
  if (body.website) return { ok: true }; // hidden honeypot field: bots fill it, people don't
  const lead = store.insertLead(O.parseLead(body));
  notify.alert("contact", null, `Contact message from ${lead.name}`, { email: lead.email });
  return { ok: true };
});

// Address suggestions while typing (official addresses with postal codes).
route("POST", /^\/api\/address\/suggest$/, async (req) => {
  limit(req, "suggest", 400, 10 * 60e3);
  const body = await readJson(req, 1024);
  return { suggestions: await suggestSvc.suggest(body.q) };
});

route("POST", /^\/api\/address$/, async (req) => {
  limit(req, "addr", 20, 10 * 60e3);
  const body = await readJson(req, 4096);
  const text = String(body.address || "").trim().slice(0, 200);
  if (text.length < 5) throw new HttpError(400, "address_short", "Write the street, number and city.");
  try {
    const r = await addressSvc.lookup(text);
    store.bump("address");
    return r;
  } catch (e) {
    console.error("[address]", e.message);
    throw new HttpError(502, "lookup_failed", "The map service didn't answer. Try again or enter the size by hand.");
  }
});

route("POST", /^\/api\/ai\/drawing$/, async (req) => {
  if (!ai.enabled || !ops().aiDrawing) throw new HttpError(503, "ai_not_configured", "Drawing reading isn't switched on yet.");
  limit(req, "ai", 6, 10 * 60e3);
  if (!allow("ai:global-day", AI_DAILY_LIMIT, 24 * 3600e3)) {
    throw new HttpError(429, "ai_daily_limit", "Today's limit for drawing reading is used up. Enter the size by hand.");
  }
  const body = await readJson(req, 12 * 1024 * 1024);
  const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
  if (!images.length) throw new HttpError(400, "no_images", "Choose a drawing or photo first.");
  for (const u of images) {
    if (typeof u !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || u.length > 5.5 * 1024 * 1024) {
      throw new HttpError(400, "bad_image", "Use JPEG, PNG or WebP images under 4 MB each.");
    }
  }
  try {
    return { ok: true, house: await ai.readDrawing(images, { lang: body.lang === "fi" ? "fi" : "en" }) };
  } catch (e) {
    console.error("[ai]", e.code, e.message);
    const msg = {
      ai_bad_key: "The OpenAI key on the server isn't valid.",
      ai_no_credit: "The OpenAI account has run out of credit.",
      ai_busy: "OpenAI is busy right now. Try again in a minute.",
      ai_bad_model: "The OpenAI model name on the server isn't available.",
      ai_unreadable: "Couldn't read measurements from that image. Try a clearer drawing with dimensions."
    }[e.code] || "Reading the drawing failed. Try again.";
    throw new HttpError(e.code === "ai_unreadable" ? 422 : 502, e.code || "ai_error", msg);
  }
});

/** Never sell scaffolding we won't have: check parts and crews for the chosen dates (409 with the first free date). */
function assertAvailable(order, f) {
  const o0 = ops();
  const orders = store.listOrders();
  const st = stockCfg();
  const end = S.addDays(f.start, f.days + st.bufferDays);
  const parts = S.check(orders, st, order.estimate.parts, f.start, end, { today: P.today() });
  const cap = S.capacityPerDay(o0, crews());
  const full = cap !== Infinity && S.jobsOn(orders, f.start) >= cap;
  if (!parts.ok || full) {
    const next = S.earliestStart(orders, st, o0, crews(), order.estimate.parts, f.days, f.start, P.today());
    throw new HttpError(409, parts.ok ? "fully_booked" : "not_enough_stock",
      next ? `That start date is fully booked. The first free date is ${next}.` : "We can't take this job on these dates. Contact us.", { date: next });
  }
}

/**
 * Orders whose size the online data can't be trusted for go to the office for a check before confirming:
 * the address lookup's warnings (sent by the website with the order) and buildings taller than the price covers.
 */
const REVIEW_CHECKS = {
  size_mismatch: "the map outline and the building register disagree on the size",
  not_rectangle: "the building is not a simple rectangle",
  size_estimated: "the size is estimated from the register floor area, not measured",
  street_only: "the address matched only the street, not the house",
  outbuilding: "the matched building may be an outbuilding"
};
/** The address is in another delivery zone than the order was priced for: a note for the office (transport price). */
async function checkZone(order) {
  const zone = await suggestSvc.zoneOf(order.site.address).catch(() => null);
  if (!zone || zone === order.site.zone) return;
  order.zoneCheck = { zone, chosen: order.site.zone };
  order.internalNotes = [order.internalNotes, `Check the delivery zone: the address is in zone ${zone}, but the order was priced for zone ${order.site.zone}.`].filter(Boolean).join("\n");
}

function applyReviewFlags(order, body) {
  const reasons = [];
  const storeys = Math.round(Number(body.storeys) || 0);
  if (storeys >= 3 && storeys <= 50) reasons.push({ code: "storeys_many", n: storeys });
  const checks = Array.isArray(body.checks) ? body.checks.filter((c) => typeof c === "string" && REVIEW_CHECKS[c]) : [];
  for (const code of new Set(checks)) reasons.push({ code });
  if (!reasons.length) return;
  order.needsReview = true;
  order.sizeCheck = { reasons, at: new Date().toISOString() };
  const words = reasons.map((r) => (r.code === "storeys_many" ? `the building register lists ${r.n} storeys (the online price covers up to 2)` : REVIEW_CHECKS[r.code]));
  order.internalNotes = `Check the size before confirming: ${words.join("; ")}. Look at the satellite view and ask the customer for photos of each side.`;
}

route("POST", /^\/api\/orders$/, async (req) => {
  limit(req, "order", 10, 60 * 60e3);
  const body = await readJson(req, 16384);
  const f = await withModel(O.parseOrderInput(body), body);
  const o0 = ops();
  if (f.urgency !== "standard" && !o0.urgencies[f.urgency]) throw new HttpError(409, "urgency_off", "That delivery speed isn't available right now.");
  if (!o0.zones[f.zone]) throw new HttpError(409, "zone_off", "We don't deliver to that area right now. Contact us.");
  if (!O.systemsOn(pricing()).includes(f.system)) throw new HttpError(409, "system_off", "That scaffold system isn't available right now.");
  const p = pricing();
  const order = O.buildOrder(f, p, (ref) => Boolean(store.getOrder(ref)));
  const account = f.partnerCode ? P.accountByCode(store, f.partnerCode) : null;
  if (account) {
    order.accountId = account.id;
    order.discountPct = account.discountPct || 0;
    order.quote = P.applyDiscount(order.quote, order.discountPct, p);
  }
  assertAvailable(order, f);
  applyReviewFlags(order, body);
  await checkZone(order);
  store.insertOrder(order);
  store.bump("orders");
  notify.event(order, "order_received");
  notify.alert("new_order", order.ref, `New order ${order.ref}: ${order.site.address}, ${order.estimate.area} m², start ${order.schedule.start}`);
  P.audit(store, null, "order_created", order.ref, { total: order.quote.total, partner: account ? account.name : null });
  console.log(`[order] ${order.ref} ${order.estimate.area} m2 ${order.quote.total} EUR`);
  return { ref: order.ref, order: customerView(order) };
});

route("GET", /^\/api\/orders\/([A-Z0-9-]+)$/, (req, m, url) => {
  limit(req, "track", 30, 10 * 60e3);
  return customerView(customerOrder(m[1], url.searchParams.get("phone")));
});
// Same, with the phone digits in the body instead of the address (the website uses this).
route("POST", /^\/api\/orders\/([A-Z0-9-]+)\/view$/, async (req, m) => {
  limit(req, "track", 30, 10 * 60e3);
  const body = await readJson(req, 1024);
  return customerView(customerOrder(m[1], body.phone));
});

// Customer actions on the tracking page. A longer or shorter rental is a change request the office approves.
route("POST", /^\/api\/orders\/([A-Z0-9-]+)\/(extend|pickup|message|change)$/, async (req, m) => {
  limit(req, "track-action", 20, 10 * 60e3);
  const body = await readJson(req, 8192);
  const o = customerOrder(m[1], body.phone);
  const action = m[2];
  if (action === "extend" || action === "change") {
    const b = action === "extend" ? { type: "days", days: (Number(o.schedule.days) || 0) + (Number(body.days) || 7) } : body;
    const pending = store.list("change", { ref: o.ref }).find((c) => c.status === "pending" && c.source === "customer");
    if (pending) throw new HttpError(409, "change_pending", "You already have a change waiting for the office.");
    const c = P.createChange(store, o, b, { source: "customer", pricing: pricing(), orders: store.listOrders() });
    saveOrder(o);
    notify.alert("change_request", o.ref, `${o.ref}: customer asks for ${P.describeChange(c, "en")}`, { id: c.id });
    return customerView(o);
  }
  if (action === "pickup") {
    if (o.status !== "erected") throw new HttpError(409, "not_erected", "Pickup can be requested once the scaffold is up.");
    const prev = o.status;
    o.status = "pickup_requested";
    O.pushHistory(o, { status: "pickup_requested", at: new Date().toISOString(), by: "customer" });
    o.updatedAt = new Date().toISOString();
    afterStatusChange(o, prev, null);
    saveOrder(o);
    return customerView(o);
  }
  O.customerAction(o, "message", body, pricing());
  saveOrder(o);
  notify.alert("customer_message", o.ref, `${o.ref}: message from ${o.customer.name}`, { text: String(body.text || "").slice(0, 200) });
  return customerView(o);
});

/** Photos of the house from the customer (each side), so the office can check the size before confirming. */
const MAX_CUSTOMER_PHOTOS = 12;
function addCustomerPhoto(o, image) {
  if (["dismantled", "closed", "cancelled"].includes(o.status)) throw new HttpError(409, "order_finished", "This order is already finished.");
  const have = store.list("file", { ref: o.ref }).filter((f) => f.kind === "photo" && f.stage === "customer").length;
  if (have >= MAX_CUSTOMER_PHOTOS) throw new HttpError(409, "too_many_photos", `Up to ${MAX_CUSTOMER_PHOTOS} photos per order.`);
  saveImage(o.ref, image, { kind: "photo", stage: "customer" });
  o.updatedAt = new Date().toISOString();
  saveOrder(o);
}
route("POST", /^\/api\/orders\/([A-Z0-9-]+)\/photos$/, async (req, m) => {
  limit(req, "photos", 30, 10 * 60e3);
  const body = await readJson(req, 7 * 1024 * 1024);
  const o = customerOrder(m[1], body.phone);
  addCustomerPhoto(o, body.image);
  return customerView(o);
});

route("POST", /^\/api\/orders\/([A-Z0-9-]+)\/review$/, async (req, m) => {
  limit(req, "review", 10, 60 * 60e3);
  const body = await readJson(req, 4096);
  const o = customerOrder(m[1], body.phone);
  const r = P.saveReview(store, o, body);
  notify.alert("review", o.ref, `${o.ref}: ${r.stars}/5 stars from ${r.name}`);
  return customerView(o);
});

route("GET", /^\/api\/reviews$/, () => ({
  reviews: store.list("review", { status: "published", limit: 24 }).map((r) => ({ stars: r.stars, text: r.text, name: r.name, lang: r.lang, at: r.createdAt }))
}));

route("GET", /^\/api\/content$/, () => {
  const c = P.mergeContent(store.getSetting("content"));
  return { ...c, reviews: store.list("review", { status: "published", limit: 12 }).map((r) => ({ stars: r.stars, text: r.text, name: r.name, lang: r.lang })) };
});

/* ---------- Business customer portal (/business) ---------- */
// People of a business customer account follow and order all of the company's sites. Changes that affect the
// price or the schedule are change requests the office approves; order details like the PO number are edited directly.
function bizSession(req) {
  const s = auth.verify(cookies(req)[auth.BIZ_COOKIE]);
  if (!s || !s.sid || !String(s.sid).startsWith("b:")) return null;
  const u = store.get("bizuser", s.sid.slice(2));
  if (!u || u.active === false || (u.ver || 0) !== (s.ver || 0)) return null;
  const account = store.get("account", u.accountId);
  if (!account || account.active === false) return null;
  return { user: u, account };
}
function requireBiz(req, roles) {
  const s = bizSession(req);
  if (!s) throw new HttpError(401, "login_required", "Log in first.");
  if (roles && !roles.includes(s.user.role)) throw new HttpError(403, "forbidden", "Your role can't do that.");
  return s;
}
const BIZ_ORDERING = ["admin", "manager"];
function bizOrder(s, ref) {
  const o = /^T[KP]-[A-Z0-9]{4,10}$/.test(ref) ? store.getOrder(ref) : null;
  if (!o || o.accountId !== s.account.id) throw new HttpError(404, "not_found", "Order not found.");
  return o;
}
const bizActor = (s) => ({ id: `biz:${s.user.id}`, name: `${s.user.name} (${s.account.name})`, role: "customer" });
function bizChanges(o) {
  return store.list("change", { ref: o.ref }).map(P.publicChange).map((c) => ({ ...c, by: c.by && c.by.role === "customer" ? { role: "customer", name: c.by.name } : { role: "office" } }));
}
function bizInvoices(ref) {
  return store.list("invoice", { ref }).filter((iv) => iv.status === "sent" || iv.status === "paid")
    .map((iv) => ({ id: iv.id, no: iv.no, ref: iv.ref, date: iv.date, due: iv.due, net: iv.net, vat: iv.vat, total: iv.total, status: iv.status, reference: iv.reference }));
}
function bizDetail(o) {
  return B.detail(o, { store, rentalEnd: P.rentalEnd(o), today: P.today(), access: auth.enabled ? auth.issue(`c:${o.ref}`, 0) : null, changes: bizChanges(o), invoices: bizInvoices(o.ref) });
}
function bizAccountView(a) {
  return { id: a.id, name: a.name, businessId: a.businessId || "", code: a.code, discountPct: a.discountPct || 0, paymentDays: a.paymentDays,
    billingAddress: a.billingAddress || "", einvoiceAddress: a.einvoiceAddress || "", einvoiceOperator: a.einvoiceOperator || "", email: a.email || "" };
}

route("POST", /^\/api\/biz\/login$/, async (req, m, url, res) => {
  if (!auth.enabled) throw new HttpError(503, "office_disabled", "Logins are switched off on the server.");
  limit(req, "login", 10, 15 * 60e3);
  const body = await readJson(req, 2048);
  const u = B.bizLogin(store, body.phone, body.pin);
  res.setHeader("Set-Cookie", auth.cookie(auth.issue(`b:${u.id}`, u.ver || 0), isSecure(req), auth.BIZ_COOKIE));
  return { ok: true, user: B.publicBizUser(u) };
});
route("POST", /^\/api\/biz\/logout$/, (req, m, url, res) => {
  res.setHeader("Set-Cookie", auth.clearCookie(isSecure(req), auth.BIZ_COOKIE));
  return { ok: true };
});
route("GET", /^\/api\/biz\/me$/, (req) => {
  const s = requireBiz(req);
  const o = ops();
  return { user: B.publicBizUser(s.user), account: bizAccountView(s.account), today: P.today(), company: { name: o.company.name, phone: o.company.phone, email: o.company.email },
    urgencies: { standard: true, express: o.urgencies.express, emergency: o.urgencies.emergency } };
});

route("GET", /^\/api\/biz\/orders$/, (req) => {
  const s = requireBiz(req);
  const pending = {};
  for (const c of store.list("change", { status: "pending" })) pending[c.ref] = (pending[c.ref] || 0) + 1;
  const today = P.today();
  const orders = store.listOrders(5000).filter((o) => o.accountId === s.account.id)
    .map((o) => B.summary(o, { rentalEnd: P.rentalEnd(o), today, pending: pending[o.ref] || 0 }));
  return { orders };
});
route("GET", /^\/api\/biz\/orders\/([A-Z0-9-]+)$/, (req, m) => {
  const s = requireBiz(req);
  return { order: bizDetail(bizOrder(s, m[1])) };
});

// A new order from the portal: the account's discount applies, contact details come from the user.
route("POST", /^\/api\/biz\/orders$/, async (req) => {
  const s = requireBiz(req, BIZ_ORDERING);
  limit(req, "biz-order", 30, 60 * 60e3);
  const body = await readJson(req, 16384);
  const bf = B.parseBizFields(body);
  const contactName = bf.siteContact.name || s.user.name;
  const contactPhone = bf.siteContact.phone || s.user.phone;
  const f = await withModel(O.parseOrderInput({ ...body, name: `${s.account.name} / ${contactName}`, phone: contactPhone, email: s.user.email || s.account.email || "", lang: s.user.lang === "en" ? "en" : "fi" }), body);
  const o0 = ops();
  if (f.urgency !== "standard" && !o0.urgencies[f.urgency]) throw new HttpError(409, "urgency_off", "That delivery speed isn't available right now.");
  if (!o0.zones[f.zone]) throw new HttpError(409, "zone_off", "We don't deliver to that area right now. Contact us.");
  if (!O.systemsOn(pricing()).includes(f.system)) throw new HttpError(409, "system_off", "That scaffold system isn't available right now.");
  const p = pricing();
  const order = O.buildOrder(f, p, (ref) => Boolean(store.getOrder(ref)));
  order.accountId = s.account.id;
  order.discountPct = s.account.discountPct || 0;
  order.quote = P.applyDiscount(order.quote, order.discountPct, p);
  order.history[0].by = "customer";
  B.applyBizFields(order, { ...bf, orderedBy: s.user.name, orderedById: s.user.id });
  applyReviewFlags(order, body);
  await checkZone(order);
  assertAvailable(order, f);
  store.insertOrder(order);
  store.bump("orders");
  notify.event(order, "order_received");
  notify.alert("new_order", order.ref, `New order ${order.ref}: ${order.site.address}, ${order.estimate.area} m², start ${order.schedule.start}`);
  P.audit(store, bizActor(s), "order_created", order.ref, { total: order.quote.total, partner: s.account.name, po: bf.po || null });
  return { ref: order.ref, order: bizDetail(order) };
});

// Order details the company keeps up to date itself (no approval needed): PO, project, cost centre, site contact.
route("PATCH", /^\/api\/biz\/orders\/([A-Z0-9-]+)$/, async (req, m) => {
  const s = requireBiz(req, BIZ_ORDERING);
  const o = bizOrder(s, m[1]);
  if (o.status === "closed" || o.status === "cancelled") throw new HttpError(409, "order_finished", "This order is already finished.");
  const body = await readJson(req, 8192);
  const bf = B.parseBizFields({ ...(o.business || {}), ...body, siteContact: { ...((o.business || {}).siteContact || {}), ...(body.siteContact || {}) } });
  B.applyBizFields(o, bf);
  if (bf.siteContact.phone) o.customer.phone = bf.siteContact.phone;
  o.updatedAt = new Date().toISOString();
  saveOrder(o);
  P.audit(store, bizActor(s), "biz_details", o.ref, { po: bf.po, project: bf.project, costCentre: bf.costCentre });
  return { order: bizDetail(o) };
});

// Price and stock before → after for a change (nothing is saved).
route("POST", /^\/api\/biz\/orders\/([A-Z0-9-]+)\/preview$/, async (req, m) => {
  const s = requireBiz(req, BIZ_ORDERING);
  const o = bizOrder(s, m[1]);
  const body = await readJson(req, 2048);
  return B.previewChange(o, body, { pricing: pricing(), reprice: P.repriceOrder, stockCfg: stockCfg(), orders: store.listOrders(), today: P.today() });
});

// A change request: longer/shorter rental, pickup date or anything else. The office always decides.
route("POST", /^\/api\/biz\/orders\/([A-Z0-9-]+)\/change$/, async (req, m) => {
  const s = requireBiz(req, BIZ_ORDERING);
  limit(req, "biz-change", 30, 10 * 60e3);
  const o = bizOrder(s, m[1]);
  const body = await readJson(req, 8192);
  if (!["days", "pickup_date", "other"].includes(body.type)) throw new HttpError(400, "bad_type", "Unknown change type.");
  if (body.type === "other" && !O.str(body.note, 1000)) throw new HttpError(400, "note_required", "Describe the change.");
  const pending = store.list("change", { ref: o.ref }).find((c) => c.status === "pending" && c.source === "customer");
  if (pending) throw new HttpError(409, "change_pending", "There is already a change waiting for the office on this order.");
  const c = P.createChange(store, o, body, { source: "customer", user: { id: `biz:${s.user.id}`, name: `${s.user.name} (${s.account.name})`, role: "customer" }, pricing: pricing(), orders: store.listOrders() });
  saveOrder(o);
  notify.alert("change_request", o.ref, `${o.ref}: customer asks for ${P.describeChange(c, "en")}`, { id: c.id });
  return { order: bizDetail(o) };
});

route("POST", /^\/api\/biz\/orders\/([A-Z0-9-]+)\/pickup$/, async (req, m) => {
  const s = requireBiz(req, BIZ_ORDERING);
  const o = bizOrder(s, m[1]);
  if (o.status !== "erected") throw new HttpError(409, "not_erected", "Pickup can be requested once the scaffold is up.");
  const prev = o.status;
  o.status = "pickup_requested";
  O.pushHistory(o, { status: "pickup_requested", at: new Date().toISOString(), by: "customer" });
  o.updatedAt = new Date().toISOString();
  afterStatusChange(o, prev, null);
  saveOrder(o);
  return { order: bizDetail(o) };
});

route("POST", /^\/api\/biz\/orders\/([A-Z0-9-]+)\/photos$/, async (req, m) => {
  const s = requireBiz(req, BIZ_ORDERING);
  limit(req, "photos", 30, 10 * 60e3);
  const body = await readJson(req, 7 * 1024 * 1024);
  const o = bizOrder(s, m[1]);
  addCustomerPhoto(o, body.image);
  return { order: bizDetail(o) };
});

route("POST", /^\/api\/biz\/orders\/([A-Z0-9-]+)\/message$/, async (req, m) => {
  const s = requireBiz(req);
  limit(req, "track-action", 30, 10 * 60e3);
  const o = bizOrder(s, m[1]);
  const body = await readJson(req, 4096);
  const text = O.str(body.text, 1000);
  if (!text) throw new HttpError(400, "empty_message", "Write a message first.");
  o.messages = (o.messages || []).concat([{ from: "customer", text, at: new Date().toISOString(), by: s.user.name }]).slice(-200);
  o.updatedAt = new Date().toISOString();
  saveOrder(o);
  notify.alert("customer_message", o.ref, `${o.ref}: message from ${s.user.name} (${s.account.name})`, { text: text.slice(0, 200) });
  return { order: bizDetail(o) };
});

route("GET", /^\/api\/biz\/invoices$/, (req) => {
  const s = requireBiz(req);
  const refs = new Map(store.listOrders(5000).filter((o) => o.accountId === s.account.id).map((o) => [o.ref, o]));
  const invoices = store.list("invoice", { limit: 5000 }).filter((iv) => refs.has(iv.ref) && (iv.status === "sent" || iv.status === "paid"))
    .map((iv) => { const b = refs.get(iv.ref).business || {}; return { id: iv.id, no: iv.no, ref: iv.ref, site: iv.site, date: iv.date, due: iv.due, net: iv.net, vat: iv.vat, total: iv.total, status: iv.status, reference: iv.reference, po: b.po || "", project: b.project || "", costCentre: b.costCentre || "", access: auth.issue(`c:${iv.ref}`, 0) }; });
  return { invoices };
});
route("GET", /^\/api\/biz\/invoices\/([\w-]+)\/finvoice$/, (req, m) => {
  const s = requireBiz(req);
  const iv = store.get("invoice", m[1]);
  const o = iv ? store.getOrder(iv.ref) : null;
  if (!iv || !o || o.accountId !== s.account.id || !(iv.status === "sent" || iv.status === "paid")) throw new HttpError(404, "not_found", "Invoice not found.");
  return finvoiceFile(iv, o);
});

// The company's own users (admins manage them).
route("GET", /^\/api\/biz\/users$/, (req) => {
  const s = requireBiz(req, ["admin"]);
  return { users: store.list("bizuser", { limit: 5000 }).filter((u) => u.accountId === s.account.id).map(B.publicBizUser) };
});
route("POST", /^\/api\/biz\/users$/, async (req) => {
  const s = requireBiz(req, ["admin"]);
  const body = await readJson(req, 4096);
  const u = B.saveBizUser(store, s.account.id, body, null);
  P.audit(store, bizActor(s), "biz_user_added", null, { name: u.name });
  return { user: B.publicBizUser(u) };
});
route("PATCH", /^\/api\/biz\/users\/([\w-]+)$/, async (req, m) => {
  const s = requireBiz(req, ["admin"]);
  const u = store.get("bizuser", m[1]);
  if (!u || u.accountId !== s.account.id) throw new HttpError(404, "not_found", "User not found.");
  const body = await readJson(req, 4096);
  if (u.id === s.user.id && (body.active === false || (body.role && body.role !== "admin"))) throw new HttpError(409, "not_self", "You can't switch off or demote yourself.");
  return { user: B.publicBizUser(B.saveBizUser(store, s.account.id, body, u)) };
});
route("DELETE", /^\/api\/biz\/users\/([\w-]+)$/, (req, m) => {
  const s = requireBiz(req, ["admin"]);
  const u = store.get("bizuser", m[1]);
  if (!u || u.accountId !== s.account.id) throw new HttpError(404, "not_found", "User not found.");
  if (u.id === s.user.id) throw new HttpError(409, "not_self", "You can't remove yourself.");
  store.del("bizuser", u.id);
  return { ok: true };
});

/** Finvoice 3.0 file for an invoice; lines in the invoice's language. */
function finvoiceFile(iv, o) {
  const account = o.accountId ? store.get("account", o.accountId) : null;
  const t = Docs.T[iv.lang === "en" ? "en" : "fi"];
  const withText = { ...iv, lines: (iv.lines || []).map((l) => ({ ...l, text: Docs.lineLabel(l, t) })) };
  const xml = finvoice(withText, o, account, ops().company);
  return new Raw(xml, { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="finvoice-${iv.no}.xml"` });
}

/* ---------- Logins (office and crew) ---------- */
async function login(req, m, url, res) {
  if (!auth.enabled) throw new HttpError(503, "office_disabled", "Set OFFICE_PASSWORD on the server to enable logins.");
  limit(req, "login", 10, 15 * 60e3);
  const body = await readJson(req, 2048);
  let token, user;
  if (body.password !== undefined && !body.phone) {
    if (!auth.checkPassword(body.password)) throw new HttpError(401, "wrong_password", "Wrong password.");
    token = auth.issue(MASTER_ID, 0);
    user = { id: MASTER_ID, name: "Owner", role: "owner", lang: "fi", crewId: null, master: true };
  } else {
    const s = P.staffLogin(store, body.phone, body.pin);
    token = auth.issue(s.id, s.ver || 0);
    user = P.publicStaff(s);
  }
  res.setHeader("Set-Cookie", auth.cookie(token, isSecure(req)));
  P.audit(store, user, "login", null, null);
  return { ok: true, user };
}
function logout(req, m, url, res) {
  res.setHeader("Set-Cookie", auth.clearCookie(isSecure(req)));
  return { ok: true };
}
function me(req) {
  const user = requireStaff(req);
  const o = ops();
  return { user, crews: crews().map((c) => ({ id: c.id, name: c.name, color: c.color, active: c.active !== false })), company: o.company.name, today: P.today() };
}
route("POST", /^\/api\/(office|staff)\/login$/, login);
route("POST", /^\/api\/(office|staff)\/logout$/, logout);
route("GET", /^\/api\/(office|staff)\/me$/, me);

/* ---------- Crew app ---------- */
route("GET", /^\/api\/crew\/jobs$/, (req, m, url) => {
  const user = requireStaff(req);
  const t = P.today();
  const from = P.isoDate(url.searchParams.get("from")) || S.addDays(t, -1);
  const to = P.isoDate(url.searchParams.get("to")) || S.addDays(t, 7);
  const all = url.searchParams.get("all") === "1" && user.role !== "worker";
  const orders = store.listOrders();
  const jobs = P.jobsFor(orders, user, from, to, { all });
  // Scaffolds that are up and due an inspection visit (leaders and owners).
  const visits = user.role === "worker" ? [] : orders.filter((o) => !o.example && o.status === "erected").map((o) => {
    const last = ((o.work && o.work.visits) || []).map((v) => v.at).concat([(o.rental && o.rental.startedAt) || o.updatedAt]).sort().pop();
    const due = S.addDays(last.slice(0, 10), ops().inspectionEveryDays);
    return { ref: o.ref, address: o.site.address, due, overdue: due < t };
  }).filter((v) => v.due <= S.addDays(t, 2));
  const pending = user.role === "worker" ? 0 : store.count("change", "pending");
  return { today: t, from, to, jobs, visits, pendingChanges: pending, crews: crews().map((c) => ({ id: c.id, name: c.name, color: c.color })) };
});

/* ---------- 3D scaffold plan of an order: office, crew, the customer, and a share link anyone with it can open ---------- */
route("GET", /^\/api\/office\/orders\/([A-Z0-9-]+)\/plan$/, (req, m) => {
  requireOffice(req);
  return { plan: O.orderPlan(getOrderOr404(m[1])) };
});
route("POST", /^\/api\/office\/orders\/([A-Z0-9-]+)\/share$/, (req, m) => {
  requireOffice(req);
  const o = getOrderOr404(m[1]);
  if (!o.shareToken) {
    o.shareToken = crypto.randomBytes(12).toString("base64url");
    saveOrder(o);
  }
  return { token: o.shareToken };
});
route("GET", /^\/api\/crew\/jobs\/([A-Z0-9-]+)\/plan$/, (req, m) => {
  const user = requireStaff(req);
  return { plan: O.orderPlan(crewOrder(user, m[1])) };
});
route("POST", /^\/api\/orders\/([A-Z0-9-]+)\/plan$/, async (req, m) => {
  limit(req, "track", 60, 10 * 60e3);
  const body = await readJson(req, 1024);
  return { plan: O.orderPlan(customerOrder(m[1], body.phone)) };
});
// Shared plan: only the scaffold and the house shape, no names, phone numbers or address.
route("GET", /^\/api\/plan\/([\w-]{12,40})$/, (req, m) => {
  limit(req, "plan", 120, 10 * 60e3);
  const o = store.listOrders().find((x) => x.shareToken === m[1]);
  if (!o || o.status === "cancelled") throw new HttpError(404, "not_found", "This link doesn't work any more.");
  return { ref: o.ref, plan: O.orderPlan(o) };
});

route("GET", /^\/api\/crew\/jobs\/([A-Z0-9-]+)$/, (req, m) => {
  const user = requireStaff(req);
  return P.jobCard(store, crewOrder(user, m[1]));
});

route("POST", /^\/api\/crew\/jobs\/([A-Z0-9-]+)\/action$/, async (req, m) => {
  const user = requireStaff(req);
  const body = await readJson(req, 4096);
  const o = crewOrder(user, m[1]);
  const prev = o.status;
  const ev = P.crewAction(store, o, body.action, body, user);
  if (ev === "ready") notify.event(o, "ready", { date: o.rental.startedAt.slice(0, 10), endDate: P.rentalEnd(o) });
  else if (ev) notify.event(o, ev);
  if (body.action === "dismantled") {
    const p = (o.work && o.work.pickup) || {};
    const lost = Object.values(p.missing || {}).reduce((a, b) => a + b, 0) + Object.values(p.damaged || {}).reduce((a, b) => a + b, 0);
    if (lost) notify.alert("stock_short", o.ref, `${o.ref}: ${lost} parts missing or damaged at pickup`);
  }
  saveOrder(o);
  P.audit(store, user, `crew_${body.action}`, o.ref, { from: prev, to: o.status });
  return P.jobCard(store, o);
});

route("PUT", /^\/api\/crew\/jobs\/([A-Z0-9-]+)\/(loadlist|inspection|pickup)$/, async (req, m) => {
  const user = requireStaff(req);
  const body = await readJson(req, 16384);
  const o = crewOrder(user, m[1]);
  if (m[2] === "loadlist") P.saveLoadList(o, body, user);
  else if (m[2] === "inspection") P.saveInspection(o, body, user);
  else P.savePickupCount(o, body, user);
  saveOrder(o);
  return P.jobCard(store, o);
});

route("POST", /^\/api\/crew\/jobs\/([A-Z0-9-]+)\/(photos|signature)$/, async (req, m) => {
  const user = requireStaff(req);
  limit(req, "upload", 120, 10 * 60e3);
  const body = await readJson(req, 7 * 1024 * 1024);
  const o = crewOrder(user, m[1]);
  if (m[2] === "photos") {
    const f = saveImage(o.ref, body.image, { kind: "photo", stage: String(body.stage || "").slice(0, 20), user });
    o.photos = (o.photos || []).concat([{ id: f.id, stage: f.stage, at: f.createdAt, by: user.name, note: O.str(body.note, 200) }]).slice(-60);
  } else {
    const f = saveImage(o.ref, body.image, { kind: "signature", stage: "inspection", user });
    o.work = o.work || {};
    o.work.inspection = { ...(o.work.inspection || {}), signature: f.id, signer: O.str(body.signer, 80), signedAt: f.createdAt };
  }
  o.updatedAt = new Date().toISOString();
  saveOrder(o);
  return P.jobCard(store, o);
});

route("POST", /^\/api\/crew\/jobs\/([A-Z0-9-]+)\/timer$/, async (req, m) => {
  const user = requireStaff(req);
  const body = await readJson(req, 1024);
  const o = crewOrder(user, m[1]);
  P.timer(store, o, user, body.action);
  return P.jobCard(store, o);
});

// A problem or difference found on site: becomes a change request for the office or a leader.
route("POST", /^\/api\/crew\/jobs\/([A-Z0-9-]+)\/report$/, async (req, m) => {
  const user = requireStaff(req);
  const body = await readJson(req, 16384);
  const o = crewOrder(user, m[1]);
  const c = P.createChange(store, o, { ...body, type: body.type === "house" ? "house" : "other" }, { source: "crew", user, pricing: pricing(), orders: store.listOrders() });
  saveOrder(o);
  const what = c.type === "house" ? `size differs (new price ${c.after ? c.after.total : "?"} €)` : O.str(body.note, 120) || "problem on site";
  notify.alert("problem", o.ref, `${o.ref}: ${user.name} reports ${what}`, { id: c.id });
  P.audit(store, user, "crew_report", o.ref, { change: c.id });
  return P.jobCard(store, o);
});

/* ---------- Change requests (office and team leaders) ---------- */
route("GET", /^\/api\/(office|crew)\/changes$/, (req, m, url) => {
  requireOffice(req);
  const status = url.searchParams.get("status") || "pending";
  const list = (status === "all" ? store.list("change", { limit: 300 }) : store.list("change", { status, limit: 300 })).map(P.publicChange);
  const orders = Object.fromEntries(list.map((c) => [c.ref, store.getOrder(c.ref)]).filter(([, o]) => o));
  return { changes: list.map((c) => ({ ...c, order: orders[c.ref] ? { address: orders[c.ref].site.address, customer: orders[c.ref].customer.name, status: orders[c.ref].status } : null })) };
});

route("POST", /^\/api\/(office|crew)\/changes\/([\w-]+)\/(approve|reject)$/, async (req, m) => {
  const user = requireOffice(req);
  const body = await readJson(req, 4096);
  const c = store.get("change", m[2]);
  if (!c) throw new HttpError(404, "not_found", "Change request not found.");
  const o = getOrderOr404(c.ref);
  const approve = m[3] === "approve";
  P.decideChange(store, o, c, approve, { user, pricing: pricing(), reason: body.reason });
  saveOrder(o);
  if (c.source === "customer" || c.type !== "other") {
    notify.event(o, approve ? "change_approved" : "change_rejected", { vars: { change: P.describeChange(c, o.lang), reason: c.reason } });
  }
  P.audit(store, user, approve ? "change_approved" : "change_rejected", o.ref, { id: c.id });
  return { change: P.publicChange(c), order: o };
});

/* ---------- Office ---------- */
function officeOrderView(o) {
  return {
    ...o,
    changes: store.list("change", { ref: o.ref }).map(P.publicChange),
    outbox: store.list("msg", { ref: o.ref, limit: 100 }),
    time: store.list("time", { ref: o.ref }),
    invoices: store.list("invoice", { ref: o.ref }),
    audit: store.list("audit", { ref: o.ref, limit: 200 }),
    files: store.list("file", { ref: o.ref }),
    review: store.get("review", `rev_${o.ref}`),
    rentalEnd: P.rentalEnd(o)
  };
}

route("GET", /^\/api\/office\/orders$/, (req) => {
  requireOffice(req);
  const pendingByRef = {};
  for (const c of store.list("change", { status: "pending" })) pendingByRef[c.ref] = (pendingByRef[c.ref] || 0) + 1;
  return { orders: store.listOrders(2000).map((o) => ({ ...o, pendingChanges: pendingByRef[o.ref] || 0 })), crews: crews() };
});

route("GET", /^\/api\/office\/orders\/([A-Z0-9-]+)$/, (req, m) => {
  requireOffice(req);
  return { order: officeOrderView(getOrderOr404(m[1])), crews: crews() };
});

route("PATCH", /^\/api\/office\/orders\/([A-Z0-9-]+)$/, async (req, m) => {
  const user = requireOffice(req);
  const body = await readJson(req, 16384);
  const o = getOrderOr404(m[1]);
  const prev = o.status;
  if (body.cancel) {
    if (["dismantled", "closed"].includes(o.status)) throw new HttpError(409, "order_finished", "This order is already finished.");
    o.status = "cancelled";
    o.cancelled = { at: new Date().toISOString(), by: user.name, reason: O.str(body.cancel.reason, 300) };
    O.pushHistory(o, { status: "cancelled", at: o.cancelled.at, by: user.name });
  } else if (body.status === "cancelled") {
    throw new HttpError(400, "use_cancel", "Use cancel to cancel an order.");
  }
  const { message, ...rest } = body;
  O.officePatch(o, { ...rest, status: body.cancel ? undefined : body.status, message: undefined });
  if (body.status && prev === "cancelled" && body.status !== "cancelled") o.cancelled = null;
  if (body.internalNotes !== undefined) o.internalNotes = O.str(body.internalNotes, 2000);
  if (body.geo && Number.isFinite(Number(body.geo.lat)) && Number.isFinite(Number(body.geo.lon))) o.geo = { lat: Number(body.geo.lat), lon: Number(body.geo.lon) };
  let changed = [];
  if (body.assignment) changed = P.setAssignment(store, o, body.assignment, user);
  if (message !== undefined && O.str(message, 1000)) {
    o.messages = (o.messages || []).concat([{ from: "office", text: O.str(message, 1000), at: new Date().toISOString(), by: user.name }]).slice(-200);
    notify.event(o, "office_reply", { vars: { text: O.str(message, 300) } });
  }
  afterStatusChange(o, prev, user);
  if (changed.includes("pickupDate") && o.assignment.pickupDate) notify.event(o, "pickup_scheduled", { date: o.assignment.pickupDate, time: o.assignment.pickupTime });
  if (changed.length) P.audit(store, user, "scheduled", o.ref, o.assignment);
  o.updatedAt = new Date().toISOString();
  saveOrder(o);
  return { order: officeOrderView(o) };
});

route("DELETE", /^\/api\/office\/orders\/([A-Z0-9-]+)$/, (req, m) => {
  const user = requireOwner(req);
  if (!store.deleteOrder(m[1])) throw new HttpError(404, "not_found", "Order not found.");
  P.audit(store, user, "order_deleted", m[1], null);
  return { ok: true };
});

route("GET", /^\/api\/office\/calendar$/, (req, m, url) => {
  requireOffice(req);
  const from = P.isoDate(url.searchParams.get("from")) || P.weekStart(P.today());
  const n = Math.min(42, Math.max(1, Number(url.searchParams.get("days")) || 14));
  const days = Array.from({ length: n }, (_, i) => S.addDays(from, i));
  const to = days[days.length - 1];
  const orders = store.listOrders();
  const o0 = ops(), cr = crews();
  const jobs = P.jobsFor(orders, { role: "owner" }, from, to, { all: true });
  const unassigned = orders.filter((o) => ["received", "confirmed"].includes(o.status) && !(o.assignment && o.assignment.date && o.assignment.crewId))
    .map((o) => ({ ref: o.ref, status: o.status, start: o.schedule.start, days: o.schedule.days, urgency: o.schedule.urgency, address: o.site.address, area: o.estimate.area, customer: o.customer.name, example: !!o.example }));
  const pickupsToPlan = orders.filter((o) => o.status === "pickup_requested" && !(o.assignment && o.assignment.pickupDate))
    .map((o) => ({ ref: o.ref, address: o.site.address, area: o.estimate.area, rentalEnd: P.rentalEnd(o), customer: o.customer.name }));
  const cap = S.capacityPerDay(o0, cr);
  return {
    from, days, crews: cr, jobs, unassigned, pickupsToPlan,
    capacity: days.map((d) => ({ date: d, booked: S.jobsOn(orders, d), max: cap === Infinity ? null : cap }))
  };
});

// Sites for the office map. Orders without coordinates are looked up in the background.
const geoQueue = new Set();
route("GET", /^\/api\/office\/map$/, (req) => {
  requireOffice(req);
  const o0 = ops();
  const cr = Object.fromEntries(crews().map((c) => [c.id, c]));
  const sites = store.listOrders().filter((o) => S.HOLDS_STOCK.has(o.status) || o.status === "dismantled").map((o) => {
    if (!o.geo && o.site.address) geoQueue.add(o.ref);
    const a = o.assignment || {};
    const w = o.weather || null;
    return {
      ref: o.ref, status: o.status, address: o.site.address, zone: o.site.zone, geo: o.geo || null, example: !!o.example,
      customer: o.customer.name, area: o.estimate.area, urgency: o.schedule.urgency, start: a.date || o.schedule.start, pickupDate: a.pickupDate || null,
      rentalEnd: P.rentalEnd(o), crew: a.crewId && cr[a.crewId] ? { name: cr[a.crewId].name, color: cr[a.crewId].color } : null,
      wind: w && w.maxGust !== undefined ? { maxGust: w.maxGust, peakAt: w.peakAt, warn: w.maxGust >= o0.windWarnMs } : null
    };
  });
  return { sites, windWarnMs: o0.windWarnMs, locating: geoQueue.size };
});

route("GET", /^\/api\/office\/stock$/, (req) => {
  requireOffice(req);
  return { ...S.overview(store.listOrders(), stockCfg(), P.today()), moves: store.list("stockmove", { limit: 200 }) };
});
route("PUT", /^\/api\/office\/stock$/, async (req) => {
  const user = requireOwner(req);
  const body = await readJson(req, 16384);
  const st = S.mergeStock({ ...stockCfg(), ...body, owned: { ...stockCfg().owned, ...(body.owned || {}) }, prices: { ...stockCfg().prices, ...(body.prices || {}) } });
  store.setSetting("stock", st);
  P.audit(store, user, "stock_settings", null, { enabled: st.enabled });
  return { ...S.overview(store.listOrders(), st, P.today()), moves: store.list("stockmove", { limit: 200 }) };
});
// Purchases, write-offs and corrections, with a reason. Keeps a ledger.
route("POST", /^\/api\/office\/stock\/move$/, async (req) => {
  const user = requireOwner(req);
  const body = await readJson(req, 4096);
  if (!S.PART_KEYS.includes(body.part)) throw new HttpError(400, "bad_part", "Unknown part.");
  const delta = Math.round(Number(body.delta));
  if (!Number.isFinite(delta) || !delta || Math.abs(delta) > 1e5) throw new HttpError(400, "bad_qty", "Give a quantity, + for added and − for removed.");
  const st = stockCfg();
  st.owned[body.part] = Math.max(0, st.owned[body.part] + delta);
  store.setSetting("stock", st);
  store.put("stockmove", { part: body.part, delta, reason: O.str(body.reason, 200), ref: body.ref || null, by: user.name, after: st.owned[body.part] });
  return { ...S.overview(store.listOrders(), st, P.today()), moves: store.list("stockmove", { limit: 200 }) };
});

route("GET", /^\/api\/office\/alerts$/, (req) => {
  const user = requireOffice(req);
  return { alerts: store.list("alert", { limit: 200 }).map((a) => ({ ...a, read: (a.readBy || []).includes(user.id) })) };
});
route("POST", /^\/api\/office\/alerts\/read$/, async (req) => {
  const user = requireOffice(req);
  const body = await readJson(req, 16384);
  const ids = body.all ? store.list("alert", { status: "new", limit: 1000 }).map((a) => a.id) : Array.isArray(body.ids) ? body.ids : [];
  for (const id of ids.slice(0, 1000)) {
    const a = store.get("alert", id);
    if (!a) continue;
    a.readBy = Array.from(new Set([...(a.readBy || []), user.id]));
    a.status = "read";
    store.put("alert", a);
  }
  return { ok: true };
});

route("GET", /^\/api\/office\/outbox$/, (req) => {
  requireOffice(req);
  return { messages: store.list("msg", { limit: 300 }), status: notify.status() };
});
route("POST", /^\/api\/office\/outbox\/([\w-]+)\/send$/, async (req, m) => {
  requireOffice(req);
  const msg = store.get("msg", m[1]);
  if (!msg) throw new HttpError(404, "not_found", "Message not found.");
  const st = notify.status();
  if (msg.channel === "email" ? !st.email.connected : !st.sms.connected) throw new HttpError(409, "not_connected", msg.channel === "email" ? "Email isn't connected yet." : "Text messages aren't connected yet.");
  await notify.flush({ ids: [msg.id] });
  return { message: store.get("msg", msg.id) };
});

route("GET", /^\/api\/office\/leads$/, (req) => {
  requireOffice(req);
  return { leads: store.listLeads(200) };
});
route("DELETE", /^\/api\/office\/leads\/(\d+)$/, (req, m) => {
  requireOffice(req);
  if (!store.deleteLead(Number(m[1]))) throw new HttpError(404, "not_found", "Message not found.");
  return { ok: true };
});

/* Money and settings: head of company only */
route("GET", /^\/api\/office\/pricing$/, (req) => {
  requireOwner(req);
  return { pricing: pricing(), defaults: E.DEFAULT_PRICING };
});
route("PUT", /^\/api\/office\/pricing$/, async (req) => {
  const user = requireOwner(req);
  const body = await readJson(req, 8192);
  const p = O.mergePricing(body.pricing);
  store.setSetting("pricing", p);
  P.audit(store, user, "pricing", null, null);
  return { pricing: p };
});

route("GET", /^\/api\/office\/settings$/, (req) => {
  requireOwner(req);
  return { settings: ops(), defaults: P.DEFAULT_OPS, messaging: notify.status() };
});
route("PUT", /^\/api\/office\/settings$/, async (req) => {
  const user = requireOwner(req);
  const body = await readJson(req, 16384);
  const merged = P.mergeOps({ ...ops(), ...(body.settings || {}), company: { ...ops().company, ...((body.settings && body.settings.company) || {}) } });
  store.setSetting("ops", merged);
  P.audit(store, user, "settings", null, null);
  return { settings: merged, defaults: P.DEFAULT_OPS, messaging: notify.status() };
});

route("GET", /^\/api\/office\/templates$/, (req) => {
  requireOwner(req);
  return { templates: notify.templates(), events: notify.EVENTS };
});
route("PUT", /^\/api\/office\/templates$/, async (req) => {
  requireOwner(req);
  const body = await readJson(req, 65536);
  store.setSetting("templates", mergeTemplates(body.templates));
  return { templates: notify.templates(), events: notify.EVENTS };
});

route("GET", /^\/api\/office\/content$/, (req) => {
  requireOwner(req);
  return { content: P.mergeContent(store.getSetting("content")) };
});
route("PUT", /^\/api\/office\/content$/, async (req) => {
  requireOwner(req);
  const body = await readJson(req, 131072);
  const c = P.mergeContent(body.content);
  store.setSetting("content", c);
  return { content: c };
});

route("GET", /^\/api\/office\/dashboard$/, (req) => {
  requireOwner(req);
  return P.dashboard(store, store.listOrders(), { ops: ops(), crews: crews() });
});
route("GET", /^\/api\/office\/margins$/, (req) => {
  requireOwner(req);
  return P.margins(store, store.listOrders(), { ops: ops() });
});
route("GET", /^\/api\/office\/audit$/, (req, m, url) => {
  requireOwner(req);
  const ref = url.searchParams.get("ref");
  return { entries: store.list("audit", ref ? { ref, limit: 300 } : { limit: 300 }) };
});

/* Team */
route("GET", /^\/api\/office\/staff$/, (req) => {
  requireOffice(req);
  return { staff: store.list("staff").map(P.publicStaff), crews: crews() };
});
route("POST", /^\/api\/office\/staff$/, async (req) => {
  const user = requireOwner(req);
  const s = P.saveStaff(store, await readJson(req, 4096));
  P.audit(store, user, "staff_added", null, { id: s.id, name: s.name, role: s.role });
  return { staff: P.publicStaff(s) };
});
route("PATCH", /^\/api\/office\/staff\/([\w-]+)$/, async (req, m) => {
  const user = requireOwner(req);
  const s0 = store.get("staff", m[1]);
  if (!s0) throw new HttpError(404, "not_found", "Staff member not found.");
  const s = P.saveStaff(store, await readJson(req, 4096), s0);
  P.audit(store, user, "staff_changed", null, { id: s.id, name: s.name });
  return { staff: P.publicStaff(s) };
});
route("DELETE", /^\/api\/office\/staff\/([\w-]+)$/, (req, m) => {
  const user = requireOwner(req);
  if (!store.del("staff", m[1])) throw new HttpError(404, "not_found", "Staff member not found.");
  P.audit(store, user, "staff_removed", null, { id: m[1] });
  return { ok: true };
});
route("POST", /^\/api\/office\/crews$/, async (req) => {
  requireOwner(req);
  return { crew: P.saveCrew(store, await readJson(req, 4096)) };
});
route("PATCH", /^\/api\/office\/crews\/([\w-]+)$/, async (req, m) => {
  requireOwner(req);
  const c0 = store.get("crew", m[1]);
  if (!c0) throw new HttpError(404, "not_found", "Crew not found.");
  return { crew: P.saveCrew(store, await readJson(req, 4096), c0) };
});
route("DELETE", /^\/api\/office\/crews\/([\w-]+)$/, (req, m) => {
  requireOwner(req);
  if (store.list("staff").some((s) => s.crewId === m[1])) throw new HttpError(409, "crew_has_staff", "Move the crew's members to another crew first.");
  if (!store.del("crew", m[1])) throw new HttpError(404, "not_found", "Crew not found.");
  return { ok: true };
});

/* Partner accounts */
route("GET", /^\/api\/office\/accounts$/, (req) => {
  requireOwner(req);
  const orders = store.listOrders();
  const users = store.list("bizuser", { limit: 5000 });
  return { accounts: store.list("account").map((a) => ({ ...a, portalUsers: users.filter((u) => u.accountId === a.id).length, orders: orders.filter((o) => o.accountId === a.id).map((o) => ({ ref: o.ref, status: o.status, total: o.quote.total, createdAt: o.createdAt, address: o.site.address })) })) };
});
route("POST", /^\/api\/office\/accounts$/, async (req) => {
  requireOwner(req);
  return { account: P.saveAccount(store, await readJson(req, 8192)) };
});
route("PATCH", /^\/api\/office\/accounts\/([\w-]+)$/, async (req, m) => {
  requireOwner(req);
  const a0 = store.get("account", m[1]);
  if (!a0) throw new HttpError(404, "not_found", "Account not found.");
  return { account: P.saveAccount(store, await readJson(req, 8192), a0) };
});
route("DELETE", /^\/api\/office\/accounts\/([\w-]+)$/, (req, m) => {
  requireOwner(req);
  if (!store.del("account", m[1])) throw new HttpError(404, "not_found", "Account not found.");
  return { ok: true };
});

/* Invoices */
// Portal users of a business customer (the office creates the first admin; the company's admin adds the rest).
route("GET", /^\/api\/office\/accounts\/([\w-]+)\/users$/, (req, m) => {
  requireOwner(req);
  if (!store.get("account", m[1])) throw new HttpError(404, "not_found", "Account not found.");
  return { users: store.list("bizuser", { limit: 5000 }).filter((u) => u.accountId === m[1]).map(B.publicBizUser) };
});
route("POST", /^\/api\/office\/accounts\/([\w-]+)\/users$/, async (req, m) => {
  const user = requireOwner(req);
  if (!store.get("account", m[1])) throw new HttpError(404, "not_found", "Account not found.");
  const u = B.saveBizUser(store, m[1], await readJson(req, 4096), null);
  P.audit(store, user, "biz_user_added", null, { name: u.name, account: m[1] });
  return { user: B.publicBizUser(u) };
});
route("PATCH", /^\/api\/office\/accounts\/([\w-]+)\/users\/([\w-]+)$/, async (req, m) => {
  requireOwner(req);
  const u = store.get("bizuser", m[2]);
  if (!u || u.accountId !== m[1]) throw new HttpError(404, "not_found", "User not found.");
  return { user: B.publicBizUser(B.saveBizUser(store, m[1], await readJson(req, 4096), u)) };
});
route("DELETE", /^\/api\/office\/accounts\/([\w-]+)\/users\/([\w-]+)$/, (req, m) => {
  requireOwner(req);
  const u = store.get("bizuser", m[2]);
  if (!u || u.accountId !== m[1]) throw new HttpError(404, "not_found", "User not found.");
  store.del("bizuser", u.id);
  return { ok: true };
});
route("GET", /^\/api\/office\/invoices\/([\w-]+)\/finvoice$/, (req, m) => {
  requireOwner(req);
  const iv = store.get("invoice", m[1]);
  const o = iv ? store.getOrder(iv.ref) : null;
  if (!iv || !o) throw new HttpError(404, "not_found", "Invoice not found.");
  return finvoiceFile(iv, o);
});

route("GET", /^\/api\/office\/invoices$/, (req) => {
  requireOwner(req);
  return { invoices: store.list("invoice", { limit: 2000 }) };
});
route("GET", /^\/api\/office\/invoices\.csv$/, (req) => {
  requireOwner(req);
  const list = store.list("invoice", { limit: 5000 }).filter((iv) => iv.status !== "draft");
  return new Raw(Docs.invoicesCsv(list, (ref) => store.getOrder(ref)), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="telinekiito-invoices-${P.today()}.csv"` });
});
route("POST", /^\/api\/office\/orders\/([A-Z0-9-]+)\/invoice$/, (req, m) => {
  const user = requireOwner(req);
  const o = getOrderOr404(m[1]);
  if (store.list("invoice", { ref: o.ref }).some((iv) => iv.status !== "void")) throw new HttpError(409, "already_invoiced", "This order already has an invoice. Void it first to make a new one.");
  const iv = store.put("invoice", P.buildInvoice(store, o, { pricing: pricing(), ops: ops(), stock: stockCfg() }));
  o.invoiceNo = iv.no;
  saveOrder(o);
  P.audit(store, user, "invoice_created", o.ref, { no: iv.no, total: iv.total });
  return { invoice: iv };
});
route("PATCH", /^\/api\/office\/invoices\/([\w-]+)$/, async (req, m) => {
  const user = requireOwner(req);
  const body = await readJson(req, 4096);
  const iv = store.get("invoice", m[1]);
  if (!iv) throw new HttpError(404, "not_found", "Invoice not found.");
  if (!["draft", "sent", "paid", "void"].includes(body.status)) throw new HttpError(400, "bad_status", "Unknown invoice status.");
  const o = store.getOrder(iv.ref);
  if (body.status === "sent" && iv.status === "draft" && o) {
    const lang = o.lang === "en" ? "en" : "fi";
    const eur = new Intl.NumberFormat(lang === "fi" ? "fi-FI" : "en-GB", { style: "currency", currency: "EUR" }).format(iv.total);
    notify.event(o, "invoice", { vars: { invoiceNo: iv.no, due: new Date(iv.due + "T12:00:00Z").toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB", { timeZone: "UTC" }), reference: iv.reference, total: eur } });
    if (o.status === "dismantled") {
      o.status = "closed";
      O.pushHistory(o, { status: "closed", at: new Date().toISOString(), by: user.name });
      saveOrder(o);
    }
  }
  iv.status = body.status;
  if (body.status === "paid") iv.paidAt = new Date().toISOString();
  store.put("invoice", iv);
  P.audit(store, user, `invoice_${body.status}`, iv.ref, { no: iv.no });
  return { invoice: iv };
});

/* Reviews */
route("GET", /^\/api\/office\/reviews$/, (req) => {
  requireOwner(req);
  return { reviews: store.list("review", { limit: 500 }) };
});
route("PATCH", /^\/api\/office\/reviews\/([\w-]+)$/, async (req, m) => {
  requireOwner(req);
  const body = await readJson(req, 1024);
  const r = store.get("review", m[1]);
  if (!r) throw new HttpError(404, "not_found", "Review not found.");
  if (body.published && !r.consent) throw new HttpError(409, "no_consent", "The customer didn't allow publishing this review.");
  r.published = Boolean(body.published);
  r.status = r.published ? "published" : "hidden";
  store.put("review", r);
  return { review: r };
});

route("GET", /^\/api\/office\/weather$/, async (req) => {
  requireOffice(req);
  const o0 = ops();
  const sites = store.listOrders().filter((o) => o.geo && S.HOLDS_STOCK.has(o.status) && o.status !== "received").slice(0, 40);
  const out = [];
  for (const o of sites) {
    try {
      const f = await weather.forecast(o.geo.lat, o.geo.lon);
      out.push({ ref: o.ref, address: o.site.address, maxGust: f.maxGust, maxWind: f.maxWind, peakAt: f.peakAt, warn: f.maxGust >= o0.windWarnMs });
    } catch (e) {
      out.push({ ref: o.ref, address: o.site.address, error: e.message });
    }
  }
  return { threshold: o0.windWarnMs, sites: out };
});

/* ---------- Files and documents (staff, or the customer with order number + last four phone digits) ---------- */
function canSee(req, url, ref) {
  if (sessionUser(req)) return true;
  const t = auth.verify(url.searchParams.get("t"));
  return Boolean(ref && t && t.sid === `c:${ref}`);
}

route("GET", /^\/api\/files\/([\w-]+)$/, (req, m, url) => {
  const f = store.get("file", m[1]);
  if (!f || !canSee(req, url, f.ref)) throw new HttpError(404, "not_found", "File not found.");
  const p = path.join(FILES_DIR, `${f.id}.${f.ext}`);
  if (!fs.existsSync(p)) throw new HttpError(404, "not_found", "File not found.");
  return new Raw(fs.readFileSync(p), { "Content-Type": f.mime, "Cache-Control": "private, max-age=3600" });
});

route("GET", /^\/doc\/(confirmation|inspection)\/([A-Z0-9-]+)$/, (req, m, url) => {
  const o = store.getOrder(m[2]);
  if (!o || !canSee(req, url, o.ref)) throw new HttpError(404, "not_found", "Document not found.");
  const t = url.searchParams.get("t");
  const fileUrl = (id) => `/api/files/${id}${t ? `?t=${encodeURIComponent(t)}` : ""}`;
  const company = ops().company;
  const html = m[1] === "confirmation"
    ? Docs.confirmation(o, { company, vatPct: pricing().vat })
    : Docs.inspection(o, { company, fileUrl, items: P.requiredItems(o) });
  return new Raw(html, { ...DOC_HEADERS, "Content-Type": "text/html; charset=utf-8" });
});

route("GET", /^\/doc\/invoice\/([\w-]+)$/, (req, m, url) => {
  const iv = store.get("invoice", m[1]);
  const staff = sessionUser(req);
  if (!iv || (!staff && (iv.status === "draft" || !canSee(req, url, iv.ref)))) throw new HttpError(404, "not_found", "Document not found.");
  const html = Docs.invoice(iv, store.getOrder(iv.ref), { company: ops().company, note: ops().invoiceNote });
  return new Raw(html, { ...DOC_HEADERS, "Content-Type": "text/html; charset=utf-8" });
});

/* ---------- Static files ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json"
};
const hasSite = () => fs.existsSync(path.join(SITE_DIR, "index.html"));

// The website's pages run Next.js inline scripts, embed an OpenStreetMap iframe and (office) draw map tiles.
const SITE_HEADERS = {
  ...SECURITY_HEADERS,
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "connect-src 'self'",
    "frame-src https://www.openstreetmap.org",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ")
};

function resolveIn(dir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const rel = path.normalize(decoded).replace(/^([/\\])+/, "");
  if (rel.includes("..") || rel.includes("\0")) return null;
  const file = path.join(dir, rel);
  if (!file.startsWith(dir)) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

function sendFile(req, res, file, { site = false, status = 200 } = {}) {
  const ext = path.extname(file);
  const immutable = site && file.includes(`${path.sep}_next${path.sep}static${path.sep}`);
  const headers = {
    ...(site ? SITE_HEADERS : SECURITY_HEADERS),
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : ext === ".html" || path.basename(file).endsWith("-sw.js") ? "no-cache" : "public, max-age=300"
  };
  if (path.basename(file) === "crew-sw.js") headers["Service-Worker-Allowed"] = "/";
  res.writeHead(status, headers);
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

function serveStatic(req, res, pathname) {
  if (pathname === "/mvp") return sendFile(req, res, path.join(PUBLIC_DIR, "index.html"));
  // Until the new office is built into the site, keep the old office page.
  if (pathname === "/office" && !fs.existsSync(path.join(SITE_DIR, "office.html"))) return sendFile(req, res, path.join(PUBLIC_DIR, "office.html"));
  if (pathname === "/engine.js") return sendFile(req, res, path.join(__dirname, "lib", "engine.js"));
  if (hasSite()) {
    if (pathname === "/") return sendFile(req, res, path.join(SITE_DIR, "index.html"), { site: true });
    const clean = pathname.replace(/\/+$/, "") || "/";
    const f = resolveIn(SITE_DIR, clean) || (!path.extname(clean) && (resolveIn(SITE_DIR, clean + ".html") || resolveIn(SITE_DIR, clean + "/index.html")));
    if (f) return sendFile(req, res, f, { site: true });
  } else if (pathname === "/") {
    return sendFile(req, res, path.join(PUBLIC_DIR, "index.html"));
  }
  const f = resolveIn(PUBLIC_DIR, pathname);
  return f ? sendFile(req, res, f) : false;
}

function notFound(req, res) {
  const page = path.join(SITE_DIR, "404.html");
  if (req.method === "GET" && fs.existsSync(page)) return sendFile(req, res, page, { site: true, status: 404 });
  send(res, 404, "Not found");
}

/* ---------- Server ---------- */
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return send(res, 400, { error: "bad_url" });
  }
  const pathname = url.pathname;
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.pattern);
      if (!m) continue;
      const out = await r.handler(req, m, url, res);
      if (out instanceof Raw) {
        res.writeHead(out.status, { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...out.headers });
        return res.end(out.body);
      }
      return send(res, 200, out);
    }
    if (pathname.startsWith("/api/")) throw new HttpError(404, "not_found", "Unknown API address.");
    if ((req.method === "GET" || req.method === "HEAD") && serveStatic(req, res, pathname)) return;
    notFound(req, res);
  } catch (e) {
    if (e instanceof HttpError) {
      if (pathname.startsWith("/doc/") && e.status === 404) return notFound(req, res);
      return send(res, e.status, { error: e.code, message: e.message, ...(e.info ? { info: e.info } : {}) });
    }
    console.error("[error]", req.method, pathname, e);
    send(res, 500, { error: "server_error", message: "Something went wrong on the server." });
  }
});

/* ---------- Background jobs: reminders, wind warnings, map locations, retries ---------- */
async function tick() {
  const o0 = ops();
  const t = P.today();
  const orders = store.listOrders();
  for (const o of orders) {
    if (o.example) continue;
    let dirty = false;
    o.reminders = o.reminders || {};
    // Rental ending soon: one reminder per end date.
    if (o.status === "erected") {
      const end = P.rentalEnd(o);
      if (P.daysBetween(t, end) <= o0.rentalReminderDays && P.daysBetween(t, end) >= 0 && o.reminders.rentalEnding !== end) {
        notify.event(o, "rental_ending", { endDate: end });
        o.reminders.rentalEnding = end;
        dirty = true;
      }
      // Inspection visit due (alert for the office and leaders), once per due date.
      const last = ((o.work && o.work.visits) || []).map((v) => v.at).concat([(o.rental && o.rental.startedAt) || o.updatedAt]).sort().pop();
      const due = S.addDays(last.slice(0, 10), o0.inspectionEveryDays);
      if (due <= t && o.reminders.visitDue !== due) {
        notify.alert("visit_due", o.ref, `${o.ref}: inspection visit due – ${o.site.address}`);
        o.reminders.visitDue = due;
        dirty = true;
      }
    }
    if (dirty) store.saveOrder(o);
  }
  // Locate a few sites without coordinates (the map service allows one request per second).
  for (const ref of Array.from(geoQueue).slice(0, 5)) {
    geoQueue.delete(ref);
    const o = store.getOrder(ref);
    if (!o || o.geo) continue;
    const g = await addressSvc.point(o.site.address);
    if (g) { o.geo = g; store.saveOrder(o); }
  }
  await notify.flush().catch(() => {});
}

let lastWeather = 0;
async function weatherTick() {
  if (Date.now() - lastWeather < 3 * 3600e3) return;
  lastWeather = Date.now();
  const o0 = ops();
  const t = P.today();
  const soon = S.addDays(t, 2);
  for (const o of store.listOrders()) {
    if (o.example || !o.geo) continue;
    const a = o.assignment || {};
    const active = S.OUT_ON_SITE.has(o.status) || (o.status === "confirmed" && (a.date || o.schedule.start) <= soon);
    if (!active) continue;
    try {
      const f = await weather.forecast(o.geo.lat, o.geo.lon);
      o.weather = { maxGust: f.maxGust, maxWind: f.maxWind, peakAt: f.peakAt, at: new Date().toISOString() };
      if (f.maxGust >= o0.windWarnMs && (o.reminders || {}).windWarned !== t) {
        notify.alert("weather", o.ref, `${o.ref}: wind gusts up to ${Math.round(f.maxGust)} m/s forecast – ${o.site.address}`, { peakAt: f.peakAt });
        o.reminders = { ...(o.reminders || {}), windWarned: t };
      }
      store.saveOrder(o);
    } catch (e) {
      console.error("[weather]", e.message);
    }
  }
}

if (require.main === module || process.env.RUN_SERVER === "1") {
  server.listen(PORT, () => console.log(`[info] TelineKiito listening on port ${PORT}, data in ${DATA_DIR}`));
  const timer = setInterval(() => {
    tick().catch((e) => console.error("[tick]", e.message));
    weatherTick().catch((e) => console.error("[weather]", e.message));
  }, 10 * 60e3);
  timer.unref();
  setTimeout(() => tick().catch(() => {}), 15e3).unref();
}

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

module.exports = { server, tick };
