"use strict";
// Stair towers: every scaffold model gets them automatically, they stand clear of the house and the other scaffolds,
// carry the right parts and price, and orders from before them keep their hatch decks and ladders.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const E = require("../lib/engine");
const O = require("../lib/orders");
const S = require("../lib/stock");
const { planFor } = require("../lib/layout");
const { checksFor } = require("../lib/checks");

/** Plan-side rectangle t0..t1 along the run, d0..d1 out from the wall. */
const rect = (s, t0, t1, d0, d1) => {
  const P = (t, d) => [s.at[0] + s.dir[0] * t + s.out[0] * d, s.at[1] + s.dir[1] * t + s.out[1] * d];
  return [P(t0, d0), P(t1, d0), P(t1, d1), P(t0, d1)];
};
/** Shortest distance between two convex polygons (0 when they overlap); a segment is a two-point polygon. */
function dist(A, B) {
  const sep = [A, B].some((poly) => poly.some((p, i) => {
    const q = poly[(i + 1) % poly.length], n = [q[1] - p[1], p[0] - q[0]];
    if (!n[0] && !n[1]) return false;
    const pa = A.map((v) => v[0] * n[0] + v[1] * n[1]), pb = B.map((v) => v[0] * n[0] + v[1] * n[1]);
    return Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9;
  }));
  if (!sep) return 0;
  const seg = (a, b, p) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
  };
  let best = Infinity;
  for (const [X, Y] of [[A, B], [B, A]]) for (const p of X) for (let i = 0; i < Y.length; i++) best = Math.min(best, seg(Y[i], Y[(i + 1) % Y.length], p));
  return best;
}
/** Every tower's footprint in the plan, with the side it stands beside. */
const towersOf = (plan) => plan.sides.flatMap((s) => (s.stairs || []).map((t) => {
  const b = s.run / s.bays;
  return { side: s, t, q: rect(s, t.bay * b, (t.bay + 1) * b, t.d0, t.d0 + t.w) };
}));
const footOf = (plan, s) => rect(s, 0, s.run, s.gap ?? plan.gap, (s.gap ?? plan.gap) + plan.width + (s.catchConsole ? E.CATCH.console : 0));

/** Towers stand clear of the house, the other scaffolds (and their catch consoles), each other and a temporary roof. */
function assertClear(plan, house, label) {
  const tw = towersOf(plan);
  for (const [i, a] of tw.entries()) {
    for (const s of plan.sides) if (s !== a.side) assert.ok(dist(a.q, footOf(plan, s)) >= 0.099, `${label}: tower by ${a.side.name} hits ${s.name}`);
    for (const [j, b] of tw.entries()) if (j > i) assert.ok(dist(a.q, b.q) >= 0.099, `${label}: two towers touch`);
    for (let e = 0; e < house.length; e++) assert.ok(dist(a.q, [house[e], house[(e + 1) % house.length]]) >= 0.099, `${label}: tower by ${a.side.name} hits the house`);
    if (plan.roof) {
      const r = plan.roof, n = [-r.dir[1], r.dir[0]], hl = r.length / 2, hs = r.span / 2;
      const R = [[-hl, -hs], [hl, -hs], [hl, hs], [-hl, hs]].map(([u, v]) => [r.at[0] + r.dir[0] * u + n[0] * v, r.at[1] + r.dir[1] * u + n[1] * v]);
      const c = a.q.map((p, k) => { const m = [(a.q[0][0] + a.q[2][0]) / 2, (a.q[0][1] + a.q[2][1]) / 2]; return [p[0] + (m[0] - p[0]) * 0.05, p[1] + (m[1] - p[1]) * 0.05]; });
      assert.ok(dist(c, R) > 0, `${label}: tower by ${a.side.name} stands under the temporary roof`);
    }
  }
}

