"use strict";
// Starts the real server on a free port with a temporary database and walks through the main flows.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const E = require("../lib/engine");
const { helsinkiNow } = require("../lib/orders");

const PASSWORD = "test-password-123";
let proc, base, dataDir, siteDir;

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

async function req(method, url, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(base + url, init);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tk-test-"));
  // A tiny stand-in for the built website.
  siteDir = path.join(dataDir, "site");
  fs.mkdirSync(path.join(siteDir, "_next", "static"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "index.html"), "<!doctype html><title>site</title>");
  fs.writeFileSync(path.join(siteDir, "404.html"), "<!doctype html><title>missing</title>");
  fs.writeFileSync(path.join(siteDir, "office.html"), "<!doctype html><title>office</title>");
  fs.writeFileSync(path.join(siteDir, "crew.html"), "<!doctype html><title>crew</title>");
  fs.writeFileSync(path.join(siteDir, "_next", "static", "app.js"), "console.log(1)");
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, SITE_DIR: siteDir, DEPLOY_DIR: path.join(dataDir, "deploy"), OFFICE_PASSWORD: PASSWORD, SESSION_SECRET: "x".repeat(64), OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  proc.stdout.on("data", (d) => { log += d; });
  proc.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/healthz")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server didn't start:\n" + log);
});

test.after(() => {
  if (proc) proc.kill("SIGTERM");
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} // Windows may still hold the db file
});

test("pages and config", async () => {
  for (const p of ["/", "/office", "/crew", "/engine.js", "/common.js", "/quote.js", "/app.css"]) {
    const r = await req("GET", p);
    assert.equal(r.status, 200, p);
  }
  assert.equal((await req("GET", "/../server.js")).status, 404);
  assert.equal((await req("GET", "/%2e%2e/server.js")).status, 404);
  assert.equal((await req("GET", "/%E0%A4%A")).status, 404);
  const c = await req("GET", "/api/config");
  assert.equal(c.json.features.ai, false);
  assert.equal(c.json.features.office, true);
  assert.ok(c.json.pricing.rentPerM2Day > 0);
  assert.match(c.headers.get("content-security-policy"), /script-src 'self'/);
});

test("order, tracking and customer actions", async () => {
  const start = E.earliestStart("express", helsinkiNow());
  const order = { length: 10, width: 8, eave: 5.8, floors: "2", roofType: "gable", pitch: 30, jobType: "roof", gables: true,
    zone: "A", urgency: "express", start, days: 28, name: "Testi Asiakas", phone: "040 765 4321", email: "", address: "Testikatu 1, Espoo", notes: "", source: "form" };

  const bad = await req("POST", "/api/orders", { ...order, name: "" });
  assert.equal(bad.status, 400);
  const early = await req("POST", "/api/orders", { ...order, start: "2020-01-01" });
  assert.equal(early.json.error, "start_too_early");
  assert.equal(early.json.info.date, start);
  const missing = await req("POST", "/api/orders", { ...order, length: 900, zone: "Q" });
  assert.deepEqual(missing.json.info.fields, ["length", "zone"]);
  assert.equal((await req("POST", "/api/orders", "x", { "Content-Type": "text/plain" })).status, 400);

  const r = await req("POST", "/api/orders", order);
  assert.equal(r.status, 200, r.text);
  const ref = r.json.ref;
  assert.match(ref, /^TK-/);
  assert.equal(r.json.order.customer.phone, "••• 4321");

  assert.equal((await req("GET", `/api/orders/${ref}?phone=0000`)).status, 404);
  const t = await req("GET", `/api/orders/${ref}?phone=4321`);
  assert.equal(t.status, 200);
  assert.equal(t.json.status, "received");

  // A longer rental is a request the office approves; the customer sees the new price first.
  const ext = await req("POST", `/api/orders/${ref}/extend`, { phone: "4321" });
  assert.equal(ext.status, 200, ext.text);
  assert.equal(ext.json.schedule.days, 28);
  const ch = ext.json.changes.find((c) => c.status === "pending");
  assert.equal(ch.proposed.days, 35);
  assert.ok(ch.after.total > t.json.quote.total);
  assert.equal((await req("POST", `/api/orders/${ref}/extend`, { phone: "4321" })).json.error, "change_pending");
  assert.ok(ext.json.access, "signed link key for documents");

  const pick = await req("POST", `/api/orders/${ref}/pickup`, { phone: "4321" });
  assert.equal(pick.status, 409);

  const msg = await req("POST", `/api/orders/${ref}/message`, { phone: "4321", text: "Can you come after 9?" });
  assert.equal(msg.json.messages.length, 1);
  assert.equal((await req("POST", `/api/orders/${ref}/message`, { phone: "9999", text: "x" })).status, 404);
});

