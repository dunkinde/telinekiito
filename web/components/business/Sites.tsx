"use client";
// All of the company's sites: what needs attention, live status, the next delivery or pickup, and cost so far.
import { useMemo, useState } from "react";
import { bizOrders, type BizOrderSummary } from "@/lib/business";
import { useT } from "../office/context";
import { day, daysBetween, money } from "../office/format";
import { jobLabel } from "../office/i18n";
import { IOrders, IRight } from "../office/icons";
import { Async, Badge, Btn, Card, Chips, Empty, Input, Select, StatusBadge, cx } from "../office/ui";
import { useBiz, useBizLoad } from "./context";
import { go } from "./BizApp";

type Filter = "active" | "upcoming" | "ending" | "finished" | "all";
const ON_SITE = ["erected", "pickup_requested"];
const BEFORE = ["received", "confirmed", "loading", "en_route"];
/** Open on the first group that has sites: on site now, then coming up, then everything. */
const firstFilter = (all: BizOrderSummary[]): Filter => {
  const real = all.filter((o) => !o.example);
  if (real.some((o) => ON_SITE.includes(o.status))) return "active";
  if (real.some((o) => BEFORE.includes(o.status))) return "upcoming";
  return "all";
};

export function Sites() {
  const { t } = useT();
  const { me, canOrder } = useBiz();
  const st = useBizLoad(bizOrders, [], { poll: true });
  const [filter, setFilter] = useState<Filter | null>(null);
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink">{t("biz.sites.title")}</h1>
          <p className="text-[14px] text-muted">{t("biz.sites.sub", { name: me.account.name })}</p>
        </div>
        <p className="text-[12.5px] text-muted" aria-live="polite">
          {t("biz.live")}
        </p>
      </div>
      <Async state={st}>
        {(d) => <SitesBody all={d.orders} today={me.today} filter={filter ?? firstFilter(d.orders)} setFilter={setFilter} q={q} setQ={setQ} project={project} setProject={setProject} canOrder={canOrder} />}
      </Async>
    </div>
  );
}

function SitesBody({ all, today, filter, setFilter, q, setQ, project, setProject, canOrder }: { all: BizOrderSummary[]; today: string; filter: Filter; setFilter: (f: Filter) => void; q: string; setQ: (v: string) => void; project: string; setProject: (v: string) => void; canOrder: boolean }) {
  const { t, lang } = useT();
  const real = all.filter((o) => !o.example);
  const endingSoon = (o: BizOrderSummary) => ON_SITE.includes(o.status) && o.rentalEnd && daysBetween(today, o.rentalEnd) <= 7;
  const groups: Record<Filter, BizOrderSummary[]> = {
    active: real.filter((o) => ON_SITE.includes(o.status)),
    upcoming: real.filter((o) => BEFORE.includes(o.status)),
    ending: real.filter(endingSoon),
    finished: real.filter((o) => o.status === "dismantled" || o.status === "closed" || o.status === "cancelled"),
    all: real
  };
  const projects = useMemo(() => [...new Set(real.map((o) => o.project).filter(Boolean))].sort(), [real]);
  const words = q.trim().toLowerCase();
  const list = groups[filter]
    .filter((o) => !project || o.project === project)
    .filter((o) => !words || [o.ref, o.address, o.po, o.project, o.costCentre, o.orderedBy].join(" ").toLowerCase().includes(words))
    .sort((a, b) => (a.next?.date || "9999").localeCompare(b.next?.date || "9999") || b.createdAt.localeCompare(a.createdAt));
  const pending = real.reduce((s, o) => s + o.pendingChanges, 0);
  const costNow = groups.active.reduce((s, o) => s + o.costToDate, 0);

  const kpis = [
    { label: t("biz.kpi.onSite"), value: String(groups.active.length), f: "active" as Filter },
    { label: t("biz.kpi.upcoming"), value: String(groups.upcoming.length), f: "upcoming" as Filter },
    { label: t("biz.kpi.ending"), value: String(groups.ending.length), f: "ending" as Filter, warn: groups.ending.length > 0 },
    { label: t("biz.kpi.waiting"), value: String(pending), f: null, warn: pending > 0 }
  ];

  if (!real.length)
    return (
      <Card as="div">
        <Empty icon={<IOrders className="h-6 w-6" />} title={t("biz.sites.none")} text={t("biz.sites.noneText")} action={canOrder ? <Btn variant="primary" size="sm" onClick={() => go("#/new")}>{t("biz.nav.new")}</Btn> : undefined} />
      </Card>
    );

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label}>
            <button
              type="button"
              disabled={!k.f}
              onClick={() => k.f && setFilter(k.f)}
              className={cx("flex h-full w-full flex-col items-start rounded-2xl p-4 text-left ring-1 transition-colors", k.warn ? "bg-sun-soft ring-sun/40" : "bg-white ring-line", k.f ? "hover:ring-ink/25" : "cursor-default")}
            >
              <span className="font-display text-[1.6rem] leading-none font-extrabold text-ink">{k.value}</span>
              <span className="mt-1.5 text-[13px] font-medium text-ink-soft">{k.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {groups.active.length ? <p className="mt-3 text-[13px] text-muted">{t("biz.kpi.costNow", { v: money(costNow, lang, 0) })}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Chips
          label={t("biz.filter")}
          value={filter}
          onChange={setFilter}
          options={(["active", "upcoming", "ending", "finished", "all"] as Filter[]).map((f) => ({ key: f, label: t(`biz.f.${f}`), count: groups[f].length }))}
        />
        <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          {projects.length ? (
            <Select aria-label={t("biz.project")} value={project} onChange={setProject} options={[{ value: "", label: t("biz.allProjects") }, ...projects.map((p) => ({ value: p, label: p }))]} className="sm:w-52" />
          ) : null}
          <Input aria-label={t("biz.search")} value={q} onChange={setQ} placeholder={t("biz.searchPh")} className="sm:w-64" />
        </div>
      </div>

      {list.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {list.map((o) => (
            <li key={o.ref}>
              <SiteCard o={o} today={today} />
            </li>
          ))}
        </ul>
      ) : (
        <Card as="div" className="mt-4">
          <Empty title={t("biz.sites.noMatch")} />
        </Card>
      )}
    </>
  );
}

