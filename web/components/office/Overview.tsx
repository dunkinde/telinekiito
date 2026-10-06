"use client";
// Overview: key numbers and charts for the head of company; today's work, approvals and alerts for everyone.
import { getCalendar, getDashboard, getJobs, markAlertsRead, type Dashboard } from "@/lib/platform";
import { useOffice, useLoad, useT, type Section } from "./context";
import { ago, day, isoWeek, money0, moneyShort, monthLabel, number } from "./format";
import { alertText, alertTypeLabel } from "./i18n";
import { IApprove, ICalendar, IMessages, IOrders, IRight, IWarn } from "./icons";
import { Bars, Legend, SERIES } from "./charts";
import { JobRow, RefLink } from "./bits";
import { Async, Badge, Card, CardHead, Empty, cx } from "./ui";

function Kpi({ label, value, sub, hint, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hint?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-line" title={hint}>
      <p className="truncate text-[12.5px] font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-[26px] leading-none font-extrabold tracking-[-0.01em] text-ink tabular-nums">{value}</p>
      {sub ? <p className={cx("mt-1.5 truncate text-[12.5px]", tone === "up" ? "text-[#17663a]" : tone === "down" ? "text-[#b42318]" : "text-muted")}>{sub}</p> : null}
    </div>
  );
}

