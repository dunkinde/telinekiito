"use client";
// Registration for a business account: the company and its first admin, who chooses the PIN. The office calls the
// company and approves the account; until then logging in says the registration is waiting.
import { useState } from "react";
import { bizRegister } from "@/lib/business";
import { Logo } from "../Logo";
import { useT } from "../office/context";
import { errMessage } from "../office/i18n";
import { ISend } from "../office/icons";
import { LangSwitch } from "../office/Login";
import { Btn, Callout, Field, Input, TextArea } from "../office/ui";

/** The dark band, logo and language switch around the login and registration cards. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-mist">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-ink" />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <a href="/" aria-label="TelineKiito">
          <Logo dark />
        </a>
        <LangSwitch dark />
      </header>
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-4 pb-10 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}

/** Finnish business ID with a matching check digit (the server checks it too). */
function validBusinessId(v: string) {
  const m = /^(\d{6,7})-?(\d)$/.exec(v.replace(/\s/g, ""));
  if (!m) return false;
  const d = m[1].padStart(7, "0");
  const r = [7, 9, 10, 5, 8, 4, 2].reduce((s, w, i) => s + w * Number(d[i]), 0) % 11;
  return r !== 1 && (r === 0 ? 0 : 11 - r) === Number(m[2]);
}

type Form = { company: string; businessId: string; billingAddress: string; einvoiceAddress: string; contactName: string; phone: string; email: string; pin: string; pin2: string; message: string; website: string };
const blank: Form = { company: "", businessId: "", billingAddress: "", einvoiceAddress: "", contactName: "", phone: "", email: "", pin: "", pin2: "", message: "", website: "" };

