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

// Mock of Nominatim, Overpass and Ryhti. `opts` switches the scenarios.
function mockMaps(lat, lon, opts = {}) {
  const calls = [];
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  const house = rectRing(lat, lon, 14, 9, 20, 2, 1);
  const address = { house_number: "5", road: "Testitie", postcode: "01400", city: "Vantaa", state: "Uusimaa" };
  const fetchImpl = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("nominatim") && u.includes("/search")) {
      const base = { lat: String(lat), lon: String(lon), display_name: "5, Testitie, Asola, Vantaa, Uusimaa, Suomi", address };
      if (opts.addressOnBuilding) {
        return json([{ ...base, osm_type: "way", osm_id: 999, category: "building", type: "house", extratags: { "building:levels": "1" },
          geojson: { type: "Polygon", coordinates: [house.map((p) => [p.lon, p.lat])] } }]);
      }
      return json([{ ...base, osm_type: "node", osm_id: 1, category: "place", type: "house" }]);
    }
    if (u.includes("nominatim") && u.includes("/reverse")) {
      if (!opts.reverseHasBuilding) return json({ error: "Unable to geocode" });
      return json({ lat: String(lat), lon: String(lon), osm_type: "way", osm_id: 555, category: "building", type: "detached", address,
        geojson: { type: "Polygon", coordinates: [house.map((p) => [p.lon, p.lat])] } });
    }
    if (u.includes("overpass") || u.includes("mail.ru")) {
      if (opts.overpassDown) return { ok: false, status: 504, json: async () => ({}) };
      return json({ elements: [
        { type: "way", id: 111, tags: { building: "house", "roof:shape": "gabled" }, geometry: house },
        { type: "way", id: 222, tags: { building: "garage" }, geometry: rectRing(lat, lon, 6, 4, 0, 25, 0) }
      ] });
    }
    if (u.includes("ryhti")) {
      return json({ features: [
        { geometry: { type: "Point", coordinates: [lon + 2 / 55000, lat + 1 / 110574] }, properties: { number_of_storeys: 2, floor_area: 140, gross_floor_area: 160, completion_date: "1987-06-01" } },
        { geometry: { type: "Point", coordinates: [lon + 0.001, lat + 0.0005] }, properties: { number_of_storeys: 1 } }
      ] });
    }
    throw new Error("unexpected url " + url);
  };
  return { calls, svc: createAddressService({ fetchImpl, log: () => {} }) };
}
const LAT = 60.25, LON = 25.0;
const near = (a, b, tol = 0.3) => Math.abs(a - b) < tol;

test("address: outline from Overpass, floors from the register", async () => {
  const { calls, svc } = mockMaps(LAT, LON);
  const r = await svc.lookup("Testitie 5, Vantaa");
  assert.equal(r.found, true);
  assert.equal(r.zone, "A");
  assert.equal(r.match.short, "Testitie 5, 01400 Vantaa");
  assert.equal(r.details.osmWayId, 111);
  assert.equal(r.details.sizeSource, "OpenStreetMap");
  assert.ok(near(r.house.length, 14) && near(r.house.width, 9), `${r.house.length} x ${r.house.width}`);
  assert.equal(r.house.roofType, "gable");
  assert.equal(r.house.floors, "2");
  assert.equal(r.details.register.completed, "1987");
  assert.equal(r.details.outline.length, 4);
  const xs = r.details.outline.map((p) => p[0]), ys = r.details.outline.map((p) => p[1]);
  assert.ok(near(Math.max(...xs), 14) && near(Math.max(...ys), 9), "outline is turned long side left-right");
  assert.equal(calls.length, 3);
  await svc.lookup("testitie 5,  vantaa");
  assert.equal(calls.length, 3, "second lookup comes from the cache");
});

test("address: building outline straight from Nominatim, no Overpass needed", async () => {
  const { calls, svc } = mockMaps(LAT, LON, { addressOnBuilding: true });
  const r = await svc.lookup("Testitie 5, Vantaa");
  assert.equal(r.details.osmWayId, 999);
  assert.ok(near(r.house.length, 14) && near(r.house.width, 9));
  assert.ok(!calls.some((u) => u.includes("overpass")));
});

test("address: Overpass down -> Nominatim reverse finds the building", async () => {
  const { calls, svc } = mockMaps(LAT, LON, { overpassDown: true, reverseHasBuilding: true });
  const r = await svc.lookup("Testitie 5, Vantaa");
  assert.equal(r.details.osmWayId, 555);
  assert.ok(near(r.house.length, 14) && near(r.house.width, 9));
  assert.equal(calls.filter((u) => u.includes("overpass") || u.includes("mail.ru")).length, 3, "all three Overpass servers tried");
});

