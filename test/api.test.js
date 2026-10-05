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
let proc, base, dataDir;

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
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, OFFICE_PASSWORD: PASSWORD, SESSION_SECRET: "x".repeat(64), OPENAI_API_KEY: "" },
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
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("pages and config", async () => {
  for (const p of ["/", "/office", "/engine.js", "/common.js", "/quote.js", "/office.js", "/app.css"]) {
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

  const ext = await req("POST", `/api/orders/${ref}/extend`, { phone: "4321" });
  assert.equal(ext.json.schedule.days, 35);
  assert.ok(ext.json.quote.total > t.json.quote.total);

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

  const pick = await req("POST", `/api/orders/${mine.ref}/pickup`, { phone: "4321" });
  assert.equal(pick.json.status, "pickup_requested");
  assert.equal(pick.json.crew, "Team 3");

  const pr = await req("PUT", "/api/office/pricing", { pricing: { rentPerM2Day: 0.2, zones: { A: { trip: 99 } } } }, H);
  assert.equal(pr.json.pricing.rentPerM2Day, 0.2);
  assert.equal(pr.json.pricing.zones.A.trip, 99);
  assert.equal((await req("GET", "/api/config")).json.pricing.rentPerM2Day, 0.2);

  assert.equal((await req("DELETE", `/api/office/orders/${mine.ref}`, undefined, H)).status, 200);
  assert.equal((await req("GET", `/api/orders/${mine.ref}?phone=4321`)).status, 404);

  const out = await req("POST", "/api/office/logout", {}, H);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await req("GET", "/api/office/orders", undefined, { Cookie: "tk_session=forged.token" })).status, 401);
});

test("drawing reading is off without a key, address needs text", async () => {
  assert.equal((await req("POST", "/api/ai/drawing", { images: [] })).status, 503);
  assert.equal((await req("POST", "/api/address", { address: "ab" })).status, 400);
});
