"use strict";
// Funnel events: validation, aggregation into daily counts and the report query (lib/events.js + lib/store.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Ev = require("../lib/events");
const Store = require("../lib/store");

test("parseEvent keeps only the allowed fields, reduced to safe values", () => {
  const e = Ev.parseEvent(
    { event: "price_shown", vid: "abcdefghijklmnop", utm_source: "Google Ads", utm_campaign: "x@y.fi", referrer: "https://www.Facebook.com/some/path?fbclid=1", landing: "/telineet?utm_source=x#top", zone: "C", job: "facade", weather: false, email: "a@b.fi" },
    { ownHost: "example.fi:443" }
  );
  assert.deepEqual(e, { event: "price_shown", vid: "abcdefghijklmnop", dims: { source: "google_ads", campaign: "", referrer: "facebook.com", landing: "/telineet", zone: "C", job: "facade", weather: "0" } });
  assert.throws(() => Ev.parseEvent({ event: "nope", vid: "abcdefghijklmnop" }), { code: "bad_event" });
  assert.throws(() => Ev.parseEvent({ event: "price_shown" }), { code: "bad_visit" });
  assert.throws(() => Ev.parseEvent({ event: "price_shown", vid: "a b c d e f g h i j" }), { code: "bad_visit" });
  // Own site, phone-like numbers and odd paths are dropped.
  assert.equal(Ev.refDomain("https://example.fi/x", "www.example.fi"), "");
  assert.equal(Ev.utm("0401234567"), "");
  assert.equal(Ev.landing("/orders/TK-12345678"), "");
  assert.equal(Ev.landing("https://evil/"), "");
  const odd = Ev.parseEvent({ event: "order_placed", vid: "abcdefghijklmnop", zone: "Z", job: "house", weather: "yes" });
  assert.deepEqual([odd.dims.zone, odd.dims.job, odd.dims.weather], ["", "", ""]);
});

test("counter aggregates once per visit and day; report gives steps, sources, zones, jobs and weather share", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tk-ev-"));
  const store = Store.open(dir);
  try {
    let day = "2026-10-01";
    const count = Ev.createEventCounter(store, { today: () => day, maxVisits: 1000 });
    const ev = (event, vid, body = {}) => count(Ev.parseEvent({ event, vid: vid.padEnd(16, "x"), ...body }));
    const fb = { utm_source: "facebook", utm_campaign: "syksy" };
    for (const v of ["v1", "v2", "v3", "v4"]) ev("calculator_opened", v, fb);
    assert.equal(ev("calculator_opened", "v1", fb), false); // second time in the same visit
    for (const v of ["v1", "v2", "v3"]) ev("price_shown", v, { ...fb, zone: "A" });
    ev("weather_option_ticked", "v1", fb);
    ev("step_timing", "v1", { ...fb, zone: "A", job: "roof" });
    ev("step_timing", "v2", { ...fb, zone: "A", job: "facade" });
    ev("order_placed", "v1", { ...fb, zone: "A", job: "roof", weather: true });
    day = "2026-10-02";
    ev("calculator_opened", "v1", { referrer: "https://google.fi/" }); // a new day counts again
    ev("order_placed", "v9", { zone: "B", job: "gutters", weather: false });

    const rows = store.eventRows("2026-10-01", "2026-10-01");
    assert.equal(rows.find((r) => r.event === "calculator_opened").n, 4);
    assert.ok(rows.every((r) => !("vid" in r)));

    const r = Ev.funnelReport(store.eventRows("2026-10-01", "2026-10-02"), { from: "2026-10-01", to: "2026-10-02" });
    const step = (e) => r.steps.find((s) => s.event === e);
    assert.deepEqual(r.steps.map((s) => s.event), Ev.FUNNEL);
    assert.equal(step("calculator_opened").visits, 5);
    assert.equal(step("price_shown").visits, 3);
    assert.equal(step("price_shown").ofStart, 60);
    assert.equal(step("address_looked_up").ofPrev, 0);
    assert.equal(step("price_shown").ofPrev, null); // nothing in the step before
    assert.equal(step("order_placed").visits, 2);
    assert.equal(r.side.weather_option_ticked, 1);

    const fbRow = r.bySource.find((x) => x.source === "facebook");
    assert.deepEqual([fbRow.kind, fbRow.campaign, fbRow.opened, fbRow.quotes, fbRow.orders, fbRow.conv], ["utm", "syksy", 4, 3, 1, 25]);
    assert.equal(r.bySource.find((x) => x.kind === "referrer").source, "google.fi");
    assert.equal(r.bySource.find((x) => x.kind === "direct").orders, 1);

    assert.deepEqual(r.byZone.find((z) => z.zone === "A"), { zone: "A", quotes: 3, contact: 0, orders: 1, conv: 33.3 });
    assert.deepEqual(r.byJob.find((j) => j.job === "roof"), { job: "roof", chosen: 1, contact: 0, orders: 1, conv: 100 });
    assert.equal(r.byJob.find((j) => j.job === "gutters").orders, 1);
    assert.deepEqual(r.weather, { quotes: 3, ticked: 1, tickedPct: 33.3, orders: 2, ordersWithWeather: 1, ordersPct: 50 });

    // A period without events: zero counts, no division by zero.
    const empty = Ev.funnelReport(store.eventRows("2026-11-01", "2026-11-30"), { from: "2026-11-01", to: "2026-11-30" });
    assert.equal(empty.steps[0].visits, 0);
    assert.equal(empty.steps[1].ofPrev, null);
    assert.equal(empty.weather.tickedPct, null);
  } finally {
    store.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

test("counter stops at its memory cap instead of growing", () => {
  const counted = [];
  const count = Ev.createEventCounter({ countEvent: (d, e) => counted.push(e) }, { today: () => "2026-10-01", maxVisits: 2 });
  for (const v of ["a", "b", "c"]) count({ event: "calculator_opened", vid: v, dims: {} });
  assert.equal(counted.length, 2);
});
