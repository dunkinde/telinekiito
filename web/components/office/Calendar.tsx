"use client";
// Dispatch calendar: crews × days. Drag an order onto a crew and day (or use the Plan button) to schedule it.
import { useMemo, useState } from "react";
import { addDays, getCalendar, patchOrder, weekStart, type Assignment, type CalendarData, type Crew, type Job, type OrderStatus } from "@/lib/platform";
import { IconTruck } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { day, dayMonth, isoWeek, number, weekday } from "./format";
import { statusLabel, urgShort } from "./i18n";
import { ICalendar, IDrag, ILeft, IPickup, IRight, IWarn } from "./icons";
import { CrewDot, JobRow, KindTag } from "./bits";
import { Async, Badge, Btn, Card, CardHead, Check, Chips, Dialog, Empty, ExampleBadge, Field, IconBtn, Input, STATUS_HEX, Select, Toolbar, cx } from "./ui";

/* ---------------- Plan fields (shared with the order panel) ---------------- */
export interface PlanValue {
  date: string;
  time: string;
  crewId: string;
}
export function planPatch(kind: "delivery" | "pickup", v: PlanValue): Assignment {
  return kind === "delivery" ? { date: v.date || null, time: v.time || "", crewId: v.crewId || null } : { pickupDate: v.date || null, pickupTime: v.time || "", pickupCrewId: v.crewId || null };
}
export function PlanFields({ value, onChange, crews, idPrefix, pickup, disabled }: { value: PlanValue; onChange: (v: PlanValue) => void; crews: Crew[]; idPrefix: string; pickup?: boolean; disabled?: boolean }) {
  const { t } = useT();
  const opts = [
    { value: "", label: pickup ? t("plan.sameCrew") : t("plan.noCrew") },
    ...crews.filter((c) => c.active || c.id === value.crewId).map((c) => ({ value: c.id, label: c.active ? c.name : `${c.name} (${t("team.off")})` }))
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("plan.date")}>{(id) => <Input id={id || idPrefix + "-date"} type="date" value={value.date} onChange={(d) => onChange({ ...value, date: d })} disabled={disabled} />}</Field>
      <Field label={t("plan.time")}>{(id) => <Input id={id} type="time" value={value.time} onChange={(x) => onChange({ ...value, time: x })} disabled={disabled} step="900" />}</Field>
      <Field label={t("plan.crew")} className="col-span-2">
        {(id) => <Select id={id} value={value.crewId} onChange={(c) => onChange({ ...value, crewId: c })} options={opts} disabled={disabled} />}
      </Field>
    </div>
  );
}

/* ---------------- Plan dialog ---------------- */
export interface PlanTarget {
  ref: string;
  kind: "delivery" | "pickup";
  status: OrderStatus;
  title: string;
  info: string;
  value: PlanValue;
  example?: boolean;
}
export function PlanDialog({ target, onClose, crews, capacity, onSaved }: { target: PlanTarget | null; onClose: () => void; crews: Crew[]; capacity?: CalendarData["capacity"]; onSaved?: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const [v, setV] = useState<PlanValue>({ date: "", time: "", crewId: "" });
  const [confirmToo, setConfirmToo] = useState(true);
  const [key, setKey] = useState("");
  const k = target ? `${target.ref}-${target.kind}-${target.value.date}-${target.value.crewId}` : "";
  if (target && k !== key) {
    setKey(k);
    setV(target.value);
    setConfirmToo(true);
  }
  const cap = capacity?.find((c) => c.date === v.date);
  const full = cap && cap.max != null && cap.booked >= cap.max;
  const willConfirm = !!target && target.kind === "delivery" && target.status === "received" && confirmToo && !!v.date;
  async function save() {
    if (!target) return;
    const r = await run(
      "plan",
      () => patchOrder(target.ref, { assignment: planPatch(target.kind, v), ...(willConfirm ? { status: "confirmed" as const } : {}) }),
      willConfirm ? t("plan.savedConfirmed") : t("plan.saved")
    );
    if (r) {
      onSaved?.();
      onClose();
    }
  }
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target ? t(target.kind === "delivery" ? "plan.titleDelivery" : "plan.titlePickup", { ref: target.ref }) : ""}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={save} busy={busy === "plan"} disabled={!v.date}>
            {willConfirm ? t("plan.saveConfirm") : t("ui.save")}
          </Btn>
        </>
      }
    >
      {target ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div className="rounded-xl bg-mist px-4 py-3">
            <p className="text-[14.5px] font-semibold text-ink">{target.title}</p>
            <p className="text-[13px] text-muted">{target.info}</p>
          </div>
          <PlanFields value={v} onChange={setV} crews={crews} idPrefix="plan" pickup={target.kind === "pickup"} />
          {full ? (
            <p className="flex items-center gap-2 text-[13px] font-medium text-[#a4470a]">
              <IWarn className="h-4 w-4" />
              {t("plan.full", { date: day(v.date, lang), n: cap!.booked, max: cap!.max! })}
            </p>
          ) : null}
          {target.kind === "delivery" && target.status === "received" ? (
            <Check checked={confirmToo} onChange={setConfirmToo} label={t("plan.confirm")} hint={target.example ? t("od.st.exampleNoMsg") : t("plan.confirmHint")} />
          ) : target.kind === "pickup" ? (
            <p className="text-[12.5px] text-muted">{t("plan.pickupNotify")}</p>
          ) : null}
          <button type="submit" className="sr-only">
            {t("ui.save")}
          </button>
        </form>
      ) : null}
    </Dialog>
  );
}

