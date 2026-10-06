"use client";
// One site, live: progress, schedule, the crew's work and photos, documents and invoices, change requests with the
// price before → after (the office approves them), the company's own order details, and messages with the office.
import { useEffect, useState } from "react";
import {
  bizChange,
  bizFinvoiceUrl,
  bizMessage,
  bizOrder,
  bizPickup,
  bizPreview,
  bizSaveDetails,
  bizUploadPhoto,
  docUrl,
  invoiceDocUrl,
  photoUrl,
  type BizChange,
  type BizDetails,
  type BizOrder,
  type ChangeBody,
  type ChangePreview
} from "@/lib/business";
import { ORDER_FLOW } from "@/lib/platform";
import { useT } from "../office/context";
import { dateTime, day, daysBetween, money, telHref } from "../office/format";
import { jobLabel, photoStageLabel, statusLabel, urgLabel } from "../office/i18n";
import { IDoc, IDownload, IEdit, ILeft, IPickup, ISend } from "../office/icons";
import { Async, Badge, Btn, Callout, Card, CardHead, Chips, Confirm, Dialog, Field, Input, KV, StatusBadge, TextArea, cx } from "../office/ui";
import { useBiz, useBizAct, useBizLoad } from "./context";
import { shrinkImage } from "@/lib/image";

export function OrderView({ refNo }: { refNo: string }) {
  const { t } = useT();
  const st = useBizLoad(() => bizOrder(refNo), [refNo], { poll: true });
  return (
    <div>
      <a href="#/sites" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink">
        <ILeft className="h-4 w-4" /> {t("biz.back")}
      </a>
      <Async state={st}>{(d) => <Body o={d.order} onChange={(o) => st.setData({ order: o })} />}</Async>
    </div>
  );
}

