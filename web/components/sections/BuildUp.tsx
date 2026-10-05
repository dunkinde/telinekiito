"use client";
// "Installation day" timelapse: the section stays pinned while you scroll, and the scaffold on the 3D house goes
// up level by level with the scroll position. A clock and milestones follow along. On desktops the page snaps
// to each milestone, so one scroll step = one stage of the day.
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { BUILD_STEPS } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { HouseModel } from "../HouseModel";
import { IconCheck } from "../ui/Icons";

const HOUSE = { length: 11, width: 8, eave: 5.8, roofType: "gable" as const, pitch: 30, jobType: "roof_facade" as const };
const DAY_START = 7 * 60 + 30, DAY_END = 14 * 60 + 30; // 07:30 → 14:30
// Section is (STAGES - 1) * 40vh of scrolling plus one pinned screen.
const STAGE_VH = 40;

export function BuildUp() {
  const { t, pick } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  const bar = useTransform(scrollYProgress, [0, 1], [0, 1]);

  // Clock text and the current milestone follow the scroll position (no re-render per frame for the clock).
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const mins = Math.round(DAY_START + (DAY_END - DAY_START) * Math.min(1, Math.max(0, v)));
    if (clock.current) clock.current.textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    let i = 0;
    BUILD_STEPS.forEach((s, k) => {
      if (v >= s.at - 0.02) i = k;
    });
    setActive((prev) => (prev === i ? prev : i));
  });

  const stages = BUILD_STEPS.length;
  return (
    <section id="build" ref={ref} className="snap-full relative bg-white" style={{ height: `calc(100svh + ${(stages - 1) * STAGE_VH}vh)` }}>
      {/* Snap stops: one per milestone (desktop). */}
      {BUILD_STEPS.map((_, i) => (
        <span key={i} aria-hidden className="snap-point pointer-events-none absolute inset-x-0 h-px" style={{ top: `${i * STAGE_VH}vh` }} />
      ))}
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden pt-20 pb-[clamp(0.75rem,3svh,2rem)]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
          <div className="lg:col-span-5">
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft lg:mb-[clamp(0.5rem,1.6svh,1rem)]">
              <span className="h-[2px] w-6 bg-sun" aria-hidden />
              {t("build.eyebrow")}
            </p>
            <h2 className="font-display text-[clamp(1.9rem,4.4vw,3.4rem)] leading-[1.04] font-extrabold tracking-[-0.02em] text-balance lg:text-[clamp(1.9rem,min(3.6vw,6.2svh),3.25rem)]">
              {t("build.title")}
            </h2>
            <p className="mt-4 hidden max-w-md text-lg leading-relaxed text-muted sm:block lg:mt-[clamp(0.5rem,1.8svh,1rem)] lg:text-[clamp(0.95rem,2.4svh,1.125rem)]">{t("build.intro")}</p>

            <div className="mt-5 flex items-end gap-4 lg:mt-[clamp(0.75rem,2.6svh,1.5rem)]">
              <span ref={clock} className="font-mono text-5xl font-bold tabular-nums text-ink sm:text-6xl lg:text-[clamp(2.5rem,7.5svh,3.75rem)]">
                07:30
              </span>
              <span className="mb-2 text-sm text-muted">{t("build.clock")}</span>
            </div>
            <div className="mt-3 h-1 w-full max-w-md overflow-hidden rounded-full bg-line">
              <motion.div className="h-full origin-left rounded-full bg-sun" style={{ scaleX: bar }} />
            </div>

            <ol className="mt-5 space-y-2.5 lg:mt-[clamp(0.75rem,2.6svh,1.5rem)] lg:space-y-[clamp(0.3rem,1.2svh,0.625rem)]">
              {BUILD_STEPS.map((s, i) => (
                <li key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${i === active ? "opacity-100" : i < active ? "opacity-60" : "opacity-30"} ${i === active ? "" : "max-sm:hidden"}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i <= active ? "bg-ink text-white" : "ring-1 ring-line text-muted"}`}>
                    {i < active ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-muted">{s.time}</span>
                  <span className="font-semibold text-ink">{pick(s.label)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:col-span-7">
            <HouseModel
              shape={HOUSE}
              mode="progress"
              progress={scrollYProgress}
              className="mx-auto h-[36svh] w-full max-w-2xl sm:h-[46svh] lg:h-[calc(100svh-8rem)] lg:max-h-[38rem]"
              label={t("build.title")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
