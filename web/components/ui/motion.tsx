"use client";
// Small building blocks for scroll animations. Only transform and opacity are animated.
import { motion, type Variants } from "framer-motion";

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Fades and slides its content in once, when it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  as = "div"
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "li" | "p" | "h2" | "span";
}) {
  const M = motion[as] as typeof motion.div;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
    >
      {children}
    </M>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: (stagger: number = 0.08) => ({ transition: { staggerChildren: stagger, delayChildren: 0.05 } })
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE_OUT } }
};

/** A list or grid whose children (StaggerItem) appear one after another. */
export function Stagger({
  children,
  className,
  stagger = 0.08,
  as = "div"
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  as?: "div" | "ul" | "ol";
}) {
  const M = motion[as] as typeof motion.div;
  return (
    <M className={className} variants={staggerParent} custom={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }}>
      {children}
    </M>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const M = motion[as] as typeof motion.div;
  return (
    <M className={className} variants={staggerChild}>
      {children}
    </M>
  );
}

/** Section heading block: eyebrow, title and intro, revealed together. */
export function SectionHead({
  eyebrow,
  title,
  intro,
  dark = false,
  className = ""
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <Stagger className={`max-w-3xl ${className}`} stagger={0.1}>
      <StaggerItem>
        <p className={`mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${dark ? "text-sun" : "text-ink-soft"}`}>
          <span className="h-[2px] w-6 bg-sun" aria-hidden />
          {eyebrow}
        </p>
      </StaggerItem>
      <StaggerItem>
        <h2 className={`font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.02] font-extrabold tracking-[-0.02em] ${dark ? "text-white" : "text-ink"}`}>
          {title}
        </h2>
      </StaggerItem>
      {intro ? (
        <StaggerItem>
          <p className={`mt-5 max-w-2xl text-lg leading-relaxed ${dark ? "text-white/70" : "text-muted"}`}>{intro}</p>
        </StaggerItem>
      ) : null}
    </Stagger>
  );
}
