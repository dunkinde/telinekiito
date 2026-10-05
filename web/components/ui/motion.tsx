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

/**
 * Section heading block: eyebrow, title and intro, revealed together.
 * `split` puts the title on the left and the intro (plus any `aside`, e.g. buttons) on the right on desktops,
 * which keeps the heading short so the section fits on one screen.
 */
export function SectionHead({
  eyebrow,
  title,
  intro,
  dark = false,
  split = false,
  aside,
  className = ""
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  dark?: boolean;
  split?: boolean;
  aside?: React.ReactNode;
  className?: string;
}) {
  const eyebrowEl = (
    <StaggerItem>
      <p className={`mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] lg:mb-[clamp(0.5rem,1.6svh,1rem)] ${dark ? "text-sun" : "text-ink-soft"}`}>
        <span className="h-[2px] w-6 bg-sun" aria-hidden />
        {eyebrow}
      </p>
    </StaggerItem>
  );
  const titleEl = (
    <StaggerItem>
      <h2 className={`font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.04] font-extrabold tracking-[-0.02em] text-balance lg:text-[clamp(2rem,min(4.2vw,7svh),3.5rem)] ${dark ? "text-white" : "text-ink"}`}>
        {title}
      </h2>
    </StaggerItem>
  );
  const introEl = intro ? (
    <p className={`max-w-2xl text-lg leading-relaxed lg:text-[clamp(1rem,2.5svh,1.125rem)] ${dark ? "text-white/70" : "text-muted"}`}>{intro}</p>
  ) : null;

  if (split) {
    return (
      <Stagger className={`grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-10 ${className}`} stagger={0.1}>
        <div className="lg:col-span-7">
          {eyebrowEl}
          {titleEl}
        </div>
        {introEl || aside ? (
          <StaggerItem className="flex flex-col gap-5 lg:col-span-5 lg:pb-1">
            {introEl}
            {aside}
          </StaggerItem>
        ) : null}
      </Stagger>
    );
  }
  return (
    <Stagger className={`max-w-3xl ${className}`} stagger={0.1}>
      {eyebrowEl}
      {titleEl}
      {introEl ? <StaggerItem className="mt-5 lg:mt-[clamp(0.75rem,2svh,1.25rem)]">{introEl}</StaggerItem> : null}
      {aside ? <StaggerItem className="mt-6">{aside}</StaggerItem> : null}
    </Stagger>
  );
}
