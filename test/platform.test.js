"use strict";
// Platform flows end to end on a real server with a temporary database:
// roles and logins, crews, the crew job flow, stock limits, change requests, messages, invoices, documents.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const E = require("../lib/engine");
const { helsinkiNow } = require("../lib/orders");

const PASSWORD = "platform-test-pass";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let proc, base, dataDir;

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });

async function req(method, url, body, cookie) {
  const init = { method, headers: {} };
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const r = await fetch(base + url, init);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
async function loginAs(body) {
  const r = await req("POST", "/api/staff/login", body);
  assert.equal(r.status, 200, r.text);
  return r.headers.get("set-cookie").split(";")[0];
}

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tk-platform-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, SITE_DIR: path.join(dataDir, "nosite"), DEPLOY_DIR: path.join(dataDir, "deploy"), OFFICE_PASSWORD: PASSWORD, SESSION_SECRET: "y".repeat(64), OPENAI_API_KEY: "", SMTP_HOST: "", SMS_PROVIDER: "", SEED_EXAMPLES: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  proc.stdout.on("data", (d) => { log += d; });
  proc.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + "/healthz")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server didn't start:\n" + log);
});
test.after(() => {
  if (proc) proc.kill("SIGTERM");
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} // Windows may still hold the db file
});

const start = () => E.earliestStart("express", helsinkiNow());
const orderBody = (over = {}) => ({
  length: 10, width: 8, eave: 3, floors: "1", roofType: "gable", pitch: 30, jobType: "roof", gables: true,
  zone: "A", urgency: "express", start: start(), days: 28, name: "Platform Testi", phone: "040 111 2233",
  email: "testi@example.fi", address: "Testikatu 2, Espoo", notes: "", lang: "fi", lat: 60.2, lon: 24.7, ...over
});

