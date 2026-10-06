// Offline queue for crew writes. A write that can't reach the server (no signal on site) is stored on the phone,
// shown as done in the app, and sent later in the original order. Photos make it large, so it lives in IndexedDB
// (localStorage only as a fallback). Server-side errors (4xx) are never queued: the user sees them right away.
import {
  ApiError,
  jobAction,
  jobTimer,
  reportFromSite,
  saveInspection,
  saveLoadList,
  savePickupCount,
  uploadPhoto,
  uploadSignature,
  type ChangeRequest,
  type CrewAction,
  type House,
  type InspectionItem,
  type JobCard,
  type Job,
  type Parts,
  type StaffUser
} from "@/lib/platform";

export type InspectionBody = { items: Partial<Record<InspectionItem, boolean>>; notes?: string; signer?: string; noSignatureReason?: string };
export type PickupBody = { counted: Parts; missing: Parts; damaged: Parts; notes?: string };
export type ReportBody = { type: "house" | "other"; house?: Partial<House>; note?: string };

export type Op =
  | { kind: "action"; ref: string; action: CrewAction; extra?: { eta?: string; ok?: boolean; notes?: string } }
  | { kind: "loadlist"; ref: string; checked: Parts; notes: string }
  | { kind: "inspection"; ref: string; body: InspectionBody }
  | { kind: "pickup"; ref: string; body: PickupBody }
  | { kind: "timer"; ref: string; action: "start" | "stop" }
  | { kind: "photo"; ref: string; image: string; stage: string; note?: string }
  | { kind: "signature"; ref: string; image: string; signer: string }
  | { kind: "report"; ref: string; body: ReportBody; images: string[]; uploaded: string[] };

export type QItem = Op & { id: number; at: string; tries: number; userId: string };

/** About 20 MB of waiting writes (mostly photos) at most. */
export const QUEUE_CAP = 20 * 1024 * 1024;
export class QueueFullError extends Error {
  constructor() {
    super("queue_full");
  }
}
const sizeOf = (x: unknown) => {
  try {
    return JSON.stringify(x).length;
  } catch {
    return 0;
  }
};
export const isNetworkError = (e: unknown) => e instanceof ApiError && (e.code === "network" || e.status === 0);

/* ---------------- Storage ---------------- */
const DB_NAME = "tk-crew";
const STORE = "queue";
const LS_KEY = "tk_crew_queue";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function lsRead(): QItem[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as QItem[];
  } catch {
    return [];
  }
}
function lsWrite(items: QItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    throw new QueueFullError();
  }
}

export async function qList(): Promise<QItem[]> {
  const db = await openDb();
  if (!db) return lsRead().sort((a, b) => a.id - b.id);
  try {
    const all = ((await tx(db, "readonly", (s) => s.getAll() as IDBRequest<QItem[]>)) || []) as QItem[];
    return all.sort((a, b) => a.id - b.id);
  } catch {
    return lsRead();
  }
}
export async function qPut(item: QItem): Promise<void> {
  const db = await openDb();
  if (!db) {
    const all = lsRead().filter((x) => x.id !== item.id);
    all.push(item);
    return lsWrite(all.sort((a, b) => a.id - b.id));
  }
  try {
    await tx(db, "readwrite", (s) => s.put(item));
  } catch (e) {
    if ((e as DOMException)?.name === "QuotaExceededError") throw new QueueFullError();
    throw e;
  }
}
export async function qRemove(id: number): Promise<void> {
  const db = await openDb();
  if (!db) return lsWrite(lsRead().filter((x) => x.id !== id));
  await tx(db, "readwrite", (s) => s.delete(id));
}
export async function qClear(): Promise<void> {
  const db = await openDb();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  if (db) await tx(db, "readwrite", (s) => s.clear());
}

/** Full-state saves (load list, checklist, count) replace a waiting save of the same kind instead of piling up. */
const REPLACEABLE = new Set<Op["kind"]>(["loadlist", "inspection", "pickup"]);
export async function qAdd(op: Op, userId: string): Promise<QItem> {
  const items = await qList();
  const forRef = items.filter((x) => x.ref === op.ref);
  const last = forRef[forRef.length - 1];
  const total = items.reduce((n, x) => n + sizeOf(x), 0);
  if (total + sizeOf(op) > QUEUE_CAP) throw new QueueFullError();
  if (last && last.kind === op.kind && REPLACEABLE.has(op.kind) && last.tries === 0) {
    const item = { ...op, id: last.id, at: new Date().toISOString(), tries: 0, userId } as QItem;
    await qPut(item);
    return item;
  }
  const id = Math.max(Date.now(), (items[items.length - 1]?.id || 0) + 1);
  const item = { ...op, id, at: new Date().toISOString(), tries: 0, userId } as QItem;
  await qPut(item);
  return item;
}

/* ---------------- Sending ---------------- */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiError("Timed out.", "network", 0, null)), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e))
    );
  });
}
const SHORT = 20_000, LONG = 90_000;

