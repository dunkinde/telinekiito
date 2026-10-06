"use client";
// Language, session data, navigation and polling for the office.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ui/Toast";
import {
  ApiError,
  getAlerts,
  getChanges,
  getOrders,
  type Alert,
  type ChangeRequest,
  type Crew,
  type FullOrder,
  type Me,
  type StaffUser
} from "@/lib/platform";
import { errMessage, hasKey, translate, type Key, type Lang, type T, type Vars } from "./i18n";

/* ---------------- Language ---------------- */
const LANG_KEY = "tk_office_lang";
interface I18n extends T {
  setLang: (l: Lang) => void;
  /** Use the logged-in user's language unless the visitor already chose one on this device. */
  preferUserLang: (l: string) => void;
}
const LangCtx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fi");
  const chosen = useRef(false);
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(LANG_KEY);
      if (s === "fi" || s === "en") {
        chosen.current = true;
        setLangState(s);
      }
    } catch {
      /* storage blocked */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    chosen.current = true;
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const preferUserLang = useCallback((l: string) => {
    if (!chosen.current && (l === "fi" || l === "en")) setLangState(l);
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      preferUserLang,
      t: (key: Key, vars?: Vars) => translate(lang, key, vars),
      tk: (key: string, vars?: Vars, fallback?: string) => (hasKey(key) ? translate(lang, key, vars) : fallback ?? key)
    }),
    [lang, setLang, preferUserLang]
  );
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useT(): I18n {
  const c = useContext(LangCtx);
  if (!c) throw new Error("useT outside I18nProvider");
  return c;
}

/* ---------------- Navigation ---------------- */
export const SECTIONS = ["overview", "orders", "calendar", "map", "approvals", "messages", "stock", "team", "invoices", "customers", "reviews", "reports", "settings"] as const;
export type Section = (typeof SECTIONS)[number];
/** Sections that only the head of company sees (their endpoints refuse team leaders). */
export const OWNER_ONLY: Section[] = ["invoices", "customers", "reviews", "reports", "settings"];
export interface Route {
  section: Section;
  params: Record<string, string>;
}
function parseHash(): Route {
  if (typeof window === "undefined") return { section: "overview", params: {} };
  const h = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const section = (SECTIONS as readonly string[]).includes(path) ? (path as Section) : "overview";
  const params: Record<string, string> = {};
  new URLSearchParams(query).forEach((v, k) => (params[k] = v));
  return { section, params };
}
function hashOf(r: Route) {
  const q = new URLSearchParams(r.params).toString();
  return `#/${r.section}${q ? `?${q}` : ""}`;
}

/* ---------------- Office data ---------------- */
interface Office {
  me: Me;
  user: StaffUser;
  owner: boolean;
  today: string;
  crews: Crew[];
  crewById: (id?: string | null) => Crew | undefined;
  orders: FullOrder[] | null;
  alerts: Alert[] | null;
  pending: ChangeRequest[] | null;
  /** Grows after every refresh; lists that follow live data reload when it changes. */
  version: number;
  refresh: () => Promise<void>;
  route: Route;
  nav: (section: Section, params?: Record<string, string>) => void;
  setParams: (p: Record<string, string | null>) => void;
  openOrder: (ref: string, tab?: string) => void;
  closeOrder: () => void;
  fail: (e: unknown) => void;
  notify: (msg: string) => void;
  logout: () => void;
}
const OfficeCtx = createContext<Office | null>(null);

export const isAuthError = (e: unknown) => e instanceof ApiError && e.status === 401;

