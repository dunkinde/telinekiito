"use strict";
// 3D building model (National Land Survey LoD2): map sheet names, reading walls and roofs from CityGML,
// and pricing a house wall by wall.
const test = require("node:test");
const assert = require("node:assert/strict");
const { tm35, sheetFor, buildingRecord, roofTypeOf } = require("../lib/nls3d");
const E = require("../lib/engine");

test("map sheet for a point (TM35 1:10 000 sheets)", () => {
  const p = tm35(60.1713883, 25.0186997); // Päätie 39, Helsinki
  assert.ok(Math.abs(p.E - 390070) < 30 && Math.abs(p.N - 6672150) < 30, JSON.stringify(p));
  assert.equal(sheetFor(p.E, p.N), "L4133D");
  // The L4133D file covers E 386 000–392 000, N 6 672 000–6 678 000.
  assert.equal(sheetFor(386001, 6672001), "L4133D");
  assert.equal(sheetFor(391999, 6677999), "L4133D");
  assert.notEqual(sheetFor(392001, 6672001), "L4133D");
  assert.equal(roofTypeOf("1030"), "gable");
  assert.equal(roofTypeOf("9999"), null);
});

// A 10 × 6 m gable house (ridge along x, eaves 3 m, ridge 5 m) with a lean-to: the last 3 m of the south wall
// are only 2 m high. Ground at z = 10.
const Z = 10;
const poly = (kind, pts) => `<bldg:${kind}><gml:posList>${pts.map((p) => p.join(" ")).join(" ")}</gml:posList></bldg:${kind}>`;
const gml = [
  '<bldg:Building gml:id="test_1"><bldg:roofType>1030</bldg:roofType><bldg:measuredHeight>5</bldg:measuredHeight>',
  poly("GroundSurface", [[0, 0, Z], [0, 6, Z], [10, 6, Z], [10, 0, Z], [0, 0, Z]]),
  poly("WallSurface", [[0, 0, Z], [7, 0, Z], [7, 0, Z + 3], [0, 0, Z + 3], [0, 0, Z]]), // south, high part
  poly("WallSurface", [[7, 0, Z], [10, 0, Z], [10, 0, Z + 2], [7, 0, Z + 2], [7, 0, Z]]), // south, under the lean-to
  poly("WallSurface", [[10, 0, Z], [10, 6, Z], [10, 6, Z + 3], [10, 3, Z + 5], [10, 0, Z + 3], [10, 0, Z]]), // east gable
  poly("WallSurface", [[10, 6, Z], [0, 6, Z], [0, 6, Z + 3], [10, 6, Z + 3], [10, 6, Z]]), // north
  poly("WallSurface", [[0, 6, Z], [0, 0, Z], [0, 0, Z + 3], [0, 3, Z + 5], [0, 6, Z + 3], [0, 6, Z]]), // west gable
  poly("WallSurface", [[3, 3, Z + 4], [4, 3, Z + 4], [4, 3, Z + 5], [3, 3, Z + 4]]), // a step in the roof: not a facade wall
  poly("RoofSurface", [[0, 0, Z + 3], [10, 0, Z + 3], [10, 3, Z + 5], [0, 3, Z + 5], [0, 0, Z + 3]]),
  poly("RoofSurface", [[0, 6, Z + 3], [0, 3, Z + 5], [10, 3, Z + 5], [10, 6, Z + 3], [0, 6, Z + 3]]),
  "</bldg:Building>"
].join("");

test("walls, heights and roof from a CityGML building", () => {
  const b = buildingRecord("test_1", gml);
  assert.equal(b.roofType, "1030");
  assert.equal(b.height, 5);
  assert.deepEqual(b.bbox, [0, 0, 10, 6]);
  const total = b.walls.reduce((a, w) => a + w.len, 0);
  assert.ok(Math.abs(total - 32) < 0.01, `perimeter ${total}`);
  const south = b.walls.filter((w) => w.edge === b.walls.find((x) => x.len === 7).edge);
  assert.deepEqual(south.map((w) => [w.len, w.eave, w.gable, w.ext]), [[3, 2, false, 1], [7, 3, false, 1]], "the lean-to part is its own piece (the ring runs west → north → east → south)");
  const gables = b.walls.filter((w) => w.gable);
  assert.equal(gables.length, 2);
  for (const g of gables) assert.deepEqual([g.len, g.eave, g.top, g.ext], [6, 3, 5, 2]);
  const north = b.walls.find((w) => w.len === 10);
  assert.deepEqual([north.eave, north.gable, north.ext], [3, false, 2]);
  assert.equal(b.roofs.length, 2);
  for (const r of b.roofs) assert.ok(Math.abs(r.slope - 33.7) < 0.2, `slope ${r.slope}`);
});

