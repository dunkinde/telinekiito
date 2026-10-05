"use client";
// Pricing: three delivery speeds with a live example price for a typical house, plus the unit prices.
// All numbers come from the server's pricing settings (the same ones the office edits).
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useState } from "react";
import type { Urgency } from "@/lib/api";
import { PRICE_EXTRA, PRICE_FEATURES } from "@/lib/content";
import { eur, num2d } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useSite } from "../SiteContext";
import { Button } from "../ui/Button";
import { CountUp } from "../ui/CountUp";
import { IconCheck } from "../ui/Icons";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";
import { TiltCard } from "../ui/TiltCard";

const TIERS: Urgency[] = ["standard", "express", "emergency"];

export function Pricing() {
  const { t, pick } = useI18n();
  const { config, openQuote } = useSite();
  const p = config?.pricing;
  // Soft yellow spotlight that follows the mouse across the section (transform + opacity only).
  const reduce = useReducedMotion();
  const sx = useSpring(useMotionValue(0), { stiffness: 120, damping: 20 });
  const sy = useSpring(useMotionValue(0), { stiffness: 120, damping: 20 });
  const [lit, setLit] = useState(false);
  function onMove(e: React.PointerEvent<HTMLElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    sx.set(e.clientX - r.left - 300);
    sy.set(e.clientY - r.top - 300);
    if (!lit) setLit(true);
  }

  const rates = p
    ? [
        { label: t("price.rate.rent"), value: `${num2d(p.rentPerM2Day)} ${t("price.rate.rentU")}` },
        { label: t("price.rate.erect"), value: `${num2d(p.erectPerM2)} ${t("price.rate.m2")}` },
        { label: t("price.rate.dismantle"), value: `${num2d(p.dismantlePerM2)} ${t("price.rate.m2")}` },
        { label: t("price.rate.catch"), value: `${num2d(p.catchPerMetre)} ${t("price.rate.perM")}` },
        { label: t("price.rate.levels"), value: `${num2d(p.extraLevelPerM)} ${t("price.rate.perLevel")}` },
        { label: t("price.rate.trip", { z: "A" }), value: eur(p.zones.A.trip) },
        { label: t("price.rate.trip", { z: "B" }), value: eur(p.zones.B.trip) },
        { label: t("price.rate.trip", { z: "C" }), value: eur(p.zones.C.trip) },
        { label: t("price.rate.min"), value: t("price.rate.days", { n: p.minRentDays }) }
      ]
    : [];

  return (
    <section id="pricing" onPointerMove={onMove} onPointerLeave={() => setLit(false)} className="relative overflow-hidden bg-ink py-24 text-white sm:py-32">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 h-[600px] w-[600px] rounded-full"
        style={{ x: sx, y: sy, background: "radial-gradient(circle, rgba(255,194,14,0.16) 0%, rgba(255,194,14,0.05) 35%, transparent 65%)" }}
        animate={{ opacity: lit ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />
      {/* A faint yellow glow behind the cards. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-sun/10 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead dark eyebrow={t("sec.pricing.eyebrow")} title={t("sec.pricing.title")} intro={t("sec.pricing.intro")} />

        <Stagger className="mt-14 grid gap-5 lg:grid-cols-3" stagger={0.12}>
          {TIERS.map((u, i) => {
            const pct = p?.urgency[u].pct ?? 0;
            const total = config?.examples.totals[u];
            const extra = PRICE_EXTRA[u];
            const featured = i === 1;
            return (
              <StaggerItem key={u} className="h-full">
                <TiltCard className="h-full rounded-3xl" max={4}>
                  <div className={`flex h-full flex-col rounded-3xl p-7 ring-1 transition-colors duration-300 ${featured ? "bg-white text-ink ring-white" : "bg-white/[0.04] ring-white/10 group-hover:ring-sun/50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-2xl font-bold">{t(`urg.${u}`)}</h3>
                        <p className={`mt-1 text-sm ${featured ? "text-muted" : "text-white/60"}`}>
                          {t("price.lead")} {t(`urgLead.${u}`)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${pct > 0 ? "bg-sun text-ink" : featured ? "bg-mist text-ink-soft" : "bg-white/10 text-white/80"}`}>
                        {pct > 0 ? t("price.surcharge", { pct }) : t("price.noSurcharge")}
                      </span>
                    </div>

                    <p className={`mt-8 text-xs font-semibold uppercase tracking-[0.14em] ${featured ? "text-muted" : "text-white/50"}`}>{t("price.from")}</p>
                    <p className="mt-1 font-display text-5xl font-extrabold tracking-[-0.02em] tabular-nums">
                      {total ? <CountUp to={total} format={eur} duration={1.6} /> : "—"}
                    </p>
                    <p className={`mt-1 text-sm ${featured ? "text-muted" : "text-white/60"}`}>{t("price.incl")}</p>
                    <p className={`mt-4 text-xs leading-relaxed ${featured ? "text-muted" : "text-white/50"}`}>{t("price.example")}</p>

                    <ul className={`mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${featured ? "border-line" : "border-white/10"}`}>
                      {[...PRICE_FEATURES, ...(extra ? [extra] : [])].map((f) => (
                        <li key={f.en} className="flex items-start gap-2.5">
                          <IconCheck className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-sun-deep" : "text-sun"}`} />
                          {pick(f)}
                        </li>
                      ))}
                    </ul>
                    <Button variant={featured ? "primary" : "light"} className="mt-8 w-full" onClick={() => openQuote({ urgency: u })}>
                      {t("price.cta")}
                    </Button>
                  </div>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>

        {rates.length ? (
          <motion.div
            className="mt-14 rounded-3xl bg-white/[0.04] p-6 ring-1 ring-white/10 sm:p-8"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3 className="font-display text-xl font-bold">{t("price.rates")}</h3>
            <dl className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {rates.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3">
                  <dt className="text-sm text-white/65">{r.label}</dt>
                  <dd className="text-right font-semibold tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm text-white/55">{t("price.note")}</p>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
