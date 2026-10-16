"use client";
// Page-load intro (about 2.3 s): the 8-point rose goes up ring by ring from the inside out, like scaffolding going up a
// level at a time, the name appears across it, then the panel lifts away.
// Shown once per browser session on desktop; skipped on phones and tablets and for visitors who prefer reduced motion.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { ROSE_EDGE, ROSE_RINGS } from "./introRose";
import { LETTERS, SLASHES } from "./Logo";
import { useSite } from "./SiteContext";
import { RICH_MOTION } from "./ui/useMedia";

const HOLD_MS = 1750;
const ring = (k: number) => ({ duration: 0.3, delay: 0.1 + Math.max(0, k - 1) * 0.12, ease: "easeOut" as const });

export function Intro() {
  const { setIntroDone } = useSite();
  const reduce = useReducedMotion();
  const [show, setShow] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem("tk_intro") === "1";
      window.sessionStorage.setItem("tk_intro", "1");
    } catch {
      /* storage blocked: just play it */
    }
    if (reduce || seen || !window.matchMedia(RICH_MOTION).matches) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(false), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);

  // The hero starts its own animation while this panel lifts away.
  useEffect(() => {
    if (!show) setIntroDone(true);
  }, [show, setIntroDone]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="intro"
          className="intro-failsafe fixed inset-0 z-[100] flex items-center justify-center bg-ink"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
          aria-hidden
        >
          <svg viewBox="0 0 640 360" className="h-auto w-[min(92vw,150vh)]" fill="none" strokeLinecap="round">
            {ROSE_RINGS.map((d, k) =>
              d ? <motion.path key={`r${k}`} d={d} stroke="#3a434e" strokeWidth={1.2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ring(k)} /> : null
            )}
            {ROSE_EDGE.map((d, k) =>
              d ? <motion.path key={`e${k}`} d={d} stroke="#ffc20e" strokeWidth={2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ring(k)} /> : null
            )}
            <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.95, ease: [0.16, 1, 0.3, 1] }}>
              <rect x="0" y="146" width="640" height="68" fill="#0e1217" opacity="0.88" />
              <g transform="translate(130 165) scale(0.4961)">
                {LETTERS.map(([x, d]) => (
                  <path key={x} transform={`translate(${x} 0)`} d={d} fill="#ffffff" fillRule="evenodd" />
                ))}
                {SLASHES.map((d) => (
                  <path key={d} d={d} fill="#ffc20e" />
                ))}
              </g>
            </motion.g>
          </svg>
          <motion.span
            className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-sun"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: HOLD_MS / 1000, ease: [0.65, 0, 0.35, 1] }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
