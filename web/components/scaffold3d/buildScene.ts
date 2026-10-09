// Builds the three.js scene for a scaffold plan: the house from its wall and roof polygons, and every side's
// standards, ledgers, transoms, decks, guardrails, toe boards, diagonals and roof-catch net, bay by bay.
// Plan coordinates (x east, y north, z up) become three.js coordinates (x, z, -y).
import type * as THREE_NS from "three";
import type { P2, P3, PlanSide, ScaffoldPlan } from "@/lib/plan";

type THREE = typeof THREE_NS;

export const COLORS = {
  wall: 0xefe9df,
  roof: 0x3f444c,
  edge: 0x8a8f96,
  tube: 0xa9b1ba,
  deck: 0xc9ced4,
  hatch: 0x6c737c,
  toe: 0xb5651d,
  net: 0xd9482b,
  ground: 0xe6e8e2,
  sheet: 0xf4f7fa,
  tarp: 0xdfe9f2,
  truss: 0x9aa3ad,
  selected: 0xffc20e
};

export interface SideObjects {
  side: PlanSide;
  group: THREE_NS.Group;
  /** Materials that light up when the side is selected. */
  materials: THREE_NS.MeshStandardMaterial[];
  /** Where to put the side's number label. */
  labelAt: THREE_NS.Vector3;
}

const toV = (T: THREE, p: P3) => new T.Vector3(p[0], p[2], -p[1]);

