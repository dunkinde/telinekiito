"use client";
// Page-load intro (about 1.4 s): the logo frame draws itself, the name rises letter by letter, then the panel lifts away.
// Shown once per browser session, and skipped for visitors who prefer reduced motion.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSite } from "./SiteContext";

const NAME = "TelineKiito";

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
    if (reduce || seen) {
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
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 40 40" className="h-14 w-14">
              <motion.rect width="40" height="40" rx="10" fill="#ffc20e" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: "20px 20px" }} />
              <g stroke="#0e1217" strokeWidth="3.2" strokeLinecap="square" fill="none">
                {["M12 9v22", "M28 9v22", "M12 15h16", "M12 25h16", "M12 25l16-10"].map((d, i) => (
                  <motion.path key={d} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.15 + i * 0.07, ease: "easeOut" }} />
                ))}
              </g>
            </svg>
            <span className="flex overflow-hidden font-display text-4xl font-extrabold tracking-[-0.01em] text-white sm:text-5xl">
              {NAME.split("").map((ch, i) => (
                <motion.span
                  key={i}
                  className={i >= 6 ? "text-sun" : undefined}
                  initial={{ y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                >
                  {ch}
                </motion.span>
              ))}
            </span>
          </div>
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
