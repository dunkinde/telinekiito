"use client";
// Reports: margins (revenue minus crew hours, truck trips and lost parts, per job and per delivery zone) and the sales funnel.
import { useMemo, useState } from "react";
import { getMargins, type MarginRow } from "@/lib/platform";
import { useLoad, useOffice, useT } from "./context";
import { money, money0, number } from "./format";
import { statusLabel } from "./i18n";
import { IReports, ISettings } from "./icons";
import { RefLink } from "./bits";
import { FunnelReport } from "./Funnel";
import { Async, Badge, Btn, Callout, Card, CardHead, Empty, TableWrap, Tabs, cx, td, th } from "./ui";

type SortKey = "ref" | "revenue" | "margin" | "marginPct" | "hours";
const TABS = ["margins", "funnel"] as const;
type Tab = (typeof TABS)[number];

export function Reports() {
  const { t } = useT();
  const { route, setParams } = useOffice();
  const tab: Tab = route.params.tab === "funnel" ? "funnel" : "margins";
  return (
    <>
      <Tabs className="mb-4" label={t("nav.reports")} value={tab} onChange={(k) => setParams({ tab: k === "margins" ? null : k })} tabs={TABS.map((k) => ({ key: k, label: t(`rep.tab.${k}`) }))} />
      {tab === "funnel" ? <FunnelReport /> : <MarginReport />}
    </>
  );
}

