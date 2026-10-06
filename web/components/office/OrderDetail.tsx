"use client";
// Order panel: everything about one order, with status, schedule, messages, crew work, money and history.
import { useEffect, useMemo, useState } from "react";
import { SYSTEM_NAMES } from "@/lib/api";
import {
  INSPECTION_ITEMS,
  ORDER_FLOW,
  PART_KEYS,
  createInvoice,
  deleteOrder,
  docUrl,
  fileUrl,
  getOrderDetail,
  invoiceDocUrl,
  mapsUrl,
  satelliteUrl,
  patchOrder,
  type Crew,
  type OfficeOrderDetail,
  type OrderStatus,
  type Parts
} from "@/lib/platform";
import { IconClose, IconMail, IconPhone, IconPin } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { ago, dateTime, day, daysBetween, hoursMin, money, number, telHref } from "./format";
import {
  auditText,
  historyText,
  inspLabel,
  jobLabel,
  lineText,
  partLabel,
  photoStageLabel,
  roofLabel,
  sideText,
  statusLabel,
  urgLabel
} from "./i18n";
import { ICamera, IDoc, IExternal, IInvoice, ISend, ITrash, IWarn } from "./icons";
import { KindTag } from "./bits";
import { ChangeCard } from "./Approvals";
import { InvoiceActions, InvoiceStatusBadge } from "./Invoices";
import { OutboxRow } from "./Messages";
import { OrderFlags } from "./Orders";
import { PlanFields, planPatch, type PlanValue } from "./Calendar";
import {
  Async,
  Badge,
  Btn,
  Callout,
  Card,
  CardHead,
  Check,
  Confirm,
  Drawer,
  Empty,
  Field,
  IconBtn,
  KV,
  Select,
  StatusBadge,
  TableWrap,
  Tabs,
  TextArea,
  cx,
  td,
  th
} from "./ui";

type Tab = "summary" | "scaffold" | "work" | "messages" | "docs" | "activity";

export function OrderDrawer() {
  const { t } = useT();
  const { route, closeOrder } = useOffice();
  const ref = route.params.order;
  return (
    <Drawer open={!!ref} onClose={closeOrder} label={t("od.label", { ref: ref || "" })}>
      {ref ? <OrderPanel key={ref} refNo={ref} /> : null}
    </Drawer>
  );
}

function OrderPanel({ refNo }: { refNo: string }) {
  const i = useT();
  const { t } = i;
  const { closeOrder, route, setParams } = useOffice();
  const st = useLoad(() => getOrderDetail(refNo), [refNo], { poll: true });
  const tab = (route.params.otab as Tab) || "summary";
  const setTab = (k: Tab) => setParams({ otab: k === "summary" ? null : k });

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-white px-4 pt-4 sm:px-6">
        <div className="min-w-0 flex-1">
          {st.data ? <Head o={st.data.order} /> : <p className="font-mono text-lg font-bold text-ink">{refNo}</p>}
          {st.data ? (
            <Tabs
              className="mt-3 -mb-px border-b-0"
              label={t("od.tabs")}
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "summary", label: t("od.tab.summary"), count: st.data.order.changes.filter((c) => c.status === "pending").length },
                { key: "scaffold", label: t("od.tab.scaffold") },
                { key: "work", label: t("od.tab.work") },
                { key: "messages", label: t("od.tab.messages"), count: st.data.order.messages.length },
                { key: "docs", label: t("od.tab.docs") },
                { key: "activity", label: t("od.tab.activity") }
              ]}
            />
          ) : (
            <div className="h-4" />
          )}
        </div>
        <IconBtn label={t("ui.close")} onClick={closeOrder} className="mt-0.5 h-10 w-10">
          <IconClose />
        </IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Async state={st} rows={6}>
          {(d) => {
            const o = d.order;
            const reload = () => st.reload();
            return (
              <div className="p-4 sm:p-6">
                {tab === "summary" ? <SummaryTab o={o} crews={d.crews} reload={reload} /> : null}
                {tab === "scaffold" ? <ScaffoldTab o={o} /> : null}
                {tab === "work" ? <WorkTab o={o} /> : null}
                {tab === "messages" ? <MessagesTab o={o} reload={reload} /> : null}
                {tab === "docs" ? <DocsTab o={o} reload={reload} /> : null}
                {tab === "activity" ? <ActivityTab o={o} /> : null}
              </div>
            );
          }}
        </Async>
      </div>
    </>
  );
}

