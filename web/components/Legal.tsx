"use client";
// Terms of service (/terms) and pre-contract information (/consumer-info), in the visitor's chosen language.
// DRAFT texts awaiting a lawyer's review – see web/lib/terms.ts.
import { LangProvider, useI18n } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { COMPANY, CONSUMER_INFO, TERMS, TERMS_DRAFT, TERMS_UPDATED, WITHDRAWAL_FORM } from "@/lib/terms";
import { LangSwitch } from "./Header";
import { Logo } from "./Logo";

type Doc = "terms" | "info";

export default function Legal({ doc }: { doc: Doc }) {
  return (
    <LangProvider>
      <Body doc={doc} />
    </LangProvider>
  );
}

function Body({ doc }: { doc: Doc }) {
  const { t, pick, lang } = useI18n();
  const sections = doc === "terms" ? TERMS : CONSUMER_INFO;
  const rows: [string, string][] = [
    [lang === "fi" ? "Nimi" : "Name", COMPANY.name],
    [lang === "fi" ? "Y-tunnus" : "Business ID", COMPANY.businessId],
    [lang === "fi" ? "Osoite" : "Address", COMPANY.address],
    [lang === "fi" ? "Puhelin" : "Phone", COMPANY.phone],
    [lang === "fi" ? "Sähköposti" : "Email", COMPANY.email]
  ];
  const fill = (s: string) => s.replace("{company}", COMPANY.name).replace("{address}", COMPANY.address).replace("{email}", COMPANY.email);
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
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-[-0.02em] text-ink">{t(doc === "terms" ? "terms.title" : "info.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("privacy.updated", { date: fmtDate(TERMS_UPDATED, lang) })}</p>
        {TERMS_DRAFT ? <p className="mt-4 rounded-xl bg-sun-soft px-4 py-3 text-sm text-ink">{t("legal.draft")}</p> : null}
        <p className="mt-4 text-sm">
          <a href={doc === "terms" ? "/consumer-info" : "/terms"} className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink">
            {t(doc === "terms" ? "info.link" : "terms.link")} →
          </a>
        </p>
        <div className="mt-6 space-y-8 rounded-3xl bg-white p-6 ring-1 ring-line sm:p-9">
          {sections.map((s, i) => (
            <section key={s.title.en} id={s.id} aria-labelledby={`lg-${i}`}>
              <h2 id={`lg-${i}`} className="font-display text-xl font-bold text-ink">
                {pick(s.title)}
              </h2>
              {s.company ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[10rem_1fr]">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {(s.body || []).map((b) => (
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
          {doc === "info" ? (
            <section id="withdrawal-form" aria-labelledby="lg-form" className="rounded-2xl bg-mist p-5 ring-1 ring-line">
              <h2 id="lg-form" className="font-display text-xl font-bold text-ink">
                {pick(WITHDRAWAL_FORM.title)}
              </h2>
              <p className="mt-2 text-sm text-muted">{pick(WITHDRAWAL_FORM.intro)}</p>
              <div className="mt-4 space-y-3 leading-relaxed text-ink">
                {WITHDRAWAL_FORM.lines.map((l) => (
                  <p key={l.en}>{fill(pick(l))}</p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <a href="/" className="nav-link mt-8 inline-block text-sm font-semibold text-ink-soft">
          ← {t("privacy.back")}
        </a>
      </main>
    </div>
  );
}
