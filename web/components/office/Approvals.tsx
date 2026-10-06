"use client";
// Approvals: changes asked by customers, crews or the office (longer rental, pickup date, a different house size).
import { useState } from "react";
import { PART_KEYS, decideChange, fileUrl, getChanges, type ChangeRequest, type House } from "@/lib/platform";
import { useAct, useLoad, useOffice, useT } from "./context";
import { ago, dateTime, day, money, number } from "./format";
import { changeTypeLabel, jobLabel, partLabel, roofLabel, sourceLabel, statusLabel } from "./i18n";
import { IApprove, IWarn } from "./icons";
import { RefLink } from "./bits";
import { Async, Badge, Btn, Callout, Card, Confirm, Empty, Field, Loading, Tabs, TextArea, cx, type Tone } from "./ui";

const SOURCE_TONE: Record<ChangeRequest["source"], Tone> = { customer: "blue", crew: "violet", office: "gray" };

function Row({ label, before, after, changed }: { label: string; before: React.ReactNode; after: React.ReactNode; changed?: boolean }) {
  return (
    <tr className="border-b border-line last:border-0">
      <th scope="row" className="py-1.5 pr-3 text-left text-[13px] font-medium text-muted">
        {label}
      </th>
      <td className="py-1.5 pr-3 text-[13.5px] text-ink-soft tabular-nums">{before}</td>
      <td aria-hidden className="py-1.5 pr-3 text-muted">
        →
      </td>
      <td className={cx("py-1.5 text-[13.5px] tabular-nums", changed ? "font-bold text-ink" : "text-ink-soft")}>{after}</td>
    </tr>
  );
}

function houseRows(i: ReturnType<typeof useT>, a: House, b: House) {
  const { t, lang } = i;
  const f = (v: number, d = 1) => number(v, lang, d);
  return [
    { label: t("ch.h.size"), before: `${f(a.length, 2)} × ${f(a.width, 2)} m`, after: `${f(b.length, 2)} × ${f(b.width, 2)} m`, changed: a.length !== b.length || a.width !== b.width },
    { label: t("ch.h.eave"), before: `${f(a.eave)} m`, after: `${f(b.eave)} m`, changed: a.eave !== b.eave },
    { label: t("ch.h.roof"), before: `${roofLabel(i, a.roofType)} ${f(a.pitch, 0)}°`, after: `${roofLabel(i, b.roofType)} ${f(b.pitch, 0)}°`, changed: a.roofType !== b.roofType || a.pitch !== b.pitch },
    { label: t("ch.h.job"), before: jobLabel(i, a.jobType), after: jobLabel(i, b.jobType), changed: a.jobType !== b.jobType },
    { label: t("ch.h.gables"), before: a.gables ? t("ui.yes") : t("ui.no"), after: b.gables ? t("ui.yes") : t("ui.no"), changed: a.gables !== b.gables }
  ];
}