test("address: no outline anywhere -> size estimated from register, not cached", async () => {
  const { calls, svc } = mockMaps(LAT, LON, { overpassDown: true });
  const r = await svc.lookup("Testitie 5, Vantaa");
  assert.equal(r.details.sizeSource, "estimate");
  assert.ok(r.noteCodes.some((n) => n.code === "size_estimated"));
  assert.equal(r.noteCodes.length, r.notes.length);
  assert.equal(r.details.footprintM2, 80);
  assert.ok(r.house.length >= r.house.width && near(r.house.length * r.house.width, 80, 8));
  assert.ok(r.notes.some((n) => n.includes("estimated")));
  const n = calls.length;
  await svc.lookup("Testitie 5, Vantaa");
  assert.ok(calls.length > n, "a result missing the outline because of an outage isn't cached");
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

test("platform helpers: reference numbers, phones, mail format, weather, stock", () => {
  const P = require("../lib/platform");
  const { toE164, fill } = require("../lib/notify");
  const { buildMessage } = require("../lib/smtp");
  const W = require("../lib/weather");
  const S = require("../lib/stock");
  // The classic Finnish example: base 123456 -> 1234561.
  assert.equal(P.finnishReference("123456"), "1234561");
  assert.equal(P.finnishReference("1001"), "10016");
  assert.equal(toE164("040 123 4567"), "+358401234567");
  assert.equal(toE164("+358 50 765 4321"), "+358507654321");
  assert.equal(toE164("12"), null);
  assert.equal(fill("Hei {name}, {missing}", { name: "Anna" }), "Hei Anna, –");
  const msg = buildMessage({ from: "a@b.fi", fromName: "TelineKiito", to: "c@d.fi", subject: "Tilaus vahvistettu – ä", text: "Hei\nRivi 2" });
  assert.match(msg, /Subject: =\?UTF-8\?B\?/);
  assert.match(msg, /Content-Transfer-Encoding: base64/);
  const xml = `<wfs:member><BsWfs:BsWfsElement><BsWfs:Time>2026-10-05T12:00:00Z</BsWfs:Time><BsWfs:ParameterName>WindSpeedMS</BsWfs:ParameterName><BsWfs:ParameterValue>6.1</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>
    <wfs:member><BsWfs:BsWfsElement><BsWfs:Time>2026-10-05T12:00:00Z</BsWfs:Time><BsWfs:ParameterName>WindGust</BsWfs:ParameterName><BsWfs:ParameterValue>14.2</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>`;
  assert.deepEqual(W.parse(xml), [{ time: "2026-10-05T12:00:00Z", wind: 6.1, gust: 14.2 }]);
  // Stock: an order holds its parts from delivery to return plus the buffer day.
  const st = S.mergeStock({ enabled: true, owned: { frames: 10 }, bufferDays: 1 });
  const o = { ref: "TK-A", status: "confirmed", schedule: { start: "2026-11-02", days: 7 }, estimate: { parts: { frames: 8 } } };
  assert.equal(S.check([o], st, { frames: 4 }, "2026-11-05", "2026-11-06").ok, false);
  assert.equal(S.check([o], st, { frames: 4 }, "2026-11-11", "2026-11-12").ok, true, "free again after return + 1 day");
  assert.equal(S.check([{ ...o, status: "cancelled" }], st, { frames: 10 }, "2026-11-05", "2026-11-06").ok, true);
});

test("address suggestions: one line per address, typed postal code and town first", () => {
  const { toSuggestions, typedPostcode } = require("../lib/suggest");
  const f = (street, no, pc, city) => ({ properties: { katunimi: street, katunumero: no, postinumero: pc, kuntanimiFin: city }, geometry: { coordinates: [25, 60] } });
  const rows = [f("Mannerheimintie", "1", "49400", "Hamina"), f("Mannerheimintie", "1", "49400", "Hamina"), f("Mannerheimintie", "1", "00100", "Helsinki")];
  assert.deepEqual(toSuggestions(rows, "Mannerheimintie 1").map((s) => s.label), ["Mannerheimintie 1, 49400 Hamina", "Mannerheimintie 1, 00100 Helsinki"]);
  assert.equal(toSuggestions(rows, "Mannerheimintie 1, 0010")[0].postcode, "00100");
  assert.equal(toSuggestions(rows, "mannerheimintie 1 hels")[0].city, "Helsinki");
  assert.equal(typedPostcode("Päätie 39"), null);
  assert.equal(typedPostcode("Päätie 39, 0059"), "0059");
});

test("delivery zone from the municipality code", () => {
  const { zoneOfMunicipality, toSuggestions } = require("../lib/suggest");
  assert.equal(zoneOfMunicipality("091"), "A"); // Helsinki
  assert.equal(zoneOfMunicipality("638"), "B"); // Porvoo
  assert.equal(zoneOfMunicipality("075"), "C"); // Hamina
  assert.equal(zoneOfMunicipality(""), null);
  const s = toSuggestions([{ properties: { katunimi: "Veneentekijäntie", katunumero: "7", postinumero: "49840", kuntanimiFin: "Hamina", kuntatunnus: "075" }, geometry: { coordinates: [27.2, 60.57] } }], "vene 7");
  assert.equal(s[0].zone, "C");
});

test("stock: a scaffold system with no stock entered isn't checked", () => {
  const S = require("../lib/stock");
  const st = S.mergeStock({ enabled: true, owned: { frames: 10 } });
  assert.ok(S.trackedKeys(st).includes("frames"));
  assert.ok(!S.trackedKeys(st).includes("mz_standards"));
  assert.equal(S.check([], st, { mz_standards: 80 }, "2027-05-01", "2027-05-29").ok, true);
  assert.equal(S.check([], st, { frames: 11 }, "2027-05-01", "2027-05-29").ok, false);
  const both = S.mergeStock({ enabled: true, owned: { frames: 10, mz_standards: 50 } });
  assert.equal(S.check([], both, { mz_standards: 80 }, "2027-05-01", "2027-05-29").ok, false);
});
