"use client";
// Business customer portal (/business): a company's people follow every site live, order new ones,
// ask for changes (the office approves them) and get their invoices and e-invoice files. FI / EN / RU.
import { useCallback, useEffect, useState } from "react";
import { bizLogin, bizLogout, bizMe, type BizMe } from "@/lib/business";
import { Logo } from "../Logo";
import { ToastProvider } from "../ui/Toast";
import { I18nProvider, isAuthError, useT } from "../office/context";
import { errMessage } from "../office/i18n";
import { IInvoice, ILock, ILogout, IOrders, ITeam } from "../office/icons";
import { LangSwitch } from "../office/Login";
import { Btn, Callout, Field, Input, Spinner, cx } from "../office/ui";
import { IconPlus } from "../ui/Icons";
import { BizProvider, useBiz } from "./context";
import { Sites } from "./Sites";
import { OrderView } from "./OrderView";
import { NewOrder } from "./NewOrder";
import { Invoices } from "./Invoices";
import { Users } from "./Users";

export default function BizApp() {
  return (
    <I18nProvider>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </I18nProvider>
  );
}

type Session = { state: "loading" } | { state: "out" } | { state: "error"; error: unknown } | { state: "in"; me: BizMe };

function Root() {
  const i = useT();
  const { preferUserLang } = i;
  const [s, setS] = useState<Session>({ state: "loading" });
  const check = useCallback(async () => {
    try {
      const me = await bizMe();
      preferUserLang(me.user.lang);
      setS({ state: "in", me });
    } catch (e) {
      setS(isAuthError(e) ? { state: "out" } : { state: "error", error: e });
    }
  }, [preferUserLang]);
  useEffect(() => {
    check();
  }, [check]);
  const logout = useCallback(async () => {
    try {
      await bizLogout();
    } catch {
      /* the cookie is replaced on the next login anyway */
    }
    window.history.replaceState(null, "", window.location.pathname);
    setS({ state: "out" });
  }, []);

  if (s.state === "loading")
    return (
      <div className="grid min-h-screen place-items-center bg-mist" role="status">
        <Spinner />
        <span className="sr-only">{i.t("ui.loading")}</span>
      </div>
    );
  if (s.state === "error")
    return (
      <div className="grid min-h-screen place-items-center bg-mist p-4">
        <Callout tone="danger" title={i.t("login.unreachable")} className="w-full max-w-md">
          <p>{errMessage(i, s.error)}</p>
          <Btn size="sm" className="mt-3" onClick={check}>
            {i.t("ui.retry")}
          </Btn>
        </Callout>
      </div>
    );
  if (s.state === "out") return <Login onDone={check} />;
  return (
    <BizProvider me={s.me} onLogout={logout} onExpired={() => setS({ state: "out" })}>
      <Shell />
    </BizProvider>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const i = useT();
  const { t } = i;
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !pin.trim()) return setError(t("login.fillPin"));
    setBusy(true);
    try {
      await bizLogin(phone.trim(), pin.trim());
      onDone();
    } catch (err) {
      setError(errMessage(i, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-mist">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-ink" />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <a href="/" aria-label="TelineKiito">
          <Logo dark />
        </a>
        <LangSwitch dark />
      </header>
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-4 pb-10 sm:px-6 sm:pt-8">
        <div className="w-full max-w-[440px] rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(14,18,23,0.35)] ring-1 ring-line sm:p-8">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t("biz.eyebrow")}</p>
          <h1 className="mt-1 font-display text-[1.8rem] leading-tight font-extrabold tracking-[-0.01em] text-ink">{t("login.title")}</h1>
          <p className="mt-1.5 text-sm text-muted">{t("biz.loginIntro")}</p>
          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            <Field label={t("login.phone")}>{(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="username" value={phone} onChange={setPhone} placeholder="040 123 4567" />}</Field>
            <Field label={t("login.pin")} hint={t("biz.pinHint")}>
              {(id, d) => <Input id={id} type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))} describedBy={d} maxLength={8} />}
            </Field>
            {error ? (
              <div role="alert">
                <Callout tone="danger">{error}</Callout>
              </div>
            ) : null}
            <Btn type="submit" variant="dark" busy={busy} className="w-full" icon={<ILock className="h-4 w-4" />}>
              {busy ? t("login.signingIn") : t("login.submit")}
            </Btn>
          </form>
        </div>
        <p className="mt-6 max-w-md text-center text-sm text-muted">{t("biz.noAccount")}</p>
      </main>
    </div>
  );
}

