"use strict";
// Business customer portal end to end on a real server with a temporary database:
// company users and roles, only the own company's orders, ordering, change requests (office decides), invoices and Finvoice.
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

async function req(method, url, body, cookie, headers = {}) {
  const init = { method, headers: { ...headers } };
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tk-business-"));
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
const house = { length: 12, width: 9, eave: 5.8, floors: "2", roofType: "gable", pitch: 30, jobType: "facade", gables: false, zone: "A", urgency: "express", days: 28 };
async function bizLogin(phone, pin) {
  const r = await req("POST", "/api/biz/login", { phone, pin });
  assert.equal(r.status, 200, r.text);
  const c = r.headers.get("set-cookie");
  assert.match(c, /^tk_biz=/);
  return c.split(";")[0];
}

test("business portal: users, own orders only, ordering, changes, invoices, Finvoice", async () => {
  const owner = await loginAs({ password: PASSWORD });
  const acc = (await req("POST", "/api/office/accounts", { name: "Rakennus Oy", businessId: "1234567-8", code: "RAKE15", discountPct: 15, paymentDays: 30, einvoiceAddress: "0037 1234 5678", einvoiceOperator: "003721291126" }, owner)).json.account;
  assert.equal(acc.einvoiceAddress, "003712345678");
  const other = (await req("POST", "/api/office/accounts", { name: "Muu Oy", code: "MUU10", discountPct: 10 }, owner)).json.account;

  // The office creates the company's admin; the admin adds the rest.
  const admin = (await req("POST", `/api/office/accounts/${acc.id}/users`, { name: "Anna Admin", phone: "040 900 0001", pin: "1111", role: "admin", email: "anna@rakennus.example" }, owner)).json.user;
  assert.equal(admin.role, "admin");
  assert.equal(admin.pinHash, undefined);
  assert.equal((await req("POST", "/api/biz/login", { phone: "040 900 0001", pin: "9999" })).status, 401);
  const a = await bizLogin("040 900 0001", "1111");
  assert.equal((await req("GET", "/api/biz/me", undefined, a)).json.account.name, "Rakennus Oy");
  assert.equal((await req("POST", "/api/biz/users", { name: "Kalle Kirjanpito", phone: "040 900 0002", pin: "2222", role: "accountant" }, a)).status, 200);
  assert.equal((await req("POST", "/api/biz/users", { name: "Dup", phone: "0409000002", pin: "3333" }, a)).json.error, "phone_taken");
  const acct = await bizLogin("040 900 0002", "2222");
  assert.equal((await req("GET", "/api/biz/users", undefined, acct)).status, 403, "accountants don't manage users");
  // A staff session is not a portal session and the other way round.
  assert.equal((await req("GET", "/api/biz/me", undefined, owner)).status, 401);
  assert.equal((await req("GET", "/api/office/orders", undefined, a)).status, 401);

  // Ordering: the account's discount applies; PO, project and site contact are kept.
  const placed = await req("POST", "/api/biz/orders", { ...house, start: start(), address: "Työmaakatu 1, Vantaa", po: "PO-77", project: "Koulu", costCentre: "KP-1", siteContact: { name: "Teemu", phone: "040 777 1234" } }, a);
  assert.equal(placed.status, 200, placed.text);
  const ref = placed.json.ref;
  assert.equal(placed.json.order.business.po, "PO-77");
  assert.equal(placed.json.order.quote.discountPct, 15);
  assert.equal((await req("POST", "/api/biz/orders", { ...house, start: start(), address: "X 1, Espoo" }, acct)).status, 403, "accountants can't order");
  const office = (await req("GET", `/api/office/orders/${ref}`, undefined, owner)).json.order;
  assert.equal(office.accountId, acc.id);
  assert.equal(office.customer.phone, "040 777 1234", "the crew calls the site contact");

  // Only the own company's orders.
  const otherOrder = (await req("POST", "/api/orders", { ...house, start: start(), name: "Muu", phone: "040 555 0000", address: "Toinen 2, Espoo", partnerCode: "MUU10" })).json.ref;
  const list = (await req("GET", "/api/biz/orders", undefined, a)).json.orders.map((o) => o.ref);
  assert.ok(list.includes(ref) && !list.includes(otherOrder));
  assert.equal((await req("GET", `/api/biz/orders/${otherOrder}`, undefined, a)).status, 404);
  assert.ok(other.id);

  // Own details are edited directly; a change of rental is previewed, then waits for the office.
  assert.equal((await req("PATCH", `/api/biz/orders/${ref}`, { po: "PO-78" }, a)).json.order.business.po, "PO-78");
  const pv = (await req("POST", `/api/biz/orders/${ref}/preview`, { type: "days", days: 42 }, a)).json;
  assert.equal(pv.before.days, 28);
  assert.equal(pv.after.days, 42);
  assert.ok(pv.after.total > pv.before.total);
  assert.equal((await req("POST", `/api/biz/orders/${ref}/change`, { type: "days", days: 42 }, a)).status, 200);
  assert.equal((await req("POST", `/api/biz/orders/${ref}/change`, { type: "days", days: 50 }, a)).json.error, "change_pending");
  assert.equal((await req("GET", `/api/office/orders/${ref}`, undefined, owner)).json.order.schedule.days, 28, "nothing changes before the office decides");
  const ch = (await req("GET", "/api/office/changes", undefined, owner)).json.changes.find((c) => c.ref === ref && c.status === "pending");
  assert.equal((await req("POST", `/api/office/changes/${ch.id}/approve`, {}, owner)).status, 200);
  assert.equal((await req("GET", `/api/biz/orders/${ref}`, undefined, a)).json.order.days, 42);

  // The office changes the layout and the price: the company sees old → new and accepts in the portal.
  const total0 = (await req("GET", `/api/biz/orders/${ref}`, undefined, a)).json.order.total;
  const side = (await req("POST", `/api/office/orders/${ref}/layout/preview`, {}, owner)).json.base[0].name;
  const lay = await req("POST", `/api/office/orders/${ref}/layout`, { adjust: { sides: { [side]: { off: true } } }, reason: "Yksi sivu jää pois" }, owner);
  assert.equal(lay.status, 200, lay.text);
  const seen = (await req("GET", `/api/biz/orders/${ref}`, undefined, a)).json.order;
  assert.equal(seen.total, total0, "the old price stays until accepted");
  assert.equal(seen.priceChange.status, "pending");
  assert.equal(seen.priceChange.before.total, total0);
  assert.ok(seen.priceChange.after.total < total0);
  assert.equal(seen.priceChange.after.quote.discountPct, 15);
  assert.equal((await req("POST", `/api/biz/orders/${ref}/price-change/accept`, { id: seen.priceChange.id }, acct)).status, 403, "accountants don't accept prices");
  const acc2 = await req("POST", `/api/biz/orders/${ref}/price-change/accept`, { id: seen.priceChange.id }, a);
  assert.equal(acc2.status, 200, acc2.text);
  assert.equal(acc2.json.order.total, seen.priceChange.after.total);
  assert.equal(acc2.json.order.priceChange.decidedBy, "Anna Admin (Rakennus Oy)");
  assert.equal(acc2.json.order.history.at(-1).code, "price_change_accepted");

  // Pickup only once the scaffold is up; messages reach the office.
  assert.equal((await req("POST", `/api/biz/orders/${ref}/pickup`, {}, a)).json.error, "not_erected");
  assert.equal((await req("POST", `/api/biz/orders/${ref}/message`, { text: "Portti auki klo 7" }, a)).json.order.messages.at(-1).by, "Anna Admin");

  // Invoice: visible to the company once sent, with a Finvoice file for their e-invoice address.
  for (const status of ["confirmed", "erected", "dismantled"]) assert.equal((await req("PATCH", `/api/office/orders/${ref}`, { status }, owner)).status, 200);
  const iv = (await req("POST", `/api/office/orders/${ref}/invoice`, {}, owner)).json.invoice;
  assert.equal((await req("GET", "/api/biz/invoices", undefined, acct)).json.invoices.length, 0, "drafts stay in the office");
  await req("PATCH", `/api/office/invoices/${iv.id}`, { status: "sent" }, owner);
  const invs = (await req("GET", "/api/biz/invoices", undefined, acct)).json.invoices;
  assert.equal(invs.length, 1);
  assert.equal(invs[0].po, "PO-78");
  const xml = await req("GET", `/api/biz/invoices/${iv.id}/finvoice`, undefined, acct);
  assert.equal(xml.status, 200);
  assert.match(xml.headers.get("content-type"), /xml/);
  for (const re of [/<Finvoice Version="3.0"/, /<ToIdentifier>003712345678<\/ToIdentifier>/, /<ToIntermediator>003721291126<\/ToIntermediator>/, /<OrderIdentifier>PO-78<\/OrderIdentifier>/, /<EpiRemittanceInfoIdentifier IdentificationSchemeName="SPY">\d+<\/EpiRemittanceInfoIdentifier>/, /<ArticleName>Vuokra, 7 päivää<\/ArticleName>/]) assert.match(xml.text, re); // up and down the same day: the 7-day minimum, not the 42 booked
  assert.equal((await req("GET", `/api/office/invoices/${iv.id}/finvoice`, undefined, owner)).status, 200);

  // Switching a user off ends their session.
  await req("PATCH", `/api/office/accounts/${acc.id}/users/${admin.id}`, { active: false }, owner);
  assert.equal((await req("GET", "/api/biz/me", undefined, a)).status, 401);
});

test("size check: lookup warnings flag the order, the customer adds photos", async () => {
  const owner = await loginAs({ password: PASSWORD });
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const body = { ...house, start: start(), name: "Koko Testi", phone: "040 555 7788", address: "Muototie 3, Hamina" };
  const flagged = (await req("POST", "/api/orders", { ...body, checks: ["size_mismatch", "made_up_code"] })).json.ref;
  const plain = (await req("POST", "/api/orders", { ...body, address: "Suora 1, Hamina" })).json.ref;
  const o = (await req("GET", `/api/office/orders/${flagged}`, undefined, owner)).json.order;
  assert.equal(o.needsReview, true);
  assert.deepEqual(o.sizeCheck.reasons.map((r) => r.code), ["size_mismatch"], "only known warnings count");
  assert.match(o.internalNotes, /satellite/);
  assert.equal((await req("GET", `/api/office/orders/${plain}`, undefined, owner)).json.order.needsReview, undefined);

  // The tracking page asks for photos until the customer adds one.
  let view = (await req("POST", `/api/orders/${flagged}/view`, { phone: "7788" })).json;
  assert.equal(view.needsPhotos, true);
  assert.equal((await req("POST", `/api/orders/${flagged}/photos`, { phone: "0000", image: PNG })).status, 404, "needs the phone digits");
  view = (await req("POST", `/api/orders/${flagged}/photos`, { phone: "7788", image: PNG })).json;
  assert.equal(view.photos.length, 1);
  assert.equal(view.needsPhotos, false);
  const files = (await req("GET", `/api/office/orders/${flagged}`, undefined, owner)).json.order.files;
  assert.ok(files.some((f) => f.kind === "photo" && f.stage === "customer"));
  assert.equal((await req("POST", `/api/orders/${flagged}/photos`, { phone: "7788", image: "data:text/plain;base64,aGk=" })).json.error, "bad_image");
});

test("partner codes: new codes are hard to guess, guessing codes stops working", async () => {
  const owner = await loginAs({ password: PASSWORD });
  const acc = (await req("POST", "/api/office/accounts", { name: "Arvaus Oy", discountPct: 8 }, owner)).json.account;
  assert.match(acc.code, /^ARVA[A-HJ-NP-Z2-9]{5}$/);
  const q = { length: 12, width: 8, eave: 3, floors: "1", roofType: "gable", pitch: 30, jobType: "roof", zone: "A", urgency: "standard", days: 28 };
  assert.equal((await req("POST", "/api/quote", { ...q, partnerCode: acc.code })).json.partner.discountPct, 8);
  for (let i = 0; i < 20; i++) assert.equal((await req("POST", "/api/quote", { ...q, partnerCode: `ARVA${i}` })).json.partner.invalid, true);
  // After 20 wrong codes, even a right one no longer shows the company or its discount from this visitor.
  assert.equal((await req("POST", "/api/quote", { ...q, partnerCode: acc.code })).json.partner.invalid, true);
});

test("registration: a company registers, the office approves it, then the PIN works", async () => {
  const owner = await loginAs({ password: PASSWORD });
  // Every visitor address gets its own hourly allowance.
  let ip = 0;
  const register = (body) => req("POST", "/api/biz/register", body, undefined, { "X-Forwarded-For": `10.9.0.${++ip}` });
  const form = { company: "Katto ja Teline Oy", businessId: "0112038 9", contactName: "Rami Rekisteröijä", phone: "040 777 0001", email: "rami@katto.example", pin: "4321", message: "Noin 20 kohdetta vuodessa", lang: "fi" };
  // The business ID's check digit is checked; the PIN must be 4–8 digits.
  assert.equal((await register({ ...form, businessId: "0112038-8" })).json.error, "bad_business_id");
  assert.equal((await register({ ...form, pin: "12" })).json.error, "bad_pin");
  assert.equal((await register(form)).status, 200);

  // Waiting: the right PIN says so, a wrong one is just wrong; nothing logs in and no partner discount yet.
  assert.equal((await req("POST", "/api/biz/login", { phone: "0407770001", pin: "4321" })).json.error, "account_pending");
  assert.equal((await req("POST", "/api/biz/login", { phone: "0407770001", pin: "9999" })).status, 401);
  const list = async () => (await req("GET", "/api/office/accounts", undefined, owner)).json.accounts;
  const acc = (await list()).find((a) => a.name === "Katto ja Teline Oy");
  assert.equal(acc.pending, true);
  assert.equal(acc.active, false);
  assert.equal(acc.businessId, "0112038-9");
  assert.equal(acc.portalUsers, 0);
  assert.equal(acc.registration.admin.phone, "040 777 0001");
  assert.equal(acc.registration.admin.pinHash, undefined);
  assert.deepEqual(acc.conflicts, { customer: null, otherRequests: 0, phoneTaken: null });
  const alert = (await req("GET", "/api/office/alerts", undefined, owner)).json.alerts.find((a) => a.type === "biz_registration");
  assert.equal(alert.data.accountId, acc.id);

  // A second request for the same company is taken like any other (the visitor learns nothing); the office sees it.
  assert.equal((await register({ ...form, contactName: "Toinen", phone: "040 777 0002" })).status, 200);
  const second = (await list()).find((a) => a.contactName === "Toinen");
  assert.equal(second.conflicts.otherRequests, 1);

  // Editing doesn't open it; approving does, with the discount and payment terms agreed on the phone.
  await req("PATCH", `/api/office/accounts/${acc.id}`, { active: true, notes: "Soitettu" }, owner);
  assert.equal((await req("POST", "/api/biz/login", { phone: "0407770001", pin: "4321" })).json.error, "account_pending");
  const ok = await req("POST", `/api/office/accounts/${acc.id}/approve`, { discountPct: 12, paymentDays: 21 }, owner);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.account.discountPct, 12);
  assert.equal(ok.json.account.pending, undefined);
  assert.equal(ok.json.account.registration.admin, undefined);
  assert.equal((await req("POST", `/api/office/accounts/${acc.id}/approve`, {}, owner)).json.error, "not_pending");
  assert.ok(!(await req("GET", "/api/office/alerts", undefined, owner)).json.alerts.some((a) => a.data && a.data.accountId === acc.id));
  const c = await bizLogin("040 777 0001", "4321");
  const me = (await req("GET", "/api/biz/me", undefined, c)).json;
  assert.equal(me.user.role, "admin");
  assert.equal(me.account.discountPct, 12);
  // The approval message waits in the outbox (sending isn't connected in tests).
  const out = (await req("GET", "/api/office/outbox", undefined, owner)).json.messages;
  assert.ok(out.some((m) => m.event === "biz_approved" && m.to === "rami@katto.example"));

  // The other request now shows the company is a customer. A request with a phone that already logs in can't be approved.
  assert.equal((await list()).find((a) => a.id === second.id).conflicts.customer, "Katto ja Teline Oy");
  assert.equal((await register({ ...form, company: "Kopio Oy", businessId: "1234567-1" })).status, 200);
  const copy = (await list()).find((a) => a.name === "Kopio Oy");
  assert.equal(copy.conflicts.phoneTaken, "Katto ja Teline Oy");
  assert.equal((await req("POST", `/api/office/accounts/${copy.id}/approve`, {}, owner)).json.error, "phone_taken");
  assert.equal((await list()).find((a) => a.id === copy.id).pending, true);

  // Rejected requests go away; the office's own accounts store Finnish business IDs in one form.
  for (const r of [second, copy]) assert.equal((await req("POST", `/api/office/accounts/${r.id}/reject`, undefined, owner)).status, 200);
  assert.ok(!(await list()).some((a) => a.pending));
  const typed = (await req("POST", "/api/office/accounts", { name: "Toimiston Oy", businessId: "01120389" }, owner)).json.account;
  assert.equal(typed.businessId, "0112038-9");
  // Bots filling the hidden field get "ok" and nothing is saved.
  assert.equal((await register({ ...form, company: "Botti Oy", website: "x" })).status, 200);
  assert.ok(!(await list()).some((a) => a.name === "Botti Oy"));
});
