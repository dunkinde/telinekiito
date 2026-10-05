"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const geo = require("../lib/geo");
const E = require("../lib/engine");
const { createAddressService } = require("../lib/address");
const { createAI, parseJsonLoose, normalize } = require("../lib/ai");
const O = require("../lib/orders");

// A 15 x 10 m rectangle around (lat, lon), rotated by `deg`, as OSM-style {lat, lon} points (closed ring).
function rectRing(lat, lon, L, W, deg, dx = 0, dy = 0) {
  const a = (deg * Math.PI) / 180;
  const k = Math.cos((lat * Math.PI) / 180) * 111320;
  const corners = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].map(([x, y]) => {
    const rx = x * Math.cos(a) - y * Math.sin(a) + dx, ry = x * Math.sin(a) + y * Math.cos(a) + dy;
    return { lat: lat + ry / 110574, lon: lon + rx / k };
  });
  return corners.concat([corners[0]]);
}

test("minRect recovers length and width of a rotated rectangle", () => {
  const ring = geo.openRing(rectRing(60.2, 24.9, 15, 10, 33));
  const r = geo.minRect(geo.project(ring, 60.2, 24.9));
  assert.ok(Math.abs(r.length - 15) < 0.15, `length ${r.length}`);
  assert.ok(Math.abs(r.width - 10) < 0.15, `width ${r.width}`);
});

test("engine: 1-storey 10 x 15 roof job with gables", () => {
  const est = E.estimate({ length: 15, width: 10, eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: true });
  assert.ok(est.totals.area > 250 && est.totals.area < 400, `area ${est.totals.area}`);
  const q = E.quote(est, { days: 28, zone: "A", urgency: "standard" }, E.DEFAULT_PRICING);
  assert.ok(q.total > 0);
});

test("address: zones and roof tags", () => {
  const { _internals: I } = createAddressService({ fetchImpl: async () => { throw new Error("no network"); } });
  assert.equal(I.zoneFor({ city: "Espoo" }), "A");
  assert.equal(I.zoneFor({ town: "Kerava", state: "Uusimaa" }), "B");
  assert.equal(I.zoneFor({ city: "Tampere", state: "Pirkanmaa" }), "C");
  assert.equal(I.roofFromTags({ "roof:shape": "hipped" }), "hip");
  assert.equal(I.roofFromTags({}), null);
});

test("address: full lookup with mocked map services", async () => {
  const lat = 60.25, lon = 25.0;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (String(url).includes("nominatim")) {
      return json([{ lat: String(lat), lon: String(lon), osm_type: "node", osm_id: 1, category: "place",
        display_name: "Testitie 5, Vantaa", address: { house_number: "5", road: "Testitie", city: "Vantaa", state: "Uusimaa" } }]);
    }
    if (String(url).includes("overpass")) {
      return json({ elements: [
        { type: "way", id: 111, tags: { building: "house", "roof:shape": "gabled" }, geometry: rectRing(lat, lon, 14, 9, 20, 2, 1) },
        { type: "way", id: 222, tags: { building: "garage" }, geometry: rectRing(lat, lon, 6, 4, 0, 25, 0) }
      ] });
    }
    if (String(url).includes("ryhti")) {
      return json({ features: [
        { geometry: { type: "Point", coordinates: [lon + 2 / 55000, lat + 1 / 110574] }, properties: { number_of_storeys: 2, floor_area: 160, completion_date: "1987-06-01" } },
        { geometry: { type: "Point", coordinates: [lon + 0.001, lat + 0.0005] }, properties: { number_of_storeys: 1 } }
      ] });
    }
    throw new Error("unexpected url " + url);
  };
  const svc = createAddressService({ fetchImpl });
  const r = await svc.lookup("Testitie 5, Vantaa");
  assert.equal(r.found, true);
  assert.equal(r.zone, "A");
  assert.equal(r.details.osmWayId, 111);
  assert.ok(Math.abs(r.house.length - 14) < 0.3, `length ${r.house.length}`);
  assert.ok(Math.abs(r.house.width - 9) < 0.3, `width ${r.house.width}`);
  assert.equal(r.house.roofType, "gable");
  assert.equal(r.house.floors, "2");
  assert.equal(r.details.register.completed, "1987");
  assert.equal(calls.length, 3);
  // Second lookup comes from the cache.
  await svc.lookup("testitie 5,  vantaa");
  assert.equal(calls.length, 3);
});

test("address: unknown address", async () => {
  const svc = createAddressService({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }) });
  const r = await svc.lookup("Nowhere 123, Atlantis");
  assert.deepEqual(r, { found: false, reason: "address_not_found" });
});

