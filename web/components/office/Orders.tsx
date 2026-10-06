"use client";
// Orders: search, status filter and the list. Clicking an order opens its panel.
import { useMemo, useState } from "react";
import { ORDER_FLOW, type FullOrder, type OrderStatus } from "@/lib/platform";
import { IconSearch } from "../ui/Icons";
import { useOffice, useT } from "./context";
import { day, money, number } from "./format";
import { jobLabel, statusLabel, urgShort } from "./i18n";
import { IMessages, IOrders } from "./icons";
import { CrewChip } from "./bits";
import { Badge, Card, Chips, Empty, ExampleBadge, Loading, Select, StatusBadge, TableWrap, Toolbar, cx, inputCls, td, th } from "./ui";

type Filter = "open" | "all" | OrderStatus;
const STATUSES: OrderStatus[] = [...ORDER_FLOW, "cancelled"];
const digitsOf = (s: string) => String(s || "").replace(/\D/g, "");

function matches(o: FullOrder, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  const d = digitsOf(q);
  return (
    o.ref.toLowerCase().includes(s) ||
    o.customer.name.toLowerCase().includes(s) ||
    o.site.address.toLowerCase().includes(s) ||
    (o.customer.email || "").toLowerCase().includes(s) ||
    (d.length >= 3 && digitsOf(o.customer.phone).includes(d.replace(/^358/, "0")))
  );
}

export function OrderFlags({ o }: { o: FullOrder }) {
  const { t } = useT();
  const last = o.messages && o.messages.length ? o.messages[o.messages.length - 1] : null;
  return (
    <>
      {o.example ? <ExampleBadge /> : null}
      {o.pendingChanges ? (
        <Badge tone="orange" dot>
          {t("orders.pendingChange")}
        </Badge>
      ) : null}
      {last && last.from === "customer" ? (
        <Badge tone="blue">
          <span className="inline-flex items-center gap-1">
            <IMessages className="h-3.5 w-3.5" />
            {t("orders.customerWrote")}
          </span>
        </Badge>
      ) : null}
    </>
  );
}

