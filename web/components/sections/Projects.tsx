"use client";
// Gallery of typical jobs: an even grid of same-size cards, picture on top and caption below.
// Each picture drifts slightly inside its frame as you scroll (parallax) and zooms a little on hover.
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { PROJECTS, type Project } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";
import { ScaffoldScene, sceneSky } from "./ScaffoldScene";

function ProjectCard({ p }: { p: Project }) {
  const { pick } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-6%", "6%"]);
  const title = pick(p.title);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-line transition-shadow duration-300 hover:shadow-xl hover:shadow-ink/5">
      <div ref={ref} className="relative aspect-[4/3] overflow-hidden" style={{ backgroundColor: sceneSky(p.scene) }}>
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
      <div className="flex flex-1 flex-col border-t border-line px-6 py-5">
        <h3 className="font-display text-lg leading-snug font-bold text-ink sm:text-xl">{title}</h3>
        <p className="mt-1.5 text-sm text-muted">{pick(p.spec)}</p>
      </div>
    </article>
  );
}

export function Projects() {
  const { t } = useI18n();
  // One column on phones, two on tablets, three on desktops; every card is the same size.
  return (
    <section id="projects" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow={t("sec.projects.eyebrow")} title={t("sec.projects.title")} intro={t("sec.projects.intro")} />
        <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((p) => (
            <StaggerItem key={p.scene} className="h-full">
              <ProjectCard p={p} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
