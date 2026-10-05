"use client";
// Services: six compact cards that tilt towards the mouse. Each card starts a quote with that job preselected
// (or goes to the contact form). Compact so the whole block fits on one desktop screen.
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
    <section id="services" className="snap-screen section-pad relative bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead split eyebrow={t("sec.services.eyebrow")} title={t("sec.services.title")} intro={t("sec.services.intro")} />
        <Stagger className="head-gap grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {SERVICES.map((s) => {
            const quotable = Boolean(s.job || s.urgency);
            const action = quotable ? t("svc.cta") : t("svc.contact");
            const body = (
              <>
                <span className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sun text-ink transition-transform duration-500 group-hover:-rotate-6 short:h-10 short:w-10 short:rounded-xl">
                    <ServiceGlyph kind={s.icon} />
                  </span>
                  <span className="flex-1 font-display text-xl leading-tight font-bold tracking-[-0.01em] text-ink">{pick(s.title)}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-ink transition-colors duration-300 group-hover:bg-ink group-hover:text-white" aria-hidden>
                    <IconArrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </span>
                <span className="mt-3 block flex-1 text-[15px] leading-relaxed text-muted short:mt-2.5 short:text-sm">{pick(s.text)}</span>
                <span className="mt-4 flex flex-wrap items-center gap-2 short:hidden">
                  {s.points.map((p) => (
                    <span key={p.en} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-ink-soft">
                      {pick(p)}
                    </span>
                  ))}
                </span>
                <span className="sr-only">{action}</span>
              </>
            );
            const cls = "flex h-full w-full flex-col rounded-3xl bg-white p-5 text-left ring-1 ring-line transition-colors duration-300 group-hover:ring-ink/20 lg:p-6 short:py-4";
            return (
              <StaggerItem key={s.icon} className="h-full">
                <TiltCard className="h-full rounded-3xl">
                  {quotable ? (
                    <button type="button" onClick={() => openQuote({ jobType: s.job, urgency: s.urgency })} className={cls} title={action}>
                      {body}
                    </button>
                  ) : (
                    <a href="#contact" className={cls} title={action}>
                      {body}
                    </a>
                  )}
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
