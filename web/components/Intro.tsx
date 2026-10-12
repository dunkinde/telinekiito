"use client";
// Page-load intro (about 1.4 s): the wordmark rises letter by letter, the two slashes shoot in, then the panel lifts away.
// Shown once per browser session on desktop; skipped on phones and tablets and for visitors who prefer reduced motion.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { LETTERS, SLASHES } from "./Logo";
import { useSite } from "./SiteContext";
import { RICH_MOTION } from "./ui/useMedia";

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
    const t = window.setTimeout(() => setShow(false), 900);
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
          <svg viewBox="0 0 766 59" className="h-12 w-auto max-w-[80vw]">
            <defs>
              <clipPath id="intro-clip">
                <rect width="766" height="59" />
              </clipPath>
            </defs>
            <g clipPath="url(#intro-clip)">
              {LETTERS.map(([x, d], i) => (
                <g key={x} transform={`translate(${x} 0)`}>
                  <motion.path d={d} fillRule="evenodd" fill="#ffffff" initial={{ y: 64 }} animate={{ y: 0 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.03, ease: [0.16, 1, 0.3, 1] }} />
                </g>
              ))}
              {SLASHES.map((d, i) => (
                <motion.path key={d} d={d} fill="#ffc20e" initial={{ x: -48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.4, delay: 0.45 + i * 0.08, ease: [0.16, 1, 0.3, 1] }} />
              ))}
            </g>
          </svg>
          <motion.span
            className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-sun"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