test("whole job: team, crew app, change, invoice, review", async () => {
  const owner = await loginAs({ password: PASSWORD });

  // Team: a crew, a leader and a worker.
  const crew = (await req("POST", "/api/office/crews", { name: "Tiimi 1", truck: "ABC-123" }, owner)).json.crew;
  assert.ok(crew.id && crew.color);
  const leader = (await req("POST", "/api/office/staff", { name: "Liisa Leader", phone: "040 222 0001", role: "leader", crewId: crew.id, pin: "4321", lang: "fi" }, owner)).json.staff;
  const worker = (await req("POST", "/api/office/staff", { name: "Ivan Worker", phone: "040 222 0002", role: "worker", crewId: crew.id, pin: "1234", lang: "ru" }, owner)).json.staff;
  assert.equal(worker.lang, "ru");
  assert.equal((await req("POST", "/api/office/staff", { name: "Dup", phone: "0402220002", role: "worker", pin: "1111" }, owner)).json.error, "phone_taken");
  assert.equal((await req("POST", "/api/office/staff", { name: "Bad", phone: "040 9", role: "worker", pin: "12" }, owner)).status, 400);

  // Wrong PIN, then right PIN.
  assert.equal((await req("POST", "/api/staff/login", { phone: "040 222 0002", pin: "0000" })).json.error, "wrong_login");
  const w = await loginAs({ phone: "+358 40 222 0002", pin: "1234" });
  const l = await loginAs({ phone: "040 222 0001", pin: "4321" });
  assert.equal((await req("GET", "/api/staff/me", undefined, w)).json.user.role, "worker");

  // Roles: workers can't use the office; leaders can't change prices.
  assert.equal((await req("GET", "/api/office/orders", undefined, w)).status, 403);
  assert.equal((await req("GET", "/api/office/orders", undefined, l)).status, 200);
  assert.equal((await req("PUT", "/api/office/pricing", { pricing: {} }, l)).status, 403);

  // Order from the website.
  const placed = await req("POST", "/api/orders", orderBody());
  assert.equal(placed.status, 200, placed.text);
  const ref = placed.json.ref;
  const access = placed.json.order.access;
  // Customer email is written to the outbox and waits because email isn't connected.
  const outbox = (await req("GET", "/api/office/outbox", undefined, owner)).json;
  assert.equal(outbox.status.email.connected, false);
  const rec = outbox.messages.find((m) => m.ref === ref && m.event === "order_received");
  assert.equal(rec.status, "waiting");
  assert.match(rec.body, new RegExp(ref));
  assert.ok((await req("GET", "/api/office/alerts", undefined, owner)).json.alerts.some((a) => a.type === "new_order" && a.ref === ref));

  // Not assigned yet: the worker can't open it.
  assert.equal((await req("GET", `/api/crew/jobs/${ref}`, undefined, w)).status, 403);

  // Office confirms and schedules it for the crew.
  const date = start();
  const sched = await req("PATCH", `/api/office/orders/${ref}`, { status: "confirmed", assignment: { date, time: "08:00", crewId: crew.id } }, owner);
  assert.equal(sched.status, 200, sched.text);
  assert.equal(sched.json.order.crew, "Tiimi 1");
  assert.ok(sched.json.order.outbox.some((m) => m.event === "confirmed"));

  const jobs = (await req("GET", `/api/crew/jobs?from=${date}&to=${date}`, undefined, w)).json.jobs;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, "delivery");

  // Calendar and map for the office.
  const cal = (await req("GET", `/api/office/calendar?from=${date}&days=7`, undefined, owner)).json;
  assert.ok(cal.jobs.some((j) => j.ref === ref));
  const map = (await req("GET", "/api/office/map", undefined, l)).json;
  assert.deepEqual(map.sites.find((s) => s.ref === ref).geo, { lat: 60.2, lon: 24.7 });

  // Crew flow: load, drive, arrive, inspect, sign, erect.
  let card = (await req("GET", `/api/crew/jobs/${ref}`, undefined, w)).json;
  assert.equal(card.customer.phone, "040 111 2233", "the crew sees the full phone number");
  assert.ok(card.parts.length > 3);
  const checked = Object.fromEntries(card.parts.map((p) => [p.key, p.qty]));
  card = (await req("PUT", `/api/crew/jobs/${ref}/loadlist`, { checked }, w)).json;
  assert.equal((await req("POST", `/api/crew/jobs/${ref}/action`, { action: "arrived" }, w)).json.error, "wrong_step");
  card = (await req("POST", `/api/crew/jobs/${ref}/action`, { action: "loaded" }, w)).json;
  assert.equal(card.status, "loading");
  card = (await req("POST", `/api/crew/jobs/${ref}/timer`, { action: "start" }, w)).json;
  card = (await req("POST", `/api/crew/jobs/${ref}/action`, { action: "on_the_way", eta: "30 min" }, w)).json;
  assert.equal(card.status, "en_route");
  card = (await req("POST", `/api/crew/jobs/${ref}/action`, { action: "arrived" }, w)).json;
  assert.ok(card.work.arrivedAt);
  const photo = await req("POST", `/api/crew/jobs/${ref}/photos`, { image: PNG, stage: "erected" }, w);
  assert.equal(photo.status, 200, photo.text);
  const erectEarly = await req("POST", `/api/crew/jobs/${ref}/action`, { action: "erected" }, w);
  assert.equal(erectEarly.json.error, "inspection_incomplete");
  const items = Object.fromEntries(card.inspectionItems.map((k) => [k, true]));
  await req("PUT", `/api/crew/jobs/${ref}/inspection`, { items, notes: "Kaikki kunnossa" }, w);
  assert.equal((await req("POST", `/api/crew/jobs/${ref}/action`, { action: "erected" }, w)).json.error, "signature_missing");
  await req("POST", `/api/crew/jobs/${ref}/signature`, { image: PNG, signer: "Platform Testi" }, w);
  card = (await req("POST", `/api/crew/jobs/${ref}/action`, { action: "erected" }, w)).json;
  assert.equal(card.status, "erected");
  assert.ok(card.rental.startedAt);

  // Inspection record and photo for the customer, through the signed link only.
  const docNo = await req("GET", `/doc/inspection/${ref}`);
  assert.equal(docNo.status, 404);
  const doc = await req("GET", `/doc/inspection/${ref}?t=${encodeURIComponent(access)}`);
  assert.equal(doc.status, 200);
  assert.match(doc.text, /Telineen tarkastuspöytäkirja/);
  assert.match(doc.text, /Platform Testi/);
  const fileId = card.photos[0].id;
  assert.equal((await req("GET", `/api/files/${fileId}`)).status, 404);
  const img = await fetch(`${base}/api/files/${fileId}?t=${encodeURIComponent(access)}`);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal((await req("GET", `/doc/confirmation/${ref}?t=${encodeURIComponent(access)}`)).status, 200);

  // The worker finds the house bigger than quoted: a change request; the leader approves it.
  const before = card.estimate.area;
  card = (await req("POST", `/api/crew/jobs/${ref}/report`, { type: "house", house: { length: 14 }, note: "Talo on pidempi" }, w)).json;
  const change = card.changes.find((c) => c.status === "pending");
  assert.equal(change.source, "crew");
  assert.ok(change.after.total > change.before.total);
  assert.equal((await req("POST", `/api/crew/changes/${change.id}/approve`, {}, w)).status, 403);
  const ok = await req("POST", `/api/crew/changes/${change.id}/approve`, {}, l);
  assert.equal(ok.status, 200, ok.text);
  // The new price waits for the customer; the size and price change once they accept.
  assert.equal(ok.json.order.house.length, 10);
  assert.equal(ok.json.order.priceChange.status, "pending");
  assert.equal(ok.json.order.priceChange.source, "change");
  const accepted = await req("POST", `/api/orders/${ref}/price-change/accept`, { phone: "2233", id: ok.json.order.priceChange.id });
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.json.house.length, 14);
  assert.ok(accepted.json.estimate.area > before);

  // Pickup: customer asks, office plans it, the crew counts parts back and dismantles.
  const view = await req("POST", `/api/orders/${ref}/view`, { phone: "2233" });
  assert.equal(view.json.status, "erected");
  assert.equal((await req("POST", `/api/orders/${ref}/pickup`, { phone: "2233" })).json.status, "pickup_requested");
  const pdate = (await req("GET", "/api/staff/me", undefined, owner)).json.today;
  await req("PATCH", `/api/office/orders/${ref}`, { assignment: { pickupDate: pdate, pickupCrewId: crew.id } }, owner);
  assert.equal((await req("POST", `/api/crew/jobs/${ref}/action`, { action: "dismantled" }, w)).json.error, "count_missing");
  const counted = Object.fromEntries(card.parts.map((p) => [p.key, p.qty]));
  await req("PUT", `/api/crew/jobs/${ref}/pickup`, { counted, missing: { decks: 1 }, notes: "Yksi taso puuttuu" }, w);
  card = (await req("POST", `/api/crew/jobs/${ref}/action`, { action: "dismantled" }, w)).json;
  assert.equal(card.status, "dismantled");
  card = (await req("POST", `/api/crew/jobs/${ref}/timer`, { action: "stop" }, w)).json;
  assert.ok(card.timeEntries.length === 1 && card.timeEntries[0].end);

  // Invoice with a missing-part line once a replacement price is set; sending it closes the order.
  await req("PUT", "/api/office/stock", { prices: { decks: 95 } }, owner);
  const inv = await req("POST", `/api/office/orders/${ref}/invoice`, {}, owner);
  assert.equal(inv.status, 200, inv.text);
  const iv = inv.json.invoice;
  assert.ok(iv.lines.some((l) => l.key === "missing_decks" && l.net === 95));
  assert.match(iv.reference, /^\d+$/);
  assert.equal((await req("POST", `/api/office/orders/${ref}/invoice`, {}, owner)).json.error, "already_invoiced");
  assert.equal((await req("GET", `/doc/invoice/${iv.no}?t=${encodeURIComponent(access)}`)).status, 404, "drafts stay private");
  await req("PATCH", `/api/office/invoices/${iv.no}`, { status: "sent" }, owner);
  const invDoc = await req("GET", `/doc/invoice/${iv.no}?t=${encodeURIComponent(access)}`);
  assert.equal(invDoc.status, 200);
  assert.match(invDoc.text, new RegExp(iv.reference));
  const closed = await req("POST", `/api/orders/${ref}/view`, { phone: "2233" });
  assert.equal(closed.json.status, "closed");
  assert.equal(closed.json.invoices[0].no, iv.no);
  const csv = await fetch(`${base}/api/office/invoices.csv`, { headers: { Cookie: owner } });
  assert.match(await csv.text(), new RegExp(iv.no));

  // Review: published only with consent, then shown on the website.
  await req("POST", `/api/orders/${ref}/review`, { phone: "2233", stars: 5, text: "Nopeaa ja siistiä", consent: true });
  const reviews = (await req("GET", "/api/office/reviews", undefined, owner)).json.reviews;
  await req("PATCH", `/api/office/reviews/${reviews[0].id}`, { published: true }, owner);
  const pub = (await req("GET", "/api/content")).json.reviews;
  assert.equal(pub[0].stars, 5);
  assert.match(pub[0].name, /^Platform/);

  // Reports.
  const dash = (await req("GET", "/api/office/dashboard", undefined, owner)).json;
  assert.ok(dash.kpis.ordersThisWeek >= 1);
  assert.equal((await req("GET", "/api/office/dashboard", undefined, l)).status, 403);
  const mg = (await req("GET", "/api/office/margins", undefined, owner)).json;
  assert.ok(mg.rows.find((r) => r.ref === ref).invoiced);

  // Switching a worker off ends their session.
  await req("PATCH", `/api/office/staff/${worker.id}`, { active: false }, owner);
  assert.equal((await req("GET", "/api/staff/me", undefined, w)).status, 401);
});

