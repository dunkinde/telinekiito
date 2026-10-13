"use strict";
// Market price levels (13 Oct 2026): the worked examples from the price brief, crane lifting for the temporary roof,
// winter surcharges and the new office price settings.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../lib/engine.js");
const O = require("../lib/orders.js");

const P = E.DEFAULT_PRICING;
// 300 m² of scaffold with no catch, extra levels or stairs: only the per-m² rates count.
const plain = (extra = {}) => ({ ...extra, totals: { area: 300, catchRunM: 0, extraLevelM: 0, weightKg: 1500, stairs: { n: 0, m: 0 } } });
const line = (q, key) => q.lines.find((l) => l.key === key);

test("worked example: plain scaffold, 300 m², 42 days, zone A comes to 7 620 € excl. VAT", () => {
  const q = E.quote(plain(), { days: 42, zone: "A", urgency: "standard", start: "2026-06-01" }, P);
  assert.equal(line(q, "erect").amount, 3000);
  assert.equal(line(q, "dismantle").amount, 1500);
  assert.equal(line(q, "rent").amount, 2520);
  assert.equal(line(q, "transport").amount, 600);
  assert.equal(q.net, 7620);
});

test("worked example: weather roof and sheeting, winter start, about 20 980 € excl. VAT", () => {
  const est = plain({ sheeting: { m2: 300 }, roof: { planM2: 168 } });
  const q = E.quote(est, { days: 42, zone: "A", urgency: "standard", start: "2026-12-01" }, P);
  assert.equal(line(q, "roofWork").amount, 4200);
  assert.equal(line(q, "roofRent").amount, 1764);
  assert.equal(line(q, "crane").amount, 5000);
  assert.equal(line(q, "sheeting").amount, 2400);
  assert.equal(line(q, "sheeting").vars.winterPct, 100);
  assert.ok(Math.abs(q.net - 20980) / 20980 < 0.1, `net ${q.net}`);
});

test("crane lifting only with a temporary roof: 2 × the per-direction price", () => {
  const sel = { days: 28, zone: "A", urgency: "standard" };
  assert.equal(line(E.quote(plain({ sheeting: { m2: 300 } }), sel, P), "crane"), undefined);
  const q = E.quote(plain({ roof: { planM2: 100 } }), sel, { ...P, craneLiftPerDirection: 1800 });
  assert.equal(line(q, "crane").amount, 3600);
  assert.deepEqual(line(q, "crane").vars, { per: 1800 });
  assert.equal(line(E.quote(plain({ roof: { planM2: 100 } }), sel, { ...P, craneLiftPerDirection: 0 }), "crane"), undefined);
});

test("winter surcharges only for jobs with sheeting starting 1 Nov – 31 Mar", () => {
  const est = plain({ sheeting: { m2: 300 } });
  const at = (start, p = P) => E.quote(est, { days: 28, zone: "A", urgency: "standard", start }, p);
  for (const d of ["2026-11-01", "2026-12-24", "2027-01-15", "2027-03-31"]) assert.equal(line(at(d), "sheeting").amount, 2400, d);
  for (const d of ["2026-10-31", "2027-04-01", "2026-07-01", undefined]) assert.equal(line(at(d), "sheeting").amount, 1200, String(d));
  // Work surcharge is off by default; when set it applies to erection and dismantling of winter sheeted jobs only.
  assert.equal(line(at("2026-12-01"), "erect").amount, 3000);
  const p30 = { ...P, winterWorkPct: 30 };
  assert.equal(line(at("2026-12-01", p30), "erect").amount, 3900);
  assert.equal(line(at("2026-12-01", p30), "dismantle").vars.winterPct, 30);
  assert.equal(line(at("2026-06-01", p30), "erect").amount, 3000);
  assert.equal(line(E.quote(plain(), { days: 28, zone: "A", urgency: "standard", start: "2026-12-01" }, p30), "erect").amount, 3000);
});

test("new price settings survive mergePricing; negatives and junk fall back to the defaults", () => {
  const keys = ["craneLiftPerDirection", "extraWorkPerPersonHour", "winterSheetingPct", "winterWorkPct"];
  const ok = O.mergePricing({ craneLiftPerDirection: 2200, extraWorkPerPersonHour: 49, winterSheetingPct: 50, winterWorkPct: 30 });
  assert.deepEqual(keys.map((k) => ok[k]), [2200, 49, 50, 30]);
  for (const bad of [-1, "abc", NaN, Infinity]) {
    const m = O.mergePricing(Object.fromEntries(keys.map((k) => [k, bad])));
    assert.deepEqual(keys.map((k) => m[k]), keys.map((k) => P[k]), String(bad));
  }
});
