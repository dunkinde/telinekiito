"use client";
// Card that lifts and tilts slightly towards the mouse. Touch screens and reduced motion get a plain card.
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

export function TiltCard({
  children,
  className = "",
  max = 6
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 22 });
  const sry = useSpring(ry, { stiffness: 220, damping: 22 });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * max * 2);
    rx.set(-py * max * 2);
  }
  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      whileHover={reduce ? undefined : { y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`group relative ${className}`}
    >
      {/* Soft shadow that fades in on hover (opacity only). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 translate-y-3 rounded-[inherit] bg-ink/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />
      {children}
    </motion.div>
  );
}