test("stock: no overselling, first free date offered", async () => {
  const owner = await loginAs({ password: PASSWORD });
  const quote = { length: 10, width: 8, eave: 3, roofType: "gable", pitch: 30, jobType: "roof", gables: true, days: 28, zone: "A", urgency: "express" };
  const q = (await req("POST", "/api/quote", quote)).json;
  const parts = q.estimate.parts;
  // Own exactly one job's worth of every part.
  const owned = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v]));
  const st = await req("PUT", "/api/office/stock", { enabled: true, owned, bufferDays: 1 }, owner);
  assert.equal(st.status, 200, st.text);
  const first = await req("POST", "/api/orders", orderBody({ phone: "040 333 4455", address: "Varastotie 1, Vantaa" }));
  assert.equal(first.status, 200, first.text);
  const second = await req("POST", "/api/orders", orderBody({ phone: "040 333 4466", address: "Varastotie 2, Vantaa" }));
  assert.equal(second.status, 409);
  assert.equal(second.json.error, "not_enough_stock");
  assert.ok(second.json.info.date > start(), "the next free date is after the first rental");
  const again = (await req("POST", "/api/quote", quote)).json;
  assert.equal(again.available.express, second.json.info.date);
  const ov = (await req("GET", "/api/office/stock", undefined, owner)).json;
  assert.equal(ov.parts.find((p) => p.key === "frames").reserved, parts.frames);
  // Buying more frames etc. frees the date again.
  for (const [k, v] of Object.entries(parts)) if (v) await req("POST", "/api/office/stock/move", { part: k, delta: v, reason: "Purchase" }, owner);
  assert.equal((await req("POST", "/api/orders", orderBody({ phone: "040 333 4466", address: "Varastotie 2, Vantaa" }))).status, 200);
  await req("PUT", "/api/office/stock", { enabled: false }, owner);
});