/** A flat polygon in 3D, triangulated in its own plane. */
function polygon(T: THREE, pts: P3[]): THREE_NS.BufferGeometry | null {
  if (pts.length < 3) return null;
  // Newell normal, then two axes in the plane.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const n = new T.Vector3(nx, ny, nz);
  if (n.lengthSq() < 1e-9) return null;
  n.normalize();
  const u = Math.abs(n.z) < 0.9 ? new T.Vector3(0, 0, 1).cross(n).normalize() : new T.Vector3(1, 0, 0).cross(n).normalize();
  const v = n.clone().cross(u);
  const flat = pts.map((p) => new T.Vector2(p[0] * u.x + p[1] * u.y + p[2] * u.z, p[0] * v.x + p[1] * v.y + p[2] * v.z));
  const tris = T.ShapeUtils.triangulateShape(flat, []);
  if (!tris.length) return null;
  const pos: number[] = [];
  for (const t of tris) for (const k of t) { const p = pts[k]; pos.push(p[0], p[2], -p[1]); }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Many tubes as one instanced mesh: each tube from a to b (three.js coordinates). */
function tubes(T: THREE, list: [THREE_NS.Vector3, THREE_NS.Vector3][], radius: number, mat: THREE_NS.Material) {
  const geo = new T.CylinderGeometry(radius, radius, 1, 6);
  const mesh = new T.InstancedMesh(geo, mat, Math.max(1, list.length));
  const up = new T.Vector3(0, 1, 0), m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3();
  list.forEach(([a, b], i) => {
    const d = b.clone().sub(a);
    const len = d.length() || 0.001;
    q.setFromUnitVectors(up, d.normalize());
    s.set(1, len, 1);
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  return mesh;
}

/** Many boxes (decks, toe boards) as one instanced mesh; each box from its centre, size and turn around the vertical. */
function boxes(T: THREE, list: { c: THREE_NS.Vector3; size: [number, number, number]; yaw: number }[], mat: THREE_NS.Material) {
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, Math.max(1, list.length));
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
  list.forEach((b, i) => {
    q.setFromEuler(e.set(0, b.yaw, 0));
    m.compose(b.c, q, new T.Vector3(...b.size));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  return mesh;
}

/** How a side's ends meet the scaffolds round it: the other side's top deck height at each end, and coupler tubes. */
interface Joins { top: [number, number]; ties: { a: P2; b: P2; top: number }[] }

/**
 * Corners: an end of one side that stops just short of another side (0.1 m, measured corners are seldom square) is
 * coupled to it with short tubes on every level the two share, and needs no end guardrail up to the other's top.
 */
function joinsOf(plan: ScaffoldPlan): Joins[] {
  const W = plan.width;
  const runOf = (s: PlanSide) => s.run ?? s.bays * plan.bay;
  const topOf = (s: PlanSide) => plan.jack + (s.half ? plan.half ?? 1 : 0) + plan.lift * s.lifts - (s.topUp ? plan.lift - (plan.half ?? 1) : 0);
  return plan.sides.map((s, i) => {
    const j: Joins = { top: [-1, -1], ties: [] };
    const g = s.gap ?? plan.gap, run = runOf(s);
    for (const k of [0, 1] as const) {
      const t = k ? run : 0;
      for (const d of [g, g + W]) {
        const p: P2 = [s.at[0] + s.dir[0] * t + s.out[0] * d, s.at[1] + s.dir[1] * t + s.out[1] * d];
        plan.sides.some((o, m) => {
          if (m === i) return false;
          const go = o.gap ?? plan.gap, vx = p[0] - o.at[0], vy = p[1] - o.at[1];
          const to = vx * o.dir[0] + vy * o.dir[1], dd = vx * o.out[0] + vy * o.out[1];
          if (to < -0.02 || to > runOf(o) + 0.02 || dd < go - 0.35 || dd > go + W + 0.35) return false;
          const top = Math.min(topOf(s), topOf(o)), dc = Math.min(go + W, Math.max(go, dd));
          j.top[k] = Math.max(j.top[k], top);
          if (Math.abs(dc - dd) > 0.01) j.ties.push({ a: p, b: [o.at[0] + o.dir[0] * to + o.out[0] * dc, o.at[1] + o.dir[1] * to + o.out[1] * dc], top });
          return true;
        });
      }
    }
    return j;
  });
}

function sideObjects(T: THREE, plan: ScaffoldPlan, side: PlanSide, joins: Joins = { top: [-1, -1], ties: [] }): SideObjects {
  const group = new T.Group();
  group.userData.side = side.i;
  const tubeMat = new T.MeshStandardMaterial({ color: COLORS.tube, metalness: 0.4, roughness: 0.5 });
  const deckMat = new T.MeshStandardMaterial({ color: COLORS.deck, metalness: 0.3, roughness: 0.6 });
  const hatchMat = new T.MeshStandardMaterial({ color: COLORS.hatch, roughness: 0.7 });
  const toeMat = new T.MeshStandardMaterial({ color: COLORS.toe, roughness: 0.8 });
  const netMat = new T.MeshStandardMaterial({ color: COLORS.net, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false });

  const { width, lift, jack } = plan;
  // Bays as built: a side that butts against a corner scaffold uses shorter bays to fit its run.
  const bay = side.run ? side.run / side.bays : plan.bay;
  const gap = side.gap ?? plan.gap;
  const base = jack + (side.half ? plan.half ?? 1 : 0); // lowest transom of the 2 m lifts
  // Height of level l (0 = on the base jacks); a top lift of 1.00 m frames ends 1 m lower.
  const Z = (l: number) => (l === 0 ? jack : base + lift * l - (side.topUp && l === side.lifts ? lift - (plan.half ?? 1) : 0));
  const run = side.bays * bay;
  const top = Z(side.lifts); // highest deck
  const cons = 0.36;
  // Roof-catch: grids 2 m high from the catch level, on an outer console at the top or on the outer standards.
  const catchZ = side.catchOn ? Z(side.catchLevel ?? side.lifts) : null;
  const catchD = side.catchConsole ? gap + width + cons : gap + width;
  const postTop = side.catchOn && side.catchConsole ? top : top + 1;
  const yaw = Math.atan2(side.dir[1], side.dir[0]); // plan angle; three.js turns the other way round y
  // A point at distance t along the run, d out from the wall, height z.
  const P = (t: number, d: number, z: number) => toV(T, [side.at[0] + side.dir[0] * t + side.out[0] * d, side.at[1] + side.dir[1] * t + side.out[1] * d, z]);
  const inner = gap, outer = gap + width, mid = gap + width / 2;
  const tl: [THREE_NS.Vector3, THREE_NS.Vector3][] = [];

  for (let k = 0; k <= side.bays; k++) {
    const t = k * bay;
    // Inner standards end at the top deck (no posts against the wall); outer ones carry the guardrail posts.
    tl.push([P(t, inner, 0), P(t, inner, side.innerRail ? top + 1 : top)]);
    tl.push([P(t, outer, 0), P(t, outer, postTop)]);
    if (side.half) tl.push([P(t, inner, base), P(t, outer, base)]);
    for (let l = 0; l <= side.lifts; l++) tl.push([P(t, inner, Z(l)), P(t, outer, Z(l))]); // transoms
    if (catchZ != null) {
      if (side.catchConsole) tl.push([P(t, outer, top), P(t, catchD, top)], [P(t, catchD, top), P(t, catchD, top + 2)]);
    }
    if (side.inner) for (const l of side.decks) if (!(side.innerRail && l === side.lifts)) tl.push([P(t, inner - cons, Z(l)), P(t, inner, Z(l))]);
  }
  if (side.half) { tl.push([P(0, inner, base), P(run, inner, base)]); tl.push([P(0, outer, base), P(run, outer, base)]); }
  for (let l = 0; l <= side.lifts; l++) {
    const z = Z(l);
    tl.push([P(0, inner, z), P(run, inner, z)]);
    tl.push([P(0, outer, z), P(run, outer, z)]);
  }
  // Guardrails at hand and knee height on every decked level, outside and at both ends.
  const deckList: { c: THREE_NS.Vector3; size: [number, number, number]; yaw: number }[] = [];
  const hatchList: typeof deckList = [], toeList: typeof deckList = [];
  // Decked levels: the listed lifts, plus the top of the 1 m base frame where every level is decked.
  const decked = [...(side.halfDeck ? [{ l: -1, z: base }] : []), ...side.decks.map((l) => ({ l, z: Z(l) }))];
  for (const { l, z } of decked) {
    const atCatch = catchZ != null && Math.abs(z - catchZ) < 0.01;
    if (side.inner && !(side.innerRail && l === side.lifts)) for (let k = 0; k < side.bays; k++) deckList.push({ c: P((k + 0.5) * bay, inner - cons / 2, z + 0.03), size: [bay - 0.04, 0.05, cons - 0.04], yaw });
    if (atCatch && side.catchConsole) for (let k = 0; k < side.bays; k++) deckList.push({ c: P((k + 0.5) * bay, outer + cons / 2, z + 0.03), size: [bay - 0.04, 0.05, cons - 0.04], yaw });
    if (atCatch) continue; // the catch wall is the side protection here
    for (const h of [0.5, 1.0]) {
      tl.push([P(0, outer, z + h), P(run, outer, z + h)]);
      // No end rail where the end is coupled to the next scaffold at this level.
      if (z > joins.top[0] + 0.01) tl.push([P(0, inner, z + h), P(0, outer, z + h)]);
      if (z > joins.top[1] + 0.01) tl.push([P(run, inner, z + h), P(run, outer, z + h)]);
    }
    for (let k = 0; k < side.bays; k++) {
      const c = P((k + 0.5) * bay, mid, z + 0.03);
      (k === 0 && (side.access ?? 1) > 0 ? hatchList : deckList).push({ c, size: [bay - 0.04, 0.05, width - 0.06], yaw });
      toeList.push({ c: P((k + 0.5) * bay, outer - 0.02, z + 0.08), size: [bay - 0.04, 0.15, 0.025], yaw });
    }
  }
  // Above the eave the top deck has no wall beside it: guardrail on the inside too.
  if (side.innerRail) for (const h of [0.5, 1.0]) tl.push([P(0, inner, top + h), P(run, inner, top + h)]);
  // Diagonal braces in the outer plane, every fifth bay, through all 2 m lifts.
  for (let k = 0; k < side.bays; k += 5) for (let l = 0; l < side.lifts; l++) tl.push([P(k * bay, outer, l === 0 ? base : Z(l)), P((k + 1) * bay, outer, Z(l + 1))]);
  if (catchZ != null) {
    // Roof-catch wall: rails along it every 0.5 m and a toe board, the grids drawn as a fine mesh below.
    for (const h of [0.5, 1.0, 1.5, 2.0]) tl.push([P(0, catchD, catchZ + h), P(run, catchD, catchZ + h)]);
    for (const h of [0.5, 1.0, 1.5, 2.0]) { tl.push([P(0, inner, catchZ + Math.min(h, 1)), P(0, catchD, catchZ + h)]); tl.push([P(run, inner, catchZ + Math.min(h, 1)), P(run, catchD, catchZ + h)]); }
    for (let k = 0; k < side.bays; k++) toeList.push({ c: P((k + 0.5) * bay, catchD - 0.02, catchZ + 0.08), size: [bay - 0.04, 0.15, 0.025], yaw });
  }

  // Couplers to the scaffold round the corner, on every level both reach.
  for (const tie of joins.ties) for (let l = 0; l <= side.lifts; l++) {
    const z = Z(l);
    if (z <= tie.top + 0.01) tl.push([toV(T, [tie.a[0], tie.a[1], z]), toV(T, [tie.b[0], tie.b[1], z])]);
  }
  group.add(tubes(T, tl, 0.024, tubeMat));
  if (deckList.length) group.add(boxes(T, deckList, deckMat));
  if (hatchList.length) group.add(boxes(T, hatchList, hatchMat));
  if (toeList.length) group.add(boxes(T, toeList, toeMat));

  if (plan.sheeting) {
    // Weather sheeting over the whole outer face.
    const h = Math.max(top + 1, catchZ != null ? catchZ + 2 : 0);
    const a = P(0, outer + 0.05, 0), b = P(run, outer + 0.05, 0), c = P(run, outer + 0.05, h), d = P(0, outer + 0.05, h);
    const g = new T.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    g.computeVertexNormals();
    group.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: COLORS.sheet, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false })));
  }
  if (catchZ != null) {
    // The side protection grids of the roof-catch wall.
    const a = P(0, catchD, catchZ + 0.1), b = P(run, catchD, catchZ + 0.1), c = P(run, catchD, catchZ + 2), d = P(0, catchD, catchZ + 2);
    const g = new T.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    g.computeVertexNormals();
    group.add(new T.Mesh(g, netMat));
    const grid: [THREE_NS.Vector3, THREE_NS.Vector3][] = [];
    for (let t = 0.25; t < run; t += 0.25) grid.push([P(t, catchD, catchZ + 0.1), P(t, catchD, catchZ + 2)]);
    for (let h = 0.35; h < 2; h += 0.25) grid.push([P(0, catchD, catchZ + h), P(run, catchD, catchZ + h)]);
    group.add(tubes(T, grid, 0.006, netMat));
  }
  group.traverse((o) => { o.userData.side = side.i; });
  return { side, group, materials: [tubeMat, deckMat], labelAt: P(run / 2, outer + 0.6, Math.max(top + 1.6, catchZ != null ? catchZ + 2.6 : 0)) };
}

