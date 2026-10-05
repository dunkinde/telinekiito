"use client";
// Gallery of typical jobs. Each illustration drifts slightly inside its frame as you scroll (parallax)
// and zooms a little on hover.
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
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-7%", "7%"]);
  const title = pick(p.title);

  return (
    <div ref={ref} style={{ backgroundColor: sceneSky(p.scene) }} className={`group relative overflow-hidden rounded-3xl ring-1 ring-line ${p.tall ? "h-[26rem] lg:h-[32rem]" : "h-[21rem] lg:h-[23rem]"}`}>
      {/* The image layer is taller than the frame so it can move without showing edges. */}
      <motion.div className="absolute inset-x-0 -top-[8%] -bottom-[8%]" style={{ y }}>
        <div className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.04]">
          <ScaffoldScene kind={p.scene} title={title} />
        </div>
      </motion.div>
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/90 via-ink/55 to-transparent p-6 pt-14">
        <h3 className="font-display text-xl font-bold leading-tight text-white sm:text-2xl">{title}</h3>
        <p className="mt-1.5 text-sm text-white/75">{pick(p.spec)}</p>
      </div>
    </div>
  );
}

export function Projects() {
  const { t } = useI18n();
  // Two masonry-style columns on tablets, three on desktops.
  return (
    <section id="projects" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow={t("sec.projects.eyebrow")} title={t("sec.projects.title")} intro={t("sec.projects.intro")} />
        <Stagger className="mt-14 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
          {PROJECTS.map((p) => (
            <StaggerItem key={p.scene}>
              <ProjectCard p={p} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