test("every scaffold model gets stair towers that reach every deck and stand clear", () => {
  let models = 0;
  for (const system of ["layher", "monzon"]) for (const roofType of ["gable", "hip", "flat"]) for (const jobType of Object.keys(E.JOB_TYPES)) for (const eave of [2.6, 4.3, 5.8, 9]) {
    for (const extra of [{}, { weatherRoof: true }, { sheeting: true }]) {
      const h = O.houseOf({ length: 13.4, width: 9.2, eave, roofType, pitch: roofType === "flat" ? 0 : 32, jobType, gables: roofType === "gable" && jobType === "roof", system, ...extra });
      const est = E.estimate(h), plan = planFor(h, est), label = `${system} ${roofType} ${jobType} ${eave} ${JSON.stringify(extra)}`;
      models++;
      assert.equal(est.access, "stairs", label);
      assert.equal(plan.access, "stairs", label);
      assert.ok(est.totals.stairs.n >= 1, `${label}: no stair tower`);
      // Box houses always have room: no scaffold is left with ladders.
      assert.ok(est.sides.every((s) => !s.accessN), `${label}: a scaffold fell back to ladders`);
      assert.equal(towersOf(plan).length, est.totals.stairs.n, label);
      // Every scaffold one can walk round is reached by a tower on it or round a corner.
      const reached = new Set(est.sides.flatMap((s) => s.stairs.flatMap((t) => t.reach)));
      for (const s of est.sides) if (s.kind !== "support") assert.ok(reached.has(s.name), `${label}: ${s.name} has no way up`);
      // One flight per lift: 2.00 m platform stairs and 1.00 m starter stairs for the 1 m lifts.
      const flights = est.sides.reduce((n, s) => n + s.stairs.length * (s.lifts + (s.half ? 1 : 0)), 0);
      const P = est.totals.parts;
      if (system === "layher") assert.equal(P.stairs + P.stairs1, flights, label);
      else assert.equal(P.mz_stairs + P.mz_stairs1, flights, label);
      assert.ok(Object.values(P).every((v) => v >= 0 && Number.isFinite(v)), `${label}: bad part count`);
      const L = 13.4, W = 9.2;
      assertClear(plan, [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]], label);
    }
  }
  assert.ok(models > 200);
});

test("measured L- and T-shaped houses: towers clear of the wings, the inner corners and the temporary roof", () => {
  const shapes = {
    L: [[0, 0], [12, 0], [12, 4], [7, 4], [7, 8], [0, 8]],
    T: [[0, 0], [16, 0], [16, 5], [10, 5], [10, 11], [6, 11], [6, 5], [0, 5]]
  };
  for (const [name, outline] of Object.entries(shapes)) {
    const cross = (i) => { const a = outline[(i + outline.length - 1) % outline.length], p = outline[i], b = outline[(i + 1) % outline.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) > 0; };
    const walls = outline.map((p, i) => {
      const q = outline[(i + 1) % outline.length];
      return { edge: i, len: Math.hypot(q[0] - p[0], q[1] - p[1]), eave: 3.2, top: 3.2, e0: cross(i) ? 1 : 0, e1: cross((i + 1) % outline.length) ? 1 : 0 };
    });
    const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length, cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    const house = outline.map((p) => [p[0] - cx, p[1] - cy]);
    for (const system of ["layher", "monzon"]) for (const jobType of ["roof", "facade", "gutters"]) for (const weatherRoof of [false, true]) {
      const h = { length: 16, width: 11, eave: 3.2, roofType: "hip", pitch: 30, jobType, walls, shape: { outline, w: [], r: [] }, system, weatherRoof };
      const est = E.estimate(h), plan = planFor(h, est), label = `${name} ${system} ${jobType} roof:${weatherRoof}`;
      assert.ok(est.totals.stairs.n >= 1, `${label}: no stair tower`);
      assertClear(plan, house, label);
      // A scaffold left with ladders (no room for a tower) is reported for the office and crew.
      if (est.sides.some((s) => s.kind !== "support" && s.accessN > 0)) assert.ok(checksFor(h, est).some((c) => c.code === "no_stairs"), label);
    }
  }
});

