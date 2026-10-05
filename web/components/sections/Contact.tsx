"use client";
// Contact: form that sends to /api/contact (messages appear in the office), contact details and a map.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { sendContact } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { errText, useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { Button } from "../ui/Button";
import { IconCheck, IconClock, IconMail, IconMap, IconPhone } from "../ui/Icons";
import { Reveal, SectionHead } from "../ui/motion";

export function Contact() {
  const i18n = useI18n();
  const { t, lang } = i18n;
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      await sendContact({ ...form, lang });
      setState("sent");
      setForm({ name: "", email: "", phone: "", message: "", website: "" });
    } catch (err) {
      setError(errText(i18n, err, (iso) => fmtDate(iso, lang)));
      setState("idle");
    }
  }

  const details = [
    { icon: IconPhone, label: t("contact.phoneLabel"), value: SITE.phone, href: SITE.phoneHref },
    { icon: IconMail, label: t("contact.emailLabel"), value: SITE.email, href: `mailto:${SITE.email}` },
    { icon: IconClock, label: t("contact.hoursLabel"), value: t("contact.hours") },
    { icon: IconMap, label: t("contact.areaLabel"), value: t("contact.area") }
  ];

  return (
    <section id="contact" className="snap-screen section-pad bg-white">
      {/* Two columns that start and end on the same lines: heading, details and map on the left; the form on the right. */}
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-stretch lg:gap-12 lg:px-8">
        <div className="flex flex-col lg:col-span-5">
          <SectionHead eyebrow={t("sec.contact.eyebrow")} title={t("sec.contact.title")} intro={t("sec.contact.intro")} />
          <Reveal className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:mt-[clamp(1rem,3.5svh,2rem)]" delay={0.1}>
            {details.map((d) => (
              <div key={d.label} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mist text-ink">
                  <d.icon />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{d.label}</p>
                  {d.href ? (
                    <a href={d.href} className="nav-link text-[15px] font-semibold text-ink short:text-sm">
                      {d.value}
                    </a>
                  ) : (
                    <p className="text-[15px] leading-snug font-semibold text-ink short:text-sm">{d.value}</p>
                  )}
                </div>
              </div>
            ))}
          </Reveal>
          <Reveal className="mt-8 flex min-h-56 flex-1 flex-col overflow-hidden rounded-3xl ring-1 ring-line lg:mt-[clamp(1rem,3.5svh,2rem)] lg:min-h-[clamp(6rem,24svh,16rem)]" delay={0.2}>
            <iframe title={t("contact.map")} src={SITE.mapEmbed} loading="lazy" className="block h-0 min-h-0 w-full grow basis-0 grayscale-[0.4]" />
            <a href={SITE.mapLink} target="_blank" rel="noopener" className="block bg-mist px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink">
              {t("contact.mapLink")} ↗
            </a>
          </Reveal>
        </div>

        <Reveal className="flex lg:col-span-7" delay={0.15}>
          <form onSubmit={submit} className="relative flex w-full flex-col rounded-3xl bg-mist p-6 ring-1 ring-line sm:p-8 short:p-6" noValidate>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <label className="block">
                <span className="field-label">{t("contact.name")}</span>
                <input className="field-input" value={form.name} onChange={set("name")} autoComplete="name" required />
              </label>
              <label className="block">
                <span className="field-label">{t("contact.email")}</span>
                <input className="field-input" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
              </label>
            </div>
            <label className="mt-4 block sm:mt-5 short:mt-4">
              <span className="field-label">{t("contact.phone")}</span>
              <input className="field-input" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
            </label>
            <label className="mt-4 flex flex-1 flex-col sm:mt-5 short:mt-4">
              <span className="field-label">{t("contact.message")}</span>
              <textarea className="field-input min-h-32 flex-1 resize-none lg:min-h-[clamp(6rem,22svh,14rem)]" value={form.message} onChange={set("message")} placeholder={t("contact.messagePh")} required />
            </label>
            {/* Hidden from people; bots tend to fill it in. */}
            <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button type="submit" variant="dark" disabled={state === "sending"}>
                {state === "sending" ? t("contact.sending") : t("contact.send")}
              </Button>
              <p className="text-xs text-muted">{t("contact.privacy")}</p>
            </div>
            <AnimatePresence>
              {error ? (
                <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 text-sm font-medium text-signal" role="alert">
                  {error}
                </motion.p>
              ) : null}
              {state === "sent" ? (
                <motion.p key="ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 inline-flex items-center gap-2 self-start rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink ring-1 ring-line" role="status">
                  <IconCheck className="h-4 w-4 text-sun-deep" />
                  {t("contact.sent")}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
