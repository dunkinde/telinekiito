"use client";
// Shared state of the crew app: who is logged in, language, navigation, the write queue and short messages.
import { createContext, useContext, useSyncExternalStore } from "react";
import type { Me } from "@/lib/platform";
import type { Lang, T } from "./i18n";
import { EMPTY_SNAPSHOT, type SyncManager, type SyncSnapshot } from "./sync";

export type ToastKind = "ok" | "error" | "offline";
export interface AppCtx {
  me: Me;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  /** Today in Helsinki, from the server. */
  today: string;
  setToday: (d: string) => void;
  sync: SyncManager;
  toast: (msg: string, kind?: ToastKind) => void;
  nav: (hash: string) => void;
  back: () => void;
  openSettings: () => void;
  /** The session ended (401): show the login again. */
  authLost: () => void;
  isLeader: boolean;
  crew: (id?: string | null) => { name: string; color: string } | null;
}

export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside the crew app");
  return c;
}

const serverSnap = () => EMPTY_SNAPSHOT;
export function useSync(): SyncSnapshot {
  const { sync } = useApp();
  return useSyncExternalStore(sync.subscribe, sync.getSnapshot, serverSnap);
}

/* ---------------- Small browser-storage helpers (never throw) ---------------- */
export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
export function ssGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function ssSet(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
