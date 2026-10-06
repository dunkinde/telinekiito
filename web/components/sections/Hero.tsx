"use client";
// Hero: headline that reveals word by word after the intro, the address bar that starts a quote,
// count-up stats and a floating example quote card with gentle parallax.
import { motion, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { getQuote, type Quote } from "@/lib/api";
import { eur } from "@/lib/format";
import { lineLabel, useI18n } from "@/lib/i18n";
import { useSite } from "../SiteContext";
import { Button } from "../ui/Button";
import { CountUp } from "../ui/CountUp";
import { IconArrow, IconCheck, IconPin } from "../ui/Icons";
import { EASE_OUT } from "../ui/motion";
import { HouseModel } from "../HouseModel";
import { HeroBackground } from "./HeroBackground";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } }
};
const word: Variants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.9, ease: EASE_OUT } }
};
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_OUT } }
};

/** One line of the headline, split into words that slide up from behind a mask. */
function Line({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className="inline-block" variants={word}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </>
  );
}

function AddressBar() {
  const { t } = useI18n();
  const { openQuote } = useSite();
  const reduce = useReducedMotion();
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-9 max-w-xl lg:mt-[clamp(1rem,3.4svh,2.25rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        // Near the top of the page the bar itself grows into the quote window (shared layout animation).
        const morph = !reduce && window.scrollY < 400;
        openQuote({ address: value.trim() || undefined, origin: morph ? "hero" : undefined });
      }}
    >
      <motion.div
        layoutId="quote-shell"
        style={{ borderRadius: 28 }}
        className="flex flex-col gap-2 bg-white p-2 shadow-[0_20px_60px_-20px_rgba(14,18,23,0.35)] ring-1 ring-line sm:flex-row sm:items-center"
      >
        <label className="flex flex-1 items-center gap-3 px-3 sm:pl-5">
          <IconPin className="h-5 w-5 shrink-0 text-ink-soft" />
          <span className="sr-only">{t("hero.addressLabel")}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("hero.addressPh")}
            autoComplete="street-address"
            className="h-12 w-full bg-transparent text-base lg:h-[clamp(2.75rem,7svh,3rem)] text-ink placeholder:text-muted focus:outline-none"
          />
        </label>
        <Button type="submit" size="lg" className="w-full sm:w-auto lg:h-[clamp(3rem,7.6svh,3.5rem)]">
          {t("hero.cta")}
          <IconArrow className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </motion.div>
    </form>
  );
}

const EXAMPLE_HOUSE = { length: 15, width: 10, eave: 3, roofType: "gable" as const, pitch: 30, jobType: "roof" as const, gables: true };

/** Example quote for a typical house, priced live by the API, floating on the right. */
function ExampleCard() {
  const i18n = useI18n();
  const { t } = i18n;
  const { config } = useSite();
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    getQuote({ ...EXAMPLE_HOUSE, days: 28, zone: "A", urgency: "standard" })
      .then((r) => setQuote(r.quote))
      .catch(() => {});
  }, []);
  const total = quote?.total ?? config?.examples.totals.standard ?? 0;
  // The first three lines as priced, then one row with everything else (other lines and VAT), so the rows add up
  // to the total shown below.
  const shown = quote?.lines.filter((l) => l.key !== "min").slice(0, 3) ?? [];
  // Rows show whole euros, so the rest is worked out from the rounded figures to make the column add up exactly.
  const rest = quote ? Math.round(quote.total) - shown.reduce((s, l) => s + Math.round(l.amount), 0) : 0;
  const more = quote ? quote.lines.length > shown.length : false;

  return (
    <div className="relative rounded-[28px] bg-white/90 p-6 shadow-[0_40px_80px_-30px_rgba(14,18,23,0.4)] ring-1 ring-line backdrop-blur sm:p-7 lg:p-[clamp(1.1rem,3svh,1.75rem)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t("hero.card.title")}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-2.5 py-1 text-xs font-semibold text-ink">
          <IconCheck className="h-3.5 w-3.5" /> {t("hero.card.ready")}
        </span>
      </div>
      {/* 3D model of the example house; the scaffold assembles level by level. */}
      <HouseModel shape={EXAMPLE_HOUSE} className="mt-3 h-40 w-full sm:h-44 lg:mt-[clamp(0.25rem,1.2svh,0.75rem)] lg:h-[clamp(6.5rem,20svh,11rem)]" label={t("hero.card.house")} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <p className="font-semibold text-ink">{t("hero.card.house")}</p>
        <p className="text-muted">
          {t("hero.card.job")} · {config ? `${config.examples.area} m²` : "319 m²"}
        </p>
      </div>
      <ul className="mt-5 space-y-2.5 text-sm lg:mt-[clamp(0.75rem,2.2svh,1.25rem)] lg:space-y-[clamp(0.35rem,1.2svh,0.625rem)]">
        {shown.length
          ? [...shown.map((l) => ({ key: l.key, label: lineLabel(i18n, l, quote ?? undefined), amount: l.amount })), { key: "rest", label: more ? t("hero.card.rest") : t("hero.card.vat"), amount: rest }].map((l) => (
              <li key={l.key} className="flex justify-between gap-4 border-b border-line pb-2.5 last:border-0 lg:pb-[clamp(0.35rem,1.2svh,0.625rem)]">
                <span className="text-ink-soft">{l.label}</span>
                <span className="font-medium tabular-nums">{eur(l.amount)}</span>
              </li>
            ))
          : [0, 1, 2, 3].map((k) => <li key={k} className="h-5 rounded bg-mist" />)}
      </ul>
      <div className="mt-5 flex items-end justify-between rounded-2xl bg-ink px-5 py-4 text-white lg:mt-[clamp(0.75rem,2.2svh,1.25rem)] lg:py-[clamp(0.65rem,1.8svh,1rem)]">
        <span className="text-sm text-white/70">{t("hero.card.total")}</span>
        <span className="font-display text-3xl font-extrabold tabular-nums">{total ? eur(total) : "—"}</span>
      </div>
    </div>
  );
}

