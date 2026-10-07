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

test("standard-configuration checks: height, anchors and sources per system", () => {
  const E = require("../lib/engine");
  const { checksFor } = require("../lib/checks");
  const h = { length: 12.4, width: 9.9, eave: 2.9, pitch: 47, roofType: "gable", jobType: "roof", gables: true };
  const lay = checksFor(h, E.estimate(h));
  assert.equal(lay[0].code, "height_ok");
  assert.ok(lay.some((c) => c.code === "anchor_every_frame"));
  assert.match(lay[0].source.doc, /Layher Blitz/);
  const mz = checksFor({ ...h, system: "monzon" }, E.estimate({ ...h, system: "monzon" }));
  assert.ok(mz.some((c) => c.code === "anchor_4m" && c.vars.kn === 3.2));
  const tall = { length: 12, width: 10, eave: 23, pitch: 30, roofType: "gable", jobType: "facade" };
  assert.equal(checksFor(tall, E.estimate(tall))[0].level, "engineer");
  // Layher one-level roof-catch sides are anchored at every frame (AuV p. 14).
  const side = E.estimate(h).sides.find((s) => s.lifts === 1 && s.catchOn);
  assert.equal(side.parts.anchors, side.bays + 1);
});

test("weather protection: sheeting area and anchors, temporary roof raises the scaffold and is priced", () => {
  const E = require("../lib/engine");
  const P = E.DEFAULT_PRICING, sel = { days: 28, zone: "C", urgency: "standard" };
  const h = { length: 12.4, width: 9.9, eave: 2.9, pitch: 47, roofType: "gable", jobType: "roof", gables: true };
  const fh = { ...h, jobType: "facade" };
  const plain = E.estimate(h), sheet = E.estimate({ ...fh, sheeting: true }), roof = E.estimate({ ...h, weatherRoof: true });
  // Options follow the job: no sheeting on a roof-only job, no temporary roof on a facade-only job.
  assert.equal(E.estimate({ ...h, sheeting: true }).sheeting, null);
  assert.equal(E.estimate({ ...fh, weatherRoof: true }).roof, null);
  // Sheeting covers the outer faces of the scaffold as built (corners counted once), up to the top guardrail.
  assert.equal(sheet.sheeting.m2, Math.round(sheet.sides.reduce((m, x) => m + x.run * (x.deckH + 1), 0)));
  assert.ok(sheet.sheeting.m2 > 200);
  assert.ok(sheet.totals.parts.anchors > E.estimate(fh).totals.parts.anchors);
  assert.ok(sheet.totals.parts.wp_sheetRolls >= 3);
  assert.equal(E.quote(sheet, sel, P).lines.find((l) => l.key === "sheeting").vars.m2, sheet.sheeting.m2);
  // The roof spans the scaffold (house width + 2 × (0.6 m gap clear of the overhang + frame)) and clears the ridge.
  assert.ok(Math.abs(roof.roof.span - (9.9 + 2 * 1.33)) < 0.01);
  assert.ok(roof.roof.support + 1.0 + (roof.roof.span / 2) * Math.tan((18 * Math.PI) / 180) - 0.75 > plain.ridge);
  // Every side carries the roof at one level, on inner consoles; the eave sides keep their working deck under the
  // eave (2.4 m, eave 2.9 m) with the roof-catch grids on it, and get a deck on top for putting the roof up.
  assert.ok(roof.sides.every((s) => s.lifts === 4 && s.half === 0 && s.inner && s.gap === 0.6));
  assert.deepEqual(roof.sides[0].deckLevels, [1, 4]);
  assert.equal(roof.sides[0].catchLevel, 1);
  assert.ok(roof.sides.filter((s) => s.kind === "gable").every((s) => !s.catchOn));
  assert.equal(roof.totals.parts.lr_ridges, roof.roof.sections + 1); // Layher scaffold → Layher Keder Roof XL
  assert.equal(E.estimate({ ...h, weatherRoof: true, system: "monzon" }).totals.parts.wr_ridges > 0, true);
  const q = E.quote(roof, sel, P);
  assert.ok(q.lines.some((l) => l.key === "roofRent") && q.lines.some((l) => l.key === "roofWork"));
  assert.ok(q.total > E.quote(plain, sel, P).total * 2);
});

