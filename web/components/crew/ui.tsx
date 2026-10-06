"use client";
// Building blocks of the crew app: big buttons for gloves, bottom sheets, steppers, toggles, chips and messages.
import { motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { OrderStatus } from "@/lib/platform";
import type { ToastKind } from "./context";
import { ICheck, IChevronDown, IClose, IMinus, IPlus } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------------- Buttons ---------------- */
type BtnVariant = "primary" | "dark" | "light" | "danger" | "ghost" | "success";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-sun text-ink active:bg-sun-deep shadow-[0_6px_18px_-8px_rgba(224,168,0,0.9)]",
  dark: "bg-ink text-white active:bg-ink-soft",
  light: "bg-white text-ink ring-2 ring-inset ring-line active:bg-mist",
  danger: "bg-white text-[#b42318] ring-2 ring-inset ring-[#f4b4b6] active:bg-[#fde2e3]",
  ghost: "bg-transparent text-ink underline-offset-4 active:bg-ink/5",
  success: "bg-[#15803d] text-white active:bg-[#166534]"
};
export function Btn({
  children,
  variant = "light",
  size = "md",
  block = false,
  busy = false,
  disabled,
  onClick,
  type = "button",
  className = "",
  href,
  target,
  ariaLabel
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: "md" | "lg";
  block?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  type?: "button" | "submit";
  className?: string;
  href?: string;
  target?: string;
  ariaLabel?: string;
}) {
  const cls = cx(
    "relative inline-flex select-none items-center justify-center gap-2.5 rounded-full px-5 font-semibold transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
    size === "lg" ? "min-h-14 text-[17px]" : "min-h-12 text-base",
    block && "w-full",
    BTN[variant],
    className
  );
  const inner = (
    <>
      {busy ? <Spinner className="h-5 w-5" /> : null}
      <span className={cx("inline-flex items-center gap-2.5", busy && "opacity-80")}>{children}</span>
    </>
  );
  if (href)
    return (
      <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined} className={cls} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled || busy} aria-label={ariaLabel} aria-busy={busy || undefined}>
      {inner}
    </button>
  );
}

/** Square icon button, 48 × 48 at least. */
export function IconBtn({ children, label, onClick, className = "", dark = false, busy = false }: { children: React.ReactNode; label: string; onClick?: () => void; className?: string; dark?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors",
        dark ? "text-white hover:bg-white/10 active:bg-white/15" : "text-ink hover:bg-ink/5 active:bg-ink/10",
        className
      )}
    >
      {busy ? <Spinner className="h-5 w-5" /> : children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- The sticky action at the bottom of a job ---------------- */
export function ActionBar({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {hint ? <p className="mb-2 text-center text-[14px] font-medium text-muted">{hint}</p> : null}
        {children}
      </div>
    </div>
  );
}

/* ---------------- Cards and sections ---------------- */
export function Card({ children, className = "", tone = "white" }: { children: React.ReactNode; className?: string; tone?: "white" | "sun" | "warn" | "ok" | "info" | "mist" }) {
  const toneCls = {
    white: "bg-white ring-1 ring-line",
    sun: "bg-sun-soft ring-1 ring-sun/50",
    warn: "bg-[#fff1e6] ring-1 ring-[#fbc59a]",
    ok: "bg-[#e8f7ee] ring-1 ring-[#a7dfbd]",
    info: "bg-[#eef3fb] ring-1 ring-[#c4d5f2]",
    mist: "bg-mist ring-1 ring-line"
  }[tone];
  return <div className={cx("rounded-2xl p-4", toneCls, className)}>{children}</div>;
}

export function SectionTitle({ children, icon, right, className = "" }: { children: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <h3 className="flex items-center gap-2 font-display text-[19px] font-bold tracking-[-0.01em] text-ink">
        {icon ? <span className="text-ink-soft">{icon}</span> : null}
        {children}
      </h3>
      {right}
    </div>
  );
}

/** A section that opens and closes; the whole header is the button. */
export function Collapsible({
  title,
  icon,
  badge,
  open,
  onToggle,
  children,
  id
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  id?: string;
}) {
  const auto = useId();
  const panel = id || auto;
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-mist">
        {icon ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mist text-ink-soft">{icon}</span> : null}
        <span className="flex-1 font-display text-[18px] font-bold tracking-[-0.01em]">{title}</span>
        {badge}
        <IChevronDown className={cx("h-6 w-6 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id={panel} className="border-t border-line px-4 pt-4 pb-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/* ---------------- Inputs ---------------- */
export function Field({ label, hint, children, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-semibold text-ink-soft">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[14px] text-muted">{hint}</p> : null}
    </div>
  );
}
export const inputCls =
  "w-full rounded-xl border-2 border-line bg-white px-4 py-3 text-[17px] text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none disabled:bg-mist";

/** Big − [n] + control for counting parts with gloves on. */
export function Stepper({ value, onChange, min = 0, max = 99999, label, id }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const btn = "grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-mist text-ink ring-1 ring-line active:bg-line disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`${label} −1`}>
        <IMinus className="h-6 w-6" />
      </button>
      <input
        id={id}
        value={text}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
          setText(v);
          if (v !== "") onChange(clamp(Number(v)));
        }}
        onBlur={() => setText(String(value))}
        className="h-14 w-full min-w-0 flex-1 rounded-2xl border-2 border-line bg-white text-center font-display text-[26px] font-extrabold text-ink focus:border-ink focus:outline-none"
      />
      <button type="button" className={btn} onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`${label} +1`}>
        <IPlus className="h-6 w-6" />
      </button>
    </div>
  );
}