test("stair tower parts: per flight, the scaffold bay beside it decked on every landing, the guardrail opened", () => {
  // Gutters, 1 floor: two long sides, one lift each, decked on top: one tower each with one platform stair.
  const h = { length: 12, width: 9, eave: 3, roofType: "gable", pitch: 30, jobType: "gutters" };
  const est = E.estimate(h), old = E.estimate({ ...h, ladders: true }), P = est.totals.parts;
  assert.equal(est.totals.stairs.n, 2);
  assert.deepEqual([P.stairs, P.stairs1, P.stairStart, P.stairRails, P.stairWalk, P.stairTop, P.gapDecks, P.stairCouplers], [2, 0, 2, 2, 0, 2, 2, 8]);
  assert.equal(P.hatchDecks, 0);
  assert.equal(P.startLedgers, 0);
  // Each tower: 2 frames and 4 base jacks; its top landing has its own guardrail, the scaffold's opens onto it.
  assert.equal(P.frames - (old.totals.parts.frames), 4);
  assert.equal(P.baseJacks - old.totals.parts.baseJacks, 8);
  assert.equal(P.guardrails, old.totals.parts.guardrails);
  // 1½ floors with roof work: a 1 m starter stair, landings decked on the lifts the scaffold isn't decked on.
  const tall = E.estimate({ length: 12, width: 9, eave: 5.8, roofType: "gable", pitch: 30, jobType: "roof", gables: true });
  const side = tall.sides.find((s) => s.stairs.length && s.half);
  if (side) {
    const flights = side.lifts + 1;
    assert.ok(tall.totals.parts.stairs1 >= 1);
    assert.ok(tall.totals.parts.stairWalk >= flights - 1);
  }
  // MonZon: the tower stands on the scaffold's outer standards (two more per lift), U-stairways and stair guardrails.
  const mz = E.estimate({ ...h, system: "monzon" }), M = mz.totals.parts;
  assert.equal(M.mz_stairs, 2);
  assert.equal(M.mz_stairRails, 2);
  assert.ok(mz.sides.every((s) => s.stairs.every((t) => t.shared && t.d0 === Math.round((s.gap + 0.73) * 100) / 100)));
  // The tower's weight goes into the truck load.
  assert.ok(est.totals.weightKg > old.totals.weightKg + 2 * 75);
});

test("stair towers are priced per metre of height: rent per day and work, on their own line", () => {
  const p = O.mergePricing({});
  assert.equal(p.stairRentPerMDay, E.DEFAULT_PRICING.stairRentPerMDay);
  assert.equal(p.stairPerM, E.DEFAULT_PRICING.stairPerM);
  // The office's own rates are kept (the pricing whitelist knows them).
  const own = O.mergePricing({ stairRentPerMDay: 0.8, stairPerM: 30 });
  assert.equal(own.stairRentPerMDay, 0.8);
  assert.equal(own.stairPerM, 30);
  const h = { length: 12, width: 9, eave: 3, roofType: "gable", pitch: 30, jobType: "gutters" };
  const est = E.estimate(h), st = est.totals.stairs;
  const q = E.quote(est, { days: 28, zone: "A", urgency: "standard" }, own);
  const line = q.lines.find((l) => l.key === "stairs");
  assert.deepEqual(line.vars, { n: st.n, m: st.m });
  assert.ok(Math.abs(line.amount - st.m * (0.8 * 28 + 30)) < 0.02);
  // The work part counts towards the household tax credit.
  const zero = E.quote(est, { days: 28, zone: "A", urgency: "standard" }, { ...own, stairPerM: 0 });
  assert.ok(Math.abs(q.labourGross - zero.labourGross - st.m * 30 * (1 + own.vat / 100)) < 0.05);
  // Rates set to 0: the towers are in the plan and the parts list, but there's no price line.
  const free = E.quote(est, { days: 28, zone: "A", urgency: "standard" }, { ...own, stairPerM: 0, stairRentPerMDay: 0 });
  assert.ok(!free.lines.some((l) => l.key === "stairs"));
  // Orders from before stair towers: no towers, no line, hatch decks and ladders as quoted.
  const old = E.estimate({ ...h, ladders: true });
  assert.equal(old.access, "ladders");
  assert.equal(old.totals.stairs.n, 0);
  assert.ok(old.totals.parts.hatchDecks > 0);
  assert.ok(!E.quote(old, { days: 28, zone: "A", urgency: "standard" }, own).lines.some((l) => l.key === "stairs"));
});