function SiteCard({ o, today }: { o: BizOrderSummary; today: string }) {
  const i = useT();
  const { t, lang } = i;
  const left = o.rentalEnd ? daysBetween(today, o.rentalEnd) : null;
  const n = o.next;
  const nextText = n
    ? t(n.kind === "delivery" ? (n.planned ? "biz.next.delivery" : "biz.next.deliveryAsked") : n.kind === "pickup" ? "biz.next.pickup" : "biz.next.rentalEnd", {
        date: day(n.date, lang) + (n.time ? ` ${n.time}` : "")
      })
    : null;
  return (
    <a href={`#/sites/${o.ref}`} className="group flex h-full flex-col rounded-2xl bg-white p-4 ring-1 ring-line transition-shadow hover:shadow-lg hover:shadow-ink/5 hover:ring-ink/20 focus-visible:outline-2 focus-visible:outline-sun sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[16.5px] font-bold text-ink">{o.address}</p>
          <p className="text-[12.5px] text-muted">
            <span className="font-mono">{o.ref}</span> · {jobLabel(i, o.jobType)} · {o.area} m²
          </p>
        </div>
        <StatusBadge status={o.status} className="shrink-0" />
      </div>
      {o.project || o.po ? (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {o.project ? <Badge tone="blue">{o.project}</Badge> : null}
          {o.po ? <Badge tone="neutral">{t("biz.poShort", { po: o.po })}</Badge> : null}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-xl bg-mist px-3 py-2">
          <p className="text-[11.5px] text-muted">{t("biz.next")}</p>
          <p className="font-semibold text-ink">{nextText || "–"}</p>
        </div>
        <div className="rounded-xl bg-mist px-3 py-2">
          <p className="text-[11.5px] text-muted">{ON_SITE.includes(o.status) ? t("biz.costToDate") : t("biz.price")}</p>
          <p className="font-semibold text-ink tabular-nums">{money(ON_SITE.includes(o.status) ? o.costToDate : o.total, lang, 0)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        {ON_SITE.includes(o.status) && left != null ? (
          <Badge tone={left < 0 ? "red" : left <= 7 ? "orange" : "neutral"}>{left < 0 ? t("biz.overdue", { n: -left }) : t("biz.daysLeft", { n: left })}</Badge>
        ) : null}
        {o.pendingChanges ? <Badge tone="sun">{t("biz.changeWaiting")}</Badge> : null}
        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-ink-soft group-hover:text-ink">
          {t("biz.open")} <IRight className="h-4 w-4" />
        </span>
      </div>
    </a>
  );
}
