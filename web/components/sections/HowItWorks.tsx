"use client";
// Three steps from address to scaffold, joined by a line that draws across as the section comes into view.
import { motion } from "framer-motion";
import { STEPS } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { useSite } from "../SiteContext";
import { Button } from "../ui/Button";
import { IconArrow, IconSearch, IconShield, IconTruck } from "../ui/Icons";
import { EASE_OUT, SectionHead, Stagger, StaggerItem } from "../ui/motion";

const ICONS = [IconSearch, IconShield, IconTruck];

export function HowItWorks() {
  const { t, pick } = useI18n();
  const { openQuote } = useSite();
  return (
    <section id="how" className="relative overflow-hidden bg-mist py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow={t("sec.how.eyebrow")} title={t("sec.how.title")} />
        <div className="relative mt-16">
          {/* Connecting line behind the step numbers (desktop). */}
          <motion.div
            aria-hidden
            className="absolute top-8 right-[16%] left-[16%] hidden h-[2px] origin-left bg-ink/15 md:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.2 }}
          />
          <Stagger className="grid gap-12 md:grid-cols-3 md:gap-8" stagger={0.18}>
            {STEPS.map((s, i) => {
              const Icon = ICONS[i];
              return (
                <StaggerItem key={i} className="relative text-left md:text-center">
                  <div className="flex items-center gap-4 md:flex-col">
                    <span className="relative z-10 grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white text-ink shadow-sm ring-1 ring-line">
                      <Icon className="h-6 w-6" />
                      <span className="absolute -top-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-sun text-[11px] font-bold text-ink">{i + 1}</span>
                    </span>
                    <h3 className="font-display text-2xl font-bold tracking-[-0.01em] md:mt-6">{pick(s.title)}</h3>
                  </div>
                  <p className="mt-4 leading-relaxed text-muted md:mx-auto md:max-w-sm">{pick(s.text)}</p>
                  <p className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft ring-1 ring-line">{pick(s.meta)}</p>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
        <div className="mt-14 flex justify-start md:justify-center">
          <Button variant="dark" size="lg" onClick={() => openQuote()}>
            {t("sec.how.cta")}
            <IconArrow className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}