/** A checklist line: the whole row is the switch. */
export function CheckRow({ checked, onChange, children, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; sub?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex min-h-16 w-full items-center gap-4 rounded-2xl px-4 py-3 text-left ring-2 ring-inset transition-colors",
        checked ? "bg-[#e8f7ee] ring-[#86d3a5]" : "bg-white ring-line active:bg-mist"
      )}
    >
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-2 ring-inset", checked ? "bg-[#15803d] text-white ring-[#15803d]" : "bg-white text-transparent ring-ink/25")}>
        <ICheck className="h-6 w-6" />
      </span>
      <span className="flex-1">
        <span className="block text-[17px] leading-snug font-semibold text-ink">{children}</span>
        {sub ? <span className="mt-0.5 block text-[14px] text-muted">{sub}</span> : null}
      </span>
    </button>
  );
}

/** Two to four big choices side by side. */
export function Segmented<T extends string>({ value, options, onChange, label, dark = false }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex gap-1 rounded-full p-1", dark ? "bg-white/10" : "bg-mist ring-1 ring-line")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-h-11 flex-1 rounded-full px-3 text-[15px] font-semibold transition-colors",
              on ? (dark ? "bg-sun text-ink" : "bg-ink text-white") : dark ? "text-white/80 hover:text-white" : "text-ink-soft hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Chips ---------------- */
const STATUS_TONE: Record<OrderStatus, string> = {
  received: "bg-mist text-ink-soft ring-line",
  confirmed: "bg-[#eef1f5] text-ink-soft ring-[#d5dce5]",
  loading: "bg-sun-soft text-[#7a5a00] ring-sun/60",
  en_route: "bg-[#e3ecfd] text-[#1d4ed8] ring-[#bcd0f7]",
  erected: "bg-[#e3f6ea] text-[#15803d] ring-[#a7dfbd]",
  pickup_requested: "bg-[#efe9fe] text-[#6d28d9] ring-[#d4c6fb]",
  dismantled: "bg-[#eceef1] text-ink-soft ring-line",
  closed: "bg-[#eceef1] text-ink-soft ring-line",
  cancelled: "bg-[#fde8e8] text-[#b42318] ring-[#f6c0c2]"
};
export function StatusChip({ status, label, className = "" }: { status: OrderStatus; label: string; className?: string }) {
  return <span className={cx("inline-flex h-8 items-center rounded-full px-3 text-[14px] font-semibold whitespace-nowrap ring-1 ring-inset", STATUS_TONE[status], className)}>{label}</span>;
}
export function Chip({ children, tone = "mist", className = "" }: { children: React.ReactNode; tone?: "mist" | "sun" | "red" | "green" | "blue" | "dark"; className?: string }) {
  const toneCls = {
    mist: "bg-mist text-ink-soft ring-line",
    sun: "bg-sun text-ink ring-sun-deep/40",
    red: "bg-[#fde8e8] text-[#b42318] ring-[#f6c0c2]",
    green: "bg-[#e3f6ea] text-[#15803d] ring-[#a7dfbd]",
    blue: "bg-[#e3ecfd] text-[#1d4ed8] ring-[#bcd0f7]",
    dark: "bg-white/10 text-white ring-white/20"
  }[tone];
  return <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold whitespace-nowrap ring-1 ring-inset", toneCls, className)}>{children}</span>;
}

/* ---------------- Bottom sheet (dialog) ---------------- */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const p = panel.current;
      const first = p?.querySelector<HTMLElement>("[data-autofocus]") || p;
      first?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')).filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/60" onClick={onClose} aria-hidden />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:max-w-xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-5">
          <h2 id={titleId} className="flex-1 py-2 font-display text-[20px] font-bold tracking-[-0.01em]">
            {title}
          </h2>
          <IconBtn label={closeLabel} onClick={onClose}>
            <IClose className="h-6 w-6" />
          </IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5">{children}</div>
        {footer ? <div className="border-t border-line bg-white px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </motion.div>
    </div>
  );
}

/* ---------------- Short messages above the action bar ---------------- */
interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
}
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToastFn = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, kind: ToastKind = "ok") => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, kind });
    timer.current = window.setTimeout(() => setMsg(null), kind === "error" ? 8000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[95] flex justify-center px-4" role="status" aria-live="polite">
        {msg ? (
          <motion.button
            key={msg.id}
            type="button"
            onClick={() => setMsg(null)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              "pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-5 py-3.5 text-left text-[16px] leading-snug font-semibold shadow-2xl",
              msg.kind === "error" ? "bg-[#b42318] text-white" : msg.kind === "offline" ? "bg-sun text-ink" : "bg-ink text-white"
            )}
          >
            {msg.kind === "ok" ? <ICheck className="mt-0.5 h-5 w-5 shrink-0 text-sun" /> : null}
            <span>{msg.text}</span>
          </motion.button>
        ) : null}
      </div>
    </ToastCtx.Provider>
  );
}

/** Asks before something that's hard to undo. */
export function Confirm({
  open,
  title,
  text,
  yes,
  no,
  onYes,
  onNo,
  danger = false,
  closeLabel
}: {
  open: boolean;
  closeLabel: string;
  title: string;
  text: React.ReactNode;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onNo}
      title={title}
      closeLabel={closeLabel}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Btn size="lg" onClick={onNo} block>
            {no}
          </Btn>
          <Btn size="lg" variant={danger ? "danger" : "primary"} onClick={onYes} block>
            {yes}
          </Btn>
        </div>
      }
    >
      <div className="text-[17px] leading-relaxed text-ink">{text}</div>
    </Sheet>
  );
}

/** A thin progress bar. */
export function Progress({ value, total, tone = "sun" }: { value: number; total: number; tone?: "sun" | "green" }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className={cx("h-full rounded-full transition-[width] duration-300", tone === "green" ? "bg-[#16a34a]" : "bg-sun")} style={{ width: `${pct}%` }} />
    </div>
  );
}