test("price wall by wall from measured walls", () => {
  const walls = buildingRecord("test_1", gml).walls;
  const house = { length: 10, width: 6, eave: 3, roofType: "gable", pitch: 34, gables: true };
  const roof = E.estimate({ ...house, jobType: "roof", walls });
  assert.deepEqual(roof.sides.map((s) => s.name), ["Gable end 1", "Wall 2", "Gable end 3", "Wall 4", "Wall 5"]);
  const [west, north, , lean, south] = roof.sides;
  assert.equal(lean.len, 3);
  assert.equal(lean.catchOn, true);
  // Real run length: walls + 1 m past each outer corner (none where the wall height steps).
  assert.equal(north.runM, 12);
  assert.equal(lean.runM, 4);
  assert.equal(south.runM, 8);
  assert.equal(roof.totals.runM, 40);
  // Parts still come in whole 3.07 m bays.
  assert.equal(south.bays, 3);
  assert.equal(west.kind, "gable");
  assert.equal(west.catchOn, false);

  // Roof job without gable ends, and gutters: only the eaves walls.
  assert.deepEqual(E.estimate({ ...house, jobType: "roof", gables: false, walls }).sides.map((s) => s.kind), ["eaves", "eaves", "eaves"]);
  assert.equal(E.estimate({ ...house, jobType: "gutters", walls }).totals.catchRunM, 0);
  // Facade: every wall, every level decked, no roof catch.
  const facade = E.estimate({ ...house, jobType: "facade", walls });
  assert.equal(facade.sides.length, 5);
  assert.ok(facade.sides.every((s) => s.deckAll && !s.catchOn));

  // The same box without walls is priced as before.
  const box = E.estimate({ ...house, jobType: "roof" });
  assert.deepEqual(box.sides.map((s) => s.name), ["Long side A", "Long side B", "Gable end A", "Gable end B"]);

  // A step in the facade is a short side of its own (it runs through its corners); a 0.8 m niche between two inner
  // corners has no room for a scaffold and is worked from its neighbours; scraps under 0.5 m are merged into the
  // piece before them on the same wall.
  const step = E.estimate({ ...house, jobType: "facade", walls: [{ edge: 0, len: 8, eave: 3, top: 3, e0: 1, e1: 0 }, { edge: 1, len: 0.8, eave: 3, top: 3, e0: 0, e1: 1 }, { edge: 2, len: 6, eave: 3, top: 3, e0: 1, e1: 1 }] });
  assert.deepEqual(step.sides.map((s) => s.len), [8, 0.8, 6]);
  assert.ok(step.sides[1].run >= 0.7);
  const niche = E.estimate({ ...house, jobType: "facade", walls: [{ edge: 0, len: 8, eave: 3, top: 3, ext: 1 }, { edge: 1, len: 0.8, eave: 3, top: 3, ext: 0 }, { edge: 2, len: 6, eave: 3, top: 3, ext: 2 }] });
  assert.deepEqual(niche.sides.map((s) => s.len), [8, 6]);
  const scrap = E.estimate({ ...house, jobType: "facade", walls: [{ edge: 0, len: 8, eave: 3, top: 3, ext: 1 }, { edge: 0, len: 0.3, eave: 3, top: 3, ext: 0 }, { edge: 1, len: 6, eave: 3, top: 3, ext: 2 }] });
  assert.deepEqual(scrap.sides.map((s) => s.len), [8.3, 6]);
});

test("MonZon Modular Light: same grid as Layher, its own parts", () => {
  const h = { length: 12.4, width: 9.9, eave: 2.9, roofType: "gable", pitch: 47, jobType: "roof", gables: true };
  const lay = E.estimate(h), mz = E.estimate({ ...h, system: "monzon" });
  assert.equal(lay.system, "layher");
  assert.equal(mz.system, "monzon");
  assert.equal(mz.totals.area, lay.totals.area); // 3.07 m bays in both
  assert.ok(Object.keys(mz.totals.parts).every((k) => k.startsWith("mz_")));
  // A long side: 5 bays, 6 frame lines, one lift, one decked level with the roof-catch wall on 0.36 m brackets and a
  // deck on them (DIN 4420-1: b ≥ 0.70 m from the eave). The wall replaces the double guardrails, so the outer ledger
  // stays; two decks in the access bay for the lowest ladder; ties on every standard (catch) plus V ties at both
  // ends and every 5th pair (instruction p. 28).
  const side = mz.sides[0];
  assert.equal(side.bays, 5);
  assert.deepEqual(
    [side.parts.mz_standards, side.parts.mz_transoms, side.parts.mz_ledgers, side.parts.mz_decks, side.parts.mz_guardrails, side.parts.mz_anchors],
    [12, 12, 20, 15, 0, 9]
  );
  assert.equal(side.parts.mz_brackets, 6);
  // Own rates per system when the office sets them.
  const P = { ...E.DEFAULT_PRICING, systems: { layher: { enabled: true }, monzon: { enabled: true, rentPerM2Day: 0.2 } } };
  const sel = { days: 28, zone: "C", urgency: "standard" };
  assert.ok(E.quote(mz, sel, P).total > E.quote(lay, sel, P).total);
  assert.equal(E.quote(lay, sel, P).total, E.quote(lay, sel, E.DEFAULT_PRICING).total);
});
