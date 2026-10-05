"use client";
// Buttons with a hover scale and a yellow glow (the glow is a blurred layer whose opacity changes).
import { motion } from "framer-motion";

type Variant = "primary" | "dark" | "ghost" | "light";
const styles: Record<Variant, string> = {
  primary: "bg-sun text-ink",
  dark: "bg-ink text-white",
  ghost: "bg-transparent text-ink ring-1 ring-inset ring-ink/15 hover:ring-ink/40",
  light: "bg-white text-ink ring-1 ring-inset ring-line"
};
const glow: Record<Variant, string> = {
  primary: "bg-sun",
  dark: "bg-sun/70",
  ghost: "bg-transparent",
  light: "bg-white/0"
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  href,
  type = "button",
  disabled,
  onClick,
  ariaLabel
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel?: string;
}) {
  const pad = size === "lg" ? "h-14 px-7 text-base" : size === "sm" ? "h-10 px-4 text-sm" : "h-12 px-6 text-[15px]";
  const inner = (
    <>
      <span aria-hidden className={`pointer-events-none absolute inset-0 -z-10 rounded-full ${glow[variant]} opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-60`} />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </>
  );
  const cls = `group relative isolate inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition-[box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${styles[variant]} ${className}`;
  const motionProps = {
    whileHover: disabled ? undefined : { scale: 1.035 },
    whileTap: disabled ? undefined : { scale: 0.97 },
    transition: { type: "spring" as const, stiffness: 400, damping: 22 }
  };
  if (href) {
    return (
      <motion.a href={href} className={cls} onClick={onClick} aria-label={ariaLabel} {...motionProps}>
        {inner}
      </motion.a>
    );
  }
  return (
    <motion.button type={type} className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...motionProps}>
      {inner}
    </motion.button>
  );
}