/** The temporary keder roof: trusses every section and the tarpaulin over them, resting on the scaffold top. */
function roofObject(T: THREE, r: NonNullable<ScaffoldPlan["roof"]>) {
  const g = new T.Group();
  const d = r.dir, n: [number, number] = [-d[1], d[0]];
  const rise = (r.span / 2) * Math.tan((r.pitch * Math.PI) / 180);
  const z0 = r.support + 1.0; // on top of the scaffold's guardrail posts
  // A point at u along the ridge (from the centre), v across it, height z.
  const Q = (u: number, v: number, z: number) => toV(T, [r.at[0] + d[0] * u + n[0] * v, r.at[1] + d[1] * u + n[1] * v, z]);
  const tl: [THREE_NS.Vector3, THREE_NS.Vector3][] = [];
  const half = r.length / 2, w = r.span / 2;
  for (let k = 0; k <= r.sections; k++) {
    const u = -half + (k * r.length) / r.sections;
    for (const s of [-1, 1]) {
      tl.push([Q(u, s * w, z0), Q(u, 0, z0 + rise)]); // top chord
      tl.push([Q(u, s * w, z0 - 0.75), Q(u, 0, z0 + rise - 0.75)]); // bottom chord
      for (let f = 0; f <= 4; f++) { const v = s * w * (1 - f / 4), z = z0 + rise * (f / 4); tl.push([Q(u, v, z), Q(u, v, z - 0.75)]); }
    }
  }
  for (const v of [-w, 0, w]) tl.push([Q(-half, v, v === 0 ? z0 + rise : z0), Q(half, v, v === 0 ? z0 + rise : z0)]);
  g.add(tubes(T, tl, 0.03, new T.MeshStandardMaterial({ color: COLORS.truss, metalness: 0.4, roughness: 0.5 })));
  // The roof covering: light blue-white and only slightly see-through, so it reads as a roof but the house shows.
  const tarp = new T.MeshStandardMaterial({ color: COLORS.tarp, transparent: true, opacity: 0.82, roughness: 0.6, side: T.DoubleSide, depthWrite: false });
  const quad = (a: THREE_NS.Vector3, b: THREE_NS.Vector3, c: THREE_NS.Vector3, e: THREE_NS.Vector3) => {
    const geo = new T.BufferGeometry().setFromPoints([a, b, c, a, c, e]);
    geo.computeVertexNormals();
    return new T.Mesh(geo, tarp);
  };
  for (const s of [-1, 1]) g.add(quad(Q(-half, s * w, z0 + 0.02), Q(half, s * w, z0 + 0.02), Q(half, 0, z0 + rise + 0.02), Q(-half, 0, z0 + rise + 0.02)));
  for (const u of [-half, half]) {
    const geo = new T.BufferGeometry().setFromPoints([Q(u, -w, z0), Q(u, w, z0), Q(u, 0, z0 + rise)]);
    geo.computeVertexNormals();
    g.add(new T.Mesh(geo, tarp));
  }
  return g;
}

export function buildScene(T: THREE, plan: ScaffoldPlan) {
  const root = new T.Group();
  const wallMat = new T.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.9, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const roofMat = new T.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.8, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edgeMat = new T.LineBasicMaterial({ color: COLORS.edge });
  const house = new T.Group();
  for (const [list, mat] of [[plan.house.walls, wallMat], [plan.house.roofs, roofMat]] as const) {
    for (const pts of list) {
      const g = polygon(T, pts);
      if (!g) continue;
      house.add(new T.Mesh(g, mat));
      const ring = pts.map((p) => toV(T, p));
      house.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(ring), edgeMat));
    }
  }
  root.add(house);
  const joins = joinsOf(plan);
  const sides = plan.sides.map((s, i) => sideObjects(T, plan, s, joins[i]));
  for (const s of sides) root.add(s.group);

  if (plan.roof) root.add(roofObject(T, plan.roof));
  const box = new T.Box3().setFromObject(root);
  const size = box.getSize(new T.Vector3());
  const ground = new T.Mesh(new T.CircleGeometry(Math.max(size.x, size.z) * 1.2 + 6, 48), new T.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  root.add(ground);
  return { root, house, sides, box };
}