function Body({ o, onChange }: { o: BizOrder; onChange: (o: BizOrder) => void }) {
  const i = useT();
  const { t, lang } = i;
  const { canOrder, me } = useBiz();
  const { busy, run } = useBizAct();
  const [changeOpen, setChangeOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickupAsk, setPickupAsk] = useState(false);
  const finished = ["dismantled", "closed", "cancelled"].includes(o.status);
  const pending = o.changes.find((c) => c.status === "pending" && c.by.role === "customer");
  const onSite = o.status === "erected" || o.status === "pickup_requested";
  const left = o.rentalEnd ? daysBetween(me.today, o.rentalEnd) : null;
  const b = o.business;

  return (
    <div className="space-y-4">
      <Card as="div" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[13px] text-muted">{o.ref}</p>
            <h1 className="font-display text-[1.6rem] leading-tight font-extrabold text-ink">{o.address}</h1>
            <p className="mt-1 text-[14px] text-muted">
              {jobLabel(i, o.jobType)} · {o.area} m² · {urgLabel(i, o.urgency)}
            </p>
            {b.project || b.po || b.costCentre ? (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {b.project ? <Badge tone="blue">{b.project}</Badge> : null}
                {b.po ? <Badge tone="neutral">{t("biz.poShort", { po: b.po })}</Badge> : null}
                {b.costCentre ? <Badge tone="neutral">{t("biz.ccShort", { cc: b.costCentre })}</Badge> : null}
              </p>
            ) : null}
          </div>
          <StatusBadge status={o.status} />
        </div>
        {!o.cancelled ? <Progress o={o} /> : <Callout tone="danger" className="mt-4">{t("biz.cancelled")}</Callout>}
        {canOrder && !finished ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Btn variant="dark" size="sm" onClick={() => setChangeOpen(true)} disabled={!!pending} title={pending ? t("biz.ch.pendingHint") : undefined}>
              {t("biz.ch.ask")}
            </Btn>
            <Btn size="sm" icon={<IPickup className="h-4 w-4" />} onClick={() => setPickupAsk(true)} disabled={o.status !== "erected"} title={o.status !== "erected" ? t("biz.pickupLater") : undefined}>
              {t("biz.pickup")}
            </Btn>
            <Btn size="sm" variant="ghost" icon={<IEdit className="h-4 w-4" />} onClick={() => setDetailsOpen(true)}>
              {t("biz.details.edit")}
            </Btn>
          </div>
        ) : null}
        {pending ? <p className="mt-3 text-[13px] text-ink-soft">{t("biz.ch.pendingHint")}</p> : null}
        {o.needsPhotos && !finished ? <Callout tone="warn" className="mt-4">{t("biz.photosNeeded")}</Callout> : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHead title={t("biz.schedule")} />
            <div className="px-5 pb-4">
              <KV
                items={[
                  { k: t("biz.delivery"), v: o.plan.date ? `${day(o.plan.date, lang)}${o.plan.time ? ` ${o.plan.time}` : ""}` : t("biz.askedStart", { date: day(o.start, lang) }) },
                  ...(o.crew ? [{ k: t("biz.crew"), v: `${o.crew}${o.eta ? ` · ${t("biz.eta", { eta: o.eta })}` : ""}` }] : []),
                  { k: t("biz.rental"), v: t("biz.rentalV", { n: o.days }) },
                  ...(o.rentalEnd && !o.cancelled ? [{ k: t("biz.rentalEnds"), v: <span>{day(o.rentalEnd, lang)}{onSite && left != null ? <span className={cx("ml-2 text-[12.5px]", left <= 7 ? "text-[#b45309]" : "text-muted")}>{left < 0 ? t("biz.overdue", { n: -left }) : t("biz.daysLeft", { n: left })}</span> : null}</span> }] : []),
                  { k: t("biz.pickupDate"), v: o.plan.pickupDate ? `${day(o.plan.pickupDate, lang)}${o.plan.pickupTime ? ` ${o.plan.pickupTime}` : ""}` : t("biz.notPlanned") }
                ]}
              />
            </div>
          </Card>

          {canOrder && !finished ? <PhotoUpload o={o} onDone={onChange} /> : null}

          <Card>
            <CardHead title={t("biz.work")} sub={t("biz.workSub")} />
            <ol className="space-y-2 px-5 pb-5 text-[14px]">
              {[
                { on: o.work.loadedAt, label: t("biz.w.loaded") },
                { on: o.work.arrivedAt, label: t("biz.w.arrived") },
                { on: o.work.inspectedAt, label: o.work.signer ? t("biz.w.inspectedSigned", { name: o.work.signer }) : t("biz.w.inspected") },
                { on: o.work.dismantledAt, label: t("biz.w.dismantled") }
              ].map((s, k) => (
                <li key={k} className="flex items-center gap-3">
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold", s.on ? "bg-[#16a34a] text-white" : "bg-mist text-muted ring-1 ring-line")}>{s.on ? "✓" : k + 1}</span>
                  <span className={cx("flex-1", s.on ? "text-ink" : "text-muted")}>{s.label}</span>
                  {s.on ? <span className="text-[12.5px] text-muted">{dateTime(s.on, lang)}</span> : null}
                </li>
              ))}
            </ol>
            {o.photos.length ? (
              <div className="border-t border-line px-5 py-4">
                <p className="mb-2 text-[13px] font-semibold text-ink-soft">{t("biz.photos", { n: o.photos.length })}</p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {o.photos.map((p) => (
                    <li key={p.id}>
                      <a href={photoUrl(p.id, o.access)} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl ring-1 ring-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl(p.id, o.access)} alt={`${photoStageLabel(i, p.stage)}, ${dateTime(p.at, lang)}`} loading="lazy" className="aspect-square w-full object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {o.changes.length ? (
            <Card>
              <CardHead title={t("biz.ch.title")} />
              <ul className="space-y-2 px-5 pb-5">
                {o.changes.map((c) => (
                  <ChangeRow key={c.id} c={c} />
                ))}
              </ul>
            </Card>
          ) : null}

          <Messages o={o} onChange={onChange} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHead title={t("biz.price")} />
            <div className="px-5 pb-4">
              <KV
                items={[
                  { k: t("biz.totalVat"), v: <b className="tabular-nums">{money(o.total, lang)}</b> },
                  ...(onSite || finished ? [{ k: t("biz.costToDate"), v: <span className="tabular-nums">{money(o.costToDate, lang)}</span> }] : []),
                  { k: t("biz.discount"), v: o.quote.discountPct ? `−${o.quote.discountPct} %` : "–" }
                ]}
              />
              <p className="mt-2 text-[12px] text-muted">{t("biz.costHint")}</p>
            </div>
          </Card>

          <Card>
            <CardHead title={t("biz.details.title")} actions={canOrder && !finished ? <Btn size="xs" variant="quiet" onClick={() => setDetailsOpen(true)}>{t("biz.details.editShort")}</Btn> : undefined} />
            <div className="px-5 pb-4">
              <KV
                items={[
                  { k: t("biz.po"), v: b.po || "–" },
                  { k: t("biz.project"), v: b.project || "–" },
                  { k: t("biz.costCentre"), v: b.costCentre || "–" },
                  { k: t("biz.siteContact"), v: b.siteContact?.name || b.siteContact?.phone ? <span>{b.siteContact.name}{b.siteContact.phone ? <> · <a className="underline" href={telHref(b.siteContact.phone)}>{b.siteContact.phone}</a></> : null}</span> : "–" },
                  { k: t("biz.orderedBy"), v: b.orderedBy || "–" }
                ]}
              />
              {b.siteInfo ? <p className="mt-2 rounded-xl bg-mist px-3 py-2 text-[13px] whitespace-pre-line text-ink-soft">{b.siteInfo}</p> : null}
            </div>
          </Card>

          <Card>
            <CardHead title={t("biz.docs")} />
            <ul className="space-y-1.5 px-5 pb-5 text-[14px]">
              {o.docs.confirmation ? <DocLink href={docUrl("confirmation", o.ref, o.access)} label={t("biz.doc.confirmation")} /> : null}
              {o.docs.inspection ? <DocLink href={docUrl("inspection", o.ref, o.access)} label={t("biz.doc.inspection")} /> : <li className="text-[13px] text-muted">{t("biz.doc.inspectionLater")}</li>}
              {o.invoices.map((iv) => (
                <li key={iv.id} className="rounded-xl bg-mist px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <a href={invoiceDocUrl(iv.id, o.access)} target="_blank" rel="noopener" className="font-semibold text-ink underline-offset-2 hover:underline">
                      {t("biz.invoiceNo", { no: iv.no })}
                    </a>
                    <Badge tone={iv.status === "paid" ? "green" : "blue"}>{t(`biz.inv.${iv.status}`)}</Badge>
                  </div>
                  <p className="text-[12.5px] text-muted">
                    {money(iv.total, lang)} · {t("biz.inv.due", { date: day(iv.due, lang) })}
                  </p>
                  <a href={bizFinvoiceUrl(iv.id)} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                    <IDownload className="h-3.5 w-3.5" /> {t("biz.finvoice")}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ChangeDialog open={changeOpen} onClose={() => setChangeOpen(false)} o={o} onDone={onChange} />
      <DetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} o={o} onDone={onChange} />
      <Confirm
        open={pickupAsk}
        onClose={() => setPickupAsk(false)}
        title={t("biz.pickupTitle")}
        text={<p>{t("biz.pickupText")}</p>}
        confirmLabel={t("biz.pickup")}
        onConfirm={async () => {
          const r = await run("pickup", () => bizPickup(o.ref), t("biz.pickupDone"));
          if (r) onChange(r.order);
          return !!r;
        }}
        disabled={busy === "pickup"}
      />
    </div>
  );
}

/** Photos of the house from the company, so the office can check the size before confirming. */
function PhotoUpload({ o, onDone }: { o: BizOrder; onDone: (o: BizOrder) => void }) {
  const { t } = useT();
  const { fail, notify } = useBiz();
  const [left, setLeft] = useState(0);
  const mine = o.photos.filter((p) => p.stage === "customer").length;
  return (
    <Card className="p-5">
      <p className="font-display text-[16px] font-bold text-ink">{t("biz.photosTitle")}</p>
      <p className="mt-1 text-[13.5px] text-ink-soft">{t("biz.photosText", { n: mine })}</p>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-white hover:bg-ink-soft">
        {left ? t("biz.photosUploading", { n: left }) : t("biz.photosAdd")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={left > 0}
          onChange={async (e) => {
            const files = Array.from(e.target.files || []).slice(0, 12);
            e.target.value = "";
            let last: BizOrder | null = null;
            for (let k = 0; k < files.length; k++) {
              setLeft(files.length - k);
              try {
                last = (await bizUploadPhoto(o.ref, await shrinkImage(files[k], t("biz.photoBad")))).order;
              } catch (err) {
                fail(err);
                break;
              }
            }
            setLeft(0);
            if (last) {
              onDone(last);
              notify(t("biz.photosSaved"));
            }
          }}
        />
      </label>
    </Card>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-ink hover:bg-mist">
        <IDoc className="h-4 w-4 text-muted" /> {label}
      </a>
    </li>
  );
}

/** Status steps the customer sees (pickup request only when it happened). */
function Progress({ o }: { o: BizOrder }) {
  const i = useT();
  const { lang } = i;
  const flow = ORDER_FLOW.filter((s) => s !== "pickup_requested" || o.status === "pickup_requested" || o.history.some((h) => h.status === "pickup_requested"));
  const cur = ORDER_FLOW.indexOf(o.status);
  const at = (s: string) => [...o.history].reverse().find((h) => h.status === s)?.at;
  return (
    <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label={i.t("biz.progress")}>
      {flow.map((s) => {
        const idx = ORDER_FLOW.indexOf(s);
        const state = idx < cur ? "done" : idx === cur ? "now" : "todo";
        const when = at(s);
        return (
          <li key={s} aria-current={state === "now" ? "step" : undefined} className={cx("rounded-xl px-3 py-2 text-[12.5px] ring-1", state === "now" ? "bg-sun font-bold text-ink ring-sun" : state === "done" ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line")}>
            <span className="block leading-tight">{statusLabel(i, s)}</span>
            {when && state !== "todo" ? <span className={cx("block text-[11px]", state === "done" ? "text-white/60" : "text-ink/70")}>{dateTime(when, lang)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ChangeRow({ c }: { c: BizChange }) {
  const { t, lang } = useT();
  const what = c.type === "days" ? t("biz.ch.daysV", { n: c.proposed.days ?? c.after?.days ?? 0 }) : c.type === "pickup_date" && c.proposed.date ? t("biz.ch.pickupV", { date: day(c.proposed.date, lang) }) : c.type === "house" ? t("biz.ch.house") : t("biz.ch.other");
  return (
    <li className="rounded-xl bg-mist px-4 py-3 text-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {what}
          <span className="font-normal text-muted"> · {c.by.role === "office" ? t("biz.ch.byOffice") : c.by.name || ""}</span>
        </p>
        <Badge tone={c.status === "approved" ? "green" : c.status === "rejected" ? "red" : "sun"}>{t(`biz.ch.st.${c.status}`)}</Badge>
      </div>
      {c.after ? <p className="mt-1 tabular-nums text-ink-soft">{t("biz.ch.price", { before: money(c.before.total, lang), after: money(c.after.total, lang) })}</p> : null}
      {c.note ? <p className="mt-1 text-[13px] text-muted">“{c.note}”</p> : null}
      {c.status === "rejected" && c.reason ? <p className="mt-1 text-[13px] text-[#b42318]">{c.reason}</p> : null}
      <p className="mt-1 text-[12px] text-muted">{dateTime(c.createdAt, lang)}</p>
    </li>
  );
}

/* ---------------- Change request with live price preview ---------------- */
type Kind = "days" | "pickup_date" | "other";
function ChangeDialog({ open, onClose, o, onDone }: { open: boolean; onClose: () => void; o: BizOrder; onDone: (o: BizOrder) => void }) {
  const { t, lang } = useT();
  const { busy, run } = useBizAct();
  const [kind, setKind] = useState<Kind>("days");
  const [days, setDays] = useState(String(o.days + 7));
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [pv, setPv] = useState<{ p: ChangePreview | null; err: string | null; loading: boolean }>({ p: null, err: null, loading: false });
  const body = (): ChangeBody | null => {
    if (kind === "days") return Number(days) >= 1 ? { type: "days", days: Math.round(Number(days)), note } : null;
    if (kind === "pickup_date") return date ? { type: "pickup_date", date, note } : null;
    return note.trim() ? { type: "other", note: note.trim() } : null;
  };
  const key = `${kind}|${days}|${date}`;
  useEffect(() => {
    if (!open) return;
    const b = body();
    if (!b || b.type === "other") return setPv({ p: null, err: null, loading: false });
    setPv((x) => ({ ...x, loading: true }));
    const id = window.setTimeout(() => {
      bizPreview(o.ref, b)
        .then((p) => setPv({ p, err: null, loading: false }))
        .catch((e: { message?: string }) => setPv({ p: null, err: e?.message || "", loading: false }));
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  const b = body();
  async function send() {
    if (!b) return;
    const r = await run("change", () => bizChange(o.ref, b), t("biz.ch.sent"));
    if (r) {
      onDone(r.order);
      onClose();
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("biz.ch.ask")}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={send} busy={busy === "change"} disabled={!b}>
            {t("biz.ch.send")}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Chips label={t("biz.ch.what")} value={kind} onChange={setKind} options={[{ key: "days", label: t("biz.ch.k.days") }, { key: "pickup_date", label: t("biz.ch.k.pickup") }, { key: "other", label: t("biz.ch.k.other") }]} />
        {kind === "days" ? (
          <Field label={t("biz.ch.newDays")} hint={t("biz.ch.nowDays", { n: o.days })}>
            {(id, h) => <Input id={id} type="number" inputMode="numeric" value={days} onChange={setDays} describedBy={h} className="max-w-[160px]" />}
          </Field>
        ) : null}
        {kind === "pickup_date" ? <Field label={t("biz.ch.pickupDate")}>{(id) => <Input id={id} type="date" value={date} onChange={setDate} className="max-w-[200px]" />}</Field> : null}
        <Field label={kind === "other" ? t("biz.ch.describe") : t("biz.ch.note")} optional={kind !== "other"}>
          {(id) => <TextArea id={id} rows={3} value={note} onChange={setNote} maxLength={1000} placeholder={kind === "other" ? t("biz.ch.otherPh") : ""} />}
        </Field>
        {kind !== "other" ? (
          <div className="rounded-2xl bg-mist p-4" aria-live="polite">
            {pv.loading ? (
              <p className="text-[13px] text-muted">{t("ui.loading")}</p>
            ) : pv.err ? (
              <p className="text-[13px] text-[#b42318]">{pv.err}</p>
            ) : pv.p && pv.p.after ? (
              <>
                <p className="text-[12.5px] text-muted">{t("biz.ch.priceTitle")}</p>
                <p className="font-display text-xl font-bold tabular-nums text-ink">
                  {money(pv.p.before.total, lang)} → {money(pv.p.after.total, lang)}
                </p>
                <p className="text-[13px] text-ink-soft">{t("biz.ch.daysChange", { from: pv.p.before.days, to: pv.p.after.days })}</p>
                {pv.p.stock ? <p className={cx("mt-1 text-[13px] font-medium", pv.p.stock.ok ? "text-[#17663a]" : "text-[#b45309]")}>{pv.p.stock.ok ? t("biz.ch.stockOk") : t("biz.ch.stockShort")}</p> : null}
              </>
            ) : (
              <p className="text-[13px] text-muted">{t("biz.ch.fill")}</p>
            )}
          </div>
        ) : null}
        <p className="text-[12.5px] text-muted">{t("biz.ch.approveNote")}</p>
      </div>
    </Dialog>
  );
}

/* ---------------- The company's own details on the order ---------------- */
function DetailsDialog({ open, onClose, o, onDone }: { open: boolean; onClose: () => void; o: BizOrder; onDone: (o: BizOrder) => void }) {
  const { t } = useT();
  const { busy, run } = useBizAct();
  const [d, setD] = useState<BizDetails>(o.business);
  const [seen, setSeen] = useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) setD({ ...o.business, siteContact: { ...o.business.siteContact } });
  }
  async function save() {
    const r = await run("details", () => bizSaveDetails(o.ref, { po: d.po, project: d.project, costCentre: d.costCentre, siteContact: d.siteContact, siteInfo: d.siteInfo }), t("ui.saved"));
    if (r) {
      onDone(r.order);
      onClose();
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("biz.details.title")}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={save} busy={busy === "details"}>
            {t("ui.save")}
          </Btn>
        </>
      }
    >
      <BizFields d={d} setD={setD} />
      <p className="mt-3 text-[12.5px] text-muted">{t("biz.details.hint")}</p>
    </Dialog>
  );
}

/** PO, project, cost centre, site contact and site details (also used when ordering). */
export function BizFields({ d, setD }: { d: BizDetails; setD: (d: BizDetails) => void }) {
  const { t } = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("biz.po")} optional>{(id) => <Input id={id} value={d.po} onChange={(v) => setD({ ...d, po: v })} maxLength={40} />}</Field>
      <Field label={t("biz.project")} optional>{(id) => <Input id={id} value={d.project} onChange={(v) => setD({ ...d, project: v })} maxLength={80} />}</Field>
      <Field label={t("biz.costCentre")} optional>{(id) => <Input id={id} value={d.costCentre} onChange={(v) => setD({ ...d, costCentre: v })} maxLength={40} />}</Field>
      <div className="hidden sm:block" />
      <Field label={t("biz.siteContactName")} optional>{(id) => <Input id={id} value={d.siteContact.name} onChange={(v) => setD({ ...d, siteContact: { ...d.siteContact, name: v } })} maxLength={80} />}</Field>
      <Field label={t("biz.siteContactPhone")} optional hint={t("biz.siteContactHint")}>
        {(id, h) => <Input id={id} type="tel" value={d.siteContact.phone} onChange={(v) => setD({ ...d, siteContact: { ...d.siteContact, phone: v } })} maxLength={40} describedBy={h} />}
      </Field>
      <Field label={t("biz.siteInfo")} optional className="sm:col-span-2">
        {(id) => <TextArea id={id} rows={3} value={d.siteInfo} onChange={(v) => setD({ ...d, siteInfo: v })} maxLength={600} placeholder={t("biz.siteInfoPh")} />}
      </Field>
    </div>
  );
}

/* ---------------- Messages with the office ---------------- */
function Messages({ o, onChange }: { o: BizOrder; onChange: (o: BizOrder) => void }) {
  const { t, lang } = useT();
  const { busy, run } = useBizAct();
  const [text, setText] = useState("");
  return (
    <Card>
      <CardHead title={t("biz.msg.title")} sub={t("biz.msg.sub")} />
      <div className="px-5 pb-5">
        {o.messages.length ? (
          <ul className="mb-4 space-y-2">
            {o.messages.map((m, k) => (
              <li key={k} className={cx("max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px]", m.from === "office" ? "bg-ink text-white" : "ml-auto bg-mist text-ink")}>
                <p className={cx("text-[11.5px]", m.from === "office" ? "text-white/60" : "text-muted")}>
                  {m.from === "office" ? "TelineKiito" : m.by || t("biz.msg.you")} · {dateTime(m.at, lang)}
                </p>
                <p className="whitespace-pre-line">{m.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-[13px] text-muted">{t("biz.msg.none")}</p>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const r = await run("msg", () => bizMessage(o.ref, text.trim()), t("biz.msg.sent"));
            if (r) {
              setText("");
              onChange(r.order);
            }
          }}
        >
          <Input aria-label={t("biz.msg.title")} value={text} onChange={setText} placeholder={t("biz.msg.ph")} className="flex-1" />
          <Btn type="submit" variant="dark" busy={busy === "msg"} icon={<ISend className="h-4 w-4" />}>
            {t("biz.msg.send")}
          </Btn>
        </form>
      </div>
    </Card>
  );
}