/* ---------------- Calendar ---------------- */
type Drag = { ref: string; kind: "delivery" | "pickup" };
const DND = "application/x-telinekiito";

function JobCard({ job, onDragStart, onDragEnd }: { job: Job; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { openOrder } = useOffice();
  const del = job.kind === "delivery";
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => openOrder(job.ref)}
      title={`${job.ref} · ${job.address} · ${job.customer} · ${statusLabel(i, job.status)} · ${number(job.area, lang, 0)} m²`}
      className={cx(
        "group block w-full cursor-grab rounded-lg border-l-[3px] bg-white px-2 py-1.5 text-left shadow-[0_1px_0_rgba(14,18,23,0.04)] ring-1 ring-line transition-shadow hover:shadow-md hover:ring-ink/25 active:cursor-grabbing",
        del ? "border-l-[#2f6fde]" : "border-l-[#f07a1a] bg-[repeating-linear-gradient(135deg,#fff,#fff_6px,#fff7ef_6px,#fff7ef_12px)]",
        job.done && "opacity-60"
      )}
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-bold">
        {del ? <IconTruck className="h-3.5 w-3.5 shrink-0 text-[#1f4fa8]" /> : <IPickup className="h-3.5 w-3.5 shrink-0 text-[#a4470a]" />}
        <span className={cx("min-w-0 truncate", del ? "text-[#1f4fa8]" : "text-[#a4470a]")}>{t(del ? "cal.deliveryShort" : "cal.pickupShort")}</span>
        <span className="ml-auto shrink-0 tabular-nums text-ink">{job.time || "–"}</span>
      </span>
      <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-ink">{job.address.split(",")[0]}</span>
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_HEX[job.status] }} />
        <span className="truncate">{statusLabel(i, job.status)}</span>
      </span>
      {job.example ? <span className="mt-0.5 block text-[10.5px] font-semibold text-muted uppercase">{t("orders.example")}</span> : null}
      {job.done ? <span className="sr-only">{t("cal.done")}</span> : null}
    </button>
  );
}

