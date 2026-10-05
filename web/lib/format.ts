import type { Lang } from "./i18n";

// Finnish number style in both languages (space thousands, comma decimals), as in the quotes.
const eur0 = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });

export const eur = (n: number) => eur0.format(Math.round(n));
export const num = (n: number) => num1.format(n);
export const num2d = (n: number) => num2.format(n);

/** "2026-10-08" -> "to 8.10." (fi) or "Thu 8 Oct" (en). */
export function fmtDate(iso: string | undefined | null, lang: Lang): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return lang === "fi"
    ? date.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" })
    : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function fmtStamp(ts: string, lang: Lang): string {
  return new Date(ts).toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", {
    day: "numeric",
    month: lang === "fi" ? "numeric" : "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export const digits = (s: string) => String(s || "").replace(/\D/g, "");
