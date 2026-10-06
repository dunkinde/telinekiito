"use client";
// Invoices (head of company): list, status changes, documents and the CSV export for accounting.
import { useMemo, useState } from "react";
import { getInvoices, invoiceDocUrl, invoicesCsvUrl, setInvoiceStatus, type Invoice } from "@/lib/platform";
import { IconSearch } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { day, money, money0 } from "./format";
import { IDownload, IExternal, IInvoice } from "./icons";
import { RefLink } from "./bits";
import { Async, Badge, Btn, Card, Chips, Confirm, Empty, TableWrap, Toolbar, cx, inputCls, td, th } from "./ui";

export function isOverdue(iv: Invoice, today: string) {
  return iv.status === "sent" && iv.due < today;
}

export function InvoiceStatusBadge({ iv }: { iv: Invoice }) {
  const { t } = useT();
  const { today } = useOffice();
  if (isOverdue(iv, today))
    return (
      <Badge tone="red" dot>
        {t("inv.st.overdue")}
      </Badge>
    );
  const tone = iv.status === "paid" ? "green" : iv.status === "sent" ? "blue" : "gray";
  return (
    <Badge tone={tone} dot className={iv.status === "void" ? "line-through" : ""}>
      {t(`inv.st.${iv.status}`)}
    </Badge>
  );
}

export function InvoiceActions({ iv, onDone }: { iv: Invoice; onDone?: () => void }) {
  const { t, lang } = useT();
  const { run } = useAct();
  const [ask, setAsk] = useState<"sent" | "paid" | "void" | null>(null);
  async function set(status: "sent" | "paid" | "void") {
    const r = await run("inv", () => setInvoiceStatus(iv.no, status), t(`inv.done.${status}`, { no: iv.no }));
    if (r) onDone?.();
    return !!r;
  }
  return (
    <>
      {iv.status === "draft" ? (
        <Btn size="xs" variant="primary" onClick={() => setAsk("sent")}>
          {t("inv.markSent")}
        </Btn>
      ) : null}
      {iv.status === "sent" ? (
        <Btn size="xs" variant="dark" onClick={() => setAsk("paid")}>
          {t("inv.markPaid")}
        </Btn>
      ) : null}
      {iv.status === "draft" || iv.status === "sent" ? (
        <Btn size="xs" variant="quiet" onClick={() => setAsk("void")}>
          {t("inv.void")}
        </Btn>
      ) : null}
      <Confirm
        open={!!ask}
        onClose={() => setAsk(null)}
        danger={ask === "void"}
        title={ask ? t(`inv.ask.${ask}Title`, { no: iv.no }) : ""}
        confirmLabel={ask === "sent" ? t("inv.markSent") : ask === "paid" ? t("inv.markPaid") : t("inv.void")}
        onConfirm={() => ask && set(ask)}
        text={ask ? <p>{t(`inv.ask.${ask}Text`, { total: money(iv.total, lang), name: iv.customer.name })}</p> : null}
      />
    </>
  );
}

type F = "all" | "draft" | "sent" | "overdue" | "paid" | "void";