export function OfficeProvider({ me, onLogout, onExpired, children }: { me: Me; onLogout: () => void; onExpired: () => void; children: React.ReactNode }) {
  const i = useT();
  const toast = useToast();
  const owner = me.user.role === "owner";
  const [orders, setOrders] = useState<FullOrder[] | null>(null);
  const [crews, setCrews] = useState<Crew[]>(() => me.crews.map((c) => ({ ...c, truck: "" })));
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [pending, setPending] = useState<ChangeRequest[] | null>(null);
  const [version, setVersion] = useState(0);
  const [route, setRoute] = useState<Route>({ section: "overview", params: {} });

  const fail = useCallback(
    (e: unknown) => {
      if (isAuthError(e)) {
        toast(i.t("err.session"));
        onExpired();
        return;
      }
      toast(errMessage(i, e));
    },
    [i, toast, onExpired]
  );

  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [o, a, c] = await Promise.allSettled([getOrders(), getAlerts(), getChanges("pending")]);
      if (o.status === "fulfilled") {
        setOrders(o.value.orders);
        setCrews(o.value.crews);
      }
      if (a.status === "fulfilled") setAlerts(a.value.alerts);
      if (c.status === "fulfilled") setPending(c.value.changes);
      const auth = [o, a, c].find((r) => r.status === "rejected" && isAuthError(r.reason));
      if (auth && auth.status === "rejected") fail(auth.reason);
    } finally {
      busy.current = false;
      setVersion((v) => v + 1);
    }
  }, [fail]);

  // First load, then every 45 s while the tab is visible (and right away when it becomes visible again).
  useEffect(() => {
    refresh();
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const id = window.setInterval(tick, 45000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  // Hash routing: #/section?order=TK-XXXX&tab=...
  useEffect(() => {
    const on = () => {
      const r = parseHash();
      if (!owner && OWNER_ONLY.includes(r.section)) r.section = "overview";
      setRoute(r);
    };
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [owner]);

  const go = useCallback((r: Route, replace = false) => {
    const h = hashOf(r);
    if (replace) window.history.replaceState(null, "", h);
    else window.history.pushState(null, "", h);
    setRoute(r);
  }, []);
  const nav = useCallback((section: Section, params: Record<string, string> = {}) => {
    go({ section, params });
    window.scrollTo({ top: 0 });
  }, [go]);
  const setParams = useCallback(
    (p: Record<string, string | null>) => {
      const cur = parseHash();
      const params = { ...cur.params };
      for (const [k, v] of Object.entries(p)) {
        if (v == null || v === "") delete params[k];
        else params[k] = v;
      }
      go({ section: cur.section, params }, true);
    },
    [go]
  );
  const openOrder = useCallback(
    (ref: string, tab?: string) => {
      const cur = parseHash();
      const params: Record<string, string> = { ...cur.params, order: ref };
      if (tab) params.otab = tab;
      else delete params.otab;
      go({ section: cur.section, params });
    },
    [go]
  );
  const closeOrder = useCallback(() => {
    const cur = parseHash();
    const params = { ...cur.params };
    delete params.order;
    delete params.otab;
    go({ section: cur.section, params });
  }, [go]);

  const value = useMemo<Office>(
    () => ({
      me,
      user: me.user,
      owner,
      today: me.today,
      crews,
      crewById: (id) => (id ? crews.find((c) => c.id === id) : undefined),
      orders,
      alerts,
      pending,
      version,
      refresh,
      route,
      nav,
      setParams,
      openOrder,
      closeOrder,
      fail,
      notify: toast,
      logout: onLogout
    }),
    [me, owner, crews, orders, alerts, pending, version, refresh, route, nav, setParams, openOrder, closeOrder, fail, toast, onLogout]
  );
  return <OfficeCtx.Provider value={value}>{children}</OfficeCtx.Provider>;
}

export function useOffice(): Office {
  const c = useContext(OfficeCtx);
  if (!c) throw new Error("useOffice outside OfficeProvider");
  return c;
}

/** Load data for a view. With `poll`, it reloads quietly whenever the office data refreshes. */
export function useLoad<R>(fn: () => Promise<R>, deps: readonly unknown[], opts: { poll?: boolean } = {}) {
  const { version, fail } = useOffice();
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(
    async (quiet = false) => {
      const n = ++seq.current;
      if (!quiet) setLoading(true);
      try {
        const d = await fnRef.current();
        if (n === seq.current) {
          setData(d);
          setError(null);
        }
        return d;
      } catch (e) {
        if (n === seq.current) setError(e);
        if (isAuthError(e)) fail(e);
        return null;
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fail, ...deps]
  );
  useEffect(() => {
    run();
  }, [run]);
  const seen = useRef(version);
  useEffect(() => {
    if (!opts.poll || seen.current === version) return;
    seen.current = version;
    run(true);
  }, [version, opts.poll, run]);
  return { data, error, loading, reload: () => run(true), setData };
}

/** Run a change: shows a busy state, a message when done, and refreshes the office data. */
export function useAct() {
  const { fail, notify, refresh } = useOffice();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <R,>(key: string, fn: () => Promise<R>, ok?: string, opts: { refresh?: boolean } = {}): Promise<R | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (ok) notify(ok);
        if (opts.refresh !== false) refresh();
        return r;
      } catch (e) {
        fail(e);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [fail, notify, refresh]
  );
  return { busy, run };
}