test("office login, dispatch, pricing and delete", async () => {
  assert.equal((await req("GET", "/api/office/orders")).status, 401);
  assert.equal((await req("POST", "/api/office/login", { password: "wrong-password" })).status, 401);
  const login = await req("POST", "/api/office/login", { password: PASSWORD });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  const H = { Cookie: cookie };

  const list = await req("GET", "/api/office/orders", undefined, H);
  assert.equal(list.status, 200);
  assert.ok(list.json.orders.length >= 4, "3 examples + 1 test order");
  const mine = list.json.orders.find((o) => !o.example);
  assert.equal(mine.customer.phone, "040 765 4321");

  const p1 = await req("PATCH", `/api/office/orders/${mine.ref}`, { status: "erected", crew: "Team 3", eta: "Thu 8–10", message: "On our way" }, H);
  assert.equal(p1.status, 200);
  assert.equal(p1.json.order.status, "erected");
  assert.equal((await req("PATCH", `/api/office/orders/${mine.ref}`, { status: "flying" }, H)).status, 400);

  const before = (await req("GET", `/api/orders/${mine.ref}?phone=4321`)).json.changes.find((c) => c.status === "pending" && c.type === "days");
  assert.ok(before, "a longer rental is waiting for the office");
  const pick = await req("POST", `/api/orders/${mine.ref}/pickup`, { phone: "4321" });
  assert.equal(pick.json.status, "pickup_requested");
  // Asking for pickup closes the request for a longer rental: approving it later would reprice a finished job.
  const moot = pick.json.changes.find((c) => c.id === before.id);
  assert.equal(moot.status, "rejected");
  assert.equal((await req("POST", `/api/office/changes/${moot.id}/approve`, {}, H)).status, 409);
  assert.equal(pick.json.crew, "Team 3");

  const pr = await req("PUT", "/api/office/pricing", { pricing: { rentPerM2Day: 0.2, zones: { A: { trip: 99 } } } }, H);
  assert.equal(pr.json.pricing.rentPerM2Day, 0.2);
  assert.equal(pr.json.pricing.zones.A.trip, 99);
  assert.equal((await req("GET", "/api/config")).json.pricing.rentPerM2Day, 0.2);

  const queued = (await req("GET", "/api/office/outbox", undefined, H)).json.messages.filter((x) => x.ref === mine.ref && x.status === "waiting");
  assert.ok(queued.length > 0, "the order has unsent messages");
  assert.equal((await req("DELETE", `/api/office/orders/${mine.ref}`, undefined, H)).status, 200);
  assert.equal((await req("GET", `/api/orders/${mine.ref}?phone=4321`)).status, 404);
  const after = (await req("GET", "/api/office/outbox", undefined, H)).json.messages.filter((x) => x.ref === mine.ref);
  assert.ok(after.length && after.every((x) => x.status !== "waiting"), "a deleted order's messages are never sent");
  assert.ok(!(await req("GET", "/api/office/alerts", undefined, H)).json.alerts.some((x) => x.ref === mine.ref), "its alerts are gone");

  const out = await req("POST", "/api/office/logout", {}, H);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await req("GET", "/api/office/orders", undefined, { Cookie: "tk_session=forged.token" })).status, 401);
});

test("drawing reading is off without a key, address needs text", async () => {
  assert.equal((await req("POST", "/api/ai/drawing", { images: [] })).status, 503);
  assert.equal((await req("POST", "/api/address", { address: "ab" })).status, 400);
});

test("website files, old tool at /mvp, 404 page", async () => {
  const home = await req("GET", "/");
  assert.equal(home.status, 200);
  assert.match(home.text, /<title>site<\/title>/);
  assert.match(home.headers.get("content-security-policy"), /script-src 'self' 'unsafe-inline'/);
  const js = await req("GET", "/_next/static/app.js");
  assert.match(js.headers.get("cache-control"), /immutable/);
  assert.match((await req("GET", "/mvp")).text, /quote\.js/);
  assert.equal((await req("GET", "/office")).status, 200);
  const miss = await req("GET", "/no-such-page");
  assert.equal(miss.status, 404);
  assert.match(miss.text, /missing/);
  const dep = await req("GET", "/healthz/deploy");
  assert.equal(dep.json.site, true);
  assert.equal(dep.json.status, null);
});