export function Invoices() {
  const { t, lang } = useT();
  const { today } = useOffice();
  const st = useLoad(getInvoices, [], { poll: true });
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const all = [...(st.data?.invoices || [])].sort((a, b) => Number(b.no) - Number(a.no) || b.createdAt.localeCompare(a.createdAt));
    const s = q.trim().toLowerCase();
    return all
      .filter((iv) => (f === "all" ? true : f === "overdue" ? isOverdue(iv, today) : iv.status === f))
      .filter((iv) => !s || iv.no.includes(s) || iv.ref.toLowerCase().includes(s) || iv.customer.name.toLowerCase().includes(s) || iv.site.toLowerCase().includes(s));
  }, [st.data, f, q, today]);
  const all = st.data?.invoices || [];
  const sum = (xs: Invoice[]) => xs.reduce((s, iv) => s + iv.total, 0);
  const outstanding = all.filter((iv) => iv.status === "sent");
  const overdue = all.filter((iv) => isOverdue(iv, today));
  const month = today.slice(0, 7);
  const paidMonth = all.filter((iv) => iv.status === "paid" && (iv.paidAt || "").slice(0, 7) === month);
  const drafts = all.filter((iv) => iv.status === "draft");

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {[
          { k: t("inv.sum.outstanding"), v: money0(sum(outstanding), lang), s: t("inv.sum.n", { n: outstanding.length }) },
          { k: t("inv.sum.overdue"), v: money0(sum(overdue), lang), s: t("inv.sum.n", { n: overdue.length }), warn: overdue.length > 0 },
          { k: t("inv.sum.paidMonth"), v: money0(sum(paidMonth), lang), s: t("inv.sum.n", { n: paidMonth.length }) },
          { k: t("inv.sum.drafts"), v: String(drafts.length), s: t("inv.sum.draftsSub") }
        ].map((x) => (
          <div key={x.k} className={cx("rounded-2xl bg-white px-4 py-3.5 ring-1", x.warn ? "ring-[#f6cbc7]" : "ring-line")}>
            <p className="truncate text-[12.5px] font-semibold text-muted">{x.k}</p>
            <p className={cx("mt-1 font-display text-[24px] leading-none font-extrabold tabular-nums", x.warn ? "text-[#b42318]" : "text-ink")}>{x.v}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">{x.s}</p>
          </div>
        ))}
      </div>
      <Toolbar className="justify-between">
        <div className="relative w-full sm:w-[300px]">
          <label htmlFor="inv-search" className="sr-only">
            {t("inv.search")}
          </label>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
          <input id="inv-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("inv.searchPh")} className={cx(inputCls, "pl-10")} />
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Btn href={invoicesCsvUrl} variant="dark" size="sm" icon={<IDownload className="h-4 w-4" />}>
            {t("inv.csv")}
          </Btn>
          <p className="text-[12px] text-muted">{t("inv.csvHint")}</p>
        </div>
      </Toolbar>
      <Chips
        className="mb-4"
        label={t("inv.filter")}
        value={f}
        onChange={setF}
        options={(["all", "draft", "sent", "overdue", "paid", "void"] as F[]).map((k) => ({
          key: k,
          label: k === "all" ? t("inv.f.all") : t(`inv.st.${k}`),
          count: k === "all" ? all.length : k === "overdue" ? overdue.length : all.filter((iv) => iv.status === k).length
        }))}
      />
      <Card as="div">
        <Async state={st}>
          {() =>
            list.length ? (
              <TableWrap>
                <table className="w-full min-w-[900px] border-collapse">
                  <caption className="sr-only">{t("nav.invoices")}</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className={th}>
                        {t("inv.col.no")}
                      </th>
                      <th scope="col" className={th}>
                        {t("inv.col.customer")}
                      </th>
                      <th scope="col" className={th}>
                        {t("inv.col.date")}
                      </th>
                      <th scope="col" className={th}>
                        {t("inv.col.due")}
                      </th>
                      <th scope="col" className={cx(th, "text-right")}>
                        {t("inv.col.total")}
                      </th>
                      <th scope="col" className={th}>
                        {t("inv.col.status")}
                      </th>
                      <th scope="col" className={th}>
                        <span className="sr-only">{t("inv.col.actions")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((iv) => (
                      <tr key={iv.id} className="border-b border-line last:border-0">
                        <td className={td}>
                          <p className="font-display text-[15px] font-bold">{iv.no}</p>
                          <RefLink refNo={iv.ref} className="text-[12px]" />
                        </td>
                        <td className={td}>
                          <p className="max-w-[240px] truncate font-semibold">{iv.customer.name}</p>
                          <p className="max-w-[240px] truncate text-[12.5px] text-muted">{iv.site}</p>
                        </td>
                        <td className={cx(td, "whitespace-nowrap")}>{day(iv.date, lang, { weekday: false, year: true })}</td>
                        <td className={cx(td, "whitespace-nowrap", isOverdue(iv, today) && "font-semibold text-[#b42318]")}>{day(iv.due, lang, { weekday: false, year: true })}</td>
                        <td className={cx(td, "text-right font-semibold whitespace-nowrap tabular-nums")}>
                          {money(iv.total, lang)}
                          <p className="text-[12px] font-normal text-muted">{t("inv.net", { v: money(iv.net, lang) })}</p>
                        </td>
                        <td className={td}>
                          <InvoiceStatusBadge iv={iv} />
                          {iv.paidAt ? <p className="mt-1 text-[12px] text-muted">{t("inv.paidOn", { date: day(iv.paidAt.slice(0, 10), lang, { weekday: false }) })}</p> : null}
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Btn size="xs" variant="light" href={invoiceDocUrl(iv.no)} newTab icon={<IExternal className="h-3.5 w-3.5" />}>
                              {t("inv.open")}
                            </Btn>
                            <InvoiceActions iv={iv} onDone={() => st.reload()} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <Empty icon={<IInvoice className="h-6 w-6" />} title={all.length ? t("inv.noMatch") : t("inv.none")} text={all.length ? undefined : t("inv.noneText")} />
            )
          }
        </Async>
      </Card>
    </div>
  );
}