test("partner code, switches, content and messaging status", async () => {
  const owner = await loginAs({ password: PASSWORD });
  const acc = (await req("POST", "/api/office/accounts", { name: "Kattomestarit Oy", code: "KATTO10", discountPct: 10 }, owner)).json.account;
  assert.equal(acc.code, "KATTO10");
  const quote = { length: 10, width: 8, eave: 3, roofType: "gable", pitch: 30, jobType: "roof", gables: true, days: 28, zone: "A", urgency: "standard" };
  const plain = (await req("POST", "/api/quote", quote)).json.quote.total;
  const partner = (await req("POST", "/api/quote", { ...quote, partnerCode: "katto10" })).json;
  assert.equal(partner.partner.name, "Kattomestarit Oy");
  assert.ok(Math.abs(partner.quote.total - plain * 0.9) < 0.05);
  assert.equal((await req("POST", "/api/quote", { ...quote, partnerCode: "NOPE" })).json.partner.invalid, true);
  const o = await req("POST", "/api/orders", orderBody({ partnerCode: "KATTO10", phone: "040 555 1212", urgency: "standard", start: E.earliestStart("standard", helsinkiNow()) }));
  assert.equal(o.status, 200, o.text);
  assert.ok(o.json.order.quote.lines.some((l) => l.key === "discount"));
  const accounts = (await req("GET", "/api/office/accounts", undefined, owner)).json.accounts;
  assert.equal(accounts[0].orders.length, 1);

  // Switching the 24 h option off hides it from the website and refuses orders for it.
  await req("PUT", "/api/office/settings", { settings: { urgencies: { emergency: false } } }, owner);
  const cfg = (await req("GET", "/api/config")).json;
  assert.equal(cfg.urgencies.emergency, false);
  assert.equal(cfg.earliest.emergency, null);
  assert.equal((await req("POST", "/api/orders", orderBody({ urgency: "emergency", start: E.earliestStart("emergency", helsinkiNow()), phone: "040 555 9999" }))).json.error, "urgency_off");
  await req("PUT", "/api/office/settings", { settings: { urgencies: { emergency: true } } }, owner);

  // Editable FAQ and contact details.
  await req("PUT", "/api/office/content", { content: { faq: [{ q: { fi: "Kysymys?", en: "Question?" }, a: { fi: "Vastaus.", en: "Answer." } }], contact: { phone: "040 123 4567", email: "info@example.fi" } } }, owner);
  const content = (await req("GET", "/api/content")).json;
  assert.equal(content.faq[0].q.en, "Question?");
  assert.equal(content.contact.phone, "040 123 4567");

  const settings = (await req("GET", "/api/office/settings", undefined, owner)).json;
  assert.equal(settings.messaging.email.connected, false);
  assert.equal(settings.messaging.sms.connected, false);
  const t = (await req("GET", "/api/office/templates", undefined, owner)).json;
  assert.ok(t.templates.confirmed.fi.subject.includes("{ref}"));
  assert.equal((await req("GET", "/healthz/services")).json.email, false);
});
