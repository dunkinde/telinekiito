"use client";
// TelineKiito crew app (/crew): the phone app for workers and team leaders, from loading the truck at the depot
// to collecting the scaffold. Finnish, English and Russian. Works on a weak signal: writes wait on the phone
// and are sent when the connection comes back; the service worker (/crew-sw.js) keeps the app and the last jobs.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ApiError, getMe, logout, type Me, type StaffUser } from "@/lib/platform";
import { LogoMark } from "../Logo";
import { Approvals } from "./Approvals";
import { Ctx, lsGet, lsSet, ssGet, ssSet, type AppCtx } from "./context";
import { isLang, makeT, type Lang } from "./i18n";
import { JobView } from "./JobView";
import { Login } from "./Login";
import { Settings } from "./Settings";
import { EMPTY_SNAPSHOT, SyncManager } from "./sync";
import { Today } from "./Today";
import { ToastHost, useToastFn } from "./ui";

type Route = { name: "today" } | { name: "job"; ref: string; kind?: "delivery" | "pickup" } | { name: "approvals" };
function parseHash(h: string): Route {
  const m = /^#\/job\/([A-Z0-9-]+)(?:\/(delivery|pickup))?$/.exec(h);
  if (m) return { name: "job", ref: m[1], kind: m[2] as "delivery" | "pickup" | undefined };
  if (h === "#/approvals") return { name: "approvals" };
  return { name: "today" };
}
const helsinkiToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
const depth = () => Number((window.history.state as { tkDepth?: number } | null)?.tkDepth) || 0;

/** Saved API answers and photos belong to the logged-in user only. */
async function clearUserCaches() {
  try {
    if (!("caches" in window)) return;
    for (const k of await caches.keys()) if (/-(api|files)$/.test(k)) await caches.delete(k);
  } catch {
    /* ignore */
  }
}
function cachedMe(): Me | null {
  try {
    const m = JSON.parse(lsGet("tk_crew_me") || "null") as Me | null;
    return m && m.user && m.user.id ? m : null;
  } catch {
    return null;
  }
}

export default function CrewApp() {
  return (
    <ToastHost>
      <Root />
    </ToastHost>
  );
}

function Root() {
  const toast = useToastFn();
  const sync = useMemo(() => new SyncManager(), []);
  const [phase, setPhase] = useState<"boot" | "login" | "app">("boot");
  const [me, setMe] = useState<Me | null>(null);
  const [lang, setLangState] = useState<Lang>("fi");
  const [route, setRoute] = useState<Route>({ name: "today" });
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState("");
  const t = useMemo(() => makeT(lang), [lang]);
  const snap = useSyncExternalStore(sync.subscribe, sync.getSnapshot, () => EMPTY_SNAPSHOT);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    lsSet("tk_crew_lang", l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const enter = useCallback(
    (m: Me, offline = false) => {
      setMe(m);
      setToday(offline ? helsinkiToday() : m.today || helsinkiToday());
      lsSet("tk_crew_me", JSON.stringify(m));
      if (!isLang(lsGet("tk_crew_lang")) && isLang(m.user.lang)) setLangState(m.user.lang);
      sync.userId = m.user.id;
      sync.setAuthLost(false);
      void sync.refresh().then(() => sync.kick());
      setNotice("");
      setPhase("app");
    },
    [sync]
  );

  // Start: language, routes, service worker, network listeners, and who is logged in.
  useEffect(() => {
    const stored = lsGet("tk_crew_lang");
    if (isLang(stored)) setLangState(stored);
    else {
      // Finnish unless the phone itself is in Russian (several workers); the user's own language applies after login.
      if (/^ru\b/i.test(navigator.language || "")) setLangState("ru");
    }
    setRoute(parseHash(window.location.hash));
    const onPop = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    const stop = sync.start();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/crew-sw.js", { scope: "/crew" }).catch(() => undefined);
    getMe()
      .then((m) => enter(m))
      .catch((e) => {
        const c = e instanceof ApiError && e.code === "network" ? cachedMe() : null;
        if (c) enter(c, true);
        else setPhase("login");
      });
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
      stop();
    };
  }, [sync, enter]);

  const authLost = useCallback(() => {
    sync.setAuthLost(true);
  }, [sync]);
  // The session ended (expired, PIN changed or the user was switched off): log in again; waiting writes stay.
  useEffect(() => {
    if (snap.authLost && phase === "app") {
      setNotice(t("err.login_required"));
      setSettings(false);
      setPhase("login");
    }
  }, [snap.authLost, phase, t]);

  async function onLogin(u: StaffUser) {
    const prev = cachedMe();
    if (!prev || prev.user.id !== u.id) await clearUserCaches();
    try {
      enter(await getMe());
    } catch {
      enter({ user: u, crews: prev?.crews || [], company: "TelineKiito", today: helsinkiToday() }, true);
    }
  }

  async function doLogout() {
    setSettings(false);
    try {
      await logout();
    } catch {
      /* offline: the cookie stays until it expires, but nothing of the user stays in the app */
    }
    await sync.clearAll();
    await clearUserCaches();
    lsSet("tk_crew_me", null);
    sync.userId = "";
    window.history.replaceState({ tkDepth: 0 }, "", window.location.pathname);
    setRoute({ name: "today" });
    setMe(null);
    setNotice("");
    setPhase("login");
  }

  const nav = useCallback((hash: string) => {
    if (window.location.hash === hash) return;
    if (parseHash(window.location.hash).name === "today") ssSet("tk_crew_scroll", String(Math.round(window.scrollY)));
    window.history.pushState({ tkDepth: depth() + 1 }, "", hash);
    setRoute(parseHash(hash));
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => {
    if (depth() > 0) window.history.back();
    else {
      window.history.replaceState({ tkDepth: 0 }, "", window.location.pathname);
      setRoute({ name: "today" });
    }
  }, []);
  // Back on the day list: where the user was.
  useEffect(() => {
    if (route.name !== "today") return;
    const y = Number(ssGet("tk_crew_scroll") || 0);
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [route]);

  const crewMap = useMemo(() => Object.fromEntries((me?.crews || []).map((c) => [c.id, c])), [me]);
  const crew = useCallback((id?: string | null) => (id && crewMap[id] ? { name: crewMap[id].name, color: crewMap[id].color } : null), [crewMap]);

  if (phase === "boot") return <Splash />;
  if (phase === "login" || !me) {
    return (
      <Login
        t={t}
        lang={lang}
        setLang={setLang}
        notice={notice}
        onLogin={(u) => {
          void onLogin(u);
        }}
      />
    );
  }

  const isLeader = me.user.role === "leader" || me.user.role === "owner";
  const ctx: AppCtx = {
    me,
    lang,
    setLang,
    t,
    today: today || helsinkiToday(),
    setToday,
    sync,
    toast,
    nav,
    back,
    openSettings: () => setSettings(true),
    authLost,
    isLeader,
    crew
  };
  return (
    <Ctx.Provider value={ctx}>
      {route.name === "job" ? (
        <JobView key={`${route.ref}-${route.kind || ""}`} refId={route.ref} kind={route.kind} />
      ) : route.name === "approvals" && isLeader ? (
        <Approvals />
      ) : (
        <Today />
      )}
      <Settings open={settings} onClose={() => setSettings(false)} onLogout={() => void doLogout()} />
    </Ctx.Provider>
  );
}

function Splash() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-ink" aria-busy="true">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="h-16 w-16" />
        <span className="font-display text-[22px] font-extrabold tracking-[-0.01em] text-white">
          Teline<span className="text-sun">Kiito</span>
        </span>
      </div>
    </main>
  );
}
