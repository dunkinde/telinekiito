"use client";
// The privacy notice page (/privacy), in the visitor's chosen language.
import { LangProvider, useI18n } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { CONTROLLER, PRIVACY, PRIVACY_UPDATED } from "@/lib/privacy";
import { LangSwitch } from "./Header";
import { Logo } from "./Logo";

export default function Privacy() {
  return (
    <LangProvider>
      <Body />
    </LangProvider>
  );
}

function Body() {
  const { t, pick, lang } = useI18n();
  const rows: [string, string][] = [
    [lang === "fi" ? "Nimi" : "Name", CONTROLLER.name],
    [lang === "fi" ? "Y-tunnus" : "Business ID", CONTROLLER.businessId],
    [lang === "fi" ? "Osoite" : "Address", CONTROLLER.address],
    [lang === "fi" ? "Sähköposti" : "Email", CONTROLLER.email],
    [lang === "fi" ? "Yhteyshenkilö" : "Contact person", CONTROLLER.contact]
  ];
  return (
    <div className="min-h-screen bg-mist">
      <a href="#main" className="skip-link">
        {t("skip")}
      </a>
      <header className="bg-ink">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <a href="/" aria-label="TelineKiito">
            <Logo dark />
          </a>
          <LangSwitch dark />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">TelineKiito</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-[-0.02em] text-ink">{t("privacy.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("privacy.updated", { date: fmtDate(PRIVACY_UPDATED, lang) })}</p>
        <div className="mt-8 space-y-8 rounded-3xl bg-white p-6 ring-1 ring-line sm:p-9">
          {PRIVACY.map((s, i) => (
            <section key={s.title.en} aria-labelledby={`pv-${i}`}>
              <h2 id={`pv-${i}`} className="font-display text-xl font-bold text-ink">
                {pick(s.title)}
              </h2>
              {i === 0 ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[10rem_1fr]">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {s.body.map((b) => (
                <p key={b.en} className="mt-3 leading-relaxed text-ink-soft">
                  {pick(b)}
                </p>
              ))}
              {s.list ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-ink-soft marker:text-sun-deep">
                  {s.list.map((b) => (
                    <li key={b.en}>{pick(b)}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <a href="/" className="nav-link mt-8 inline-block text-sm font-semibold text-ink-soft">
          ← {t("privacy.back")}
        </a>
      </main>
    </div>
  );
}