test("live quote, config extras and contact messages", async () => {
  const q = await req("POST", "/api/quote", { length: 15, width: 10, eave: 3, roofType: "gable", pitch: 30, jobType: "roof", gables: true, days: 28, zone: "A", urgency: "standard" });
  assert.equal(q.status, 200);
  assert.equal(q.json.estimate.area, 319);
  // Without a 3D model, the map outline sent back shapes the walls and roof.
  const L = [[0, 0], [12, 0], [12, 5], [5, 5], [5, 10], [0, 10]];
  const ql = await req("POST", "/api/quote", { length: 12, width: 10, eave: 3, roofType: "gable", pitch: 30, jobType: "roof", gables: true, days: 28, zone: "A", urgency: "standard", model: { outline: L } });
  assert.equal(ql.status, 200);
  assert.ok(ql.json.plan.house.outline && ql.json.plan.house.walls.length === 6);
  const cfg = (await req("GET", "/api/config")).json;
  assert.ok(cfg.earliest.emergency < cfg.earliest.standard);
  assert.equal(cfg.examples.totals.standard, q.json.quote.total);
  const bad = await req("POST", "/api/quote", { length: 2 });
  assert.deepEqual(bad.json.info.fields, ["length", "width", "eave", "roofType", "pitch", "jobType"]);

  assert.equal((await req("POST", "/api/contact", { name: "A", email: "nope", message: "hi" })).json.error, "email_invalid");
  assert.equal((await req("POST", "/api/contact", { name: "Testi", email: "testi@example.fi", message: "Tarvitsen telineet" })).status, 200);
  assert.equal((await req("POST", "/api/contact", { name: "Bot", email: "b@b.fi", message: "spam", website: "x" })).status, 200);
  assert.equal((await req("GET", "/api/office/leads")).status, 401);
  const login = await req("POST", "/api/office/login", { password: PASSWORD });
  const H = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const leads = (await req("GET", "/api/office/leads", undefined, H)).json.leads;
  assert.equal(leads.length, 1, "the honeypot message is not stored");
  assert.equal(leads[0].email, "testi@example.fi");
  assert.equal((await req("DELETE", `/api/office/leads/${leads[0].id}`, undefined, H)).status, 200);
  assert.equal((await req("GET", "/api/office/leads", undefined, H)).json.leads.length, 0);
});

test("two scaffold systems: options in the quote, the chosen one on the order, office can switch one off", async () => {
  const house = { length: 12.4, width: 9.9, eave: 2.9, roofType: "gable", pitch: 47, jobType: "roof", gables: true, days: 28, zone: "C" };
  const q = await req("POST", "/api/quote", { ...house, system: "monzon" });
  assert.equal(q.status, 200);
  assert.equal(q.json.estimate.system, "monzon");
  assert.ok(Object.keys(q.json.estimate.parts).every((k) => k.startsWith("mz_")));
  assert.deepEqual(q.json.options.map((o) => o.system), ["layher", "monzon"]);
  assert.equal(q.json.options.find((o) => o.system === "monzon").total, q.json.quote.total);
  const cfg = await req("GET", "/api/config");
  assert.deepEqual(cfg.json.systems.map((s) => [s.key, s.enabled]), [["layher", true], ["monzon", true]]);

  const start = E.earliestStart("standard", helsinkiNow());
  const order = { ...house, floors: "1.5", urgency: "standard", start, name: "Monzon Testi", phone: "040 111 2222", address: "Testikatu 9, Hamina", source: "form", system: "monzon" };
  const placed = await req("POST", "/api/orders", order);
  assert.equal(placed.status, 200, placed.text);
  const login = await req("POST", "/api/office/login", { password: PASSWORD });
  const H = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const detail = await req("GET", `/api/office/orders/${placed.json.ref}`, undefined, H);
  assert.equal(detail.json.order.house.system, "monzon");
  assert.ok(detail.json.order.estimate.parts.mz_standards > 0);

  // Office switches MonZon off: no longer offered, and orders for it are refused.
  const pr = await req("GET", "/api/office/pricing", undefined, H);
  const off = await req("PUT", "/api/office/pricing", { pricing: { ...pr.json.pricing, systems: { layher: { enabled: true }, monzon: { enabled: false, rentPerM2Day: 0.2 } } } }, H);
  assert.equal(off.json.pricing.systems.monzon.enabled, false);
  assert.equal(off.json.pricing.systems.monzon.rentPerM2Day, 0.2);
  const q2 = await req("POST", "/api/quote", { ...house, system: "monzon" });
  assert.equal(q2.json.estimate.system, "layher");
  assert.deepEqual(q2.json.options.map((o) => o.system), ["layher"]);
  const refused = await req("POST", "/api/orders", order);
  assert.equal(refused.json.error, "system_off");
  await req("PUT", "/api/office/pricing", { pricing: pr.json.pricing }, H);
});