function MarginReport() {
  const i = useT();
  const { t, lang } = i;
  const { nav } = useOffice();
  const st = useLoad(getMargins, [], { poll: true });
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "margin", desc: true });
  const rows = useMemo(() => {
    const r = [...(st.data?.rows || [])];
    r.sort((a, b) => {
      const av = a[sort.k] ?? -Infinity, bv = b[sort.k] ?? -Infinity;
      const c = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sort.desc ? -c : c;
    });
    return r;
  }, [st.data, sort]);
  const head = (k: SortKey, label: string, right = true) => (
    <th scope="col" className={cx(th, right && "text-right")} aria-sort={sort.k === k ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : true }))} className="inline-flex items-center gap-1 uppercase hover:text-ink">
        {label}
        <span aria-hidden className={sort.k === k ? "text-ink" : "opacity-30"}>
          {sort.k === k && !sort.desc ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
  const pct = (v: number | null) => (v == null ? "–" : `${v} %`);
  const pctTone = (v: number | null) => (v == null ? "" : v < 0 ? "text-[#b42318]" : v < 20 ? "text-[#a4470a]" : "text-[#17663a]");

  return (
    <Async state={st}>
      {(d) => {
        const tot = d.rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, margin: a.margin + r.margin, hours: a.hours + r.hours }), { revenue: 0, margin: 0, hours: 0 });
        const noHours = d.rows.filter((r) => !r.hoursLogged).length;
        return (
          <div className="space-y-4 lg:space-y-5">
            <Callout
              tone="info"
              icon={<ISettings className="h-5 w-5" />}
              title={t("rep.costs", { hour: money(d.costs.crewHourCost, lang), trip: money(d.costs.truckTripCost, lang) })}
            >
              <p>{t("rep.costsText")}</p>
              <Btn size="xs" variant="light" className="mt-2" onClick={() => nav("settings", { tab: "ops" })}>
                {t("rep.changeCosts")}
              </Btn>
            </Callout>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              {[
                { k: t("rep.jobs"), v: String(d.rows.length) },
                { k: t("rep.revenue"), v: money0(tot.revenue, lang) },
                { k: t("rep.margin"), v: money0(tot.margin, lang), s: tot.revenue ? `${Math.round((tot.margin / tot.revenue) * 100)} %` : "–" },
                { k: t("rep.hours"), v: `${number(tot.hours, lang, 1)} h`, s: noHours ? t("rep.noHoursN", { n: noHours }) : undefined }
              ].map((x) => (
                <div key={x.k} className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-line">
                  <p className="text-[12.5px] font-semibold text-muted">{x.k}</p>
                  <p className="mt-1 font-display text-[24px] leading-none font-extrabold text-ink tabular-nums">{x.v}</p>
                  {x.s ? <p className="mt-1.5 text-[12.5px] text-muted">{x.s}</p> : null}
                </div>
              ))}
            </div>

            <Card aria-labelledby="rep-zones">
              <CardHead id="rep-zones" title={t("rep.byZone")} sub={t("rep.byZoneSub")} />
              <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
                {d.byZone.map((z) => (
                  <div key={z.zone} className="rounded-xl bg-mist px-4 py-3">
                    <p className="text-[13px] font-semibold text-ink">{t("rep.zone", { z: z.zone })}</p>
                    <p className="text-[12px] text-muted">{t(`rep.zoneName.${z.zone}`)}</p>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-[12.5px]">
                      <div>
                        <dt className="text-muted">{t("rep.jobs")}</dt>
                        <dd className="font-semibold tabular-nums">{z.jobs}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t("rep.revenueShort")}</dt>
                        <dd className="font-semibold tabular-nums">{money0(z.revenue, lang)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t("rep.marginShort")}</dt>
                        <dd className={cx("font-semibold tabular-nums", pctTone(z.marginPct))}>{pct(z.marginPct)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </Card>

            <Card aria-labelledby="rep-jobs">
              <CardHead id="rep-jobs" title={t("rep.perJob")} sub={t("rep.perJobSub")} />
              {rows.length ? (
                <TableWrap>
                  <table className="w-full min-w-[1000px] border-collapse">
                    <caption className="sr-only">{t("rep.perJob")}</caption>
                    <thead>
                      <tr className="border-y border-line bg-mist/50">
                        {head("ref", t("rep.col.job"), false)}
                        {head("revenue", t("rep.col.revenue"))}
                        {head("hours", t("rep.col.hours"))}
                        <th scope="col" className={cx(th, "text-right")}>
                          {t("rep.col.crew")}
                        </th>
                        <th scope="col" className={cx(th, "text-right")}>
                          {t("rep.col.transport")}
                        </th>
                        <th scope="col" className={cx(th, "text-right")}>
                          {t("rep.col.damages")}
                        </th>
                        {head("margin", t("rep.col.margin"))}
                        {head("marginPct", t("rep.col.pct"))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r: MarginRow) => (
                        <tr key={r.ref} className="border-b border-line last:border-0">
                          <td className={td}>
                            <RefLink refNo={r.ref} />
                            <p className="max-w-[260px] truncate text-[12.5px] text-muted">
                              {r.address} · {t("rep.zone", { z: r.zone })} · {number(r.area, lang, 0)} m²
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge tone="neutral">{statusLabel(i, r.status)}</Badge>
                              {!r.invoiced ? <Badge tone="sun">{t("rep.estimate")}</Badge> : null}
                              {!r.hoursLogged ? <Badge tone="orange">{t("rep.noHours")}</Badge> : null}
                            </div>
                          </td>
                          <td className={cx(td, "text-right tabular-nums")}>{money(r.revenue, lang)}</td>
                          <td className={cx(td, "text-right tabular-nums")}>{number(r.hours, lang, 1)}</td>
                          <td className={cx(td, "text-right tabular-nums")}>{money(r.crewCost, lang)}</td>
                          <td className={cx(td, "text-right tabular-nums")}>{money(r.transportCost, lang)}</td>
                          <td className={cx(td, "text-right tabular-nums")}>{r.damages ? money(r.damages, lang) : "–"}</td>
                          <td className={cx(td, "text-right font-semibold tabular-nums", r.margin < 0 && "text-[#b42318]")}>{money(r.margin, lang)}</td>
                          <td className={cx(td, "text-right font-semibold tabular-nums", pctTone(r.marginPct))}>{pct(r.marginPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ) : (
                <Empty icon={<IReports className="h-6 w-6" />} title={t("rep.none")} text={t("rep.noneText")} />
              )}
              <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">{t("rep.note")}</p>
            </Card>
          </div>
        );
      }}
    </Async>
  );
}
