// Sends crew writes, and keeps them on the phone when there's no signal: one ordered queue, retried when the
// connection comes back (online event, every 15 s, and when the app comes back to the screen).
// React reads its state through useSyncExternalStore (see useSync in context.tsx).
import { ApiError, type CrewAction, type JobCard } from "@/lib/platform";
import { execOp, isNetworkError, qAdd, qClear, qList, qPut, qRemove, type Op, type QItem } from "./queue";

export interface Failure {
  id: string;
  kind: Op["kind"];
  action?: CrewAction;
  ref: string;
  code: string;
  message: string;
  info: Record<string, unknown> | null;
}
export interface Served {
  cached: boolean;
  at: number;
}
export interface SyncSnapshot {
  items: QItem[];
  syncing: boolean;
  failures: Failure[];
  online: boolean;
  /** For each GET of /api/crew/jobs*: whether the service worker answered from its saved copy, and from when. */
  served: Record<string, Served>;
  updateReady: boolean;
  authLost: boolean;
}

const FAIL_KEY = "tk_crew_failures";
const readFailures = (): Failure[] => {
  try {
    return JSON.parse(localStorage.getItem(FAIL_KEY) || "[]") as Failure[];
  } catch {
    return [];
  }
};
const writeFailures = (f: Failure[]) => {
  try {
    localStorage.setItem(FAIL_KEY, JSON.stringify(f.slice(-10)));
  } catch {
    /* ignore */
  }
};

export const EMPTY_SNAPSHOT: SyncSnapshot = { items: [], syncing: false, failures: [], online: true, served: {}, updateReady: false, authLost: false };

export class SyncManager {
  private snap: SyncSnapshot = EMPTY_SNAPSHOT;
  private subs = new Set<() => void>();
  private cardSubs = new Set<(c: JobCard) => void>();
  private drainSubs = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private looping = false;
  userId = "";

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<SyncSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.subs.forEach((f) => f());
  }

  /** Server answered with a fresh job card (after a write): open job views take it. */
  onCard(fn: (c: JobCard) => void) {
    this.cardSubs.add(fn);
    return () => {
      this.cardSubs.delete(fn);
    };
  }
  /** Everything waiting has been sent: lists refresh. */
  onDrained(fn: () => void) {
    this.drainSubs.add(fn);
    return () => {
      this.drainSubs.delete(fn);
    };
  }
  private emitCard(c: JobCard) {
    this.cardSubs.forEach((f) => f(c));
  }

  /** Starts listening to the network and the service worker. Returns the clean-up. */
  start(): () => void {
    this.set({ online: navigator.onLine !== false, failures: readFailures() });
    void this.refresh().then(() => this.kick());
    const onOnline = () => {
      this.set({ online: true });
      this.kick();
    };
    const onOffline = () => this.set({ online: false });
    const onVisible = () => {
      if (document.visibilityState === "visible") this.kick();
    };
    const onSw = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string; cached?: boolean; at?: number } | null;
      if (!d || typeof d !== "object") return;
      if (d.type === "api" && d.url) {
        this.set({ served: { ...this.snap.served, [d.url]: { cached: !!d.cached, at: Number(d.at) || Date.now() } } });
        if (d.cached) this.set({ online: false });
        else if (!this.snap.online) onOnline();
      } else if (d.type === "update") {
        this.set({ updateReady: true });
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onSw);
    const timer = window.setInterval(() => {
      if (this.snap.items.length && document.visibilityState === "visible") this.kick();
    }, 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSw);
      window.clearInterval(timer);
    };
  }

  async refresh() {
    const all = await qList().catch(() => [] as QItem[]);
    this.set({ items: this.userId ? all.filter((x) => x.userId === this.userId) : all });
  }

  setOnline(online: boolean) {
    if (this.snap.online !== online) this.set({ online });
  }
  setAuthLost(v: boolean) {
    this.set({ authLost: v });
  }

  /**
   * Sends a write now, or keeps it on the phone when there's no connection (or older writes are still waiting,
   * so the order stays right). Server-side errors are thrown to the caller.
   */
  run(op: Op): Promise<{ card: JobCard | null; queued: boolean }> {
    const go = async () => {
      if (this.snap.items.length || !this.snap.online) return this.enqueue(op);
      try {
        const card = await execOp(op);
        this.setOnline(true);
        this.emitCard(card);
        return { card, queued: false };
      } catch (e) {
        if (isNetworkError(e)) {
          this.setOnline(false);
          return this.enqueue(op);
        }
        if (e instanceof ApiError && e.status === 401) this.setAuthLost(true);
        throw e;
      }
    };
    // Photos may take long on a weak signal: they don't hold up taps that come after them.
    if (op.kind === "photo") return go();
    const p = this.chain.then(go, go);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async enqueue(op: Op) {
    await qAdd(op, this.userId);
    await this.refresh();
    this.kick();
    return { card: null, queued: true };
  }

  /** Try sending what's waiting (quietly does nothing when already sending or nothing waits). */
  kick() {
    if (!this.looping && this.snap.items.length && !this.snap.authLost) void this.syncNow();
  }

  async syncNow() {
    if (this.looping) return;
    this.looping = true;
    this.set({ syncing: true });
    let sent = 0;
    try {
      for (;;) {
        const all = await qList();
        const it = all.find((x) => !this.userId || x.userId === this.userId);
        if (!it) break;
        try {
          const card = await execOp(it, async () => {
            await qPut(it);
          });
          await qRemove(it.id);
          sent++;
          this.setOnline(true);
          this.emitCard(card);
        } catch (e) {
          if (isNetworkError(e)) {
            this.setOnline(false);
            break;
          }
          const err = e instanceof ApiError ? e : new ApiError(String((e as Error)?.message || e), "client_error", 0, null);
          if (err.status === 401) {
            this.setAuthLost(true);
            break;
          }
          // Server busy or broken: try again later, a few times.
          if (err.status === 429 || err.status >= 500 || err.status === 0) {
            it.tries = (it.tries || 0) + 1;
            if (it.tries < 5) {
              await qPut(it);
              break;
            }
          }
          await qRemove(it.id);
          // A step that was already done (e.g. sent twice on a flaky line) is not worth an alarm.
          if (!(it.kind === "action" && err.code === "wrong_step")) this.addFailure(it, err);
        }
        await this.refresh();
      }
    } finally {
      this.looping = false;
      await this.refresh();
      this.set({ syncing: false });
      if (sent && !this.snap.items.length) this.drainSubs.forEach((f) => f());
    }
  }

  private addFailure(it: QItem, err: ApiError) {
    const f: Failure = { id: `${it.id}`, kind: it.kind, action: it.kind === "action" ? it.action : undefined, ref: it.ref, code: err.code, message: err.message, info: err.info };
    const failures = [...this.snap.failures, f].slice(-10);
    writeFailures(failures);
    this.set({ failures });
  }
  dismissFailure(id: string) {
    const failures = this.snap.failures.filter((f) => f.id !== id);
    writeFailures(failures);
    this.set({ failures });
  }

  /** Logout: nothing of this user stays on the phone. */
  async clearAll() {
    await qClear().catch(() => undefined);
    writeFailures([]);
    this.set({ items: [], failures: [], served: {} });
  }
}
