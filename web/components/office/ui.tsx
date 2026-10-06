"use client";
// Small building blocks for the office screens: buttons, cards, badges, form fields, tabs, dialogs, drawer.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { OrderStatus } from "@/lib/platform";
import { Modal } from "../ui/Modal";
import { useT } from "./context";
import { errMessage, statusLabel, type Lang } from "./i18n";
import { IInfo, IRefresh, IWarn } from "./icons";
import { parseNum, numText } from "./format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------------- Buttons ---------------- */
type BtnVariant = "primary" | "dark" | "ghost" | "light" | "danger" | "quiet";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-sun text-ink hover:bg-[#ffcd38] active:bg-sun-deep",
  dark: "bg-ink text-white hover:bg-ink-soft",
  ghost: "bg-transparent text-ink ring-1 ring-inset ring-ink/15 hover:ring-ink/40 hover:bg-white",
  light: "bg-white text-ink ring-1 ring-inset ring-line hover:ring-ink/30",
  danger: "bg-white text-[#b42318] ring-1 ring-inset ring-[#f4c7c3] hover:bg-[#fff1f0] hover:ring-[#e5484d]",
  quiet: "bg-transparent text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
};
export function Btn({
  children,
  variant = "light",
  size = "md",
  icon,
  className,
  href,
  newTab,
  type = "button",
  disabled,
  busy,
  onClick,
  title,
  ...rest
}: {
  children?: React.ReactNode;
  variant?: BtnVariant;
  size?: "xs" | "sm" | "md";
  icon?: React.ReactNode;
  className?: string;
  href?: string;
  newTab?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu" | "dialog" | "listbox" | boolean;
  "aria-controls"?: string;
  "aria-pressed"?: boolean;
}) {
  const pad = size === "xs" ? "h-8 px-3 text-[13px] gap-1.5" : size === "sm" ? "h-9 px-3.5 text-[13.5px] gap-1.5" : "h-11 px-5 text-[14.5px] gap-2";
  const cls = cx(
    "inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    pad,
    BTN[variant],
    className
  );
  const inner = (
    <>
      {busy ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} className={cls} title={title} onClick={onClick} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener" : undefined} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || busy} onClick={onClick} title={title} aria-busy={busy || undefined} {...rest}>
      {inner}
    </button>
  );
}

