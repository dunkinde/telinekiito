"use strict";
// Market price levels (brief v2, 15 Oct 2026): the worked examples, transport included in zone A, weekly inspections,
// crane lifting only on orders the office marks, sheeting included with a temporary roof, winter sheeting surcharge
// and the office price settings.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../lib/engine.js");
const O = require("../lib/orders.js");

const P = E.DEFAULT_PRICING;
// 300 m² of scaffold with no catch, extra levels or stairs: only the per-m² rates count.
const plain = (extra = {}) => ({ ...extra, totals: { area: 300, catchRunM: 0, extraLevelM: 0, weightKg: 1500, stairs: { n: 0, m: 0 } } });
const line = (q, key) => q.lines.find((l) => l.key === key);
const sel = (extra = {}) => ({ days: 42, zone: "A", urgency: "standard", start: "2026-06-01", ...extra });

test("worked example: plain scaffold, 300 m², 42 days, zone A, inspections on comes to 7 086 € excl. VAT", () => {
  const q = E.quote(plain({ inspections: true }), sel(), P);
  assert.equal(line(q, "erect").amount, 3000);
  assert.equal(line(q, "dismantle").amount, 1500);
  assert.equal(line(q, "rent").amount, 2016);
  assert.equal(line(q, "inspection").amount, 570);
  assert.equal(line(q, "transport"), undefined);
  assert.equal(q.net, 7086);
});

test("worked example: with a temporary roof, no crane, sheeting included, about 12 180 € excl. VAT", () => {
  const q = E.quote(plain({ inspections: true, sheeting: { m2: 300 }, roof: { planM2: 168 } }), sel({ start: "2026-12-01" }), P);
  assert.equal(line(q, "roofWork").amount, 4032);
  assert.equal(line(q, "roofWork").vars.sheeting, true);
  assert.equal(line(q, "roofRent").amount, 1058.4);
  assert.equal(line(q, "sheeting"), undefined);
  assert.equal(line(q, "crane"), undefined);
  assert.equal(q.net, 12176.4);
});

test("zone A adds no transport line; zones B and C charge both ways per load", () => {
  assert.equal(line(E.quote(plain(), sel(), P), "transport"), undefined);
  assert.equal(line(E.quote(plain(), sel({ zone: "B" }), P), "transport").amount, 400);
  assert.equal(line(E.quote(plain(), sel({ zone: "C" }), P), "transport").amount, 800);
  const heavy = { totals: { ...plain().totals, weightKg: 4000 } };
  assert.equal(line(E.quote(heavy, sel({ zone: "C" }), P), "transport").amount, 1600);
});

test("weekly inspections: one visit per started week of rent, only when the customer asks", () => {
  assert.equal(line(E.quote(plain(), sel(), P), "inspection"), undefined);
  const at = (days) => line(E.quote(plain({ inspections: true }), sel({ days }), P), "inspection");
  assert.deepEqual([at(42).amount, at(43).amount], [570, 665]);
  assert.deepEqual(at(43).vars, { n: 7, per: 95 });
  assert.equal(at(3).amount, 190); // the 14-day minimum rent: two weeks
  assert.equal(line(E.quote(plain({ inspections: true }), sel(), { ...P, inspectionPerVisit: 0 }), "inspection"), undefined);
});

test("crane lifting only on orders the office marks: 2 × the per-direction price, never from the roof alone", () => {
  assert.equal(line(E.quote(plain({ roof: { planM2: 100 } }), sel(), P), "crane"), undefined);
  const q = E.quote(plain({ crane: true }), sel(), { ...P, craneLiftPerDirection: 1800 });
  assert.equal(line(q, "crane").amount, 3600);
  assert.deepEqual(line(q, "crane").vars, { per: 1800 });
  // Customer input never carries the crane; the office's flag on the house does.
  const f = O.parseQuoteInput({ length: 12, width: 9, eave: 5, roofType: "gable", pitch: 30, jobType: "facade", crane: true, inspections: true });
  assert.equal(O.houseOf(f).crane, undefined);
  assert.equal(O.houseOf(f).inspections, true);
  assert.equal(O.houseOf({ ...O.houseOf(f), crane: true }).crane, true);
  assert.equal(E.estimate(O.houseOf({ ...O.houseOf(f), crane: true })).crane, true);
});

test("sheeting is included with a temporary roof unless the office turns that off", () => {
  const est = plain({ sheeting: { m2: 300 }, roof: { planM2: 100 } });
  assert.equal(line(E.quote(est, sel(), P), "sheeting"), undefined);
  assert.equal(line(E.quote(est, sel(), { ...P, shelterSheetingIncluded: false }), "sheeting").amount, 810);
  assert.equal(line(E.quote(plain({ sheeting: { m2: 300 } }), sel(), P), "sheeting").amount, 810);
});

test("winter sheeting surcharge only for starts 1 Nov – 31 Mar", () => {
  const at = (start) => line(E.quote(plain({ sheeting: { m2: 300 } }), sel({ start }), P), "sheeting");
  for (const d of ["2026-11-01", "2026-12-24", "2027-01-15", "2027-03-31"]) assert.equal(at(d).amount, 1620, d);
  assert.equal(at("2026-11-01").vars.winterPct, 100);
  for (const d of ["2026-10-31", "2027-04-01", "2026-07-01", undefined]) assert.equal(at(d).amount, 810, String(d));
  assert.equal(line(E.quote(plain(), sel({ start: "2026-12-01" }), P), "erect").amount, 3000); // work has no winter rate
});

test("new price settings survive mergePricing; negatives and junk fall back to the defaults", () => {
  const keys = ["craneLiftPerDirection", "extraWorkPerPersonHour", "extraWorkMinHours", "inspectionPerVisit", "winterSheetingPct"];
  const ok = O.mergePricing({ craneLiftPerDirection: 2200, extraWorkPerPersonHour: 49, extraWorkMinHours: 2, inspectionPerVisit: 80, winterSheetingPct: 50, shelterSheetingIncluded: false });
  assert.deepEqual(keys.map((k) => ok[k]), [2200, 49, 2, 80, 50]);
  assert.equal(ok.shelterSheetingIncluded, false);
  assert.equal(O.mergePricing({}).shelterSheetingIncluded, true);
  for (const bad of [-1, "abc", NaN, Infinity]) {
    const m = O.mergePricing(Object.fromEntries(keys.map((k) => [k, bad])));
    assert.deepEqual(keys.map((k) => m[k]), keys.map((k) => P[k]), String(bad));
  }
});