function Head({ o }: { o: OfficeOrderDetail }) {
  const i = useT();
  const { t, lang } = i;
  const a = o.assignment || {};
  const facts = [
    { k: t("od.f.start"), v: day(a.date || o.schedule.start, lang) + (a.time ? ` ${a.time}` : "") },
    { k: t("od.f.rental"), v: t("od.f.rentalV", { n: o.schedule.days, end: day(o.rentalEnd, lang, { weekday: false }) }) },
    { k: t("od.f.scaffold"), v: `${number(o.estimate.area, lang, 0)} m² · ${number(o.estimate.weightKg, lang, 0)} kg` },
    { k: t("od.f.speed"), v: urgLabel(i, o.schedule.urgency) },
    { k: t("od.f.total"), v: money(o.quote.total, lang) }
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pr-2">
        <h2 className="font-mono text-[19px] font-bold tracking-tight text-ink">{o.ref}</h2>
        <StatusBadge status={o.status} />
        <OrderFlags o={o} />
      </div>
      <p className="mt-1 truncate text-[14.5px] text-ink-soft">
        <span className="font-semibold text-ink">{o.customer.name}</span> · {o.site.address}
        <span className="text-muted"> · {jobLabel(i, o.house.jobType)}</span>
      </p>
      <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
        {facts.map((f) => (
          <div key={f.k} className="min-w-0">
            <dt className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">{f.k}</dt>
            <dd className="text-[14px] font-semibold text-ink tabular-nums">{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ======================= Summary ======================= */
function SummaryTab({ o, crews, reload }: { o: OfficeOrderDetail; crews: Crew[]; reload: () => void }) {
  const { t } = useT();
  const changes = [...o.changes].sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {o.example ? <Callout tone="info" title={t("od.exampleTitle")}>{t("od.exampleText")}</Callout> : null}
        {o.needsReview && ["received", "confirmed"].includes(o.status) ? <ReviewCallout o={o} /> : null}
        {o.zoneCheck && ["received", "confirmed"].includes(o.status) ? (
          <Callout tone="warn" title={t("od.zoneCheck.title")}>
            {t("od.zoneCheck.text", { zone: o.zoneCheck.zone, chosen: o.zoneCheck.chosen })}
          </Callout>
        ) : null}
        <StatusCard o={o} reload={reload} />
        <ScheduleCard o={o} crews={crews} reload={reload} />
        {changes.length ? (
          <section aria-labelledby="od-changes">
            <h3 id="od-changes" className="mb-2 font-display text-[16px] font-bold text-ink">
              {t("od.changes")}
            </h3>
            <div className="space-y-3">
              {changes.map((c) => (
                <ChangeCard key={c.id} c={c} compact onDone={reload} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <div className="space-y-4">
        <CustomerCard o={o} />
        <BizCard o={o} />
        <NotesCard o={o} reload={reload} />
        <DangerCard o={o} />
      </div>
    </div>
  );
}

function effectText(i: ReturnType<typeof useT>, from: OrderStatus, to: OrderStatus) {
  const back = ORDER_FLOW.indexOf(to) < ORDER_FLOW.indexOf(from) && from !== "cancelled";
  if (back) return i.t("od.st.effect.back");
  if (to === "confirmed" && from === "received") return i.t("od.st.effect.confirmed");
  return i.tk(`od.st.effect.${to}`, undefined, "");
}

function StatusCard({ o, reload }: { o: OfficeOrderDetail; reload: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [pick, setPick] = useState<string>("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [tell, setTell] = useState(false);
  const cancelled = o.status === "cancelled";
  const idx = ORDER_FLOW.indexOf(o.status);
  const next = !cancelled && idx >= 0 && idx < ORDER_FLOW.length - 1 ? ORDER_FLOW[idx + 1] : null;
  const finished = o.status === "dismantled" || o.status === "closed";

  async function move(to: OrderStatus) {
    const r = await run("status", () => patchOrder(o.ref, { status: to }), t("od.st.moved", { status: statusLabel(i, to) }));
    if (r) reload();
  }
  async function cancel() {
    const r = await run(
      "cancel",
      () => patchOrder(o.ref, { cancel: { reason: reason.trim() }, ...(tell && reason.trim() ? { message: reason.trim() } : {}) }),
      t("od.st.cancelled")
    );
    if (r) {
      setReason("");
      reload();
    }
    return !!r;
  }

  return (
    <Card aria-labelledby="od-status">
      <CardHead id="od-status" title={t("od.st.title")} sub={t("od.st.sub")} />
      <div className="px-5 pb-5">
        <ol className="flex flex-wrap gap-y-2" aria-label={t("od.st.flow")}>
          {ORDER_FLOW.map((s, k) => {
            const done = !cancelled && k < idx;
            const cur = !cancelled && k === idx;
            return (
              <li key={s} className="flex items-center" aria-current={cur ? "step" : undefined}>
                <span
                  className={cx(
                    "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap",
                    cur ? "bg-ink text-white" : done ? "bg-[#e9f7ef] text-[#17663a]" : "bg-mist text-muted"
                  )}
                >
                  <span aria-hidden className={cx("grid h-4 w-4 place-items-center rounded-full text-[10px]", cur ? "bg-sun text-ink" : done ? "bg-[#22a35a] text-white" : "bg-white text-muted ring-1 ring-line")}>
                    {done ? "✓" : k + 1}
                  </span>
                  {statusLabel(i, s)}
                  {done ? <span className="sr-only">({t("od.st.done")})</span> : null}
                </span>
                {k < ORDER_FLOW.length - 1 ? <span aria-hidden className="mx-1 h-px w-3 bg-line" /> : null}
              </li>
            );
          })}
        </ol>

        {cancelled ? (
          <Callout tone="danger" className="mt-4" title={t("od.st.isCancelled")}>
            {o.cancelled ? (
              <p>
                {dateTime(o.cancelled.at, lang)} · {o.cancelled.by}
                {o.cancelled.reason ? ` – ${o.cancelled.reason}` : ""}
              </p>
            ) : null}
          </Callout>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next ? (
            <Btn variant="primary" onClick={() => setTarget(next)} busy={busy === "status"}>
              {t("od.st.next", { status: statusLabel(i, next) })}
            </Btn>
          ) : null}
          <div className="flex items-center gap-2">
            <label htmlFor={`od-pick-${o.ref}`} className="sr-only">
              {t("od.st.pick")}
            </label>
            <Select
              id={`od-pick-${o.ref}`}
              className="!w-auto !py-2"
              value={pick}
              onChange={(v) => {
                setPick("");
                if (v) setTarget(v as OrderStatus);
              }}
              options={[{ value: "", label: cancelled ? t("od.st.restore") : t("od.st.pick") }, ...ORDER_FLOW.filter((s) => s !== o.status).map((s) => ({ value: s, label: statusLabel(i, s) }))]}
            />
          </div>
          {!cancelled && !finished ? (
            <Btn variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
              {t("od.st.cancel")}
            </Btn>
          ) : null}
        </div>
        {o.status === "loading" || o.status === "en_route" ? <p className="mt-3 text-[12.5px] text-muted">{t("od.st.crewHint")}</p> : null}
      </div>

      <Confirm
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? t("od.st.confirmTitle", { status: statusLabel(i, target) }) : ""}
        confirmLabel={t("od.st.confirmBtn")}
        onConfirm={() => target && move(target)}
        text={
          target ? (
            <>
              <p>{t("od.st.confirmText", { from: statusLabel(i, o.status), to: statusLabel(i, target) })}</p>
              {effectText(i, o.status, target) ? <p className="mt-2 font-medium text-ink">{effectText(i, o.status, target)}</p> : null}
              {o.example ? <p className="mt-2 text-muted">{t("od.st.exampleNoMsg")}</p> : null}
            </>
          ) : null
        }
      />
      <Confirm
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("od.st.cancelTitle", { ref: o.ref })}
        confirmLabel={t("od.st.cancelBtn")}
        danger
        onConfirm={cancel}
        text={<p>{t("od.st.cancelText")}</p>}
      >
        <Field label={t("od.st.reason")} optional>
          {(id) => <TextArea id={id} rows={3} value={reason} onChange={setReason} maxLength={300} />}
        </Field>
        <div className="mt-3">
          <Check checked={tell} onChange={setTell} label={t("od.st.tell")} hint={t("od.st.tellHint")} disabled={!reason.trim()} />
        </div>
      </Confirm>
    </Card>
  );
}

function ScheduleCard({ o, crews, reload }: { o: OfficeOrderDetail; crews: Crew[]; reload: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const a = o.assignment || {};
  const initial = useMemo(
    () => ({
      delivery: { date: a.date || "", time: a.time || "", crewId: a.crewId || "" },
      pickup: { date: a.pickupDate || "", time: a.pickupTime || "", crewId: a.pickupCrewId || "" }
    }),
    // Reset the form when the saved schedule changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(a)]
  );
  const [del, setDel] = useState<PlanValue>(initial.delivery);
  const [pick, setPick] = useState<PlanValue>(initial.pickup);
  const [confirmToo, setConfirmToo] = useState(true);
  useEffect(() => {
    setDel(initial.delivery);
    setPick(initial.pickup);
  }, [initial]);
  const dirty = JSON.stringify({ d: del, p: pick }) !== JSON.stringify({ d: initial.delivery, p: initial.pickup });
  const willConfirm = o.status === "received" && confirmToo && !!del.date;
  const pickupAllowed = !["received", "cancelled"].includes(o.status);

  async function save() {
    const assignment = { ...planPatch("delivery", del), ...(pickupAllowed || pick.date ? planPatch("pickup", pick) : {}) };
    const r = await run("schedule", () => patchOrder(o.ref, { assignment, ...(willConfirm ? { status: "confirmed" as const } : {}) }), willConfirm ? t("plan.savedConfirmed") : t("plan.saved"));
    if (r) reload();
  }
  const requested = o.schedule.start;
  return (
    <Card aria-labelledby="od-sched">
      <CardHead id="od-sched" title={t("od.sched.title")} sub={t("od.sched.requested", { date: day(requested, lang), speed: urgLabel(i, o.schedule.urgency) })} />
      <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="mb-2">
            <KindTag kind="delivery" />
          </legend>
          <PlanFields value={del} onChange={setDel} crews={crews} idPrefix={`od-d-${o.ref}`} />
          {del.date && del.date < requested && o.status === "received" ? <p className="mt-2 text-[12.5px] text-[#a4470a]">{t("od.sched.beforeRequested")}</p> : null}
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2">
            <KindTag kind="pickup" />
          </legend>
          <PlanFields value={pick} onChange={setPick} crews={crews} idPrefix={`od-p-${o.ref}`} pickup disabled={!pickupAllowed && !pick.date} />
          <p className="mt-2 text-[12.5px] text-muted">{pickupAllowed ? t("od.sched.pickupHint", { end: day(o.rentalEnd, lang) }) : t("od.sched.pickupLater")}</p>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        {o.status === "received" ? <Check checked={confirmToo} onChange={setConfirmToo} label={t("plan.confirm")} hint={t("plan.confirmHint")} /> : <span className="text-[12.5px] text-muted">{t("od.sched.notify")}</span>}
        <div className="flex gap-2">
          {dirty ? (
            <Btn
              variant="quiet"
              size="sm"
              onClick={() => {
                setDel(initial.delivery);
                setPick(initial.pickup);
              }}
            >
              {t("ui.undo")}
            </Btn>
          ) : null}
          <Btn variant="dark" size="sm" onClick={save} busy={busy === "schedule"} disabled={!dirty && !willConfirm}>
            {willConfirm ? t("plan.saveConfirm") : t("ui.save")}
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function CustomerCard({ o }: { o: OfficeOrderDetail }) {
  const { t, lang } = useT();
  return (
    <Card aria-labelledby="od-cust">
      <CardHead id="od-cust" title={t("od.cust.title")} />
      <div className="space-y-3 px-5 pb-5 text-[14px]">
        <p className="font-semibold text-ink">{o.customer.name}</p>
        <ul className="space-y-1.5">
          <li>
            <a href={telHref(o.customer.phone)} className="inline-flex items-center gap-2 font-medium text-ink hover:underline">
              <IconPhone className="h-4 w-4 text-muted" />
              {o.customer.phone}
            </a>
          </li>
          {o.customer.email ? (
            <li>
              <a href={`mailto:${o.customer.email}`} className="inline-flex items-center gap-2 font-medium break-all text-ink hover:underline">
                <IconMail className="h-4 w-4 shrink-0 text-muted" />
                {o.customer.email}
              </a>
            </li>
          ) : (
            <li className="flex items-center gap-2 text-muted">
              <IconMail className="h-4 w-4" />
              {t("od.cust.noEmail")}
            </li>
          )}
          <li>
            <a href={mapsUrl(o.site.address, o.geo)} target="_blank" rel="noopener" className="inline-flex items-start gap-2 font-medium text-ink hover:underline">
              <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <span>
                {o.site.address}
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[12.5px] font-normal text-muted">
                  {t("od.cust.route")} <IExternal className="h-3 w-3" />
                </span>
              </span>
            </a>
            <a href={satelliteUrl(o.site.address, o.geo)} target="_blank" rel="noopener" className="ml-6 inline-flex items-center gap-0.5 text-[12.5px] text-muted hover:text-ink hover:underline">
              {t("od.cust.satellite")} <IExternal className="h-3 w-3" />
            </a>
          </li>
        </ul>
        <KV
          items={[
            { k: t("od.cust.zone"), v: t("od.cust.zoneV", { z: o.site.zone }) },
            { k: t("od.cust.lang"), v: o.lang === "en" ? "English" : "Suomi" },
            { k: t("od.cust.created"), v: dateTime(o.createdAt, lang) },
            { k: t("od.cust.source"), v: t(`od.src.${o.source === "ai" ? "ai" : o.source === "address" ? "address" : "form"}`) },
            ...(o.discountPct ? [{ k: t("od.cust.partner"), v: t("od.cust.partnerV", { pct: o.discountPct }) }] : [])
          ]}
        />
        {o.notes ? (
          <div className="rounded-xl bg-sun-soft/60 px-3.5 py-2.5 ring-1 ring-[#f3dc8a]">
            <p className="text-[12px] font-semibold tracking-wide text-[#7a5a00] uppercase">{t("od.cust.notes")}</p>
            <p className="mt-0.5 whitespace-pre-line text-ink">{o.notes}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** The size from online data can't be trusted: what to check, a satellite link and the customer's photos. */
function ReviewCallout({ o }: { o: OfficeOrderDetail }) {
  const i = useT();
  const { t } = i;
  const photos = (o.files || []).filter((f) => f.kind === "photo" && f.stage === "customer").length;
  return (
    <Callout tone="warn" title={t("rv.title")}>
      <ul className="list-disc space-y-0.5 pl-5">
        {(o.sizeCheck?.reasons || [{ code: "storeys_many" }]).map((r, k) => (
          <li key={k}>{i.tk(`rv.${r.code}`, { n: r.n ?? "" }, r.code)}</li>
        ))}
      </ul>
      <p className="mt-2">{photos ? t("rv.photos", { n: photos }) : t("rv.noPhotos")}</p>
      <a href={satelliteUrl(o.site.address, o.geo)} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2">
        {t("rv.satellite")} <IExternal className="h-3.5 w-3.5" />
      </a>
    </Callout>
  );
}

/** PO, project, cost centre and site contact from the business portal. */
function BizCard({ o }: { o: OfficeOrderDetail }) {
  const { t } = useT();
  const b = o.business;
  if (!b || !(b.po || b.project || b.costCentre || b.siteContact?.name || b.siteContact?.phone || b.siteInfo || b.orderedBy)) return null;
  const contact = [b.siteContact?.name, b.siteContact?.phone].filter(Boolean).join(" · ");
  return (
    <Card aria-labelledby="od-biz">
      <CardHead id="od-biz" title={t("od.biz.title")} />
      <div className="px-5 pb-4">
        <KV
          items={[
            ...(b.po ? [{ k: t("od.biz.po"), v: b.po }] : []),
            ...(b.project ? [{ k: t("od.biz.project"), v: b.project }] : []),
            ...(b.costCentre ? [{ k: t("od.biz.costCentre"), v: b.costCentre }] : []),
            ...(contact ? [{ k: t("od.biz.contact"), v: contact }] : []),
            ...(b.orderedBy ? [{ k: t("od.biz.orderedBy"), v: b.orderedBy }] : [])
          ]}
        />
        {b.siteInfo ? <p className="mt-2 rounded-xl bg-mist px-3 py-2 text-[13px] whitespace-pre-line text-ink-soft">{b.siteInfo}</p> : null}
      </div>
    </Card>
  );
}

function NotesCard({ o, reload }: { o: OfficeOrderDetail; reload: () => void }) {
  const { t } = useT();
  const { busy, run } = useAct();
  const [text, setText] = useState(o.internalNotes || "");
  const saved = o.internalNotes || "";
  useEffect(() => setText(o.internalNotes || ""), [o.internalNotes]);
  return (
    <Card aria-labelledby="od-notes">
      <CardHead id="od-notes" title={t("od.notes.title")} sub={t("od.notes.sub")} />
      <div className="px-5 pb-5">
        <label htmlFor={`notes-${o.ref}`} className="sr-only">
          {t("od.notes.title")}
        </label>
        <TextArea id={`notes-${o.ref}`} rows={4} value={text} onChange={setText} maxLength={2000} placeholder={t("od.notes.ph")} />
        <div className="mt-2 flex justify-end">
          <Btn
            size="sm"
            variant="dark"
            disabled={text === saved}
            busy={busy === "notes"}
            onClick={async () => {
              const r = await run("notes", () => patchOrder(o.ref, { internalNotes: text }), t("od.notes.saved"));
              if (r) reload();
            }}
          >
            {t("ui.save")}
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function DangerCard({ o }: { o: OfficeOrderDetail }) {
  const { t } = useT();
  const { owner, closeOrder } = useOffice();
  const { run } = useAct();
  const [open, setOpen] = useState(false);
  if (!owner) return null;
  return (
    <Card aria-labelledby="od-danger" className="ring-[#f6cbc7]">
      <CardHead id="od-danger" title={t("od.del.title")} sub={t("od.del.sub")} />
      <div className="px-5 pb-5">
        <Btn variant="danger" size="sm" icon={<ITrash className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("od.del.btn")}
        </Btn>
      </div>
      <Confirm
        open={open}
        onClose={() => setOpen(false)}
        danger
        title={t("od.del.confirmTitle", { ref: o.ref })}
        confirmLabel={t("od.del.confirmBtn")}
        text={<p>{t("od.del.confirmText")}</p>}
        onConfirm={async () => {
          const r = await run("delete", () => deleteOrder(o.ref), t("od.del.done", { ref: o.ref }));
          if (r) closeOrder();
          return !!r;
        }}
      />
    </Card>
  );
}

/* ======================= Scaffold and price ======================= */
function ScaffoldTab({ o }: { o: OfficeOrderDetail }) {
  const i = useT();
  const { t, lang } = i;
  const h = o.house;
  const e = o.estimate;
  const parts = PART_KEYS.filter((k) => (e.parts[k] || 0) > 0);
  const q = o.quote;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card aria-labelledby="od-house">
          <CardHead id="od-house" title={t("od.house.title")} />
          <div className="px-5 pb-4">
            <KV
              items={[
                { k: t("od.house.job"), v: jobLabel(i, h.jobType) },
                { k: t("od.house.system"), v: SYSTEM_NAMES[h.system || "layher"] },
                { k: t("od.house.size"), v: `${number(h.length, lang, 2)} × ${number(h.width, lang, 2)} m` },
                ...(h.model && h.walls?.length ? [{ k: t("od.house.model"), v: t("od.house.modelVal", { date: h.model.date ? day(h.model.date, lang, { year: true }) : "" }) }] : []),
                { k: t("od.house.floors"), v: number(Number(h.floors), lang, 1) },
                { k: t("od.house.eave"), v: `${number(h.eave, lang, 1)} m` },
                { k: t("od.house.roof"), v: `${roofLabel(i, h.roofType)}${h.roofType !== "flat" ? ` · ${number(h.pitch, lang, 0)}°` : ""}` },
                { k: t("od.house.gables"), v: h.gables ? t("ui.yes") : t("ui.no") },
                { k: t("od.house.run"), v: `${number(e.runM, lang, 1)} m` },
                { k: t("od.house.catch"), v: e.catchRunM ? `${number(e.catchRunM, lang, 1)} m` : t("ui.no") }
              ]}
            />
          </div>
        </Card>
        <Card aria-labelledby="od-sides">
          <CardHead id="od-sides" title={t("od.sides.title")} sub={t("od.sides.sub", { area: number(e.area, lang, 0) })} />
          <TableWrap className="pb-2">
            <table className="w-full min-w-[460px]">
              <thead>
                <tr className="border-y border-line bg-mist/50">
                  <th scope="col" className={th}>
                    {t("od.sides.side")}
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    {t("od.sides.bays")}
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    {t("od.sides.lifts")}
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    {t("od.sides.height")}
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    {t("od.sides.area")}
                  </th>
                  <th scope="col" className={th}>
                    {t("od.sides.catch")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.sides.map((s, k) => (
                  <tr key={k} className="border-b border-line last:border-0">
                    <th scope="row" className={cx(td, "text-left font-semibold")}>
                      {sideText(i, s.name)}
                    </th>
                    <td className={cx(td, "text-right tabular-nums")}>{s.bays}</td>
                    <td className={cx(td, "text-right tabular-nums")}>{s.lifts}</td>
                    <td className={cx(td, "text-right tabular-nums")}>{number(s.workH, lang, 1)} m</td>
                    <td className={cx(td, "text-right tabular-nums")}>{number(s.area, lang, 0)} m²</td>
                    <td className={td}>{s.catchOn ? t("ui.yes") : t("ui.no")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>
      <div className="space-y-4">
        <Card aria-labelledby="od-parts">
          <CardHead id="od-parts" title={t("od.parts.title")} sub={t("od.parts.sub", { kg: number(e.weightKg, lang, 0), trucks: q.trucks })} />
          <ul className="divide-y divide-line px-5 pb-3">
            {parts.map((k) => (
              <li key={k} className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
                <span className="text-ink-soft">{partLabel(i, k)}</span>
                <span className="font-semibold text-ink tabular-nums">{t("ui.pcs", { n: e.parts[k] || 0 })}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card aria-labelledby="od-price">
          <CardHead id="od-price" title={t("od.price.title")} sub={t("od.price.sub")} />
          <div className="px-5 pb-5">
            <ul className="divide-y divide-line">
              {q.lines.map((l, k) => (
                <li key={k} className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
                  <span className="text-ink-soft">{lineText(i, l, q)}</span>
                  <span className={cx("font-medium tabular-nums", l.amount < 0 ? "text-[#17663a]" : "text-ink")}>{money(l.amount, lang)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 space-y-1 border-t-2 border-ink pt-3 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-muted">{t("od.price.net")}</dt>
                <dd className="tabular-nums">{money(q.net, lang)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("od.price.vat")}</dt>
                <dd className="tabular-nums">{money(q.vat, lang)}</dd>
              </div>
              <div className="flex justify-between pt-1 font-display text-[18px] font-bold">
                <dt>{t("od.price.total")}</dt>
                <dd className="tabular-nums">{money(q.total, lang)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">
              {t("od.price.labour", { amount: money(q.labourGross, lang) })} · {t("od.price.perM2", { amount: money(q.perM2, lang) })}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ======================= Crew work ======================= */
function PartsList({ parts, empty }: { parts?: Parts; empty?: string }) {
  const i = useT();
  const keys = PART_KEYS.filter((k) => (parts?.[k] || 0) > 0);
  if (!keys.length) return <p className="text-[13px] text-muted">{empty || "–"}</p>;
  return (
    <ul className="space-y-0.5 text-[13.5px]">
      {keys.map((k) => (
        <li key={k} className="flex justify-between gap-3">
          <span className="text-ink-soft">{partLabel(i, k)}</span>
          <span className="font-semibold tabular-nums">{parts?.[k]}</span>
        </li>
      ))}
    </ul>
  );
}

function Step({ title, done, when, children }: { title: string; done: boolean; when?: React.ReactNode; children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <li className="relative pl-8">
      <span aria-hidden className={cx("absolute top-0.5 left-0 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold", done ? "bg-[#22a35a] text-white" : "bg-white text-muted ring-1 ring-line")}>
        {done ? "✓" : ""}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[14.5px] font-semibold text-ink">
          {title}
          <span className="sr-only"> – {done ? t("od.work.doneSr") : t("od.work.notYetSr")}</span>
        </p>
        {when ? <p className="text-[12.5px] text-muted">{when}</p> : null}
      </div>
      {children ? <div className="mt-1.5">{children}</div> : null}
    </li>
  );
}

function WorkTab({ o }: { o: OfficeOrderDetail }) {
  const i = useT();
  const { t, lang } = i;
  const w = o.work || {};
  const insp = w.inspection;
  const items = INSPECTION_ITEMS.filter((k) => k !== "catch" || o.estimate.catchRunM > 0);
  const photos = o.photos || [];
  const minutes = o.time.reduce((m, e) => m + ((e.end ? Date.parse(e.end) : Date.now()) - Date.parse(e.start)) / 60e3, 0);
  const by = (who?: string, at?: string) => (at ? `${dateTime(at, lang)}${who ? ` · ${who}` : ""}` : undefined);
  const loadedCount = Object.values(w.loaded?.checked || {}).reduce((s, n) => s + (n || 0), 0);
  const neededCount = Object.values(o.estimate.parts || {}).reduce((s, n) => s + (n || 0), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card aria-labelledby="od-work">
        <CardHead id="od-work" title={t("od.work.title")} sub={t("od.work.sub")} />
        <ol className="space-y-5 px-5 pb-5">
          <Step title={t("od.work.loaded")} done={!!w.loaded?.done} when={by(w.loaded?.by, w.loaded?.at)}>
            {w.loaded ? (
              <p className="text-[13px] text-ink-soft">
                {t("od.work.loadedCount", { n: loadedCount, of: neededCount })}
                {w.loaded.notes ? ` – ${w.loaded.notes}` : ""}
              </p>
            ) : null}
          </Step>
          <Step title={t("od.work.arrived")} done={!!w.arrivedAt} when={w.arrivedAt ? dateTime(w.arrivedAt, lang) : undefined} />
          <Step title={t("od.work.inspection")} done={!!(insp && items.every((k) => insp.items?.[k]))} when={by(insp?.by, insp?.at)}>
            {insp ? (
              <div className="space-y-3">
                <ul className="grid gap-1 text-[13.5px] sm:grid-cols-1">
                  {items.map((k) => {
                    const ok = !!insp.items?.[k];
                    return (
                      <li key={k} className="flex items-start gap-2">
                        <span aria-hidden className={cx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-bold", ok ? "bg-[#22a35a] text-white" : "bg-[#fff0ef] text-[#b42318] ring-1 ring-[#f6cbc7]")}>
                          {ok ? "✓" : "!"}
                        </span>
                        <span className={ok ? "text-ink-soft" : "font-medium text-[#b42318]"}>
                          {inspLabel(i, k)}
                          <span className="sr-only"> – {ok ? t("od.work.ok") : t("od.work.notChecked")}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {insp.notes ? <p className="rounded-lg bg-mist px-3 py-2 text-[13px] text-ink-soft">{insp.notes}</p> : null}
                {insp.signature ? (
                  <figure>
                    <img src={fileUrl(insp.signature)} alt={t("od.work.signatureAlt", { name: insp.signer || "" })} className="h-20 rounded-lg bg-white ring-1 ring-line" />
                    <figcaption className="mt-1 text-[12.5px] text-muted">
                      {t("od.work.signedBy", { name: insp.signer || "–" })}
                      {insp.signedAt ? ` · ${dateTime(insp.signedAt, lang)}` : ""}
                    </figcaption>
                  </figure>
                ) : insp.noSignatureReason ? (
                  <p className="text-[13px] text-[#a4470a]">{t("od.work.noSignature", { reason: insp.noSignatureReason })}</p>
                ) : (
                  <p className="text-[13px] text-muted">{t("od.work.signatureMissing")}</p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted">{t("od.work.inspectionNone")}</p>
            )}
          </Step>
          <Step
            title={t("od.work.rental")}
            done={!!o.rental?.startedAt}
            when={o.rental?.startedAt ? t("od.work.rentalV", { from: day(o.rental.startedAt.slice(0, 10), lang), to: day(o.rental.endedAt ? o.rental.endedAt.slice(0, 10) : o.rentalEnd, lang) }) : undefined}
          >
            {o.rental?.startedAt && !o.rental.endedAt ? <p className="text-[13px] text-ink-soft">{t("od.work.rentalLeft", { n: daysBetween(o.rental.startedAt.slice(0, 10), o.rentalEnd) })}</p> : null}
          </Step>
          <Step title={t("od.work.visits")} done={!!w.visits?.length}>
            {w.visits?.length ? (
              <ul className="space-y-1 text-[13.5px]">
                {w.visits.map((v, k) => (
                  <li key={k} className="flex flex-wrap items-baseline gap-x-2">
                    <Badge tone={v.ok ? "green" : "red"} dot>
                      {v.ok ? t("od.work.visitOk") : t("od.work.visitIssue")}
                    </Badge>
                    <span className="text-muted">
                      {dateTime(v.at, lang)} · {v.by}
                    </span>
                    {v.notes ? <span className="w-full text-ink-soft">{v.notes}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">{t("od.work.visitsNone")}</p>
            )}
          </Step>
          <Step title={t("od.work.pickup")} done={!!w.pickup?.at} when={by(w.pickup?.by, w.pickup?.at)}>
            {w.pickup ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t("od.work.counted")}</p>
                  <PartsList parts={w.pickup.counted} />
                </div>
                <div>
                  <p className="mb-1 text-[12px] font-semibold tracking-wide text-[#b42318] uppercase">{t("od.work.missing")}</p>
                  <PartsList parts={w.pickup.missing} empty={t("od.work.none")} />
                </div>
                <div>
                  <p className="mb-1 text-[12px] font-semibold tracking-wide text-[#a4470a] uppercase">{t("od.work.damaged")}</p>
                  <PartsList parts={w.pickup.damaged} empty={t("od.work.none")} />
                </div>
                {w.pickup.notes ? <p className="text-[13px] text-ink-soft sm:col-span-3">{w.pickup.notes}</p> : null}
              </div>
            ) : null}
          </Step>
        </ol>
      </Card>

      <div className="space-y-4">
        <Card aria-labelledby="od-photos">
          <CardHead id="od-photos" title={t("od.photos.title")} sub={photos.length ? t("od.photos.count", { n: photos.length }) : undefined} />
          {photos.length ? (
            <ul className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id}>
                  <a href={fileUrl(p.id)} target="_blank" rel="noopener" className="group block overflow-hidden rounded-xl ring-1 ring-line">
                    <img src={fileUrl(p.id)} alt={t("od.photos.alt", { stage: photoStageLabel(i, p.stage), date: dateTime(p.at, lang) })} loading="lazy" className="aspect-[4/3] w-full bg-mist object-cover transition-transform group-hover:scale-[1.03]" />
                  </a>
                  <p className="mt-1 truncate text-[12px] font-semibold text-ink">{photoStageLabel(i, p.stage)}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {dateTime(p.at, lang)} · {p.by}
                  </p>
                  {p.note ? <p className="text-[12px] text-ink-soft">{p.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<ICamera className="h-6 w-6" />} title={t("od.photos.none")} text={t("od.photos.noneText")} className="py-6" />
          )}
        </Card>
        <Card aria-labelledby="od-hours">
          <CardHead id="od-hours" title={t("od.hours.title")} sub={o.time.length ? t("od.hours.total", { h: hoursMin(minutes, lang) }) : undefined} />
          {o.time.length ? (
            <TableWrap className="pb-2">
              <table className="w-full min-w-[380px]">
                <thead>
                  <tr className="border-y border-line bg-mist/50">
                    <th scope="col" className={th}>
                      {t("od.hours.who")}
                    </th>
                    <th scope="col" className={th}>
                      {t("od.hours.start")}
                    </th>
                    <th scope="col" className={cx(th, "text-right")}>
                      {t("od.hours.duration")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.time.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className={td}>{e.staffName}</td>
                      <td className={cx(td, "text-[13px] text-ink-soft")}>{dateTime(e.start, lang)}</td>
                      <td className={cx(td, "text-right tabular-nums")}>
                        {e.status === "running" ? <Badge tone="green" dot>{t("od.hours.running")}</Badge> : hoursMin((Date.parse(e.end || e.start) - Date.parse(e.start)) / 60e3, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <p className="px-5 pb-5 text-[13.5px] text-muted">{t("od.hours.none")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ======================= Messages ======================= */
function MessagesTab({ o, reload }: { o: OfficeOrderDetail; reload: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const [text, setText] = useState("");
  async function send() {
    if (!text.trim()) return;
    const r = await run("msg", () => patchOrder(o.ref, { message: text.trim() }), t("od.msg.sent"));
    if (r) {
      setText("");
      reload();
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card aria-labelledby="od-thread">
        <CardHead id="od-thread" title={t("od.msg.title")} sub={t("od.msg.sub", { name: o.customer.name })} />
        <div className="px-5 pb-5">
          {o.messages.length ? (
            <ol className="space-y-3">
              {o.messages.map((m, k) => {
                const mine = m.from === "office";
                return (
                  <li key={k} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cx("max-w-[85%] rounded-2xl px-4 py-2.5", mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-mist text-ink ring-1 ring-line")}>
                      <p className={cx("text-[12px] font-semibold", mine ? "text-white/60" : "text-muted")}>
                        {mine ? `${t("od.msg.office")}${m.by ? ` · ${m.by}` : ""}` : o.customer.name} · {dateTime(m.at, lang)}
                      </p>
                      <p className="mt-0.5 text-[14.5px] leading-relaxed whitespace-pre-line">{m.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="py-4 text-center text-[13.5px] text-muted">{t("od.msg.none")}</p>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <label htmlFor={`reply-${o.ref}`} className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
              {t("od.msg.reply")}
            </label>
            <TextArea
              id={`reply-${o.ref}`}
              rows={3}
              value={text}
              onChange={setText}
              maxLength={1000}
              placeholder={t("od.msg.ph")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
              }}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] text-muted">{o.example ? t("od.msg.exampleHint") : t("od.msg.hint")}</p>
              <Btn variant="dark" size="sm" icon={<ISend className="h-4 w-4" />} onClick={send} busy={busy === "msg"} disabled={!text.trim()}>
                {t("od.msg.send")}
              </Btn>
            </div>
          </div>
        </div>
      </Card>
      <Card aria-labelledby="od-outbox">
        <CardHead id="od-outbox" title={t("od.outbox.title")} sub={t("od.outbox.sub")} />
        {o.outbox.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {o.outbox.map((m) => (
              <OutboxRow key={m.id} m={m} compact />
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-[13.5px] text-muted">{t("od.outbox.none")}</p>
        )}
      </Card>
    </div>
  );
}

/* ======================= Documents and invoices ======================= */
function DocsTab({ o, reload }: { o: OfficeOrderDetail; reload: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { owner, notify } = useOffice();
  const { busy, run } = useAct();
  const hasInspection = !!(o.rental?.startedAt || o.work?.inspection);
  const open = o.invoices.filter((iv) => iv.status !== "void");
  const canInvoice = owner && !open.length && o.status !== "cancelled" && !o.example;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card aria-labelledby="od-docs">
        <CardHead id="od-docs" title={t("od.docs.title")} sub={t("od.docs.sub")} />
        <ul className="space-y-2 px-5 pb-5">
          <li>
            <a href={docUrl("confirmation", o.ref)} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line hover:ring-ink/30">
              <IDoc className="h-5 w-5 text-muted" />
              <span className="flex-1 text-[14px] font-semibold text-ink">{t("od.docs.confirmation")}</span>
              <IExternal className="h-4 w-4 text-muted" />
              <span className="sr-only">{t("ui.newTab")}</span>
            </a>
          </li>
          <li>
            {hasInspection ? (
              <a href={docUrl("inspection", o.ref)} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line hover:ring-ink/30">
                <IDoc className="h-5 w-5 text-muted" />
                <span className="flex-1 text-[14px] font-semibold text-ink">{t("od.docs.inspection")}</span>
                <IExternal className="h-4 w-4 text-muted" />
                <span className="sr-only">{t("ui.newTab")}</span>
              </a>
            ) : (
              <p className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted ring-1 ring-line ring-dashed">
                <IDoc className="h-5 w-5" />
                <span className="flex-1 text-[14px]">
                  {t("od.docs.inspection")} – {t("od.docs.inspectionLater")}
                </span>
              </p>
            )}
          </li>
        </ul>
        {owner && o.review ? (
          <div className="border-t border-line px-5 py-4">
            <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{t("od.docs.review")}</p>
            <p className="mt-1 text-[14px] text-ink">
              {"★".repeat(o.review.stars)}
              <span className="text-line">{"★".repeat(5 - o.review.stars)}</span>
              <span className="sr-only">{t("reviews.stars", { n: o.review.stars })}</span>
            </p>
            {o.review.text ? <p className="mt-1 text-[13.5px] text-ink-soft">“{o.review.text}”</p> : null}
          </div>
        ) : null}
      </Card>
      {owner ? (
        <Card aria-labelledby="od-inv">
          <CardHead
            id="od-inv"
            title={t("od.inv.title")}
            actions={
              canInvoice ? (
                <Btn
                  size="sm"
                  variant="primary"
                  icon={<IInvoice className="h-4 w-4" />}
                  busy={busy === "inv"}
                  onClick={async () => {
                    const r = await run("inv", () => createInvoice(o.ref));
                    if (r) {
                      notify(t("od.inv.created", { no: r.invoice.no }));
                      reload();
                    }
                  }}
                >
                  {t("od.inv.create")}
                </Btn>
              ) : null
            }
          />
          <div className="px-5 pb-5">
            {o.example ? <p className="mb-3 text-[13px] text-muted">{t("od.inv.example")}</p> : null}
            {!["dismantled", "closed"].includes(o.status) && canInvoice ? <p className="mb-3 text-[13px] text-muted">{t("od.inv.early")}</p> : null}
            {o.invoices.length ? (
              <ul className="space-y-2">
                {o.invoices.map((iv) => (
                  <li key={iv.id} className="rounded-xl px-3.5 py-3 ring-1 ring-line">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-ink">
                        {t("inv.no", { no: iv.no })} · <span className="tabular-nums">{money(iv.total, lang)}</span>
                      </p>
                      <InvoiceStatusBadge iv={iv} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {t("inv.dates", { date: day(iv.date, lang, { weekday: false, year: true }), due: day(iv.due, lang, { weekday: false, year: true }) })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Btn size="xs" variant="light" href={invoiceDocUrl(iv.no)} newTab icon={<IExternal className="h-3.5 w-3.5" />}>
                        {t("inv.open")}
                      </Btn>
                      <InvoiceActions iv={iv} onDone={reload} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-muted">{t("od.inv.none")}</p>
            )}
            <p className="mt-3 text-[12.5px] text-muted">{t("od.inv.how")}</p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* ======================= Activity ======================= */
function ActivityTab({ o }: { o: OfficeOrderDetail }) {
  const i = useT();
  const { t, lang } = i;
  const history = [...(o.history || [])].reverse();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card aria-labelledby="od-hist">
        <CardHead id="od-hist" title={t("od.act.history")} sub={t("od.act.historySub")} />
        <ol className="space-y-0 px-5 pb-5">
          {history.map((h, k) => (
            <li key={k} className="relative border-l border-line py-2 pl-5 last:pb-0">
              <span aria-hidden className={cx("absolute top-3.5 -left-[5px] h-2.5 w-2.5 rounded-full ring-2 ring-white", h.status ? "bg-ink" : "bg-steel")} />
              <p className="text-[14px] font-medium text-ink">{historyText(i, h)}</p>
              <p className="text-[12.5px] text-muted">
                {dateTime(h.at, lang)}
                {h.by ? ` · ${h.by === "customer" ? t("od.act.customer") : h.by === "office" ? t("od.act.office") : h.by}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </Card>
      <Card aria-labelledby="od-audit">
        <CardHead id="od-audit" title={t("od.act.audit")} sub={t("od.act.auditSub")} />
        {o.audit.length ? (
          <ol className="divide-y divide-line px-5 pb-4">
            {o.audit.map((a) => (
              <li key={a.id} className="py-2">
                <p className="text-[14px] text-ink">{auditText(i, a)}</p>
                <p className="text-[12.5px] text-muted">
                  {ago(a.createdAt, lang)} · {a.actor.role === "customer" ? t("od.act.customer") : a.actor.name}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 pb-5 text-[13.5px] text-muted">{t("od.act.none")}</p>
        )}
      </Card>
      {o.status === "cancelled" ? (
        <div className="lg:col-span-2">
          <Callout tone="warn" icon={<IWarn className="h-5 w-5" />}>
            {t("od.act.cancelledNote")}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