test("ai: tolerant JSON parsing and clamping", () => {
  const raw = 'Here you go:\n```json\n{"length_m": 9.2, "width_m": 14.6, "floors": 1.5, "roof_type": "gable", "pitch_deg": 70, "eave_height_m": null, "confidence": "medium", "notes": "From plan dims"}\n```';
  const n = normalize(parseJsonLoose(raw));
  assert.deepEqual(
    { length: n.length, width: n.width, floors: n.floors, pitch: n.pitch, eave: n.eave, confidence: n.confidence },
    { length: 14.6, width: 9.2, floors: "1.5", pitch: 55, eave: null, confidence: "medium" }
  );
  assert.equal(normalize({ length_m: "x" }), null);
  assert.equal(parseJsonLoose("no json"), null);
});

test("ai: error codes from OpenAI", async () => {
  const mk = (status, body) => createAI({ apiKey: "sk-test", model: "m", fetchImpl: async () => ({ ok: status === 200, status, json: async () => body }) });
  await assert.rejects(mk(401, { error: { message: "bad" } }).readDrawing(["data:image/png;base64,AA=="]), { code: "ai_bad_key" });
  await assert.rejects(mk(429, { error: { code: "insufficient_quota" } }).readDrawing(["x"]), { code: "ai_no_credit" });
  await assert.rejects(mk(429, { error: { code: "rate_limit_exceeded" } }).readDrawing(["x"]), { code: "ai_busy" });
  await assert.rejects(mk(200, { choices: [{ message: { content: "I can't see dimensions." } }] }).readDrawing(["x"]), { code: "ai_unreadable" });
  const ok = await mk(200, { choices: [{ message: { content: '{"length_m":12,"width_m":8,"floors":2,"roof_type":"hip","pitch_deg":25,"eave_height_m":5.6,"confidence":"high","notes":"ok"}' } }] }).readDrawing(["x"]);
  assert.equal(ok.roofType, "hip");
  assert.equal(ok.eave, 5.6);
});

test("orders: validation, masking and phone check", () => {
  const start = E.earliestStart("standard", O.helsinkiNow());
  const base = { length: 12, width: 9, eave: 4.3, floors: "1.5", roofType: "gable", pitch: 35, jobType: "roof", gables: true,
    zone: "B", urgency: "standard", start, days: 28, name: "Test", phone: "040 123 4567", address: "Testitie 1, Kerava" };
  const f = O.parseOrderInput(base);
  const o = O.buildOrder(f, O.mergePricing(null), () => false);
  assert.match(o.ref, /^TK-[A-Z0-9]{6}$/);
  const pv = O.publicView(o);
  assert.equal(pv.customer.phone, "••• 4567");
  assert.equal(pv.estimate.parts, undefined);
  assert.equal(O.phoneMatches(o, "4567"), true);
  assert.equal(O.phoneMatches(o, "1234"), false);
  assert.throws(() => O.parseOrderInput({ ...base, phone: "12" }), { code: "phone_required" });
  assert.throws(() => O.parseOrderInput({ ...base, start: "2020-01-01" }), { code: "start_too_early" });
  assert.throws(() => O.parseOrderInput({ ...base, length: 500 }), { code: "invalid_fields" });
});

test("engine: roof and facade = facade scaffold plus roof-catch on the eaves", () => {
  const h = { length: 12, width: 9, eave: 4.3, roofType: "gable", pitch: 35, gables: false };
  const facade = E.estimate({ ...h, jobType: "facade" });
  const both = E.estimate({ ...h, jobType: "roof_facade" });
  const roof = E.estimate({ ...h, jobType: "roof", gables: true });
  assert.equal(both.totals.area, facade.totals.area);
  assert.equal(facade.totals.catchRunM, 0);
  assert.equal(both.totals.catchRunM, roof.totals.catchRunM);
  assert.equal(both.totals.area, roof.totals.area);
  assert.ok(both.totals.extraLevelM > 0 && roof.totals.extraLevelM === 0);
  const hip = E.estimate({ ...h, roofType: "hip", jobType: "roof_facade" });
  assert.equal(hip.sides.filter((s) => s.catchOn).length, 4);
  const P = E.DEFAULT_PRICING, opt = { days: 28, zone: "A", urgency: "standard" };
  const qBoth = E.quote(both, opt, P), qRoof = E.quote(roof, opt, P);
  assert.ok(qBoth.total > E.quote(facade, opt, P).total);
  assert.ok(qBoth.total > qRoof.total);
  assert.ok(qBoth.lines.some((l) => l.key === "levels"));
});
