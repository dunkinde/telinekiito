"use client";
// Phone number + PIN. Big fields with number keypads; the owner's password login hides behind "Office login".
import { useEffect, useRef, useState } from "react";
import { loginWithPassword, loginWithPin, type StaffUser } from "@/lib/platform";
import { LogoMark } from "../Logo";
import { lsGet, lsSet } from "./context";
import { errorText, LANG_NAMES, LANGS, type Lang, type T } from "./i18n";
import { IEye, IEyeOff, IKey } from "./icons";
import { Btn, cx, inputCls } from "./ui";

export function Login({ t, lang, setLang, onLogin, notice }: { t: T; lang: Lang; setLang: (l: Lang) => void; onLogin: (u: StaffUser) => void; notice?: string }) {
  const [office, setOffice] = useState(false);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice || "");
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const last = lsGet("tk_crew_phone");
    if (last) setPhone(last);
  }, []);
  useEffect(() => setError(notice || ""), [notice]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (office) {
      if (!password) return setError(t("login.needPassword"));
    } else {
      if (phone.replace(/\D/g, "").length < 6) return setError(t("login.needPhone"));
      if (!/^\d{4,8}$/.test(pin)) return setError(t("login.needPin"));
    }
    setBusy(true);
    try {
      const r = office ? await loginWithPassword(password) : await loginWithPin(phone.trim(), pin);
      if (!office) lsSet("tk_crew_phone", phone.trim());
      setPin("");
      setPassword("");
      onLogin(r.user);
    } catch (err) {
      setError(errorText(t, err));
      setPin("");
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-ink text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3 py-2">
          <span className="inline-flex items-center gap-2.5">
            <LogoMark className="h-10 w-10" />
            <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.01em]">
              Teline<span className="text-sun">Kiito</span>
            </span>
          </span>
          <div className="flex gap-1 rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Language / Kieli / Язык">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={l === lang}
                aria-label={LANG_NAMES[l]}
                onClick={() => setLang(l)}
                className={cx("h-10 min-w-11 rounded-full px-2.5 text-[14px] font-bold uppercase", l === lang ? "bg-sun text-ink" : "text-white/80 hover:text-white")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-[8vh] mb-7">
          <p className="text-[15px] font-semibold tracking-[0.12em] text-sun uppercase">{t("app.sub")}</p>
          <h1 className="mt-2 font-display text-[32px] leading-[1.1] font-extrabold tracking-[-0.02em]">{office ? t("login.office") : t("login.title")}</h1>
        </div>

        <form onSubmit={submit} className="rounded-3xl bg-white p-5 text-ink shadow-2xl" noValidate>
          {office ? (
            <div>
              <label htmlFor="tk-pw" className="mb-1.5 block text-[15px] font-semibold text-ink-soft">
                {t("login.password")}
              </label>
              <input id="tk-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cx(inputCls, "h-14 text-[19px]")} autoFocus />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="tk-phone" className="mb-1.5 block text-[15px] font-semibold text-ink-soft">
                  {t("login.phone")}
                </label>
                <input
                  id="tk-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="username"
                  name="username"
                  placeholder="040 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 20))}
                  className={cx(inputCls, "h-14 font-display text-[22px] font-bold tracking-[0.02em] placeholder:font-normal placeholder:text-muted/45")}
                />
              </div>
              <div>
                <label htmlFor="tk-pin" className="mb-1.5 block text-[15px] font-semibold text-ink-soft">
                  {t("login.pin")}
                </label>
                <div className="relative">
                  <input
                    id="tk-pin"
                    ref={pinRef}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="current-password"
                    name="password"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className={cx(inputCls, "h-14 pr-14 font-display text-[26px] font-bold tracking-[0.3em]")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    aria-label={showPin ? t("login.hidePin") : t("login.showPin")}
                    aria-pressed={showPin}
                    className="absolute top-1 right-1 grid h-12 w-12 place-items-center rounded-xl text-muted hover:text-ink"
                  >
                    {showPin ? <IEyeOff className="h-6 w-6" /> : <IEye className="h-6 w-6" />}
                  </button>
                </div>
              </div>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-[#fde8e8] px-4 py-3 text-[16px] font-semibold text-[#b42318]">
              {error}
            </p>
          ) : null}
          <Btn type="submit" variant="primary" size="lg" block busy={busy} className="mt-5">
            {busy ? t("login.busy") : t("login.submit")}
          </Btn>
          <p className="mt-4 text-center text-[14px] text-muted">{office ? "" : t("login.stay")}</p>
        </form>

        <div className="mt-auto flex flex-col items-center gap-1 pt-8 text-center">
          {!office ? <p className="text-[15px] text-white/70">{t("login.help")}</p> : null}
          <button
            type="button"
            onClick={() => {
              setOffice((v) => !v);
              setError("");
            }}
            className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline"
          >
            <IKey className="h-5 w-5" />
            {office ? t("login.backToPin") : t("login.office")}
          </button>
          {office ? (
            <a href="/office" className="inline-flex min-h-12 items-center rounded-full px-4 text-[15px] font-semibold text-sun underline-offset-4 hover:underline">
              {t("login.openOffice")}
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