/** Round icon-only button; `label` is its accessible name (and tooltip). */
export function IconBtn({
  label,
  children,
  onClick,
  className,
  disabled,
  href,
  newTab,
  tone = "light",
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  disabled?: boolean;
  href?: string;
  newTab?: boolean;
  tone?: "light" | "quiet" | "dark";
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu" | "dialog" | boolean;
  "aria-controls"?: string;
}) {
  const cls = cx(
    "relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40",
    tone === "light" && "bg-white text-ink ring-1 ring-inset ring-line hover:ring-ink/30",
    tone === "quiet" && "text-ink-soft hover:bg-ink/[0.06] hover:text-ink",
    tone === "dark" && "text-white/80 hover:bg-white/10 hover:text-white",
    className
  );
  if (href) {
    return (
      <a href={href} className={cls} aria-label={label} title={label} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} title={label} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin motion-reduce:animate-none", className)} aria-hidden fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Surfaces ---------------- */
export function Card({ children, className, as = "section", ...rest }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" | "li"; "aria-label"?: string; "aria-labelledby"?: string }) {
  const Tag = as;
  return (
    <Tag className={cx("rounded-2xl bg-white ring-1 ring-line", className)} {...rest}>
      {children}
    </Tag>
  );
}
export function CardHead({ title, sub, actions, id, className }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[17px] leading-tight font-bold text-ink">
          {title}
        </h2>
        {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
/** Toolbar under the page title: filters on the left, actions on the right. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
export function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 max-w-3xl text-sm text-muted">{children}</p>;
}

/* ---------------- Badges ---------------- */
export type Tone = "neutral" | "sun" | "green" | "blue" | "red" | "orange" | "violet" | "gray" | "ink";
const TONE: Record<Tone, string> = {
  neutral: "bg-mist text-ink-soft ring-line",
  sun: "bg-sun-soft text-[#7a5a00] ring-[#f3dc8a]",
  green: "bg-[#e9f7ef] text-[#17663a] ring-[#bfe5cd]",
  blue: "bg-[#ebf2fd] text-[#1f4fa8] ring-[#c6d9f6]",
  red: "bg-[#fff0ef] text-[#b42318] ring-[#f6cbc7]",
  orange: "bg-[#fff3e8] text-[#a4470a] ring-[#f8d2b0]",
  violet: "bg-[#f3efff] text-[#5b3cc4] ring-[#dcd2fb]",
  gray: "bg-[#f1f2f4] text-[#4a525c] ring-[#dfe2e6]",
  ink: "bg-ink text-white ring-ink"
};
const DOT: Record<Tone, string> = {
  neutral: "bg-muted",
  sun: "bg-sun-deep",
  green: "bg-[#22a35a]",
  blue: "bg-[#2f6fde]",
  red: "bg-signal",
  orange: "bg-[#f07a1a]",
  violet: "bg-[#7c5cf0]",
  gray: "bg-[#8a929c]",
  ink: "bg-white"
};
export function Badge({ children, tone = "neutral", dot, className, title }: { children: React.ReactNode; tone?: Tone; dot?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] leading-5 font-semibold whitespace-nowrap ring-1 ring-inset", TONE[tone], className)}>
      {dot ? <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
export const STATUS_TONE: Record<OrderStatus, Tone> = {
  received: "sun",
  confirmed: "blue",
  loading: "violet",
  en_route: "violet",
  erected: "green",
  pickup_requested: "orange",
  dismantled: "gray",
  closed: "neutral",
  cancelled: "red"
};
/** Marker / card colours per status (the same families as the badges). */
export const STATUS_HEX: Record<OrderStatus, string> = {
  received: "#e0a800",
  confirmed: "#2f6fde",
  loading: "#7c5cf0",
  en_route: "#7c5cf0",
  erected: "#22a35a",
  pickup_requested: "#f07a1a",
  dismantled: "#8a929c",
  closed: "#5d6773",
  cancelled: "#e5484d"
};
export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const i = useT();
  return (
    <Badge tone={STATUS_TONE[status] || "neutral"} dot className={className}>
      {statusLabel(i, status)}
    </Badge>
  );
}
export function ExampleBadge() {
  const { t } = useT();
  return (
    <Badge tone="gray" title={t("orders.exampleHint")}>
      {t("orders.example")}
    </Badge>
  );
}
/** Small count bubble for nav items and tabs. */
export function Count({ n, tone = "sun", label }: { n: number; tone?: "sun" | "red" | "ink" | "mist" | "dim"; label?: string }) {
  if (!n) return null;
  return (
    <span
      className={cx(
        "inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-none font-bold tabular-nums",
        tone === "sun" && "bg-sun text-ink",
        tone === "red" && "bg-signal text-white",
        tone === "ink" && "bg-ink text-white",
        tone === "mist" && "bg-ink/[0.08] text-ink-soft",
        tone === "dim" && "bg-white/15 text-white"
      )}
    >
      {n > 99 ? "99+" : n}
      {label ? <span className="sr-only"> {label}</span> : null}
    </span>
  );
}

/* ---------------- Callouts and states ---------------- */
export function Callout({ tone = "info", title, children, className, icon }: { tone?: "info" | "warn" | "danger" | "ok"; title?: React.ReactNode; children?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  const styles = {
    info: "bg-[#f4f7fb] ring-[#d9e3ef] text-ink-soft",
    warn: "bg-sun-soft/70 ring-[#f3dc8a] text-ink-soft",
    danger: "bg-[#fff1f0] ring-[#f6cbc7] text-[#7a1d14]",
    ok: "bg-[#eef8f2] ring-[#c7e8d4] text-[#17663a]"
  }[tone];
  const ic = icon ?? (tone === "info" || tone === "ok" ? <IInfo className="h-5 w-5" /> : <IWarn className="h-5 w-5" />);
  return (
    <div className={cx("flex gap-3 rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed ring-1 ring-inset", styles, className)}>
      <span aria-hidden className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-signal" : tone === "warn" ? "text-sun-deep" : tone === "ok" ? "text-[#22a35a]" : "text-[#2f6fde]")}>
        {ic}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}
export function Empty({ title, text, icon, action, className }: { title: string; text?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon ? <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-mist text-muted">{icon}</span> : null}
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {text ? <p className="mt-1 max-w-sm text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
export function Loading({ rows = 4, className }: { rows?: number; className?: string }) {
  const { t } = useT();
  return (
    <div className={cx("space-y-3 p-5", className)} role="status" aria-live="polite">
      <span className="sr-only">{t("ui.loading")}</span>
      {Array.from({ length: rows }, (_, k) => (
        <div key={k} className="h-10 animate-pulse rounded-xl bg-mist motion-reduce:animate-none" style={{ opacity: 1 - k * 0.15 }} />
      ))}
    </div>
  );
}
export function LoadError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const i = useT();
  return (
    <div className={cx("p-5", className)}>
      <Callout tone="danger" title={i.t("ui.loadFailed")}>
        <p>{errMessage(i, error)}</p>
        {onRetry ? (
          <Btn size="sm" variant="light" className="mt-2" icon={<IRefresh className="h-4 w-4" />} onClick={onRetry}>
            {i.t("ui.retry")}
          </Btn>
        ) : null}
      </Callout>
    </div>
  );
}
/** Loading / error / content in one: renders children only when data is there. */
export function Async<D>({ state, children, rows }: { state: { data: D | null; error: unknown; loading: boolean; reload: () => unknown }; children: (d: D) => React.ReactNode; rows?: number }) {
  if (state.data != null) return <>{children(state.data)}</>;
  if (state.error) return <LoadError error={state.error} onRetry={() => state.reload()} />;
  return <Loading rows={rows} />;
}

/* ---------------- Form fields ---------------- */
export const inputCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14.5px] text-ink transition-colors placeholder:text-muted/70 hover:border-ink/30 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:bg-mist disabled:text-muted";
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string, describedBy?: string) => React.ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-h` : undefined;
  const { t } = useT();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
        {label}
        {optional ? <span className="font-normal text-muted"> ({t("ui.optional")})</span> : null}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="mt-1 text-[12.5px] font-medium text-[#b42318]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
type InputProps = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoComplete?: string;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email" | "search" | "url";
  describedBy?: string;
  maxLength?: number;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  name?: string;
  "aria-label"?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};
export function Input({ value, onChange, describedBy, className, type = "text", ...rest }: InputProps) {
  return <input {...rest} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} className={cx(inputCls, className)} />;
}
export function TextArea({
  value,
  onChange,
  describedBy,
  className,
  rows = 4,
  ...rest
}: { id?: string; value: string; onChange: (v: string) => void; describedBy?: string; className?: string; rows?: number; placeholder?: string; maxLength?: number; disabled?: boolean; "aria-label"?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void }) {
  return <textarea {...rest} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} className={cx(inputCls, "resize-y leading-relaxed", className)} />;
}
export function Select({
  value,
  onChange,
  options,
  describedBy,
  className,
  ...rest
}: { id?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; describedBy?: string; className?: string; disabled?: boolean; "aria-label"?: string }) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} className={cx(inputCls, "appearance-none bg-[length:16px] bg-[right_0.8rem_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: SELECT_ARROW }}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235d6773' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

/** A number typed with a comma or a dot. Keeps the text while typing; reports the parsed number (or null). */
export function NumInput({
  value,
  onChange,
  lang,
  suffix,
  describedBy,
  className,
  ...rest
}: { id?: string; value: number | null; onChange: (v: number | null) => void; lang: Lang; suffix?: string; describedBy?: string; className?: string; disabled?: boolean; placeholder?: string; "aria-label"?: string }) {
  const [text, setText] = useState(numText(value, lang));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(numText(value, lang));
    }
  }, [value, lang]);
  return (
    <div className={cx("relative", className)}>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        value={text}
        aria-describedby={describedBy}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          last.current = n;
          onChange(n);
        }}
        className={cx(inputCls, "tabular-nums", suffix ? "pr-16" : "")}
      />
      {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] text-muted">{suffix}</span> : null}
    </div>
  );
}

/** On/off switch with a visible label. */
export function Switch({ checked, onChange, label, hint, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-h` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-ink" : "bg-[#cfd5db]")}
      >
        <span aria-hidden className={cx("absolute h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")}>
          {checked ? <span className="absolute inset-1.5 rounded-full bg-sun" /> : null}
        </span>
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-[14px] font-semibold text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-h`} className="mt-0.5 text-[12.5px] leading-snug text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
export function Check({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink" aria-describedby={hint ? `${id}-h` : undefined} />
      <div>
        <label htmlFor={id} className="text-[14px] font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-h`} className="text-[12.5px] text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Tabs and filter chips ---------------- */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  size = "md"
}: {
  tabs: { key: K; label: React.ReactNode; count?: number }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, idx: number) {
    let n = -1;
    if (e.key === "ArrowRight") n = (idx + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n >= 0) {
      e.preventDefault();
      onChange(tabs[n].key);
      refs.current[n]?.focus();
    }
  }
  return (
    <div role="tablist" aria-label={label} className={cx("no-scrollbar flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((tb, idx) => {
        const on = tb.key === value;
        return (
          <button
            key={tb.key}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tb.key)}
            onKeyDown={(e) => onKey(e, idx)}
            className={cx(
              "relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 font-semibold whitespace-nowrap transition-colors",
              size === "sm" ? "px-2.5 py-2 text-[13px]" : "px-3 py-2.5 text-[14px]",
              on ? "border-sun-deep text-ink" : "border-transparent text-muted hover:text-ink"
            )}
          >
            {tb.label}
            {tb.count ? <Count n={tb.count} tone={on ? "sun" : "mist"} /> : null}
          </button>
        );
      })}
    </div>
  );
}
export function Chips<K extends string>({ options, value, onChange, label, className }: { options: { key: K; label: React.ReactNode; count?: number }[]; value: K; onChange: (k: K) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cx("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
              on ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-inset ring-line hover:ring-ink/30 hover:text-ink"
            )}
          >
            {o.label}
            {o.count != null ? <span className={cx("tabular-nums", on ? "text-white/70" : "text-muted")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Dialogs ---------------- */
/** A centred dialog with a title, body and footer buttons (Esc and the backdrop close it). */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const { t } = useT();
  return (
    <Modal open={open} onClose={onClose} label={title} closeLabel={t("ui.close")} size="md">
      <div className={cx("flex min-h-0 flex-1 flex-col", wide ? "" : "sm:mx-auto sm:w-full")}>
        <div className="px-6 pt-6 pb-2 sm:px-7">
          <h2 className="pr-12 font-display text-xl font-bold text-ink">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 sm:px-7">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-mist/50 px-6 py-4 sm:px-7">{footer}</div> : null}
      </div>
    </Modal>
  );
}

/** "Are you sure?" dialog. `onConfirm` may return a promise; the dialog closes when it resolves to anything but false. */
export function Confirm({
  open,
  onClose,
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  children,
  disabled
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const go = useCallback(async () => {
    setBusy(true);
    try {
      const r = await onConfirm();
      if (r !== false) onClose();
    } finally {
      setBusy(false);
    }
  }, [onConfirm, onClose]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant={danger ? "dark" : "primary"} busy={busy} disabled={disabled} onClick={go} className={danger ? "!bg-[#b42318] hover:!bg-[#912018]" : ""}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      {text ? <div className="text-[14.5px] leading-relaxed text-ink-soft">{text}</div> : null}
      {children ? <div className={text ? "mt-4" : ""}>{children}</div> : null}
    </Dialog>
  );
}

/** Wide panel from the right (full screen on phones). Esc closes it and focus stays inside. */
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => panel.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      // Dialogs opened from the drawer handle their own Esc.
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-drawer])')) return;
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        data-drawer
        aria-label={label}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-mist shadow-2xl outline-none sm:w-[min(1120px,calc(100vw-48px))] lg:w-[min(1120px,calc(100vw-160px))]"
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- Popover (menus) ---------------- */
/** Closes on outside click and Esc. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (ref.current?.querySelector("button") as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/* ---------------- Misc ---------------- */
export function Stars({ n, className }: { n: number; className?: string }) {
  const { t } = useT();
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-sun-deep", className)} role="img" aria-label={t("reviews.stars", { n })}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill={k <= n ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
        </svg>
      ))}
    </span>
  );
}
/** Key–value row list. */
export function KV({ items, className }: { items: { k: React.ReactNode; v: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {items.map((it, idx) => (
        <div key={idx} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="shrink-0 text-[13px] text-muted">{it.k}</dt>
          <dd className="min-w-0 text-right text-[14px] font-medium text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
/** Table wrapper: scrolls sideways on small screens. */
export function TableWrap({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)} role={label ? "region" : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      {children}
    </div>
  );
}
export const th = "px-3 py-2.5 text-left text-[12px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap first:pl-5 last:pr-5";
export const td = "px-3 py-2.5 align-top text-[14px] text-ink first:pl-5 last:pr-5";

/** Copy text to the clipboard with a short confirmation. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked */
    }
  }, []);
  return { copied, copy };
}

/** Width of an element, for charts and the map. */
export function useSize<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}