test("office layout editor: preview, save and reset change the parts and the price", async () => {
  const login = await req("POST", "/api/office/login", { password: PASSWORD });
  const H = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const start = E.earliestStart("standard", helsinkiNow());
  const order = { length: 12.4, width: 9.9, eave: 2.9, floors: "1.5", roofType: "gable", pitch: 47, jobType: "roof", gables: true, zone: "A", urgency: "standard", start, days: 28, name: "Layout Testi", phone: "040 333 4444", address: "Testikatu 3, Espoo", source: "form" };
  const placed = await req("POST", "/api/orders", order);
  assert.equal(placed.status, 200, placed.text);
  const ref = placed.json.ref;
  const pre = await req("POST", `/api/office/orders/${ref}/layout/preview`, { adjust: { sides: { "Long side A": { bays: 7, lifts: 2 }, "Gable end B": { off: true }, "Nope": { off: true } } } }, H);
  assert.equal(pre.status, 200, pre.text);
  assert.deepEqual(Object.keys(pre.json.adjust.sides).sort(), ["Gable end B", "Long side A"]);
  assert.equal(pre.json.plan.sides.length, 3);
  assert.equal(pre.json.base.length, 4);
  assert.notEqual(pre.json.quote.total, placed.json.order.quote.total);
  // A new price needs a reason for the customer, then waits for them; the old price stays.
  assert.equal((await req("POST", `/api/office/orders/${ref}/layout`, { adjust: pre.json.adjust }, H)).json.error, "reason_required");
  const saved = await req("POST", `/api/office/orders/${ref}/layout`, { adjust: pre.json.adjust, reason: "Pääty B jää pois" }, H);
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.json.order.quote.total, placed.json.order.quote.total);
  assert.equal(saved.json.order.priceChange.status, "pending");
  assert.equal(saved.json.order.priceChange.after.total, pre.json.quote.total);
  assert.equal(saved.json.order.history.at(-1).code, "price_change_proposed");
  // The editor reopens on the waiting layout.
  const again = await req("POST", `/api/office/orders/${ref}/layout/preview`, {}, H);
  assert.equal(again.json.adjust.sides["Long side A"].bays, 7);
  assert.equal(again.json.quote.total, pre.json.quote.total);
  const pc = (await req("POST", `/api/orders/${ref}/view`, { phone: "4444" })).json.priceChange;
  assert.equal(pc.reason, "Pääty B jää pois");
  assert.equal(pc.after.quote.total, pre.json.quote.total);
  assert.equal(pc.after.house, undefined, "the customer sees prices, not the stored layout");
  const accepted = await req("POST", `/api/orders/${ref}/price-change/accept`, { phone: "4444", id: pc.id });
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.json.quote.total, pre.json.quote.total);
  assert.equal(accepted.json.priceChange.status, "accepted");
  assert.equal(accepted.json.history.at(-1).code, "price_change_accepted");
  assert.equal((await req("POST", `/api/orders/${ref}/price-change/accept`, { phone: "4444", id: pc.id })).json.error, "no_price_change");
  const office = (await req("GET", `/api/office/orders/${ref}`, undefined, H)).json.order;
  assert.equal(office.estimate.sides.find((s) => s.name === "Long side A").bays, 7);
  assert.equal(office.priceChange.decidedBy, "Layout Testi");
  // Reset: back to the calculated layout (and price), again for the customer to accept.
  const reset = await req("POST", `/api/office/orders/${ref}/layout`, { adjust: null, reason: "Takaisin alkuperäiseen" }, H);
  assert.equal(reset.json.order.priceChange.status, "pending");
  assert.equal((await req("POST", `/api/orders/${ref}/price-change/accept`, { phone: "4444" })).status, 200);
  const back = (await req("GET", `/api/office/orders/${ref}`, undefined, H)).json.order;
  assert.equal(back.house.adjust, undefined);
  assert.equal(back.estimate.sides.length, 4);
  assert.equal(back.quote.total, placed.json.order.quote.total);
});

