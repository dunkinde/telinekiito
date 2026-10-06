"use client";
// Shared state of the business portal: who is logged in, toasts, loading data with live refresh, and actions.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { BizMe } from "@/lib/business";
import { useToast } from "../ui/Toast";
import { isAuthError, useT } from "../office/context";
import { errMessage } from "../office/i18n";

interface Biz {
  me: BizMe;
  canOrder: boolean;
  isAdmin: boolean;
  notify: (msg: string) => void;
  fail: (e: unknown) => void;
  logout: () => void;
}
const Ctx = createContext<Biz | null>(null);

export function BizProvider({ me, onLogout, onExpired, children }: { me: BizMe; onLogout: () => void; onExpired: () => void; children: React.ReactNode }) {
  const i = useT();
  const toast = useToast();
  const notify = useCallback((msg: string) => toast(msg), [toast]);
  const fail = useCallback(
    (e: unknown) => {
      if (isAuthError(e)) return onExpired();
      toast(errMessage(i, e));
    },
    [i, toast, onExpired]
  );
  const value: Biz = { me, canOrder: me.user.role === "admin" || me.user.role === "manager", isAdmin: me.user.role === "admin", notify, fail, logout: onLogout };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBiz(): Biz {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBiz outside BizProvider");
  return c;
}

/** Loads data; with `poll` it refreshes every 20 s while the tab is visible, so the company sees changes live. */
export function useBizLoad<R>(fn: () => Promise<R>, deps: readonly unknown[], opts: { poll?: boolean } = {}) {
  const { fail } = useBiz();
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
    [fail]
  );
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    if (!opts.poll) return;
    const id = window.setInterval(() => {
      if (!document.hidden) run(true);
    }, 20000);
    const onFocus = () => run(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [opts.poll, run]);
  return { data, error, loading, reload: () => run(), setData };
}

/** Runs an action with a busy key, shows the success toast or the error. */
export function useBizAct() {
  const { fail, notify } = useBiz();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <R,>(key: string, fn: () => Promise<R>, ok?: string): Promise<R | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (ok) notify(ok);
        return r;
      } catch (e) {
        fail(e);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [fail, notify]
  );
  return { busy, run };
}
