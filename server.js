"use strict";
// Telinekiito MVP server. Built-in Node modules only (Node 22+): http, sqlite, crypto.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const E = require("./lib/engine");
const Store = require("./lib/store");
const { makeAuth } = require("./lib/auth");
const { makeLimiter } = require("./lib/ratelimit");
const { createAddressService } = require("./lib/address");
const { createAI } = require("./lib/ai");
const O = require("./lib/orders");
const { HttpError } = O;

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
// The marketing website (Next.js static export, built into ./site by the Dockerfile).
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, "site");
const DEPLOY_DIR = process.env.DEPLOY_DIR || "/deploy";
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 40;

const store = Store.open(DATA_DIR);
const auth = makeAuth({ password: process.env.OFFICE_PASSWORD, secret: process.env.SESSION_SECRET });
const allow = makeLimiter();
const addressSvc = createAddressService();
const ai = createAI({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-6-luna" });

if (!auth.enabled) console.warn("[warn] OFFICE_PASSWORD missing or shorter than 8 characters: office login is disabled.");
if (!ai.enabled) console.warn("[info] OPENAI_API_KEY not set: drawing reading is switched off.");

function pricing() {
  return O.mergePricing(store.getSetting("pricing"));
}

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

function requireOffice(req) {
  const session = auth.verify(cookies(req)[auth.COOKIE]);
  if (!session) throw new HttpError(401, "login_required", "Log in to the office first.");
  return session;
}

function getOrderOr404(ref) {
  const o = /^T[KP]-[A-Z0-9]{4,10}$/.test(ref) ? store.getOrder(ref) : null;
  if (!o) throw new HttpError(404, "not_found", "No order matches that reference and phone number.");
  return o;
}

/* ---------- API routes ---------- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route("GET", /^\/healthz$/, () => ({ ok: true }));

route("GET", /^\/api\/config$/, () => {
  const p = pricing();
  return {
    pricing: p,
    features: { ai: ai.enabled, address: true, office: auth.enabled },
    earliest: O.earliestDates(),
    examples: O.priceExamples(p)
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

// Live price for the website's quote wizard. Same engine and prices as orders.
route("POST", /^\/api\/quote$/, async (req) => {
  limit(req, "quote", 600, 10 * 60e3);
  const body = await readJson(req, 4096);
  return O.quoteFor(O.parseQuoteInput(body), pricing());
});

// Contact form on the website. Messages show in the office.
route("POST", /^\/api\/contact$/, async (req) => {
  limit(req, "contact", 5, 60 * 60e3);
  const body = await readJson(req, 8192);
  if (body.website) return { ok: true }; // hidden honeypot field: bots fill it, people don't
  const lead = store.insertLead(O.parseLead(body));
  console.log(`[contact] message from ${lead.name}`);
  return { ok: true };
});

route("POST", /^\/api\/address$/, async (req) => {
  limit(req, "addr", 20, 10 * 60e3);
  const body = await readJson(req, 4096);
  const text = String(body.address || "").trim().slice(0, 200);
  if (text.length < 5) throw new HttpError(400, "address_short", "Write the street, number and city.");
  try {
    return await addressSvc.lookup(text);
  } catch (e) {
    console.error("[address]", e.message);
    throw new HttpError(502, "lookup_failed", "The map service didn't answer. Try again or enter the size by hand.");
  }
});

route("POST", /^\/api\/ai\/drawing$/, async (req) => {
  if (!ai.enabled) throw new HttpError(503, "ai_not_configured", "Drawing reading isn't switched on yet.");
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

route("POST", /^\/api\/orders$/, async (req) => {
  limit(req, "order", 10, 60 * 60e3);
  const body = await readJson(req, 16384);
  const f = O.parseOrderInput(body);
  const order = O.buildOrder(f, pricing(), (ref) => Boolean(store.getOrder(ref)));
  store.insertOrder(order);
  console.log(`[order] ${order.ref} ${order.estimate.area} m2 ${order.quote.total} EUR`);
  return { ref: order.ref, order: O.publicView(order) };
});

route("GET", /^\/api\/orders\/([A-Z0-9-]+)$/, (req, m, url) => {
  limit(req, "track", 30, 10 * 60e3);
  const o = getOrderOr404(m[1]);
  if (!O.phoneMatches(o, url.searchParams.get("phone"))) throw new HttpError(404, "not_found", "No order matches that reference and phone number.");
  return O.publicView(o);
});

route("POST", /^\/api\/orders\/([A-Z0-9-]+)\/(extend|pickup|message)$/, async (req, m) => {
  limit(req, "track-action", 20, 10 * 60e3);
  const body = await readJson(req, 8192);
  const o = getOrderOr404(m[1]);
  if (!O.phoneMatches(o, body.phone)) throw new HttpError(404, "not_found", "No order matches that reference and phone number.");
  O.customerAction(o, m[2], body, pricing());
  store.saveOrder(o);
  return O.publicView(o);
});

/* Office */
route("POST", /^\/api\/office\/login$/, async (req, m, url, res) => {
  if (!auth.enabled) throw new HttpError(503, "office_disabled", "Set OFFICE_PASSWORD on the server to enable the office.");
  limit(req, "login", 10, 15 * 60e3);
  const body = await readJson(req, 2048);
  if (!auth.checkPassword(body.password)) throw new HttpError(401, "wrong_password", "Wrong password.");
  res.setHeader("Set-Cookie", auth.cookie(auth.issue(), isSecure(req)));
  return { ok: true };
});

route("POST", /^\/api\/office\/logout$/, (req, m, url, res) => {
  res.setHeader("Set-Cookie", auth.clearCookie(isSecure(req)));
  return { ok: true };
});

route("GET", /^\/api\/office\/me$/, (req) => {
  requireOffice(req);
  return { ok: true };
});

route("GET", /^\/api\/office\/orders$/, (req) => {
  requireOffice(req);
  return { orders: store.listOrders(500) };
});

route("PATCH", /^\/api\/office\/orders\/([A-Z0-9-]+)$/, async (req, m) => {
  requireOffice(req);
  const body = await readJson(req, 8192);
  const o = getOrderOr404(m[1]);
  O.officePatch(o, body);
  store.saveOrder(o);
  return { order: o };
});

route("DELETE", /^\/api\/office\/orders\/([A-Z0-9-]+)$/, (req, m) => {
  requireOffice(req);
  if (!store.deleteOrder(m[1])) throw new HttpError(404, "not_found", "Order not found.");
  return { ok: true };
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

route("GET", /^\/api\/office\/pricing$/, (req) => {
  requireOffice(req);
  return { pricing: pricing(), defaults: E.DEFAULT_PRICING };
});

route("PUT", /^\/api\/office\/pricing$/, async (req) => {
  requireOffice(req);
  const body = await readJson(req, 8192);
  const p = O.mergePricing(body.pricing);
  store.setSetting("pricing", p);
  return { pricing: p };
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

// The website's pages run Next.js inline scripts and embed an OpenStreetMap iframe, so they get their own policy.
const SITE_HEADERS = {
  ...SECURITY_HEADERS,
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src https://www.openstreetmap.org",
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
  res.writeHead(status, {
    ...(site ? SITE_HEADERS : SECURITY_HEADERS),
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : ext === ".html" ? "no-cache" : "public, max-age=300"
  });
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

function serveStatic(req, res, pathname) {
  // Old pages: the MVP quote tool (now at /mvp) and the office.
  if (pathname === "/office") return sendFile(req, res, path.join(PUBLIC_DIR, "office.html"));
  if (pathname === "/mvp") return sendFile(req, res, path.join(PUBLIC_DIR, "index.html"));
  if (pathname === "/engine.js") return sendFile(req, res, path.join(__dirname, "lib", "engine.js"));
  if (hasSite()) {
    if (pathname === "/") return sendFile(req, res, path.join(SITE_DIR, "index.html"), { site: true });
    const f = resolveIn(SITE_DIR, pathname) || (!path.extname(pathname) && resolveIn(SITE_DIR, pathname + ".html"));
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
      return send(res, 200, out);
    }
    if (pathname.startsWith("/api/")) throw new HttpError(404, "not_found", "Unknown API address.");
    if ((req.method === "GET" || req.method === "HEAD") && serveStatic(req, res, pathname)) return;
    notFound(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message, ...(e.info ? { info: e.info } : {}) });
    console.error("[error]", req.method, pathname, e);
    send(res, 500, { error: "server_error", message: "Something went wrong on the server." });
  }
});

server.listen(PORT, () => console.log(`[info] Telinekiito listening on port ${PORT}, data in ${DATA_DIR}`));

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

module.exports = { server };
