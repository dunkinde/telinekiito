"use client";
// Login: phone + PIN (team leaders and the owner's own staff login) or the owner's master password.
import { useState } from "react";
import { loginWithPassword, loginWithPin, type Me } from "@/lib/platform";
import { Logo } from "../Logo";
import { useT } from "./context";
import { errMessage } from "./i18n";
import { IExternal, IHelmet, ILock } from "./icons";
import { Btn, Callout, Field, Input, Tabs, cx } from "./ui";

export function LangSwitch({ dark = false, className }: { dark?: boolean; className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <div role="group" aria-label={t("ui.language")} className={cx("inline-flex rounded-full p-0.5 text-[12.5px] font-bold ring-1 ring-inset", dark ? "ring-white/15" : "ring-line bg-white", className)}>
      {(["fi", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cx(
            "h-7 rounded-full px-3 uppercase transition-colors",
            lang === l ? (dark ? "bg-white text-ink" : "bg-ink text-white") : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"
          )}
        >
          <span aria-hidden>{l}</span>
          <span className="sr-only">{l === "fi" ? "Suomi" : "English"}</span>
        </button>
      ))}
    </div>
  );
}

export function Login({ onDone }: { onDone: () => void }) {
  const i = useT();
  const { t } = i;
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "pin" && (!phone.trim() || !pin.trim())) return setError(t("login.fillPin"));
    if (mode === "password" && !password) return setError(t("login.fillPassword"));
    setBusy(true);
    try {
      if (mode === "pin") await loginWithPin(phone.trim(), pin.trim());
      else await loginWithPassword(password);
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
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-sun/10 blur-3xl" />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo dark />
        <LangSwitch dark />
      </header>
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-4 pb-10 sm:px-6 sm:pt-8">
        <div className="w-full max-w-[440px] rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(14,18,23,0.35)] ring-1 ring-line sm:p-8">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t("login.eyebrow")}</p>
          <h1 className="mt-1 font-display text-[1.8rem] leading-tight font-extrabold tracking-[-0.01em] text-ink">{t("login.title")}</h1>
          <p className="mt-1.5 text-sm text-muted">{t("login.intro")}</p>

          <Tabs
            className="mt-5"
            label={t("login.how")}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            tabs={[
              { key: "pin", label: t("login.tabPin") },
              { key: "password", label: t("login.tabPassword") }
            ]}
          />

          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            {mode === "pin" ? (
              <>
                <Field label={t("login.phone")}>{(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="username" value={phone} onChange={setPhone} placeholder="040 123 4567" />}</Field>
                <Field label={t("login.pin")} hint={t("login.pinHint")}>
                  {(id, d) => <Input id={id} type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))} describedBy={d} maxLength={8} />}
                </Field>
              </>
            ) : (
              <Field label={t("login.password")} hint={t("login.passwordHint")}>
                {(id, d) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={setPassword} describedBy={d} />}
              </Field>
            )}
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
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted">
          <IHelmet className="h-4 w-4" />
          {t("login.crewHint")}
          <a href="/crew" className="font-semibold text-ink underline decoration-sun-deep decoration-2 underline-offset-4 hover:decoration-ink">
            {t("login.crewLink")}
          </a>
        </p>
      </main>
    </div>
  );
}

/** Workers belong in the crew app, not here. */
export function WorkerScreen({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { t } = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-mist px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center ring-1 ring-line sm:p-9">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sun text-ink">
          <IHelmet className="h-7 w-7" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">{t("worker.title", { name: me.user.name.split(" ")[0] })}</h1>
        <p className="mt-2 text-[15px] text-muted">{t("worker.text")}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Btn href="/crew" variant="primary" icon={<IExternal className="h-4 w-4" />}>
            {t("worker.open")}
          </Btn>
          <Btn variant="quiet" onClick={onLogout}>
            {t("user.logout")}
          </Btn>
        </div>
      </div>
      <LangSwitch className="mt-6" />
    </div>
  );
}
