"use client";
// Gallery of typical jobs as a horizontal slider: three same-size cards on desktops (two on tablets, one and a
// bit on phones), arrows to browse. Each picture drifts slightly inside its frame as you scroll (parallax) and
// zooms a little on hover.
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { PROJECTS, type Project } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { IconArrow } from "../ui/Icons";
import { Reveal, SectionHead } from "../ui/motion";
import { ScaffoldScene, sceneSky } from "./ScaffoldScene";
import { useRichMotion } from "../ui/useMedia";

function ProjectCard({ p }: { p: Project }) {
  const { pick } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const rich = useRichMotion();
  const reduce = useReducedMotion() || !rich;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-6%", "6%"]);
  const title = pick(p.title);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-line transition-shadow duration-300 hover:shadow-xl hover:shadow-ink/5">
      <div ref={ref} className="relative aspect-[4/3] overflow-hidden short:aspect-[16/9]" style={{ backgroundColor: sceneSky(p.scene) }}>
        {/* The picture layer is taller than the frame so it can move without showing edges. */}
        <motion.div className="absolute inset-x-0 -top-[8%] -bottom-[8%]" style={{ y }}>
          <div className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.04]">
            {p.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo} alt={title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <ScaffoldScene kind={p.scene} title={title} />
            )}
          </div>
        </motion.div>
      </div>
      <div className="flex flex-1 flex-col border-t border-line px-6 py-5 short:py-3.5">
        <h3 className="font-display text-lg leading-snug font-bold text-ink sm:text-xl">{title}</h3>
        <p className="mt-1.5 text-sm text-muted">{pick(p.spec)}</p>
      </div>
    </article>
  );
}

export function Projects() {
  const { t, lang } = useI18n();
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  }, []);
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const arrows = (
    <div className="hidden shrink-0 items-center gap-3 sm:flex">
      {([-1, 1] as const).map((d) => {
        const off = d < 0 ? edge.start : edge.end;
        return (
          <button
            key={d}
            type="button"
            onClick={() => go(d)}
            disabled={off}
            aria-label={d < 0 ? (lang === "fi" ? "Edelliset kohteet" : "Previous projects") : lang === "fi" ? "Seuraavat kohteet" : "Next projects"}
            className="grid h-12 w-12 place-items-center rounded-full bg-white text-ink ring-1 ring-line transition-colors hover:bg-ink hover:text-white disabled:cursor-default disabled:opacity-35 disabled:hover:bg-white disabled:hover:text-ink"
          >
            <IconArrow className={`h-5 w-5 ${d < 0 ? "rotate-180" : ""}`} />
          </button>
        );
      })}
    </div>
  );

  return (
    <section id="projects" className="snap-screen section-pad overflow-hidden bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          split
          eyebrow={t("sec.projects.eyebrow")}
          title={t("sec.projects.title")}
          aside={
            <div className="flex items-end justify-between gap-6">
              <p className="max-w-md text-lg leading-relaxed text-muted lg:text-[clamp(0.95rem,2.4svh,1.0625rem)]">{t("sec.projects.intro")}</p>
              {arrows}
            </div>
          }
        />
        <Reveal className="head-gap" delay={0.1}>
          <ul
            ref={track}
            onScroll={update}
            className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0"
          >
            {PROJECTS.map((p) => (
              <li key={p.scene} className="w-[84%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]">
                <ProjectCard p={p} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