/* ---------------- Frame and routing (#/sites, #/sites/TK-…, #/new, #/invoices, #/users) ---------------- */
type Route = { page: "sites" } | { page: "order"; ref: string } | { page: "new"; copy?: string } | { page: "invoices" } | { page: "users" };
function parse(h: string): Route {
  let m = /^#\/sites\/([A-Z0-9-]+)$/.exec(h);
  if (m) return { page: "order", ref: m[1] };
  m = /^#\/new(?:\/([A-Z0-9-]+))?$/.exec(h);
  if (m) return { page: "new", copy: m[1] };
  if (h === "#/invoices") return { page: "invoices" };
  if (h === "#/users") return { page: "users" };
  return { page: "sites" };
}
export const go = (hash: string) => {
  if (window.location.hash !== hash) window.location.hash = hash;
};

function Shell() {
  const { t } = useT();
  const { me, canOrder, isAdmin, logout } = useBiz();
  const [route, setRoute] = useState<Route>({ page: "sites" });
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Accountants see invoices only.
  const accountant = me.user.role === "accountant";
  const tabs = [
    ...(!accountant ? [{ hash: "#/sites", label: t("biz.nav.sites"), icon: IOrders, on: route.page === "sites" || route.page === "order" }] : []),
    { hash: "#/invoices", label: t("biz.nav.invoices"), icon: IInvoice, on: route.page === "invoices" },
    ...(isAdmin ? [{ hash: "#/users", label: t("biz.nav.users"), icon: ITeam, on: route.page === "users" }] : [])
  ];
  const page = accountant && route.page !== "invoices" ? { page: "invoices" as const } : route;

  return (
    <div className="min-h-screen bg-mist">
      <a href="#main" className="skip-link" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
        {t("ui.skip")}
      </a>
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="#/sites" className="shrink-0" aria-label={t("biz.home")}>
            <Logo dark />
          </a>
          <span className="hidden min-w-0 truncate border-l border-white/15 pl-3 text-[13.5px] font-semibold text-white/80 md:block">{me.account.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <LangSwitch dark className="hidden sm:inline-flex" />
            <span className="hidden text-right leading-tight lg:block">
              <span className="block text-[13px] font-semibold">{me.user.name}</span>
              <span className="block text-[11.5px] text-white/60">{t(`biz.role.${me.user.role}`)}</span>
            </span>
            <button type="button" onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-white/80 ring-1 ring-white/15 hover:bg-white/10 hover:text-white">
              <ILogout className="h-4 w-4" />
              <span className="hidden sm:inline">{t("user.logout")}</span>
              <span className="sr-only sm:hidden">{t("user.logout")}</span>
            </button>
          </div>
        </div>
        <nav aria-label={t("biz.nav.label")} className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 pb-2 sm:px-4">
          {tabs.map((x) => (
            <a
              key={x.hash}
              href={x.hash}
              aria-current={x.on ? "page" : undefined}
              className={cx("inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[14px] font-semibold", x.on ? "bg-white/[0.12] text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white")}
            >
              <x.icon className={cx("h-[18px] w-[18px]", x.on ? "text-sun" : "")} />
              {x.label}
            </a>
          ))}
          {canOrder ? (
            <Btn size="sm" variant="primary" className="ml-auto shrink-0" icon={<IconPlus className="h-4 w-4" />} onClick={() => go("#/new")} aria-label={t("biz.nav.new")}>
              <span className="hidden sm:inline">{t("biz.nav.new")}</span>
            </Btn>
          ) : null}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 outline-none sm:px-6 sm:py-8">
        {page.page === "sites" ? <Sites /> : null}
        {page.page === "order" ? <OrderView refNo={page.ref} /> : null}
        {page.page === "new" ? canOrder ? <NewOrder copyFrom={page.copy} /> : <Sites /> : null}
        {page.page === "invoices" ? <Invoices /> : null}
        {page.page === "users" ? isAdmin ? <Users /> : <Sites /> : null}
      </main>
      <div className="flex justify-center pb-8 sm:hidden">
        <LangSwitch />
      </div>
    </div>
  );
}
