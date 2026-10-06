"use client";
// The company's invoices: open, paid and overdue, by project, with the printable invoice and the Finvoice e-invoice file.
import { useMemo, useState } from "react";
import { bizFinvoiceUrl, bizInvoices, invoiceDocUrl, type BizInvoice } from "@/lib/business";
import { useT } from "../office/context";
import { day, money } from "../office/format";
import { IDownload, IInvoice } from "../office/icons";
import { Async, Badge, Card, Chips, Empty, Select, TableWrap, td, th } from "../office/ui";
import { useBiz, useBizLoad } from "./context";

type F = "open" | "paid" | "all";

export function Invoices() {
  const { t } = useT();
  const { me } = useBiz();
  const st = useBizLoad(bizInvoices, [], { poll: true });
  return (
    <div>
      <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink">{t("biz.inv.title")}</h1>
      <p className="mb-5 text-[14px] text-muted">{me.account.einvoiceAddress ? t("biz.inv.einvoiceTo", { addr: me.account.einvoiceAddress }) : t("biz.inv.sub")}</p>
      <Async state={st}>{(d) => <Body list={d.invoices} today={me.today} />}</Async>
    </div>
  );
}

function Body({ list, today }: { list: BizInvoice[]; today: string }) {
  const { t, lang } = useT();
  const [f, setF] = useState<F>("open");
  const [project, setProject] = useState("");
  const projects = useMemo(() => [...new Set(list.map((x) => x.project).filter(Boolean))].sort(), [list]);
  const overdue = (x: BizInvoice) => x.status === "sent" && x.due < today;
  const shown = list.filter((x) => (f === "all" ? true : f === "open" ? x.status === "sent" : x.status === "paid")).filter((x) => !project || x.project === project);
  const open = list.filter((x) => x.status === "sent");
  const sum = (a: BizInvoice[]) => a.reduce((s, x) => s + x.total, 0);
  if (!list.length)
    return (
      <Card as="div">
        <Empty icon={<IInvoice className="h-6 w-6" />} title={t("biz.inv.none")} text={t("biz.inv.noneText")} />
      </Card>
    );
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <li className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <p className="font-display text-[1.4rem] font-extrabold tabular-nums">{money(sum(open), lang, 0)}</p>
          <p className="text-[13px] text-ink-soft">{t("biz.inv.open", { n: open.length })}</p>
        </li>
        <li className={`rounded-2xl p-4 ring-1 ${open.some(overdue) ? "bg-[#fdecec] ring-[#f5c2c2]" : "bg-white ring-line"}`}>
          <p className="font-display text-[1.4rem] font-extrabold tabular-nums">{money(sum(open.filter(overdue)), lang, 0)}</p>
          <p className="text-[13px] text-ink-soft">{t("biz.inv.overdue", { n: open.filter(overdue).length })}</p>
        </li>
        <li className="col-span-2 rounded-2xl bg-white p-4 ring-1 ring-line lg:col-span-1">
          <p className="font-display text-[1.4rem] font-extrabold tabular-nums">{money(sum(list.filter((x) => x.status === "paid")), lang, 0)}</p>
          <p className="text-[13px] text-ink-soft">{t("biz.inv.paidTotal")}</p>
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Chips label={t("biz.filter")} value={f} onChange={setF} options={[{ key: "open", label: t("biz.inv.f.open") }, { key: "paid", label: t("biz.inv.f.paid") }, { key: "all", label: t("biz.f.all") }]} />
        {projects.length ? <Select aria-label={t("biz.project")} value={project} onChange={setProject} options={[{ value: "", label: t("biz.allProjects") }, ...projects.map((p) => ({ value: p, label: p }))]} className="ml-auto sm:w-56" /> : null}
      </div>
      <Card className="mt-4">
        <TableWrap label={t("biz.inv.title")}>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-y border-line bg-mist/50">
                <th className={th}>{t("biz.inv.col.no")}</th>
                <th className={th}>{t("biz.inv.col.site")}</th>
                <th className={th}>{t("biz.inv.col.date")}</th>
                <th className={th}>{t("biz.inv.col.due")}</th>
                <th className={`${th} text-right`}>{t("biz.inv.col.total")}</th>
                <th className={th}>{t("biz.inv.col.status")}</th>
                <th className={th}>{t("biz.inv.col.files")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((x) => (
                <tr key={x.id}>
                  <td className={td}>
                    <span className="font-semibold">{x.no}</span>
                    <span className="block text-[12px] text-muted">{t("biz.inv.ref", { ref: x.reference })}</span>
                  </td>
                  <td className={td}>
                    <a href={`#/sites/${x.ref}`} className="font-medium underline-offset-2 hover:underline">
                      {x.site}
                    </a>
                    <span className="block text-[12px] text-muted">{[x.project, x.po && t("biz.poShort", { po: x.po }), x.costCentre && t("biz.ccShort", { cc: x.costCentre })].filter(Boolean).join(" · ") || x.ref}</span>
                  </td>
                  <td className={td}>{day(x.date, lang, { year: true })}</td>
                  <td className={td}>{day(x.due, lang, { year: true })}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{money(x.total, lang)}</td>
                  <td className={td}>
                    <Badge tone={x.status === "paid" ? "green" : overdue(x) ? "red" : "blue"}>{x.status === "paid" ? t("biz.inv.paid") : overdue(x) ? t("biz.inv.overdueOne") : t("biz.inv.sent")}</Badge>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold">
                      <a href={invoiceDocUrl(x.id, x.access)} target="_blank" rel="noopener" className="text-ink underline-offset-2 hover:underline">
                        {t("biz.inv.pdf")}
                      </a>
                      <a href={bizFinvoiceUrl(x.id)} className="inline-flex items-center gap-1 text-ink-soft hover:text-ink">
                        <IDownload className="h-3.5 w-3.5" /> Finvoice
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {!shown.length ? <p className="px-5 py-6 text-center text-[14px] text-muted">{t("biz.inv.noMatch")}</p> : null}
      </Card>
    </>
  );
}
