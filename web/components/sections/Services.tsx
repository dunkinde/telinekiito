"use client";
// Services grid: six cards that tilt towards the mouse. Each card starts a quote with that job preselected.
import { SERVICES } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { useSite } from "../SiteContext";
import { IconArrow, ServiceGlyph } from "../ui/Icons";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";
import { TiltCard } from "../ui/TiltCard";

export function Services() {
  const { t, pick } = useI18n();
  const { openQuote } = useSite();
  return (
    <section id="services" className="relative bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow={t("sec.services.eyebrow")} title={t("sec.services.title")} intro={t("sec.services.intro")} />
        <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => {
            const quotable = Boolean(s.job || s.urgency);
            return (
              <StaggerItem key={s.icon} className="h-full">
                <TiltCard className="h-full rounded-3xl">
                  <div className="flex h-full flex-col rounded-3xl bg-white p-7 ring-1 ring-line transition-colors duration-300 group-hover:ring-ink/20">
                    <div className="mb-6 flex items-center justify-between">
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sun text-ink transition-transform duration-500 group-hover:-rotate-6">
                        <ServiceGlyph kind={s.icon} />
                      </span>
                      <span className="font-display text-sm font-bold text-line transition-colors group-hover:text-ink/20">
                        {String(SERVICES.indexOf(s) + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink">{pick(s.title)}</h3>
                    <p className="mt-3 flex-1 leading-relaxed text-muted">{pick(s.text)}</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {s.points.map((p) => (
                        <li key={p.en} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-ink-soft">
                          {pick(p)}
                        </li>
                      ))}
                    </ul>
                    {quotable ? (
                      <button
                        type="button"
                        onClick={() => openQuote({ jobType: s.job, urgency: s.urgency })}
                        className="mt-6 inline-flex items-center gap-2 self-start text-sm font-semibold text-ink"
                      >
                        <span className="nav-link">{t("svc.cta")}</span>
                        <IconArrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </button>
                    ) : (
                      <a href="#contact" className="mt-6 inline-flex items-center gap-2 self-start text-sm font-semibold text-ink">
                        <span className="nav-link">{t("svc.contact")}</span>
                        <IconArrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </a>
                    )}
                  </div>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
