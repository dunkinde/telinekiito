// Builds the three.js scene for a scaffold plan: the house from its wall and roof polygons, and every side's
// standards, ledgers, transoms, decks, guardrails, toe boards, diagonals and roof-catch net, bay by bay.
// Plan coordinates (x east, y north, z up) become three.js coordinates (x, z, -y).
import type * as THREE_NS from "three";
import type { P3, PlanSide, ScaffoldPlan } from "@/lib/plan";

type THREE = typeof THREE_NS;

export const COLORS = {
  wall: 0xefe9df,
  roof: 0x3f444c,
  edge: 0x8a8f96,
  tube: 0xa9b1ba,
  deck: 0xc9ced4,
  hatch: 0x6c737c,
  toe: 0xb5651d,
  net: 0x1f2a24,
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

function sideObjects(T: THREE, plan: ScaffoldPlan, side: PlanSide): SideObjects {
  const group = new T.Group();
  group.userData.side = side.i;
  const tubeMat = new T.MeshStandardMaterial({ color: COLORS.tube, metalness: 0.4, roughness: 0.5 });
  const deckMat = new T.MeshStandardMaterial({ color: COLORS.deck, metalness: 0.3, roughness: 0.6 });
  const hatchMat = new T.MeshStandardMaterial({ color: COLORS.hatch, roughness: 0.7 });
  const toeMat = new T.MeshStandardMaterial({ color: COLORS.toe, roughness: 0.8 });
  const netMat = new T.MeshStandardMaterial({ color: COLORS.net, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false });

  const { bay, width, gap, lift, jack } = plan;
  const run = side.bays * bay;
  const top = jack + lift * side.lifts; // highest deck
  const yaw = Math.atan2(side.dir[1], side.dir[0]); // plan angle; three.js turns the other way round y
  // A point at distance t along the run, d out from the wall, height z.
  const P = (t: number, d: number, z: number) => toV(T, [side.at[0] + side.dir[0] * t + side.out[0] * d, side.at[1] + side.dir[1] * t + side.out[1] * d, z]);
  const inner = gap, outer = gap + width, mid = gap + width / 2;
  const tl: [THREE_NS.Vector3, THREE_NS.Vector3][] = [];

  for (let k = 0; k <= side.bays; k++) {
    const t = k * bay;
    tl.push([P(t, inner, 0), P(t, inner, top + 1)]);
    tl.push([P(t, outer, 0), P(t, outer, top + (side.catchOn ? 2 : 1))]);
    for (let l = 0; l <= side.lifts; l++) tl.push([P(t, inner, jack + lift * l), P(t, outer, jack + lift * l)]); // transoms
  }
  for (let l = 0; l <= side.lifts; l++) {
    const z = jack + lift * l;
    tl.push([P(0, inner, z), P(run, inner, z)]);
    tl.push([P(0, outer, z), P(run, outer, z)]);
  }
  // Guardrails at hand and knee height on every decked level, outside and at both ends.
  const deckList: { c: THREE_NS.Vector3; size: [number, number, number]; yaw: number }[] = [];
  const hatchList: typeof deckList = [], toeList: typeof deckList = [];
  for (const l of side.decks) {
    const z = jack + lift * l;
    for (const h of [0.5, 1.0]) {
      tl.push([P(0, outer, z + h), P(run, outer, z + h)]);
      tl.push([P(0, inner, z + h), P(0, outer, z + h)]);
      tl.push([P(run, inner, z + h), P(run, outer, z + h)]);
    }
    for (let k = 0; k < side.bays; k++) {
      const c = P((k + 0.5) * bay, mid, z + 0.03);
      (k === 0 ? hatchList : deckList).push({ c, size: [bay - 0.04, 0.05, width - 0.06], yaw });
      toeList.push({ c: P((k + 0.5) * bay, outer - 0.02, z + 0.08), size: [bay - 0.04, 0.15, 0.025], yaw });
    }
  }
  // Diagonal braces in the outer plane, every fifth bay, through all lifts.
  for (let k = 0; k < side.bays; k += 5) for (let l = 0; l < side.lifts; l++) tl.push([P(k * bay, outer, jack + lift * l), P((k + 1) * bay, outer, jack + lift * (l + 1))]);

  group.add(tubes(T, tl, 0.024, tubeMat));
  if (deckList.length) group.add(boxes(T, deckList, deckMat));
  if (hatchList.length) group.add(boxes(T, hatchList, hatchMat));
  if (toeList.length) group.add(boxes(T, toeList, toeMat));

  if (plan.sheeting) {
    // Weather sheeting over the whole outer face.
    const h = top + (side.catchOn ? 2 : 1);
    const a = P(0, outer + 0.05, 0), b = P(run, outer + 0.05, 0), c = P(run, outer + 0.05, h), d = P(0, outer + 0.05, h);
    const g = new T.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    g.computeVertexNormals();
    group.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: COLORS.sheet, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false })));
  }
  if (side.catchOn) {
    // Roof-catch net above the top deck on the outside.
    const a = P(0, outer, top + 0.1), b = P(run, outer, top + 0.1), c = P(run, outer, top + 2), d = P(0, outer, top + 2);
    const g = new T.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    g.computeVertexNormals();
    group.add(new T.Mesh(g, netMat));
  }
  group.traverse((o) => { o.userData.side = side.i; });
  return { side, group, materials: [tubeMat, deckMat], labelAt: P(run / 2, outer + 0.6, top + (side.catchOn ? 2.6 : 1.6)) };
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
  const sides = plan.sides.map((s) => sideObjects(T, plan, s));
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
