"use client";
// The office: for the head of company (owner) and team leaders. Workers are sent to the crew app.
import { useCallback, useEffect, useState } from "react";
import { getMe, logout as apiLogout, type Me } from "@/lib/platform";
import { ToastProvider } from "../ui/Toast";
import { I18nProvider, OfficeProvider, isAuthError, useT } from "./context";
import { Login, WorkerScreen } from "./Login";
import { Shell } from "./Shell";
import { Btn, Callout, Spinner } from "./ui";
import { errMessage } from "./i18n";
import { LogoMark } from "../Logo";

export default function OfficeApp() {
  return (
    <I18nProvider>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </I18nProvider>
  );
}

type Session = { state: "loading" } | { state: "out" } | { state: "error"; error: unknown } | { state: "in"; me: Me };

function Root() {
  const i = useT();
  const { preferUserLang } = i;
  const [s, setS] = useState<Session>({ state: "loading" });

  const check = useCallback(async () => {
    setS({ state: "loading" });
    try {
      const me = await getMe();
      preferUserLang(me.user.lang);
      setS({ state: "in", me });
    } catch (e) {
      setS(isAuthError(e) ? { state: "out" } : { state: "error", error: e });
    }
  }, [preferUserLang]);

  useEffect(() => {
    check();
  }, [check]);

  const doLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* the cookie is cleared anyway on the next login */
    }
    window.history.replaceState(null, "", window.location.pathname);
    setS({ state: "out" });
  }, []);
  const expired = useCallback(() => setS({ state: "out" }), []);

  if (s.state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-mist" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4 text-muted">
          <LogoMark className="h-11 w-11" />
          <Spinner />
          <span className="sr-only">{i.t("ui.loading")}</span>
        </div>
      </div>
    );
  }
  if (s.state === "error") {
    return (
      <div className="grid min-h-screen place-items-center bg-mist p-4">
        <div className="w-full max-w-md">
          <Callout tone="danger" title={i.t("login.unreachable")}>
            <p>{errMessage(i, s.error)}</p>
            <Btn size="sm" className="mt-3" onClick={check}>
              {i.t("ui.retry")}
            </Btn>
          </Callout>
        </div>
      </div>
    );
  }
  if (s.state === "out") return <Login onDone={check} />;
  if (s.me.user.role === "worker") return <WorkerScreen me={s.me} onLogout={doLogout} />;
  return (
    <OfficeProvider me={s.me} onLogout={doLogout} onExpired={expired}>
      <Shell />
    </OfficeProvider>
  );
}
