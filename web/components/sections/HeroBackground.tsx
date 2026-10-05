"use client";
// Hero background: a slow gradient mesh, a faint scaffold lattice that draws itself, and floating couplers.
// Everything moves with transform/opacity only; the lattice and mesh drift at different speeds while scrolling.
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useMemo } from "react";
import { seeded } from "@/lib/random";

const BAY = 96; // px between scaffold standards
const LIFT = 80; // px between levels

export function HeroBackground({ start }: { start: boolean }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const latticeY = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 140]);
  const meshY = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 60]);

  // Same pseudo-random layout on the server and in the browser (no hydration mismatch).
  const particles = useMemo(() => {
    const r = seeded(7);
    return Array.from({ length: 22 }, () => ({
      left: 4 + r() * 92,
      top: 8 + r() * 84,
      size: 3 + Math.round(r() * 5),
      dur: 9 + r() * 10,
      delay: r() * 4,
      drift: 12 + r() * 26,
      square: r() > 0.55
    }));
  }, []);

  const lattice = useMemo(() => {
    const cols = 7, rows = 7, paths: { d: string; kind: "line" | "brace" | "deck" }[] = [];
    for (let c = 0; c <= cols; c++) paths.push({ d: `M${c * BAY} 0V${rows * LIFT}`, kind: "line" });
    for (let r = 0; r <= rows; r++) paths.push({ d: `M0 ${r * LIFT}H${cols * BAY}`, kind: "line" });
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        if ((c + r) % 3 === 0) paths.push({ d: `M${c * BAY} ${(r + 1) * LIFT}L${(c + 1) * BAY} ${r * LIFT}`, kind: "brace" });
        if ((c * 3 + r) % 4 === 1) paths.push({ d: `M${c * BAY + 6} ${r * LIFT + 2}H${(c + 1) * BAY - 6}`, kind: "deck" });
      }
    return paths;
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Gradient mesh: three soft blobs drifting slowly. */}
      <motion.div className="absolute inset-0" style={{ y: meshY }}>
        <motion.div
          className="absolute -top-40 -right-24 h-[34rem] w-[34rem] rounded-full bg-sun/45 blur-3xl"
          animate={reduce ? undefined : { x: [0, -60, 20, 0], y: [0, 40, -20, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 -left-40 h-[30rem] w-[30rem] rounded-full bg-steel/70 blur-3xl"
          animate={reduce ? undefined : { x: [0, 50, -10, 0], y: [0, -30, 30, 0], scale: [1, 0.94, 1.06, 1] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 right-1/4 h-[24rem] w-[24rem] rounded-full bg-sun-soft blur-3xl"
          animate={reduce ? undefined : { x: [0, 40, -30, 0], y: [0, -20, 10, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Scaffold lattice on the right, drawn line by line after the intro. */}
      <motion.svg
        className="absolute top-16 -right-24 hidden h-[640px] w-[760px] lg:block"
        viewBox={`-4 -4 ${7 * BAY + 8} ${7 * LIFT + 8}`}
        style={{ y: latticeY }}
        initial={false}
      >
        {lattice.map((p, i) => (
          <motion.path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.kind === "deck" ? "#ffc20e" : "#0e1217"}
            strokeOpacity={p.kind === "deck" ? 0.75 : p.kind === "brace" ? 0.07 : 0.09}
            strokeWidth={p.kind === "deck" ? 5 : 1.5}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={start ? { pathLength: 1 } : undefined}
            transition={{ duration: 1.1, delay: 0.2 + (i % 24) * 0.035, ease: [0.65, 0, 0.35, 1] }}
          />
        ))}
      </motion.svg>

      {/* Floating couplers / dust: tiny squares and dots bobbing up and down. */}
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute ${p.square ? "rounded-[2px] bg-ink/15" : "rounded-full bg-sun/70"}`}
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
          initial={{ opacity: 0 }}
          animate={reduce ? { opacity: 0.6 } : { opacity: [0, 0.8, 0.8, 0], y: [0, -p.drift, -p.drift * 1.6, -p.drift * 2] }}
          transition={reduce ? { duration: 0.6 } : { duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* Fade into the next section. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-white" />
    </div>
  );
}