export function Orders() {
  const i = useT();
  const { t, lang } = i;
  const { orders, crewById, openOrder, route, setParams } = useOffice();
  const filter = (route.params.status as Filter) || "open";
  const [q, setQ] = useState(route.params.q || "");
  const [sort, setSort] = useState<"new" | "start">("new");
  const [limit, setLimit] = useState(60);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, open: 0 };
    for (const o of orders || []) {
      c.all++;
      c[o.status] = (c[o.status] || 0) + 1;
      if (o.status !== "closed" && o.status !== "cancelled") c.open++;
    }
    return c;
  }, [orders]);

  const list = useMemo(() => {
    const out = (orders || []).filter((o) => (filter === "all" ? true : filter === "open" ? o.status !== "closed" && o.status !== "cancelled" : o.status === filter)).filter((o) => matches(o, q.trim()));
    if (sort === "new") out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else out.sort((a, b) => ((a.assignment?.date || a.schedule.start) + (a.assignment?.time || "")).localeCompare((b.assignment?.date || b.schedule.start) + (b.assignment?.time || "")));
    return out;
  }, [orders, filter, q, sort]);

  const chips: { key: Filter; label: string; count?: number }[] = [
    { key: "open", label: t("orders.f.open"), count: counts.open || 0 },
    ...STATUSES.filter((s) => counts[s] || s === "received" || s === "cancelled").map((s) => ({ key: s as Filter, label: statusLabel(i, s), count: counts[s] || 0 })),
    { key: "all", label: t("orders.f.all"), count: counts.all || 0 }
  ];

  return (
    <div>
      <Toolbar className="items-start justify-between">
        <div className="relative w-full sm:w-[340px]">
          <label htmlFor="order-search" className="sr-only">
            {t("orders.search")}
          </label>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
          <input
            id="order-search"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(60);
            }}
            placeholder={t("orders.searchPh")}
            className={cx(inputCls, "pl-10")}
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="order-sort" className="text-[13px] font-medium text-muted">
            {t("orders.sort")}
          </label>
          <Select
            id="order-sort"
            className="!w-auto !py-2"
            value={sort}
            onChange={(v) => setSort(v as "new" | "start")}
            options={[
              { value: "new", label: t("orders.sortNew") },
              { value: "start", label: t("orders.sortStart") }
            ]}
          />
        </div>
      </Toolbar>
      <Chips
        className="mb-4"
        label={t("orders.filter")}
        options={chips}
        value={filter}
        onChange={(k) => {
          setParams({ status: k === "open" ? null : k });
          setLimit(60);
        }}
      />

      <Card as="div">
        {!orders ? (
          <Loading rows={6} />
        ) : !list.length ? (
          <Empty icon={<IOrders className="h-6 w-6" />} title={q ? t("orders.noMatch") : t("orders.none")} text={q ? t("orders.noMatchText") : t("orders.noneText")} />
        ) : (
          <>
            {/* Table on wider screens */}
            <TableWrap className="hidden md:block">
              <table className="w-full min-w-[820px] table-fixed border-collapse">
                <caption className="sr-only">{t("orders.caption", { n: list.length })}</caption>
                <colgroup>
                  <col className="w-[172px]" />
                  <col className="w-[19%]" />
                  <col />
                  <col className="w-[160px]" />
                  <col className="w-[148px]" />
                  <col className="w-[112px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={th}>
                      {t("orders.col.ref")}
                    </th>
                    <th scope="col" className={th}>
                      {t("orders.col.customer")}
                    </th>
                    <th scope="col" className={th}>
                      {t("orders.col.site")}
                    </th>
                    <th scope="col" className={th}>
                      {t("orders.col.schedule")}
                    </th>
                    <th scope="col" className={th}>
                      {t("orders.col.status")}
                    </th>
                    <th scope="col" className={cx(th, "text-right")}>
                      {t("orders.col.total")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, limit).map((o) => {
                    const a = o.assignment || {};
                    const crew = crewById(a.crewId);
                    return (
                      <tr key={o.ref} onClick={() => openOrder(o.ref)} className={cx("cursor-pointer border-b border-line last:border-0 hover:bg-mist/60", o.status === "cancelled" && "opacity-70")}>
                        <td className={td}>
                          <button type="button" onClick={(e) => (e.stopPropagation(), openOrder(o.ref))} className="font-mono text-[13px] font-bold text-ink underline decoration-ink/15 underline-offset-4 hover:decoration-sun-deep">
                            {o.ref}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <OrderFlags o={o} />
                          </div>
                        </td>
                        <td className={td}>
                          <p className="truncate font-semibold">{o.customer.name}</p>
                          <p className="truncate text-[12.5px] text-muted">{o.customer.phone}</p>
                        </td>
                        <td className={td}>
                          <p className="truncate">{o.site.address}</p>
                          <p className="truncate text-[12.5px] text-muted">
                            {jobLabel(i, o.house.jobType)} · {number(o.estimate.area, lang, 0)} m² · {t("orders.zone", { z: o.site.zone })}
                          </p>
                        </td>
                        <td className={td}>
                          <p className="whitespace-nowrap">
                            {day(a.date || o.schedule.start, lang)}
                            {a.time ? <span className="text-ink-soft"> {a.time}</span> : null}
                          </p>
                          {a.crewId ? <CrewChip crew={crew} className="text-[12.5px]" /> : <p className="text-[12.5px] text-muted">{a.date ? t("orders.noCrew") : t("orders.unplanned")}</p>}
                          <p className="truncate text-[12px] text-muted">
                            {t("orders.days", { n: o.schedule.days })}
                            {o.schedule.urgency !== "standard" ? (
                              <>
                                {" · "}
                                <span className="font-semibold text-[#a4470a]">{urgShort(i, o.schedule.urgency)}</span>
                              </>
                            ) : null}
                          </p>
                        </td>
                        <td className={td}>
                          <StatusBadge status={o.status} />
                        </td>
                        <td className={cx(td, "text-right font-semibold whitespace-nowrap tabular-nums")}>{money(o.quote.total, lang)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>

            {/* Cards on phones */}
            <ul className="divide-y divide-line md:hidden">
              {list.slice(0, limit).map((o) => {
                const a = o.assignment || {};
                return (
                  <li key={o.ref}>
                    <button type="button" onClick={() => openOrder(o.ref)} className="block w-full px-4 py-3.5 text-left hover:bg-mist/60">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-bold text-ink">{o.ref}</span>
                        <StatusBadge status={o.status} />
                      </span>
                      <span className="mt-1 block truncate text-[15px] font-semibold text-ink">{o.customer.name}</span>
                      <span className="block truncate text-[13.5px] text-ink-soft">{o.site.address}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                        <span>{day(a.date || o.schedule.start, lang)}</span>
                        <span>{number(o.estimate.area, lang, 0)} m²</span>
                        <span className="font-semibold text-ink">{money(o.quote.total, lang)}</span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        <OrderFlags o={o} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {list.length > limit ? (
              <div className="border-t border-line p-3 text-center">
                <button type="button" onClick={() => setLimit((l) => l + 100)} className="text-[13.5px] font-semibold text-ink hover:underline">
                  {t("orders.more", { n: list.length - limit })}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