export function Hero() {
  const { t, lang } = useI18n();
  const { introDone, openTrack, quote } = useSite();
  const morphing = quote.open && quote.start.origin === "hero";
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  // Gentle parallax: the text column moves a little slower than the page, the card a little more.
  const textY = useTransform(scrollY, [0, 700], [0, reduce ? 0 : -40]);
  const cardY = useTransform(scrollY, [0, 700], [0, reduce ? 0 : -110]);
  const state = introDone ? "show" : "hidden";

  return (
    <section id="top" className="snap-full relative overflow-hidden pt-28 pb-20 sm:pt-32 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-20 lg:pb-[clamp(0.75rem,3svh,2.5rem)]">
      <HeroBackground start={introDone} />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <motion.div className="lg:col-span-7" style={{ y: textY }} initial="hidden" animate={state} variants={container}>
          <motion.p variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full lg:mb-[clamp(0.75rem,2.6svh,1.5rem)] bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft ring-1 ring-line backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="motion-loop absolute inline-flex h-full w-full animate-ping rounded-full bg-sun opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sun-deep" />
            </span>
            {t("hero.eyebrow")}
          </motion.p>

          <motion.h1 key={lang} variants={container} className="font-display text-[clamp(2.3rem,6.4vw,4.75rem)] leading-[1] font-extrabold tracking-[-0.03em] text-ink lg:text-[clamp(2.5rem,min(5.6vw,7.4svh),4.75rem)]">
            <span className="block">
              <Line text={t("hero.line1")} />
            </span>
            <span className="relative mt-1 inline-block">
              <motion.span
                aria-hidden
                className="absolute inset-x-[-0.08em] bottom-[0.08em] h-[0.32em] origin-left rounded-sm bg-sun"
                variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.8, delay: 0.55, ease: EASE_OUT } } }}
              />
              <span className="relative">
                <Line text={t("hero.line2")} />
              </span>
            </span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-7 max-w-xl text-lg leading-relaxed text-muted sm:text-xl lg:mt-[clamp(0.75rem,2.6svh,1.75rem)] lg:max-w-[38rem] lg:text-[clamp(1rem,2.4svh,1.25rem)]">
            {t("hero.sub")}
          </motion.p>

          <motion.div variants={fadeUp}>
            <AddressBar />
          </motion.div>

          <motion.ul variants={fadeUp} className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft lg:mt-[clamp(0.75rem,2.2svh,1.25rem)]">
            {(["hero.trust1", "hero.trust2", "hero.trust3"] as const).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <IconCheck className="h-4 w-4 text-sun-deep" />
                {t(k)}
              </li>
            ))}
          </motion.ul>

          <motion.div variants={fadeUp} className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-7 lg:mt-[clamp(1rem,3.6svh,2.5rem)] lg:pt-[clamp(0.85rem,3svh,1.75rem)]">
            {[
              { n: 24, u: "h", k: "hero.stat1" as const },
              { n: 48, u: "h", k: "hero.stat2" as const },
              { n: 60, u: "s", k: "hero.stat3" as const }
            ].map((s) => (
              <div key={s.k}>
                <p className="font-display text-3xl font-extrabold tabular-nums text-ink sm:text-4xl lg:text-[clamp(1.75rem,5svh,2.25rem)]">
                  <CountUp to={s.n} />
                  <span className="ml-0.5 text-sun-deep">{s.u}</span>
                </p>
                <p className="mt-1 text-xs leading-snug text-muted sm:text-sm">{t(s.k)}</p>
              </div>
            ))}
          </motion.div>

          <motion.button variants={fadeUp} type="button" onClick={() => openTrack()} className="nav-link mt-8 text-sm font-semibold text-ink-soft hover:text-ink lg:mt-[clamp(0.75rem,2.6svh,2rem)]">
            {t("hero.track")} →
          </motion.button>
        </motion.div>

        <motion.div
          className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none"
          style={{ y: cardY }}
          initial={{ opacity: 0, y: 40 }}
          animate={introDone ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 1, delay: 0.45, ease: EASE_OUT }}
        >
          {/* While the hero bar grows into the quote window, the example card steps back towards it. */}
          <motion.div animate={morphing ? { opacity: 0, scale: 0.9, x: -60 } : { opacity: 1, scale: 1, x: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <motion.div
              animate={reduce ? undefined : { y: [0, -10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <ExampleCard />
            </motion.div>
          </motion.div>
          <motion.div
            className="absolute top-[22%] -left-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl sm:-left-8"
            initial={{ opacity: 0, scale: 0.8, rotate: -6 }}
            animate={introDone ? { opacity: 1, scale: 1, rotate: -4 } : undefined}
            transition={{ duration: 0.6, delay: 0.9, ease: EASE_OUT }}
          >
            <p className="font-display text-2xl font-extrabold leading-none text-sun">24 h</p>
            <p className="mt-1 text-xs text-white/70">{t("hero.stat1")}</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