export function ChangeCard({ c, compact, onDone }: { c: ChangeRequest; compact?: boolean; onDone?: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const pending = c.status === "pending";
  const diff = c.after ? c.after.total - c.before.total : 0;
  const short = c.stock && !c.stock.ok ? PART_KEYS.filter((k) => (c.stock!.short[k] || 0) > 0) : [];

  async function decide(approve: boolean) {
    const r = await run(approve ? "approve" : "reject", () => decideChange(c.id, approve, approve ? "" : reason.trim()), approve ? t("ch.approved") : t("ch.rejected"));
    if (r) {
      setReason("");
      onDone?.();
    }
    return !!r;
  }

  return (
    <Card as="article" className={cx("overflow-hidden", pending && "ring-[#f3dc8a]")} aria-label={`${changeTypeLabel(i, c.type)} ${c.ref}`}>
      <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-3.5", pending ? "bg-sun-soft/50" : "bg-mist/50")}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[16px] font-bold text-ink">{changeTypeLabel(i, c.type)}</span>
            <Badge tone={SOURCE_TONE[c.source]}>{sourceLabel(i, c.source)}</Badge>
            {!pending ? (
              <Badge tone={c.status === "approved" ? "green" : "red"} dot>
                {t(c.status === "approved" ? "ch.st.approved" : "ch.st.rejected")}
              </Badge>
            ) : null}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {c.by?.name ? `${c.by.name} · ` : ""}
            {ago(c.createdAt, lang)}
          </p>
        </div>
        {!compact ? (
          <div className="text-right text-[13px]">
            <RefLink refNo={c.ref} />
            {c.order ? (
              <p className="max-w-[260px] truncate text-muted">
                {c.order.customer} · {c.order.address}
              </p>
            ) : null}
            {c.order ? <p className="text-[12px] text-muted">{statusLabel(i, c.order.status)}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {c.type !== "other" ? (
            <table className="w-full">
              <caption className="sr-only">{t("ch.beforeAfter")}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t("ch.what")}</th>
                  <th scope="col">{t("ch.before")}</th>
                  <th scope="col" />
                  <th scope="col">{t("ch.after")}</th>
                </tr>
              </thead>
              <tbody>
                {c.type === "days" || c.type === "pickup_date" ? (
                  <Row label={t("ch.days")} before={t("ch.daysV", { n: c.before.days })} after={t("ch.daysV", { n: c.proposed.days ?? c.after?.days ?? c.before.days })} changed />
                ) : null}
                {c.type === "pickup_date" && c.proposed.date ? <Row label={t("ch.pickupDate")} before="–" after={day(c.proposed.date, lang)} changed /> : null}
                {c.type === "house" && c.proposed.house ? houseRows(i, c.before.house, c.proposed.house).map((r) => <Row key={r.label} {...r} />) : null}
                {c.after ? <Row label={t("ch.area")} before="" after={`${number(c.after.area, lang, 0)} m²`} /> : null}
                {c.after ? (
                  <Row
                    label={t("ch.total")}
                    before={money(c.before.total, lang)}
                    after={
                      <>
                        {money(c.after.total, lang)}{" "}
                        <span className={cx("text-[12px] font-semibold", diff >= 0 ? "text-[#17663a]" : "text-[#b42318]")}>
                          ({diff >= 0 ? "+" : "−"}
                          {money(Math.abs(diff), lang)})
                        </span>
                      </>
                    }
                    changed
                  />
                ) : null}
              </tbody>
            </table>
          ) : (
            <p className="text-[13.5px] text-muted">{t("ch.otherHint")}</p>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          {c.note ? (
            <blockquote className="rounded-xl bg-mist px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
              <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">{t("ch.note")}</p>
              {c.note}
            </blockquote>
          ) : null}
          {c.after ? (
            c.stock == null ? (
              <p className="text-[12.5px] text-muted">{t("ch.stockOff")}</p>
            ) : c.stock.ok ? (
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#17663a]">
                <IApprove className="h-4 w-4" />
                {t("ch.stockOk")}
              </p>
            ) : (
              <Callout tone="danger" title={t("ch.stockShort")}>
                <ul className="mt-1 space-y-0.5">
                  {short.map((k) => (
                    <li key={k}>
                      {partLabel(i, k)}: <strong>{t("ch.missingN", { n: c.stock!.short[k] || 0 })}</strong>
                    </li>
                  ))}
                </ul>
              </Callout>
            )
          ) : null}
          {c.photos.length ? (
            <ul className="flex flex-wrap gap-2" aria-label={t("ch.photos")}>
              {c.photos.map((p, k) => {
                const src = p.startsWith("data:") ? p : fileUrl(p);
                return (
                  <li key={k}>
                    <a href={src} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg ring-1 ring-line">
                      <img src={src} alt={t("ch.photoAlt", { n: k + 1 })} className="h-20 w-24 bg-mist object-cover" loading="lazy" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {!pending ? (
            <p className="text-[12.5px] text-muted">
              {t("ch.decidedBy", { name: c.decidedBy?.name || "–", at: dateTime(c.decidedAt, lang) })}
              {c.reason ? ` – ${c.reason}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {pending ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          {short.length ? (
            <span className="mr-auto flex items-center gap-1.5 text-[12.5px] font-medium text-[#b42318]">
              <IWarn className="h-4 w-4" />
              {t("ch.shortWarn")}
            </span>
          ) : null}
          <Btn size="sm" variant="danger" onClick={() => setRejectOpen(true)} busy={busy === "reject"}>
            {t("ch.reject")}
          </Btn>
          <Btn size="sm" variant="primary" onClick={() => setApproveOpen(true)} busy={busy === "approve"}>
            {t("ch.approve")}
          </Btn>
        </div>
      ) : null}

      <Confirm
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={t("ch.approveTitle", { ref: c.ref })}
        confirmLabel={t("ch.approve")}
        onConfirm={() => decide(true)}
        text={
          <>
            <p>{c.type === "other" ? t("ch.approveOther") : t("ch.approveText", { total: c.after ? money(c.after.total, lang) : "–" })}</p>
            {c.source === "customer" || c.type !== "other" ? <p className="mt-2 text-muted">{t("ch.customerTold")}</p> : null}
            {short.length ? <p className="mt-2 font-medium text-[#b42318]">{t("ch.shortWarn")}</p> : null}
          </>
        }
      />
      <Confirm open={rejectOpen} onClose={() => setRejectOpen(false)} title={t("ch.rejectTitle", { ref: c.ref })} confirmLabel={t("ch.reject")} danger onConfirm={() => decide(false)} text={<p>{t("ch.rejectText")}</p>}>
        <Field label={t("ch.reason")} hint={t("ch.reasonHint")}>
          {(id, d) => <TextArea id={id} rows={3} value={reason} onChange={setReason} describedBy={d} maxLength={500} />}
        </Field>
      </Confirm>
    </Card>
  );
}

export function Approvals() {
  const { t } = useT();
  const { pending, refresh, route, setParams } = useOffice();
  const tab = route.params.tab === "history" ? "history" : "pending";
  const hist = useLoad(() => (tab === "history" ? getChanges("all") : Promise.resolve(null)), [tab], { poll: tab === "history" });
  return (
    <div>
      <Tabs
        className="mb-4"
        label={t("nav.approvals")}
        value={tab}
        onChange={(k) => setParams({ tab: k === "pending" ? null : k })}
        tabs={[
          { key: "pending", label: t("ch.tab.pending"), count: pending?.length || 0 },
          { key: "history", label: t("ch.tab.history") }
        ]}
      />
      {tab === "pending" ? (
        !pending ? (
          <Card as="div">
            <Loading />
          </Card>
        ) : pending.length ? (
          <div className="space-y-4">
            {pending.map((c) => (
              <ChangeCard key={c.id} c={c} onDone={refresh} />
            ))}
          </div>
        ) : (
          <Card as="div">
            <Empty icon={<IApprove className="h-6 w-6" />} title={t("ch.none")} text={t("ch.noneText")} />
          </Card>
        )
      ) : (
        <Async state={hist}>
          {(d) => {
            const list = (d?.changes || []).filter((c) => c.status !== "pending");
            return list.length ? (
              <div className="space-y-4">
                {list.map((c) => (
                  <ChangeCard key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <Card as="div">
                <Empty icon={<IApprove className="h-6 w-6" />} title={t("ch.noHistory")} />
              </Card>
            );
          }}
        </Async>
      )}
    </div>
  );
}