test("the ladders flag stays on stored orders only: customers can't send it", () => {
  const body = { length: 12, width: 9, eave: 3, roofType: "gable", pitch: 30, jobType: "gutters", floors: "1", zone: "A", urgency: "standard", start: E.earliestStart("standard", O.helsinkiNow()), days: 28, name: "Testi", phone: "040 111 2222", address: "Testikatu 1, Hamina", ladders: true };
  assert.equal(O.houseOf(O.parseOrderInput(body)).ladders, undefined);
  assert.equal(O.houseOf(O.parseQuoteInput(body)).ladders, undefined);
  assert.equal(O.houseOf({ ...O.parseQuoteInput(body), ladders: true }).ladders, true);
  assert.equal(O.houseOf({ ...O.parseQuoteInput(body), ladders: "yes" }).ladders, undefined);
});

test("checks: how the towers stand, a gate in the roof-catch wall, nothing for the engineer", () => {
  const hip = { length: 12, width: 9, eave: 3, roofType: "hip", pitch: 25, jobType: "roof" };
  const c = checksFor(hip, E.estimate(hip));
  const tower = c.find((x) => x.code === "stair_tower");
  assert.equal(tower.vars.system, "layher");
  assert.ok(c.some((x) => x.code === "stair_gate"));
  assert.ok(!c.some((x) => /^stair|no_stairs/.test(x.code) && x.level === "engineer"));
  const gutters = { length: 12, width: 9, eave: 3, roofType: "gable", pitch: 30, jobType: "gutters", system: "monzon" };
  const g = checksFor(gutters, E.estimate(gutters));
  assert.equal(g.find((x) => x.code === "stair_tower").vars.system, "monzon");
  assert.ok(!g.some((x) => x.code === "stair_gate"));
  const steel = { ...gutters, system: "alfix100" };
  assert.equal(checksFor(steel, E.estimate(steel)).find((x) => x.code === "stair_tower").vars.system, "partner");
});

test("stock: stair parts are a kit of their own; a part a job doesn't use never refuses it", () => {
  const st = S.mergeStock({ enabled: true, owned: { frames: 400, decks: 400, baseJacks: 400 } });
  const keys = S.trackedKeys(st);
  assert.ok(keys.includes("frames") && !keys.includes("stairs") && !keys.includes("gapDecks"));
  assert.equal(S.check([], st, { stairs: 4, frames: 10 }, "2027-05-01", "2027-05-29").ok, true);
  // Once a stair part is entered, the whole stair kit is checked.
  const both = S.mergeStock({ enabled: true, owned: { frames: 400, stairs: 2 } });
  assert.ok(S.trackedKeys(both).includes("stairRails"));
  assert.equal(S.check([], both, { stairs: 4 }, "2027-05-01", "2027-05-29").ok, false);
  // Other orders holding more ladders than are owned don't refuse a job that needs none.
  const o = { ref: "TK-A", status: "confirmed", schedule: { start: "2027-05-01", days: 28 }, estimate: { parts: { ladders: 5, frames: 10 } } };
  const st2 = S.mergeStock({ enabled: true, owned: { frames: 400, ladders: 2 } });
  assert.equal(S.check([o], st2, { frames: 10 }, "2027-05-02", "2027-05-20").ok, true);
  assert.equal(S.check([o], st2, { frames: 10, ladders: 1 }, "2027-05-02", "2027-05-20").ok, false);
});

