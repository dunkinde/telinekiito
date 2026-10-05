"use client";
// Accessible dialog: full screen on phones, a large centred panel on bigger screens.
// Esc closes it, focus stays inside while it's open, and the page behind doesn't scroll.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { IconClose } from "./Icons";

export function Modal({
  open,
  onClose,
  label,
  closeLabel,
  size = "lg",
  children
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  size?: "md" | "lg";
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    // Focus the first field (or the panel) once the panel has mounted.
    const t = window.setTimeout(() => {
      // Prefer the first text field; fall back to the first button, then the panel itself.
      const p = panel.current;
      const first = p?.querySelector<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), textarea, select") || p?.querySelector<HTMLElement>("button:not([data-close])");
      (first || p)?.focus();
    }, 60);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(
        panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div key="modal" className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4 md:p-6">
          <motion.div
            className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl outline-none sm:rounded-3xl ${
              size === "lg" ? "sm:h-[min(880px,94vh)] sm:max-w-6xl" : "sm:max-h-[90vh] sm:max-w-2xl"
            }`}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              data-close
              onClick={onClose}
              aria-label={closeLabel}
              className="absolute top-3 right-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink ring-1 ring-line transition-transform hover:scale-105"
            >
              <IconClose />
            </button>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