/** Sends one write. A report uploads its photos first (remembering each one so a retry doesn't resend it). */
export async function execOp(op: Op, onProgress?: (op: Op) => Promise<void> | void): Promise<JobCard> {
  switch (op.kind) {
    case "action":
      return withTimeout(jobAction(op.ref, op.action, op.extra || {}), SHORT);
    case "loadlist":
      return withTimeout(saveLoadList(op.ref, op.checked, op.notes), SHORT);
    case "inspection":
      return withTimeout(saveInspection(op.ref, op.body), SHORT);
    case "pickup":
      return withTimeout(savePickupCount(op.ref, op.body), SHORT);
    case "timer":
      return withTimeout(jobTimer(op.ref, op.action), SHORT);
    case "photo":
      return withTimeout(uploadPhoto(op.ref, op.image, op.stage, op.note || ""), LONG);
    case "signature":
      return withTimeout(uploadSignature(op.ref, op.image, op.signer), LONG);
    case "report": {
      for (let i = op.uploaded.length; i < op.images.length; i++) {
        const card = await withTimeout(uploadPhoto(op.ref, op.images[i], "problem", op.body.note?.slice(0, 200) || ""), LONG);
        const last = card.photos[card.photos.length - 1];
        if (last) op.uploaded.push(last.id);
        if (onProgress) await onProgress(op);
      }
      return withTimeout(reportFromSite(op.ref, { ...op.body, photos: op.uploaded }), SHORT);
    }
  }
}

/* ---------------- Showing waiting writes as done ---------------- */
export interface ViewCard extends JobCard {
  /** Writes for this job still on the phone. */
  pending: number;
  /** Photos and signatures not sent yet: local id → data URL. */
  localImages: Record<string, string>;
}

const STATUS_AFTER: Partial<Record<CrewAction, JobCard["status"]>> = { loaded: "loading", on_the_way: "en_route", erected: "erected", dismantled: "dismantled" };

/** The job card as it will be once the waiting writes reach the server. */
export function applyQueue(card: JobCard, items: QItem[], me: Pick<StaffUser, "id" | "name" | "role">): ViewCard {
  const mine = items.filter((x) => x.ref === card.ref);
  const c: ViewCard = { ...card, work: { ...(card.work || {}) }, photos: [...(card.photos || [])], changes: [...(card.changes || [])], timeEntries: [...(card.timeEntries || [])], pending: mine.length, localImages: {} };
  for (const op of mine) {
    const w = c.work;
    switch (op.kind) {
      case "action": {
        const next = STATUS_AFTER[op.action];
        if (op.action === "loaded") w.loaded = { ...(w.loaded || {}), done: true, at: op.at, by: me.name };
        if (op.action === "on_the_way" && op.extra?.eta) c.eta = op.extra.eta;
        if (op.action === "arrived") w.arrivedAt = w.arrivedAt || op.at;
        if (op.action === "erected") c.rental = { ...(c.rental || {}), startedAt: op.at };
        if (op.action === "dismantled") c.rental = { ...(c.rental || {}), endedAt: op.at };
        if (op.action === "visit") w.visits = [...(w.visits || []), { at: op.at, by: me.name, ok: op.extra?.ok !== false, notes: op.extra?.notes || "" }];
        if (next && c.status !== next) {
          c.status = next;
          c.history = [...(c.history || []), { status: next, at: op.at, by: me.name }];
        }
        break;
      }
      case "loadlist":
        w.loaded = { ...(w.loaded || {}), checked: op.checked, notes: op.notes, at: op.at, by: me.name };
        break;
      case "inspection":
        w.inspection = { ...(w.inspection || {}), items: op.body.items, notes: op.body.notes, signer: op.body.signer || w.inspection?.signer, noSignatureReason: op.body.noSignatureReason || "", at: op.at, by: me.name };
        break;
      case "pickup":
        w.pickup = { ...op.body, at: op.at, by: me.name };
        break;
      case "timer": {
        c.timeEntries = c.timeEntries.map((e) => (e.staffId === me.id && !e.end ? { ...e, end: op.at } : e));
        if (op.action === "start") c.timeEntries.push({ id: `local:${op.id}`, staffId: me.id, staffName: me.name, start: op.at, end: null });
        break;
      }
      case "photo": {
        const id = `local:${op.id}`;
        c.photos.push({ id, stage: op.stage, at: op.at, by: me.name, note: op.note });
        c.localImages[id] = op.image;
        break;
      }
      case "signature": {
        const id = `local:${op.id}`;
        w.inspection = { ...(w.inspection || {}), signature: id, signer: op.signer, signedAt: op.at };
        c.localImages[id] = op.image;
        break;
      }
      case "report": {
        const change: ChangeRequest = {
          id: `local:${op.id}`,
          ref: op.ref,
          type: op.body.type,
          source: "crew",
          status: "pending",
          createdAt: op.at,
          note: op.body.note || "",
          proposed: op.body.house ? { house: { ...c.house, ...op.body.house } } : {},
          before: { days: c.schedule.days, total: 0, house: c.house },
          after: null,
          stock: null,
          photos: [],
          by: { id: me.id, name: me.name, role: me.role },
          decidedAt: null,
          decidedBy: null,
          reason: ""
        };
        c.changes.push(change);
        op.images.forEach((img, i) => (c.localImages[`local:${op.id}:${i}`] = img));
        break;
      }
    }
  }
  return c;
}

/** The day's list as it will be once the waiting writes reach the server. */
export function applyQueueToJobs(jobs: Job[], items: QItem[]): Job[] {
  if (!items.length) return jobs;
  return jobs.map((j) => {
    let status = j.status;
    for (const op of items) {
      if (op.ref !== j.ref || op.kind !== "action") continue;
      const next = STATUS_AFTER[op.action];
      if (next) status = next;
    }
    if (status === j.status) return j;
    const done = j.kind === "delivery" ? status === "erected" || status === "pickup_requested" || status === "dismantled" : status === "dismantled";
    return { ...j, status, done };
  });
}