function Attention() {
  const { t } = useT();
  const { pending, alerts, orders, nav } = useOffice();
  const real = (orders || []).filter((o) => !o.example);
  const items: { key: string; n: number; label: string; section: Section; icon: React.ReactNode; params?: Record<string, string> }[] = [
    { key: "new", n: real.filter((o) => o.status === "received").length, label: t("ov.att.new"), section: "orders", icon: <IOrders className="h-[18px] w-[18px]" />, params: { status: "received" } },
    {
      key: "plan",
      n: real.filter((o) => {
        const a = o.assignment || {};
        return ((o.status === "received" || o.status === "confirmed") && !(a.date && a.crewId)) || (o.status === "pickup_requested" && !a.pickupDate);
      }).length,
      label: t("ov.att.plan"),
      section: "calendar",
      icon: <ICalendar className="h-[18px] w-[18px]" />
    },
    { key: "changes", n: (pending || []).length, label: t("ov.att.changes"), section: "approvals", icon: <IApprove className="h-[18px] w-[18px]" /> },
    { key: "alerts", n: (alerts || []).filter((a) => !a.read).length, label: t("ov.att.alerts"), section: "messages", icon: <IMessages className="h-[18px] w-[18px]" /> }
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4" aria-label={t("ov.attention")}>
      {items.map((it) => (
        <li key={it.key}>
          <button
            type="button"
            onClick={() => nav(it.section, it.params)}
            className={cx(
              "group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition-colors",
              it.n ? "bg-sun-soft/60 ring-[#f3dc8a] hover:bg-sun-soft" : "bg-white ring-line hover:ring-ink/25"
            )}
          >
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", it.n ? "bg-sun text-ink" : "bg-mist text-muted")}>{it.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[20px] leading-none font-extrabold text-ink tabular-nums">{it.n}</span>
              <span className="mt-1 block text-[12.5px] leading-snug font-medium text-ink-soft">{it.label}</span>
            </span>
            <IRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TodayCard() {
  const { t, lang } = useT();
  const { today, nav } = useOffice();
  const cal = useLoad(() => getCalendar(today, 1), [today], { poll: true });
  const jobs = useLoad(() => getJobs({ from: today, to: today, all: true }), [today], { poll: true });
  const visits = jobs.data?.visits || [];
  return (
    <Card aria-labelledby="ov-today">
      <CardHead
        id="ov-today"
        title={t("ov.today", { date: day(today, lang) })}
        actions={
          <button type="button" onClick={() => nav("calendar")} className="text-[13px] font-semibold text-ink-soft hover:text-ink hover:underline">
            {t("ov.toCalendar")} →
          </button>
        }
      />
      <Async state={cal} rows={3}>
        {(d) =>
          d.jobs.length ? (
            <ul className="px-2 pb-2">
              {d.jobs.map((j) => (
                <JobRow key={j.ref + j.kind} job={j} />
              ))}
            </ul>
          ) : (
            <Empty icon={<ICalendar className="h-6 w-6" />} title={t("ov.noJobs")} text={t("ov.noJobsText")} className="py-7" />
          )
        }
      </Async>
      {visits.length ? (
        <div className="border-t border-line px-5 py-3">
          <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{t("ov.visits")}</p>
          <ul className="mt-1.5 space-y-1.5">
            {visits.map((v) => (
              <li key={v.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                <RefLink refNo={v.ref} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{v.address}</span>
                {v.overdue ? (
                  <Badge tone="red" dot>
                    {t("ov.visitOverdue", { date: day(v.due, lang) })}
                  </Badge>
                ) : (
                  <Badge tone="sun" dot>
                    {t("ov.visitDue", { date: day(v.due, lang) })}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function AlertsCard() {
  const i = useT();
  const { t, lang } = i;
  const { alerts, openOrder, nav, refresh } = useOffice();
  const list = (alerts || []).slice(0, 6);
  return (
    <Card aria-labelledby="ov-alerts">
      <CardHead
        id="ov-alerts"
        title={t("ov.latestAlerts")}
        actions={
          <button type="button" onClick={() => nav("messages")} className="text-[13px] font-semibold text-ink-soft hover:text-ink hover:underline">
            {t("ov.allAlerts")} →
          </button>
        }
      />
      {list.length ? (
        <ul className="px-2 pb-2">
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  if (!a.read) markAlertsRead([a.id]).then(refresh, () => {});
                  if (a.ref) openOrder(a.ref);
                  else nav("messages", a.type === "contact" ? { tab: "contact" } : {});
                }}
                className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-mist"
              >
                <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.read ? "bg-line" : "bg-signal")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{alertTypeLabel(i, a.type)}</span>
                    <span className="shrink-0 text-[12px] text-muted">{ago(a.createdAt, lang)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13.5px] text-ink-soft">{alertText(i, a)}</span>
                  {!a.read ? <span className="sr-only">{t("alerts.unread")}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={t("alerts.none")} className="py-7" />
      )}
    </Card>
  );
}

function OwnerNumbers({ d }: { d: Dashboard }) {
  const { t, lang } = useT();
  const k = d.kpis;
  const diff = k.ordersThisWeek - k.ordersLastWeek;
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      <Kpi
        label={t("kpi.ordersWeek")}
        value={k.ordersThisWeek}
        sub={t("kpi.lastWeek", { n: k.ordersLastWeek, diff: diff > 0 ? `+${diff}` : String(diff) })}
        tone={diff > 0 ? "up" : diff < 0 ? "down" : undefined}
      />
      <Kpi label={t("kpi.booked")} value={money0(k.bookedThisMonth, lang)} sub={t("kpi.bookedSub")} />
      <Kpi label={t("kpi.invoiced")} value={money0(k.invoicedThisMonth, lang)} sub={t("kpi.invoicedSub")} />
      <Kpi label={t("kpi.outstanding")} value={money0(k.outstanding, lang)} sub={t("kpi.outstandingSub")} />
      <Kpi label={t("kpi.m2")} value={`${number(k.m2OnRent, lang, 0)} m²`} sub={t("kpi.sites", { n: k.activeSites })} />
      <Kpi label={t("kpi.today")} value={`${k.deliveriesToday} / ${k.pickupsToday}`} sub={t("kpi.crews", { busy: k.crewsBusy, total: k.crewsTotal })} />
      <Kpi
        label={t("kpi.conversion")}
        value={k.quoteToOrderPct == null ? "–" : `${k.quoteToOrderPct} %`}
        sub={k.quoteToOrderPct == null ? t("kpi.conversionNone") : t("kpi.conversionSub", { orders: k.orders30, lookups: k.lookups30 })}
        hint={t("kpi.conversionHint")}
      />
      <Kpi
        label={t("kpi.lead")}
        value={k.avgDaysToErected == null ? "–" : t("kpi.days", { n: number(k.avgDaysToErected, lang, 1) })}
        sub={k.avgDaysToErected == null ? t("kpi.leadNone") : t("kpi.leadSub")}
      />
    </div>
  );
}

function Charts({ d }: { d: Dashboard }) {
  const { t, lang } = useT();
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card aria-labelledby="ov-weeks">
        <CardHead id="ov-weeks" title={t("ov.chartWeeks")} sub={t("ov.chartWeeksSub")} />
        <div className="px-4 pb-4">
          <Bars
            label={t("ov.chartWeeks")}
            height={190}
            highlightLast
            series={[{ name: t("ov.orders"), color: SERIES[0] }]}
            fmt={(v) => number(v, lang, 0)}
            groups={d.weeks.map((w) => ({ label: `${lang === "fi" ? "vk" : lang === "ru" ? "нед." : "w"} ${isoWeek(w.week)}`, title: t("ov.weekOf", { n: isoWeek(w.week), date: day(w.week, lang, { weekday: false }) }), values: [w.orders] }))}
          />
        </div>
      </Card>
      <Card aria-labelledby="ov-months">
        <CardHead
          id="ov-months"
          title={t("ov.chartMonths")}
          sub={t("ov.chartMonthsSub")}
          actions={
            <Legend
              items={[
                { name: t("ov.booked"), color: SERIES[0] },
                { name: t("ov.invoicedS"), color: SERIES[1] }
              ]}
            />
          }
        />
        <div className="px-4 pb-4">
          <Bars
            label={t("ov.chartMonths")}
            height={190}
            series={[
              { name: t("ov.booked"), color: SERIES[0] },
              { name: t("ov.invoicedS"), color: SERIES[1] }
            ]}
            fmt={(v) => money0(v, lang)}
            axisFmt={(v) => moneyShort(v, lang)}
            groups={d.months.map((m) => ({ label: monthLabel(m.month, lang), title: monthLabel(m.month, lang, true), values: [m.booked, m.invoiced] }))}
          />
        </div>
      </Card>
    </div>
  );
}

export function Overview() {
  const { t } = useT();
  const { owner, orders } = useOffice();
  const dash = useLoad(() => (owner ? getDashboard() : Promise.resolve(null)), [owner], { poll: true });
  const examples = (orders || []).filter((o) => o.example).length;
  return (
    <div className="space-y-4 lg:space-y-5">
      <Attention />
      {owner ? <Async state={dash}>{(d) => (d ? <OwnerNumbers d={d} /> : null)}</Async> : null}
      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TodayCard />
        <AlertsCard />
      </div>
      {owner && dash.data ? <Charts d={dash.data} /> : null}
      {examples ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <IWarn className="h-4 w-4" />
          {t("ov.examplesNote", { n: examples })}
        </p>
      ) : null}
    </div>
  );
}