export function CalendarView() {
  const i = useT();
  const { t, lang } = i;
  const { today, route, setParams, crews: allCrews } = useOffice();
  const from = route.params.from || weekStart(today);
  const span = route.params.w === "2" ? 14 : 7;
  const cal = useLoad(() => getCalendar(from, span), [from, span], { poll: true });
  const [target, setTarget] = useState<PlanTarget | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Drag | null>(null);

  const go = (d: string | null) => setParams({ from: d && d !== weekStart(today) ? d : null });
  const days = cal.data?.days || Array.from({ length: span }, (_, k) => addDays(from, k));
  const label = `${t("cal.week", { n: isoWeek(from) })}${span === 14 ? `–${isoWeek(addDays(from, 7))}` : ""} · ${dayMonth(days[0], lang)} – ${day(days[days.length - 1], lang, { weekday: false, year: true })}`;

  const crews = useMemo(() => {
    const d = cal.data;
    if (!d) return [] as Crew[];
    const used = new Set(d.jobs.map((j) => j.crewId));
    return d.crews.filter((c) => c.active || used.has(c.id));
  }, [cal.data]);

  function openPlanFor(ref: string, kind: "delivery" | "pickup", value?: Partial<PlanValue>) {
    const d = cal.data;
    if (!d) return;
    const job = d.jobs.find((j) => j.ref === ref && j.kind === kind);
    const un = d.unassigned.find((u) => u.ref === ref);
    const pk = d.pickupsToPlan.find((p) => p.ref === ref);
    let base: PlanTarget | null = null;
    if (job) {
      base = {
        ref,
        kind,
        status: job.status,
        example: job.example,
        title: `${job.customer} · ${job.address}`,
        info: `${number(job.area, lang, 0)} m² · ${statusLabel(i, job.status)}`,
        value: { date: job.date, time: job.time, crewId: job.crewId || "" }
      };
    } else if (un && kind === "delivery") {
      base = {
        ref,
        kind,
        status: un.status,
        example: un.example,
        title: `${un.customer} · ${un.address}`,
        info: t("cal.requested", { date: day(un.start, lang), days: un.days, speed: urgShort(i, un.urgency) }) + ` · ${number(un.area, lang, 0)} m²`,
        value: { date: un.start, time: "", crewId: "" }
      };
    } else if (pk) {
      base = {
        ref,
        kind: "pickup",
        status: "pickup_requested",
        title: `${pk.customer} · ${pk.address}`,
        info: t("cal.rentalEnds", { date: day(pk.rentalEnd, lang) }) + ` · ${number(pk.area, lang, 0)} m²`,
        value: { date: pk.rentalEnd < today ? today : pk.rentalEnd, time: "", crewId: "" }
      };
    }
    if (base) setTarget({ ...base, value: { ...base.value, ...value } });
  }

  function dragStart(e: React.DragEvent, d: Drag) {
    e.dataTransfer.setData(DND, JSON.stringify(d));
    e.dataTransfer.setData("text/plain", d.ref);
    e.dataTransfer.effectAllowed = "move";
    setDragging(d);
  }
  function drop(e: React.DragEvent, date: string, crewId: string) {
    e.preventDefault();
    setOver(null);
    setDragging(null);
    let d: Drag | null = null;
    try {
      d = JSON.parse(e.dataTransfer.getData(DND));
    } catch {
      d = null;
    }
    if (!d) return;
    const existing = cal.data?.jobs.find((j) => j.ref === d!.ref && j.kind === d!.kind);
    openPlanFor(d.ref, d.kind, { date, crewId, ...(existing ? { time: existing.time } : {}) });
  }
  const cellProps = (date: string, crewId: string) => {
    const id = `${date}|${crewId}`;
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (over !== id) setOver(id);
      },
      onDragLeave: () => setOver((o) => (o === id ? null : o)),
      onDrop: (e: React.DragEvent) => drop(e, date, crewId)
    };
  };

  return (
    <div>
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <IconBtn label={t("cal.prev")} onClick={() => go(addDays(from, -7))}>
            <ILeft className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn label={t("cal.next")} onClick={() => go(addDays(from, 7))}>
            <IRight className="h-[18px] w-[18px]" />
          </IconBtn>
          <Btn size="sm" variant="light" onClick={() => go(null)} disabled={from === weekStart(today)}>
            {t("cal.today")}
          </Btn>
          <p className="ml-1 font-display text-[16px] font-bold text-ink" aria-live="polite">
            {label}
          </p>
        </div>
        <Chips
          label={t("cal.span")}
          value={span === 14 ? "2" : "1"}
          onChange={(k) => setParams({ w: k === "2" ? "2" : null })}
          options={[
            { key: "1", label: t("cal.oneWeek") },
            { key: "2", label: t("cal.twoWeeks") }
          ]}
        />
      </Toolbar>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Card as="div" className="overflow-hidden">
            <Async state={cal} rows={6}>
              {(d) => (
                <>
                  {/* Grid: tablets and up */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full table-fixed border-collapse" style={{ minWidth: 136 + span * (span === 14 ? 100 : 108) }}>
                      <caption className="sr-only">{t("cal.caption", { range: label })}</caption>
                      <colgroup>
                        <col style={{ width: 136 }} />
                        {days.map((dd) => (
                          <col key={dd} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col" className="sticky left-0 z-10 border-b border-line bg-white px-3 py-2 text-left text-[12px] font-semibold text-muted uppercase">
                            {t("cal.crew")}
                          </th>
                          {days.map((dd) => {
                            const cap = d.capacity.find((c) => c.date === dd);
                            const full = cap && cap.max != null && cap.booked >= cap.max;
                            const isToday = dd === today;
                            const wk = new Date(dd + "T12:00:00Z").getUTCDay();
                            return (
                              <th key={dd} scope="col" className={cx("border-b border-l border-line px-2 py-2 text-left align-top", isToday ? "bg-sun-soft/70" : wk === 0 || wk === 6 ? "bg-mist/60" : "bg-white")}>
                                <span className="flex items-baseline gap-1.5">
                                  <span className={cx("text-[12px] font-semibold uppercase", isToday ? "text-ink" : "text-muted")}>{weekday(dd, lang)}</span>
                                  <span className="font-display text-[15px] font-bold text-ink">{dayMonth(dd, lang)}</span>
                                  {isToday ? <span className="sr-only">({t("cal.todayLabel")})</span> : null}
                                </span>
                                {cap && cap.max != null ? (
                                  <span className="mt-1 flex items-center gap-1.5" title={t("cal.capacityHint")}>
                                    <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                                      <span className={cx("block h-full rounded-full", full ? "bg-signal" : "bg-ink/60")} style={{ width: `${Math.min(100, (cap.booked / Math.max(1, cap.max)) * 100)}%` }} />
                                    </span>
                                    <span className={cx("text-[11.5px] font-semibold tabular-nums", full ? "text-[#b42318]" : "text-muted")}>
                                      {full ? t("cal.full") : `${cap.booked}/${cap.max}`}
                                      <span className="sr-only"> {t("cal.capacitySr", { n: cap.booked, max: cap.max })}</span>
                                    </span>
                                  </span>
                                ) : null}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {[...crews.map((c) => ({ id: c.id, name: c.name, color: c.color, truck: c.truck })), { id: "", name: t("cal.noCrew"), color: "", truck: "" }].map((row) => {
                          const rowJobs = d.jobs.filter((j) => (j.crewId || "") === row.id);
                          if (!row.id && !rowJobs.length && !dragging) return null;
                          return (
                            <tr key={row.id || "none"}>
                              <th scope="row" className="sticky left-0 z-10 border-b border-line bg-white px-3 py-2 text-left align-top">
                                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                                  {row.id ? <CrewDot color={row.color} /> : null}
                                  <span className="truncate">{row.name}</span>
                                </span>
                                {row.truck ? <span className="mt-0.5 block truncate pl-[18px] text-[11.5px] text-muted">{row.truck}</span> : null}
                              </th>
                              {days.map((dd) => {
                                const jobs = rowJobs.filter((j) => j.date === dd);
                                const id = `${dd}|${row.id}`;
                                const wk = new Date(dd + "T12:00:00Z").getUTCDay();
                                return (
                                  <td
                                    key={dd}
                                    {...cellProps(dd, row.id)}
                                    className={cx(
                                      "h-[88px] border-b border-l border-line p-1 align-top transition-colors",
                                      over === id ? "bg-sun-soft outline-2 -outline-offset-2 outline-sun-deep outline-dashed" : dd === today ? "bg-sun-soft/25" : wk === 0 || wk === 6 ? "bg-mist/40" : ""
                                    )}
                                  >
                                    <div className="space-y-1.5">
                                      {jobs.map((j) => (
                                        <JobCard key={j.ref + j.kind} job={j} onDragStart={(e) => dragStart(e, { ref: j.ref, kind: j.kind })} onDragEnd={() => setDragging(null)} />
                                      ))}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!crews.length ? <p className="border-t border-line px-4 py-3 text-[13px] text-muted">{t(d.crews.length ? "cal.crewsOff" : "cal.noCrews")}</p> : null}
                  </div>

                  {/* Agenda: phones */}
                  <div className="md:hidden">
                    {days.map((dd) => {
                      const jobs = d.jobs.filter((j) => j.date === dd);
                      const cap = d.capacity.find((c) => c.date === dd);
                      return (
                        <section key={dd} className="border-b border-line last:border-0" aria-label={day(dd, lang)}>
                          <div className={cx("flex items-center justify-between px-4 py-2", dd === today ? "bg-sun-soft/70" : "bg-mist/60")}>
                            <h3 className="font-display text-[14.5px] font-bold text-ink">
                              {day(dd, lang)}
                              {dd === today ? <span className="ml-2 text-[12px] font-semibold text-muted">{t("cal.todayLabel")}</span> : null}
                            </h3>
                            {cap && cap.max != null ? <span className="text-[12px] font-semibold text-muted tabular-nums">{cap.booked >= cap.max ? t("cal.full") : `${cap.booked}/${cap.max}`}</span> : null}
                          </div>
                          {jobs.length ? (
                            <ul className="px-1 py-1">
                              {jobs.map((j) => (
                                <JobRow key={j.ref + j.kind} job={j} />
                              ))}
                            </ul>
                          ) : (
                            <p className="px-4 py-2.5 text-[13px] text-muted">{t("cal.free")}</p>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </Async>
          </Card>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
            <KindTag kind="delivery" />
            <KindTag kind="pickup" />
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <IDrag className="h-4 w-4" />
              {t("cal.dragHint")}
            </span>
          </div>
        </div>

        <aside className="grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-1" aria-label={t("cal.toPlan")}>
          <Card aria-labelledby="cal-un">
            <CardHead id="cal-un" title={t("cal.unassigned")} sub={t("cal.unassignedSub")} />
            {cal.data ? (
              cal.data.unassigned.length ? (
                <ul className="space-y-2 px-3 pb-3">
                  {[...cal.data.unassigned]
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((u) => (
                      <li
                        key={u.ref}
                        draggable
                        onDragStart={(e) => dragStart(e, { ref: u.ref, kind: "delivery" })}
                        onDragEnd={() => setDragging(null)}
                        className="cursor-grab rounded-xl border-l-[3px] border-l-[#2f6fde] bg-white px-3 py-2.5 ring-1 ring-line hover:ring-ink/25 active:cursor-grabbing"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[12.5px] font-bold text-ink">{u.ref}</span>
                          <span className="flex gap-1">
                            {u.example ? <ExampleBadge /> : null}
                            {u.urgency !== "standard" ? <Badge tone="orange">{urgShort(i, u.urgency)}</Badge> : null}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">{u.address}</p>
                        <p className="truncate text-[12.5px] text-muted">
                          {u.customer} · {number(u.area, lang, 0)} m²
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[12.5px] text-ink-soft">
                            {t("cal.wants", { date: day(u.start, lang) })} · {statusLabel(i, u.status)}
                          </span>
                          <Btn size="xs" variant="dark" onClick={() => openPlanFor(u.ref, "delivery")}>
                            {t("cal.plan")}
                          </Btn>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="px-5 pb-4 text-[13.5px] text-muted">{t("cal.allPlanned")}</p>
              )
            ) : null}
          </Card>
          <Card aria-labelledby="cal-pk">
            <CardHead id="cal-pk" title={t("cal.pickups")} sub={t("cal.pickupsSub")} />
            {cal.data ? (
              cal.data.pickupsToPlan.length ? (
                <ul className="space-y-2 px-3 pb-3">
                  {cal.data.pickupsToPlan.map((p) => (
                    <li
                      key={p.ref}
                      draggable
                      onDragStart={(e) => dragStart(e, { ref: p.ref, kind: "pickup" })}
                      onDragEnd={() => setDragging(null)}
                      className="cursor-grab rounded-xl border-l-[3px] border-l-[#f07a1a] bg-white px-3 py-2.5 ring-1 ring-line hover:ring-ink/25 active:cursor-grabbing"
                    >
                      <span className="font-mono text-[12.5px] font-bold text-ink">{p.ref}</span>
                      <p className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">{p.address}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[12.5px] text-muted">{t("cal.rentalEnds", { date: day(p.rentalEnd, lang) })}</span>
                        <Btn size="xs" variant="dark" onClick={() => openPlanFor(p.ref, "pickup")}>
                          {t("cal.plan")}
                        </Btn>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pb-4 text-[13.5px] text-muted">{t("cal.noPickups")}</p>
              )
            ) : null}
          </Card>
          {cal.data && !cal.data.unassigned.length && !cal.data.pickupsToPlan.length && !cal.data.jobs.length ? (
            <Empty icon={<ICalendar className="h-6 w-6" />} title={t("cal.empty")} className="py-4" />
          ) : null}
        </aside>
      </div>

      <PlanDialog target={target} onClose={() => setTarget(null)} crews={allCrews} capacity={cal.data?.capacity} onSaved={() => cal.reload()} />
    </div>
  );
}