test("roof-edge protection follows DIN 4420-1 (Layher AuV §17): deck ≤ 1.5 m under the eave, catch wall b ≥ 0.7 m and 1.5 − b above it", () => {
  const E = require("../lib/engine");
  const C = E.CATCH;
  for (const eave of [2.7, 3.0, 3.6, 4.3, 5.0, 5.8, 6.5, 7.2]) {
    for (const jobType of ["roof", "roof_facade", "gutters", "facade"]) {
      const est = E.estimate({ length: 12, width: 9, eave, pitch: 30, roofType: "hip", jobType });
      for (const s of est.sides) {
        assert.ok(s.deckH <= eave - 0.2 + 1e-9 && s.deckH >= eave - C.maxBelow - 1e-9, `${jobType} eave ${eave}: deck ${s.deckH}`);
        if (s.catchOn) {
          const b = E.catchB(false);
          assert.ok(b >= C.minB);
          assert.ok(s.deckH + C.wall >= eave + C.reach - b - 1e-9, `catch wall too low at eave ${eave}`);
          assert.ok(s.catchConsole);
        }
      }
    }
  }
  // 1½ floors (eave 4.3 m): a 1.00 m compensation frame puts the deck at 3.4 m (2.4 m would be 1.9 m under the eave).
  const s = E.estimate({ length: 12, width: 9, eave: 4.3, pitch: 30, roofType: "hip", jobType: "roof" }).sides[0];
  assert.equal(s.half, 1);
  assert.equal(s.deckH, 3.4);
  assert.equal(s.parts.frames1, s.bays + 1);
});

test("corners: one scaffold per corner, the roof-catch side runs through; free roof-catch ends run 2 m past the roof edge", () => {
  const E = require("../lib/engine");
  const W = E.SYS.gap + E.SYS.width;
  const ring = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: true });
  const eaves = ring.sides.filter((s) => s.kind === "eaves"), gables = ring.sides.filter((s) => s.kind === "gable");
  assert.ok(eaves.every((s) => Math.abs(s.ext0 - W) < 1e-9 && Math.abs(s.ext1 - W) < 1e-9)); // catch runs through
  // The gables run just past their wall ends, up to 0.1 m short of the through side's inner standards.
  const butt = E.SYS.gap - 0.1;
  assert.ok(gables.every((s) => Math.abs(s.ext0 - butt) < 1e-9 && Math.abs(s.ext1 - butt) < 1e-9));
  // Each corner is built once: perimeter + the through sides' corner pieces + the butting sides' short run-ins.
  assert.ok(Math.abs(ring.sides.reduce((m, s) => m + s.run, 0) - (2 * (12 + 9) + 4 * W + 4 * butt)) < 1e-9);
  // Bays never stretch past 3.07 m.
  assert.ok(ring.sides.every((s) => s.run / s.bays <= 3.07 + 1e-9));
  // Facade: the taller gables run through.
  const fac = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 40, jobType: "facade" });
  assert.ok(fac.sides.filter((s) => s.kind === "gable").every((s) => s.ext0 > 0 && s.ext1 > 0));
  // Gable roof with only the eave sides: the roof-catch runs 2 m past the 0.5 m verge overhang at both ends.
  const free = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: false });
  assert.ok(free.sides.every((s) => Math.abs(s.ext0 - 2.5) < 1e-9 && Math.abs(s.ext1 - 2.5) < 1e-9));
  // An office-removed side leaves its neighbours with free ends.
  const off = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "hip", pitch: 30, jobType: "facade", adjust: { sides: { "Short side A": { off: true } } } });
  const front = off.sides.find((s) => s.name === "Long side A");
  assert.equal(front.ext0, E.SYS.extend);
});

test("Layher parts follow the catalogue and AuV: double guardrails, end toe boards, base braces, access, 1 m frames", () => {
  const E = require("../lib/engine");
  // Facade, 1 floor (deck 2.4 m), gable roof: long sides have 1 decked level.
  const fac = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 40, jobType: "facade" });
  const s = fac.sides.find((x) => x.kind === "eaves");
  const D = s.deckLevels.length, fields = Math.ceil(s.bays / 5);
  assert.equal(s.parts.guardrails, s.bays * D); // one double guardrail per bay and level
  assert.equal(s.parts.endToeBoards, 2 * D);
  assert.equal(s.parts.hBraces, fields);
  assert.equal(s.parts.startLedgers, 2); // the lowest ladder stands on a deck
  assert.equal(s.parts.decks, D * s.bays * 2 - 2 * D + 2);
  // Roof job: no guardrails behind the roof-catch wall, ends closed with frames.
  const roof = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: true }).sides[0];
  assert.equal(roof.parts.guardrails, 0);
  assert.equal(roof.parts.frames, (roof.bays + 1) * roof.lifts + 2);
  assert.equal(roof.parts.endGuards, 0);
  // 1½ floors: 1 m frames braced with tubes and couplers, a ladder from the ground instead of the start ledgers.
  const half = E.estimate({ length: 12, width: 9, eave: 4.3, roofType: "hip", pitch: 30, jobType: "gutters" }).sides[0];
  assert.equal(half.half, 1);
  assert.equal(half.parts.tubes, Math.ceil(half.bays / 5));
  assert.equal(half.parts.couplers, 2 * Math.ceil(half.bays / 5));
  assert.equal(half.parts.ladders, 1);
  assert.equal(half.parts.startLedgers, 0);
  // Flat roof (≤ 22.5°): the edge protection reaches 1.0 m above the eave.
  const flat = E.estimate({ length: 12, width: 9, eave: 3.0, roofType: "flat", pitch: 0, jobType: "roof" }).sides[0];
  assert.ok(flat.deckH + E.CATCH.wall >= 3.0 + 1.0 - 1e-9);
});

