"use client";
// A price change the office sent to the customer after the order (layout, scaffold system, a size found on site):
// the old and the new price line by line. Used on the office's order page and in the business portal, where the
// company accepts or declines it.
import type { PriceChange } from "@/lib/api";
import { useT } from "./context";
import { dateTime, money } from "./format";
import { lineText } from "./i18n";
import { Badge, cx } from "./ui";

export const PC_TONE = { pending: "sun", accepted: "green", declined: "red", replaced: "neutral", withdrawn: "neutral", outdated: "neutral" } as const;

export function PriceChangeBadge({ pc }: { pc: PriceChange }) {
  const { t } = useT();
  return <Badge tone={PC_TONE[pc.status]}>{t(`pc.status.${pc.status}`)}</Badge>;
}

/** Old → new total, the reason, and every price line with both amounts (changed lines stand out). */
export function PriceCompare({ pc, className }: { pc: PriceChange; className?: string }) {
  const i = useT();
  const { t, lang } = i;
  const keys = [...new Set([...pc.before.quote.lines.map((l) => l.key), ...pc.after.quote.lines.map((l) => l.key)])];
  const rows = keys.map((k) => {
    const b = pc.before.quote.lines.find((l) => l.key === k);
    const a = pc.after.quote.lines.find((l) => l.key === k);
    return { k, label: lineText(i, (a || b)!, a ? pc.after.quote : pc.before.quote), before: b?.amount, after: a?.amount };
  });
  const diff = pc.after.total - pc.before.total;
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-mist px-3.5 py-2.5">
          <p className="text-[12px] text-muted">{t("pc.old")}</p>
          <p className="font-display text-[1.25rem] font-bold tabular-nums text-ink-soft">{money(pc.before.total, lang)}</p>
        </div>
        <div className="rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-line">
          <p className="text-[12px] text-muted">{t("pc.new")}</p>
          <p className="font-display text-[1.25rem] font-bold tabular-nums text-ink">
            {money(pc.after.total, lang)}{" "}
            <span className={cx("text-[13px]", diff > 0 ? "text-[#b42318]" : "text-[#17663a]")}>
              {diff > 0 ? "+" : "−"}
              {money(Math.abs(diff), lang)}
            </span>
          </p>
        </div>
      </div>
      {pc.reason ? (
        <p className="mt-2.5 text-[13.5px] text-ink-soft">
          <b className="text-ink">{t("pc.reason")}:</b> {pc.reason}
        </p>
      ) : null}
      <table className="mt-3 w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-[12px] text-muted">
            <th className="py-1 text-left font-medium">{t("pc.line")}</th>
            <th className="py-1 text-right font-medium">{t("pc.old")}</th>
            <th className="py-1 text-right font-medium">{t("pc.new")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={r.before === r.after ? "text-muted" : "font-semibold text-ink"}>
              <td className="py-1 pr-2">{r.label}</td>
              <td className="py-1 text-right">{r.before === undefined ? "–" : money(r.before, lang)}</td>
              <td className="py-1 text-right">{r.after === undefined ? "–" : money(r.after, lang)}</td>
            </tr>
          ))}
          <tr className="border-t border-line text-[12px] text-muted">
            <td className="py-1">{t("pc.vat")}</td>
            <td className="py-1 text-right">{money(pc.before.quote.vat, lang)}</td>
            <td className="py-1 text-right">{money(pc.after.quote.vat, lang)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Who sent it and when, and how it ended. */
export function PriceChangeMeta({ pc }: { pc: PriceChange }) {
  const { t, tk, lang } = useT();
  return (
    <p className="text-[12.5px] text-muted">
      {t("pc.sent", { by: pc.by || "–", at: dateTime(pc.at, lang) })}
      {pc.decidedAt ? ` · ${tk(`pc.outcome.${pc.status}`, { by: pc.decidedBy || "–", at: dateTime(pc.decidedAt, lang) })}` : ""}
      {pc.note ? ` · “${pc.note}”` : ""}
    </p>
  );
}