/* ---------- Orders from before stair towers keep their ladders (startup migration, runs once) ---------- */

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
async function startServer(dataDir) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, SITE_DIR: path.join(dataDir, "site"), DEPLOY_DIR: path.join(dataDir, "deploy"), OFFICE_PASSWORD: "test-password-123", SESSION_SECRET: "y".repeat(64), OPENAI_API_KEY: "", SEED_EXAMPLES: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  proc.stdout.on("data", (d) => { log += d; });
  proc.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/healthz")).ok) return { proc, base }; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill("SIGTERM");
  throw new Error("server didn't start:\n" + log);
}
const stop = (proc) => new Promise((r) => { proc.once("exit", r); proc.kill("SIGTERM"); });
async function call(base, method, url, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const r = await fetch(base + url, init);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}

test("orders from before stair towers keep their hatch decks and ladders; new orders get stairs", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tk-stairs-"));
  try {
    // An order and a pending change saved before this version.
    const Store = require("../lib/store");
    const store = Store.open(dataDir);
    const p = O.mergePricing({});
    const f = O.parseOrderInput({ length: 12, width: 9, eave: 3, roofType: "gable", pitch: 30, jobType: "gutters", floors: "1", zone: "A", urgency: "standard", start: E.earliestStart("standard", O.helsinkiNow()), days: 28, name: "Vanha Tilaus", phone: "040 111 3333", address: "Vanhatie 1, Hamina" });
    const old = O.buildOrder(f, p, () => false);
    old.house = { ...old.house };
    delete old.house.ladders;
    store.insertOrder(old);
    store.put("change", { ref: old.ref, type: "house", source: "customer", status: "pending", proposed: { house: { ...old.house, eave: 3.5 } } });
    store.close();

    let { proc, base } = await startServer(dataDir);
    const login = await call(base, "POST", "/api/office/login", { password: "test-password-123" });
    let H = { Cookie: login.headers.get("set-cookie").split(";")[0] };
    const got = (await call(base, "GET", `/api/office/orders/${old.ref}`, undefined, H)).json.order;
    assert.equal(got.house.ladders, true);
    assert.equal((await call(base, "GET", `/api/office/orders/${old.ref}/plan`, undefined, H)).json.plan.access, "ladders");

    // A new order from the website: stair towers, and their line in the price.
    const placed = await call(base, "POST", "/api/orders", { ...f, start: f.start, name: "Uusi Tilaus", phone: "040 111 4444", address: "Uusitie 2, Hamina", source: "form" });
    assert.equal(placed.status, 200, placed.text);
    const fresh = (await call(base, "GET", `/api/office/orders/${placed.json.ref}`, undefined, H)).json.order;
    assert.equal(fresh.house.ladders, undefined);
    assert.ok(fresh.estimate.stairs.n >= 1);
    assert.ok(fresh.quote.lines.some((l) => l.key === "stairs"));
    assert.ok(fresh.estimate.parts.stairs >= 1);
    const plan = (await call(base, "GET", `/api/office/orders/${placed.json.ref}/plan`, undefined, H)).json.plan;
    assert.equal(plan.access, "stairs");
    assert.ok(plan.sides.some((s) => s.stairs && s.stairs.length));

    // A restart doesn't touch orders made since.
    await stop(proc);
    ({ proc, base } = await startServer(dataDir));
    const login2 = await call(base, "POST", "/api/office/login", { password: "test-password-123" });
    H = { Cookie: login2.headers.get("set-cookie").split(";")[0] };
    assert.equal((await call(base, "GET", `/api/office/orders/${placed.json.ref}`, undefined, H)).json.order.house.ladders, undefined);
    assert.equal((await call(base, "GET", `/api/office/orders/${old.ref}`, undefined, H)).json.order.house.ladders, true);
    await stop(proc);
    const check = Store.open(dataDir);
    const ch = check.list("change", { ref: old.ref })[0];
    assert.equal(ch.proposed.house.ladders, true);
    check.close();
  } finally {
    try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
});