export function Register() {
  const i = useT();
  const { t, lang } = i;
  const [f, setF] = useState<Form>(blank);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const up = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const errs: Partial<Record<keyof Form, string>> = {};
  if (!f.company.trim()) errs.company = t("biz.reg.err.required");
  if (!validBusinessId(f.businessId)) errs.businessId = f.businessId.trim() ? t("biz.reg.err.businessId") : t("biz.reg.err.required");
  if (!f.contactName.trim()) errs.contactName = t("biz.reg.err.required");
  if (f.phone.replace(/\D/g, "").length < 6) errs.phone = f.phone.trim() ? t("biz.reg.err.phone") : t("biz.reg.err.required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errs.email = f.email.trim() ? t("biz.reg.err.email") : t("biz.reg.err.required");
  if (!/^\d{4,8}$/.test(f.pin)) errs.pin = t("biz.reg.err.pin");
  else if (f.pin2 !== f.pin) errs.pin2 = t("biz.reg.err.pin2");
  const show = (k: keyof Form) => (tried ? errs[k] || null : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (Object.keys(errs).length) {
      // Take the visitor to the first field to fix.
      window.requestAnimationFrame(() => (document.querySelector("[data-reg] [aria-invalid=true]") as HTMLElement | null)?.focus());
      return;
    }
    setBusy(true);
    try {
      await bizRegister({
        company: f.company.trim(),
        businessId: f.businessId.trim(),
        billingAddress: f.billingAddress.trim(),
        einvoiceAddress: f.einvoiceAddress.trim(),
        contactName: f.contactName.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        pin: f.pin,
        message: f.message.trim(),
        lang,
        website: f.website
      });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(errMessage(i, err));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <AuthFrame>
        <div className="w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(14,18,23,0.35)] ring-1 ring-line sm:p-8" role="status">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-sun text-2xl font-bold text-ink">✓</span>
          <h1 className="mt-4 font-display text-[1.6rem] leading-tight font-extrabold text-ink">{t("biz.reg.doneTitle")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{t("biz.reg.doneText", { phone: f.phone.trim() })}</p>
          <Btn variant="dark" className="mt-6" href="#/">
            {t("biz.reg.back")}
          </Btn>
        </div>
      </AuthFrame>
    );

  const inv = (k: keyof Form) => (show(k) ? { "aria-invalid": true } : {});
  return (
    <AuthFrame>
      <div data-reg className="w-full max-w-[640px] rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(14,18,23,0.35)] ring-1 ring-line sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t("biz.eyebrow")}</p>
        <h1 className="mt-1 font-display text-[1.8rem] leading-tight font-extrabold tracking-[-0.01em] text-ink">{t("biz.reg.title")}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("biz.reg.intro")}</p>
        <form className="mt-6 space-y-6" onSubmit={submit} noValidate>
          {/* Hidden from people; bots fill it in. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => up({ website: e.target.value })} />
            </label>
          </div>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 font-display text-[15px] font-bold text-ink">{t("biz.reg.company")}</legend>
            <Field label={t("biz.reg.companyName")} error={show("company")} className="sm:col-span-2">
              {(id, d) => <Input id={id} {...inv("company")} value={f.company} onChange={(v) => up({ company: v })} maxLength={120} autoComplete="organization" describedBy={d} required />}
            </Field>
            <Field label={t("biz.reg.businessId")} hint={t("biz.reg.businessIdHint")} error={show("businessId")}>
              {(id, d) => <Input id={id} {...inv("businessId")} value={f.businessId} onChange={(v) => up({ businessId: v.replace(/[^\d-]/g, "").slice(0, 9) })} inputMode="numeric" placeholder="1234567-8" describedBy={d} required />}
            </Field>
            <Field label={t("biz.reg.einvoice")} hint={t("biz.reg.einvoiceHint")} optional>
              {(id, d) => <Input id={id} value={f.einvoiceAddress} onChange={(v) => up({ einvoiceAddress: v })} maxLength={40} className="font-mono" describedBy={d} />}
            </Field>
            <Field label={t("biz.reg.billing")} optional className="sm:col-span-2">
              {(id) => <Input id={id} value={f.billingAddress} onChange={(v) => up({ billingAddress: v })} maxLength={120} autoComplete="street-address" />}
            </Field>
          </fieldset>
          <fieldset className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <legend className="sr-only">{t("biz.reg.you")}</legend>
            <div className="sm:col-span-2" aria-hidden>
              <p className="font-display text-[15px] font-bold text-ink">{t("biz.reg.you")}</p>
              <p className="mt-0.5 text-[13px] text-muted">{t("biz.reg.youHint")}</p>
            </div>
            <Field label={t("biz.reg.name")} error={show("contactName")} className="sm:col-span-2">
              {(id, d) => <Input id={id} {...inv("contactName")} value={f.contactName} onChange={(v) => up({ contactName: v })} maxLength={80} autoComplete="name" describedBy={d} required />}
            </Field>
            <Field label={t("biz.reg.phone")} hint={t("biz.reg.phoneHint")} error={show("phone")}>
              {(id, d) => <Input id={id} {...inv("phone")} type="tel" inputMode="tel" value={f.phone} onChange={(v) => up({ phone: v })} maxLength={40} autoComplete="tel" placeholder="040 123 4567" describedBy={d} required />}
            </Field>
            <Field label={t("biz.reg.email")} error={show("email")}>
              {(id, d) => <Input id={id} {...inv("email")} type="email" inputMode="email" value={f.email} onChange={(v) => up({ email: v })} maxLength={120} autoComplete="email" describedBy={d} required />}
            </Field>
            <Field label={t("biz.reg.pin")} hint={t("biz.reg.pinHint")} error={show("pin")}>
              {(id, d) => <Input id={id} {...inv("pin")} type="password" inputMode="numeric" value={f.pin} onChange={(v) => up({ pin: v.replace(/\D/g, "").slice(0, 8) })} maxLength={8} autoComplete="new-password" describedBy={d} required />}
            </Field>
            <Field label={t("biz.reg.pin2")} error={show("pin2")}>
              {(id, d) => <Input id={id} {...inv("pin2")} type="password" inputMode="numeric" value={f.pin2} onChange={(v) => up({ pin2: v.replace(/\D/g, "").slice(0, 8) })} maxLength={8} autoComplete="new-password" describedBy={d} required />}
            </Field>
          </fieldset>
          <Field label={t("biz.reg.message")} hint={t("biz.reg.messageHint")} optional className="border-t border-line pt-5">
            {(id, d) => <TextArea id={id} rows={3} value={f.message} onChange={(v) => up({ message: v })} maxLength={600} describedBy={d} />}
          </Field>
          {tried && Object.keys(errs).length ? <Callout tone="warn">{t("biz.reg.err.fix")}</Callout> : null}
          {error ? (
            <div role="alert">
              <Callout tone="danger">{error}</Callout>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-muted">
              {t("biz.reg.privacy")}{" "}
              <a href="/privacy" className="underline underline-offset-2 hover:text-ink">
                {t("biz.reg.privacyLink")}
              </a>
            </p>
            <Btn type="submit" variant="dark" busy={busy} icon={<ISend className="h-4 w-4" />}>
              {busy ? t("biz.reg.sending") : t("biz.reg.submit")}
            </Btn>
          </div>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        {t("biz.reg.have")}{" "}
        <a href="#/" className="font-semibold text-ink underline underline-offset-2">
          {t("login.submit")}
        </a>
      </p>
    </AuthFrame>
  );
}
