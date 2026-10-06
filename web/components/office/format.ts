// Dates, money and numbers for the office, in the chosen language. Times are shown in Helsinki time.
import type { Lang } from "./i18n";

export const TZ = "Europe/Helsinki";
const loc = (l: Lang) => (l === "fi" ? "fi-FI" : l === "ru" ? "ru-RU" : "en-GB");

const cache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, opts: Intl.NumberFormatOptions) {
  const k = lang + JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(loc(lang), opts);
    cache.set(k, f);
  }
  return f;
}

/** 1 234,56 € (fi) or €1,234.56 (en). */
export const money = (n: number | null | undefined, lang: Lang, decimals = 2) =>
  n == null || !Number.isFinite(Number(n)) ? "–" : nf(lang, { style: "currency", currency: "EUR", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n));
/** Whole euros, for KPIs and charts. */
export const money0 = (n: number | null | undefined, lang: Lang) => money(n, lang, 0);
export const number = (n: number | null | undefined, lang: Lang, max = 1) =>
  n == null || !Number.isFinite(Number(n)) ? "–" : nf(lang, { maximumFractionDigits: max }).format(Number(n));
/** Short euro amounts for chart axes: 12 k€. */
export function moneyShort(n: number, lang: Lang) {
  if (Math.abs(n) >= 1000) return `${number(n / 1000, lang, n >= 10000 ? 0 : 1)} k€`;
  return `${number(n, lang, 0)} €`;
}

const dateOf = (iso: string) => new Date(String(iso).slice(0, 10) + "T12:00:00Z");

/** A calendar day (YYYY-MM-DD): "ma 5.10." / "Mon 5 Oct"; with year: "ma 5.10.2026" / "Mon 5 Oct 2026". */
export function day(iso: string | null | undefined, lang: Lang, opts: { weekday?: boolean; year?: boolean } = {}) {
  if (!iso) return "–";
  const { weekday = true, year = false } = opts;
  const d = dateOf(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  if (lang === "fi") {
    const w = weekday ? d.toLocaleDateString("fi-FI", { weekday: "short", timeZone: "UTC" }) + " " : "";
    return `${w}${d.getUTCDate()}.${d.getUTCMonth() + 1}.${year ? d.getUTCFullYear() : ""}`;
  }
  return d.toLocaleDateString(loc(lang), { weekday: weekday ? "short" : undefined, day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone: "UTC" });
}
/** Weekday name alone: "ma" / "Mon". */
export const weekday = (iso: string, lang: Lang, long = false) => dateOf(iso).toLocaleDateString(loc(lang), { weekday: long ? "long" : "short", timeZone: "UTC" });
/** Day and month only: "5.10." / "5 Oct". */
export const dayMonth = (iso: string, lang: Lang) => day(iso, lang, { weekday: false });
/** Month label for "2026-10": "loka" / "Oct" (with year when asked). */
export function monthLabel(ym: string, lang: Lang, withYear = false) {
  const d = new Date(ym + "-15T12:00:00Z");
  const s = d.toLocaleDateString(loc(lang), { month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
  return s.replace(/\.$/, "");
}

/** A moment (ISO timestamp) in Helsinki time: "5.10. klo 14.05" / "5 Oct, 14:05". */
export function dateTime(ts: string | null | undefined, lang: Lang, opts: { year?: boolean } = {}) {
  if (!ts) return "–";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const date = d.toLocaleDateString(loc(lang), { day: "numeric", month: lang === "fi" ? "numeric" : "short", year: opts.year ? "numeric" : undefined, timeZone: TZ });
  const time = d.toLocaleTimeString(loc(lang), { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return lang === "fi" ? `${date.endsWith(".") || opts.year ? date : date + "."} klo ${time}` : `${date}, ${time}`;
}
export const timeOf = (ts: string, lang: Lang) => new Date(ts).toLocaleTimeString(loc(lang), { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** "5 min ago" / "5 min sitten", or the date for older moments. */
export function ago(ts: string | null | undefined, lang: Lang, now = Date.now()) {
  if (!ts) return "–";
  const diff = (Date.parse(ts) - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(loc(lang), { numeric: "auto", style: "short" });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), "second");
  if (a < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (a < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return dateTime(ts, lang);
}

/** ISO week number of a day (Finnish calendars show weeks). */
export function isoWeek(iso: string) {
  const d = dateOf(iso);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - first.getTime()) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

/** Days from a to b (YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + "T00:00:00Z") - Date.parse(a.slice(0, 10) + "T00:00:00Z")) / 864e5);

/** Hours and minutes from minutes: "3 h 05 min". */
export function hoursMin(minutes: number, lang: Lang) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const [hu, mu] = lang === "ru" ? ["ч", "мин"] : ["h", "min"];
  if (!h) return `${r} ${mu}`;
  return r ? `${h} ${hu} ${String(r).padStart(2, "0")} ${mu}` : `${h} ${hu}`;
}

/** Parse a number typed with a comma or a dot. Empty → null. */
export function parseNum(s: string): number | null {
  const v = String(s ?? "").trim().replace(/\s/g, "").replace(",", ".").replace("−", "-");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** A number shown in an input, in the language's style (comma decimals in Finnish and Russian). */
export const numText = (n: number | null | undefined, lang: Lang) => (n == null || !Number.isFinite(n) ? "" : lang === "en" ? String(n) : String(n).replace(".", ","));

/** Phone link: "040 123 4567" → "tel:+358401234567". */
export function telHref(phone: string) {
  let d = String(phone || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  else if (d.startsWith("0")) d = "+358" + d.slice(1);
  return `tel:${d}`;
}

export const initials = (name: string) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
