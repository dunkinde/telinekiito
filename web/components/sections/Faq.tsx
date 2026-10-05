"use client";
// FAQ accordion. Answers fade and slide in (opacity/transform only); the height changes in one step.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { FAQ } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { IconPlus } from "../ui/Icons";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";

export function Faq() {
  const { t, pick } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-mist py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <SectionHead eyebrow={t("sec.faq.eyebrow")} title={t("sec.faq.title")} intro={t("sec.faq.side")} />
            <Button href="#contact" variant="dark" className="mt-8">
              {t("sec.faq.contact")}
            </Button>
          </div>
        </div>
        <Stagger as="ul" className="space-y-3 lg:col-span-7" stagger={0.06}>
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <StaggerItem as="li" key={f.q.en}>
                <div className={`rounded-2xl bg-white ring-1 transition-colors duration-300 ${isOpen ? "ring-ink/20" : "ring-line hover:ring-ink/15"}`}>
                  <h3>
                    <button
                      type="button"
                      id={`faq-q-${i}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-a-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left font-display text-lg font-bold text-ink"
                    >
                      {pick(f.q)}
                      <motion.span
                        animate={{ rotate: isOpen ? 45 : 0 }}
                        transition={{ duration: 0.3 }}
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${isOpen ? "bg-sun text-ink" : "bg-mist text-ink-soft"}`}
                      >
                        <IconPlus className="h-4 w-4" />
                      </motion.span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        key="answer"
                        id={`faq-a-${i}`}
                        role="region"
                        aria-labelledby={`faq-q-${i}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <p className="px-6 pb-6 leading-relaxed text-muted">{pick(f.a)}</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