test("checks flag what the rules don't cover", () => {
  const E = require("../lib/engine"), { checksFor } = require("../lib/checks");
  const codes = (h) => checksFor(h, E.estimate(h)).map((c) => c.code + ":" + c.level);
  const steep = codes({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 65, jobType: "roof", gables: true });
  assert.ok(steep.includes("catch_steep:engineer"));
  const hamina = codes({ length: 12.41, width: 9.91, eave: 2.9, roofType: "gable", pitch: 47, jobType: "roof", gables: true, weatherRoof: true });
  assert.ok(hamina.includes("roof_anchor:engineer")); // the roof's top deck is far above the eave
  assert.ok(hamina.includes("steep_45:note"));
  const mz = codes({ length: 12, width: 9, eave: 3.0, roofType: "gable", pitch: 30, jobType: "roof", gables: true, weatherRoof: true, system: "monzon" });
  assert.ok(mz.includes("mz_not_covered:engineer"));
  assert.ok(mz.includes("mz_vties:note"));
});

test("measured L-shaped house: scaffolds never overlap and every wall has one in front of it", () => {
  const E = require("../lib/engine"), { planFor } = require("../lib/layout");
  // L: 12 × 8 with a 5 × 4 notch; counter-clockwise outline, one wall per edge.
  const outline = [[0, 0], [12, 0], [12, 4], [7, 4], [7, 8], [0, 8]];
  const outer = [true, true, true, false, true, true]; // vertex 3 (7,4) is the inner corner
  const walls = outline.map((p, i) => {
    const q = outline[(i + 1) % outline.length];
    return { edge: i, len: Math.hypot(q[0] - p[0], q[1] - p[1]), eave: 3, top: 3, e0: outer[i] ? 1 : 0, e1: outer[(i + 1) % 6] ? 1 : 0 };
  });
  for (const jobType of ["roof", "facade", "gutters"]) {
    const h = { length: 12, width: 8, eave: 3, roofType: "hip", pitch: 30, jobType, walls, shape: { outline, w: [], r: [] } };
    const est = E.estimate(h), plan = planFor(h, est);
    const quad = (s) => { const g = s.gap ?? plan.gap, w = plan.width, P = (t, k) => [s.at[0] + s.dir[0] * t + s.out[0] * k, s.at[1] + s.dir[1] * t + s.out[1] * k]; return [P(0, g), P(s.run, g), P(s.run, g + w), P(0, g + w)]; };
    const sep = (A, B) => [A, B].some((poly) => poly.some((p, i) => {
      const q = poly[(i + 1) % 4], n = [q[1] - p[1], p[0] - q[0]];
      const pa = A.map((v) => v[0] * n[0] + v[1] * n[1]), pb = B.map((v) => v[0] * n[0] + v[1] * n[1]), L = Math.hypot(...n);
      return (Math.max(...pa) - Math.min(...pb)) / L <= 0.02 || (Math.max(...pb) - Math.min(...pa)) / L <= 0.02;
    }));
    const qs = plan.sides.map(quad);
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) assert.ok(sep(qs[i], qs[j]), `${jobType}: ${plan.sides[i].name} × ${plan.sides[j].name}`);
    assert.equal(est.sides.length, 6, jobType);
    // Each side runs at least the length of its wall, less the 1.13 m it gives up at the inner corner.
    for (const s of est.sides) assert.ok(s.run >= s.len - 1.13 - 1e-9, `${jobType}: ${s.name}`);
  }
});