test("office price change: the customer declines, the old price stays and the office is alerted", async () => {
  const login = await req("POST", "/api/office/login", { password: PASSWORD });
  const H = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const start = E.earliestStart("standard", helsinkiNow());
  const order = { length: 12.4, width: 9.9, eave: 2.9, floors: "1.5", roofType: "gable", pitch: 47, jobType: "roof", gables: true, zone: "A", urgency: "standard", start, days: 28, name: "Hinta Testi", phone: "040 333 5555", email: "hinta@example.com", address: "Testikatu 5, Espoo", source: "form" };
  const placed = await req("POST", "/api/orders", order);
  assert.equal(placed.status, 200, placed.text);
  const ref = placed.json.ref;
  const total0 = placed.json.order.quote.total;
  assert.equal((await req("PATCH", `/api/office/orders/${ref}`, { status: "confirmed" }, H)).status, 200);

  // A layout change moves the price: proposed, and the customer is told with a link.
  const first = await req("POST", `/api/office/orders/${ref}/layout`, { adjust: { sides: { "Long side A": { bays: 7, lifts: 2 } } }, reason: "Pitkä sivu A lyhyempi" }, H);
  assert.equal(first.status, 200, first.text);
  const firstId = first.json.order.priceChange.id;
  assert.equal(first.json.order.house.adjust, undefined);
  const msg = first.json.order.outbox.find((m) => m.event === "price_change" && m.channel === "email");
  assert.ok(msg, "email waits in the outbox without SMTP");
  assert.match(msg.body, /Pitkä sivu A lyhyempi/);
  assert.ok(first.json.order.outbox.some((m) => m.event === "price_change" && m.channel === "sms"));

  // A newer proposal replaces the first; answering the old one is refused.
  const second = await req("POST", `/api/office/orders/${ref}/layout`, { adjust: { sides: { "Gable end B": { off: true } } }, reason: "Pääty B pois" }, H);
  const pcId = second.json.order.priceChange.id;
  assert.notEqual(pcId, firstId);
  assert.ok(second.json.order.history.some((h) => h.code === "price_change_replaced"));
  assert.equal((await req("POST", `/api/orders/${ref}/price-change/decline`, { phone: "5555", id: firstId })).json.error, "price_change_changed");
  assert.equal((await req("POST", `/api/orders/${ref}/price-change/decline`, { phone: "0000", id: pcId })).status, 404);

  const declined = await req("POST", `/api/orders/${ref}/price-change/decline`, { phone: "5555", id: pcId, note: "Liian kallis" });
  assert.equal(declined.status, 200, declined.text);
  assert.equal(declined.json.quote.total, total0);
  assert.equal(declined.json.priceChange.status, "declined");
  assert.equal(declined.json.history.at(-1).code, "price_change_declined");
  const office = (await req("GET", `/api/office/orders/${ref}`, undefined, H)).json.order;
  assert.equal(office.quote.total, total0);
  assert.equal(office.house.adjust, undefined);
  assert.equal(office.priceChange.note, "Liian kallis");
  assert.ok(office.audit.some((a) => a.action === "price_change_declined"));
  const alerts = (await req("GET", "/api/office/alerts", undefined, H)).json.alerts;
  assert.ok(alerts.some((a) => a.type === "price_change_declined" && a.ref === ref));

  // The office can withdraw a proposal; a layout change that keeps the price applies directly.
  await req("POST", `/api/office/orders/${ref}/layout`, { adjust: { sides: { "Long side A": { lifts: 2 } } }, reason: "Uusi ehdotus" }, H);
  const w = await req("POST", `/api/office/orders/${ref}/price-change/withdraw`, {}, H);
  assert.equal(w.json.order.priceChange.status, "withdrawn");
  assert.equal((await req("POST", `/api/office/orders/${ref}/price-change/withdraw`, {}, H)).json.error, "no_price_change");
  const same = await req("POST", `/api/office/orders/${ref}/layout`, { adjust: null }, H);
  assert.equal(same.json.order.history.at(-1).code, "layout_changed");
});
