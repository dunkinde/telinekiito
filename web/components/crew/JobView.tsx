"use client";
// The job card: what to do next, one step at a time. Delivery: load → drive → build → inspect → up.
// Pickup: count the parts → dismantle → done. Everything else (site, notes, photos, changes, history) below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getJob, mapsUrl, type JobCard } from "@/lib/platform";
import { ssGet, ssSet, useApp, useSync } from "./context";
import { ChangeCard, ReportSheet } from "./Changes";
import { errorText, fmtDay, jobTypeLabel, relDay, statusLabel, type Key } from "./i18n";
import { IBack, IBuild, ICalendar, IChat, IDismantle, IFlag, IHistory, IHome, INavigate, IPhone, IRefresh, IUpload, IWarn } from "./icons";
import { History, NotesBlock, PhotosSection, ScheduleInfo, SiteModel, type Act } from "./JobInfo";
import { applyQueue, QueueFullError, type ViewCard } from "./queue";
import { QueueBanner, TopBar } from "./Shell";
import { BuildStep, CountStep, DismantleStep, DriveStep, InspectStep, LoadStep, PickupDone, UpPanel } from "./steps";
import { ActionBar, Btn, Collapsible, cx, IconBtn, Spinner, StatusChip } from "./ui";

const cardCache: Record<string, JobCard> = {};

type StepId = "load" | "drive" | "build" | "inspect" | "up" | "count" | "dismantle" | "done";
interface Flow {
  mode: "delivery" | "pickup" | "cancelled";
  steps: StepId[];
  current: StepId;
}
const DELIVERY: StepId[] = ["load", "drive", "build", "inspect", "up"];
const PICKUP: StepId[] = ["count", "dismantle", "done"];

function flowOf(c: ViewCard, kind: "delivery" | "pickup" | undefined, today: string, inspectStarted: boolean, pickupStarted: boolean): Flow {
  if (c.status === "cancelled") return { mode: "cancelled", steps: [], current: "done" };
  if (["received", "confirmed", "loading", "en_route"].includes(c.status)) {
    const loaded = !!c.work.loaded?.done || c.status === "loading" || c.status === "en_route";
    const current: StepId = !loaded ? "load" : !c.work.arrivedAt ? "drive" : !(inspectStarted || c.work.inspection?.at) ? "build" : "inspect";
    return { mode: "delivery", steps: DELIVERY, current };
  }
  if (c.status === "erected" || c.status === "pickup_requested") {
    const a = c.assignment || {};
    const pickup = kind === "pickup" || pickupStarted || c.status === "pickup_requested" || !!c.work.pickup?.at || (!!a.pickupDate && a.pickupDate <= today);
    if (!pickup) return { mode: "delivery", steps: DELIVERY, current: "up" };
    return { mode: "pickup", steps: PICKUP, current: c.work.pickup?.at ? "dismantle" : "count" };
  }
  return { mode: "pickup", steps: PICKUP, current: "done" };
}
const STEP_LABEL: Record<StepId, Key> = { load: "step.load", drive: "step.drive", build: "step.build", inspect: "step.inspect", up: "step.up", count: "step.count", dismantle: "step.dismantle", done: "step.done" };

export function JobView({ refId, kind }: { refId: string; kind?: "delivery" | "pickup" }) {
  const app = useApp();
  const { t, lang, me, sync, toast, back, today, isLeader, authLost } = app;
  const snap = useSync();
  const [card, setCard] = useState<JobCard | null>(() => cardCache[refId] || null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [inspectStarted, setInspectStarted] = useState(() => ssGet(`tk_crew_insp_${refId}`) === "1");
  const [pickupStarted, setPickupStarted] = useState(() => ssGet(`tk_crew_pick_${refId}`) === "1");
  const [viewStep, setViewStep] = useState<StepId | null>(null);
  const [report, setReport] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getJob(refId);
      cardCache[refId] = c;
      setCard(c);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return authLost();
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [refId, authLost]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  useEffect(
    () =>
      sync.onCard((c) => {
        if (c.ref !== refId) return;
        cardCache[refId] = c;
        setCard(c);
      }),
    [sync, refId]
  );
  useEffect(() => sync.onDrained(() => void load()), [sync, load]);

  const view = useMemo(() => (card ? applyQueue(card, snap.items, { id: me.user.id, name: me.user.name, role: me.user.role }) : null), [card, snap.items, me.user]);
  const flow = view ? flowOf(view, kind, today, inspectStarted, pickupStarted) : null;

  // A new step: show it and go to the top of the page.
  const lastCurrent = useRef<StepId | null>(null);
  useEffect(() => {
    if (!flow) return;
    if (lastCurrent.current && lastCurrent.current !== flow.current) {
      setViewStep(null);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    lastCurrent.current = flow.current;
  }, [flow?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const act: Act = useCallback(
    async (op, okMsg, silent) => {
      try {
        const r = await sync.run(op);
        if (r.card) {
          cardCache[refId] = r.card;
          setCard(r.card);
        }
        if (r.queued) {
          if (!silent) toast(t("q.savedOffline"), "offline");
        } else if (okMsg) toast(okMsg);
        return true;
      } catch (e) {
        if (e instanceof QueueFullError) toast(t("q.full"), "error");
        else if (e instanceof ApiError && e.status === 401) authLost();
        else toast(errorText(t, e), "error");
        return false;
      }
    },
    [sync, refId, toast, t, authLost]
  );

  const startInspect = () => {
    ssSet(`tk_crew_insp_${refId}`, "1");
    setInspectStarted(true);
  };
  const startPickup = () => {
    ssSet(`tk_crew_pick_${refId}`, "1");
    setPickupStarted(true);
  };

  /* ---------- Loading and errors ---------- */
  if (!view || !flow) {
    const offline = error instanceof ApiError && error.code === "network";
    return (
      <div className="min-h-[100dvh] bg-mist">
        <TopBar>
          <div className="flex items-center gap-1 py-1.5">
            <IconBtn dark label={t("common.back")} onClick={back}>
              <IBack className="h-7 w-7" />
            </IconBtn>
            <p className="flex-1 font-display text-[18px] font-bold">{refId}</p>
          </div>
        </TopBar>
        <main className="mx-auto max-w-2xl px-4 pt-6">
          {error ? (
            <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-line">
              <IWarn className="mx-auto h-10 w-10 text-sun-deep" />
              <p className="mt-3 text-[18px] font-bold">{offline ? t("jv.offlineNoCopy") : t("jv.loadFailed")}</p>
              {!offline ? <p className="mt-1 text-[16px] text-muted">{errorText(t, error)}</p> : null}
              <div className="mt-5 flex justify-center gap-2">
                <Btn onClick={back}>{t("common.back")}</Btn>
                <Btn variant="dark" busy={loading} onClick={() => void load()}>
                  {t("common.retry")}
                </Btn>
              </div>
            </div>
          ) : (
            <div className="grid place-items-center py-24 text-muted">
              <Spinner className="h-9 w-9" />
              <p className="mt-3 text-[16px]">{t("jv.loading")}</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  const shown = viewStep && flow.steps.includes(viewStep) ? viewStep : flow.current;
  const isCurrent = shown === flow.current;
  const pickupMode = flow.mode === "pickup";
  const a = view.assignment || {};
  const date = pickupMode ? a.pickupDate : a.date;
  const time = pickupMode ? a.pickupTime : a.time;
  const tel = view.customer.phone ? `tel:${view.customer.phone.replace(/[^\d+]/g, "")}` : undefined;
  const canReport = !["dismantled", "closed", "cancelled"].includes(view.status);
  const pendingChanges = view.changes.filter((c) => c.status === "pending").length;
  const photoStage = shown === "load" ? "loading" : shown === "count" || shown === "dismantle" || shown === "done" ? "pickup" : "erected";
  const photoHint = photoStage === "loading" ? t("photos.hintLoading") : photoStage === "pickup" ? t("photos.hintPickup") : shown === "build" || shown === "inspect" ? t("photos.hintErected") : undefined;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const backBar = (
    <ActionBar>
      <Btn variant="dark" size="lg" block onClick={() => setViewStep(null)}>
        {t("step.backToCurrent", { step: t(STEP_LABEL[flow.current]) })}
      </Btn>
    </ActionBar>
  );
  const hasBar = flow.mode !== "cancelled" && !(isCurrent && (shown === "up" || shown === "done"));
  const dayText = (d: string) => {
    const rel = relDay(d, today, lang, t), abs = fmtDay(d, lang);
    return rel === abs ? abs : `${rel} ${abs}`;
  };

  let panel: React.ReactNode = null;
  if (flow.mode === "cancelled") panel = <div className="rounded-2xl bg-[#fde8e8] p-5 text-[18px] font-bold text-[#8a1c13] ring-1 ring-[#f6c0c2]">{t("jv.cancelled")}</div>;
  else if (shown === "load") panel = <LoadStep key="load" view={view} act={act} isCurrent={isCurrent} backBar={backBar} />;
  else if (shown === "drive") panel = <DriveStep key="drive" view={view} act={act} isCurrent={isCurrent} backBar={backBar} />;
  else if (shown === "build") panel = <BuildStep key="build" view={view} act={act} isCurrent={isCurrent} backBar={backBar} onInspect={startInspect} />;
  else if (shown === "inspect") panel = <InspectStep key="inspect" view={view} act={act} isCurrent={isCurrent} backBar={backBar} />;
  else if (shown === "up") panel = <UpPanel key="up" view={view} act={act} onStartPickup={startPickup} />;
  else if (shown === "count") panel = <CountStep key="count" view={view} act={act} isCurrent={isCurrent} backBar={backBar} />;
  else if (shown === "dismantle") panel = <DismantleStep key="dismantle" view={view} act={act} isCurrent={isCurrent} backBar={backBar} onEditCount={() => setViewStep("count")} />;
  else panel = <PickupDone view={view} />;

  return (
    <div className={cx("min-h-[100dvh] bg-mist", hasBar ? "pb-40" : "pb-[max(24px,env(safe-area-inset-bottom))]")}>
      <TopBar>
        <div className="flex items-center gap-1 py-1.5">
          <IconBtn dark label={t("common.back")} onClick={back}>
            <IBack className="h-7 w-7" />
          </IconBtn>
          <p className="min-w-0 flex-1 truncate font-display text-[17px] font-bold tracking-[0.02em] text-white/80">{view.ref}</p>
          <StatusChip status={view.status} label={statusLabel(t, view.status)} className="ring-0" />
          <IconBtn dark label={t("common.refresh")} onClick={() => void load()} busy={loading}>
            <IRefresh className="h-6 w-6" />
          </IconBtn>
        </div>
      </TopBar>
      <div ref={topRef} className="scroll-mt-16 bg-ink text-white">
        <div className="mx-auto w-full max-w-2xl px-4 pt-1 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex h-9 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-[15px] font-bold", pickupMode ? "bg-[#2563eb] text-white" : "bg-sun text-ink")}>
              {pickupMode ? <IDismantle className="h-5 w-5" /> : <IBuild className="h-5 w-5" />}
              {pickupMode ? t("kind.pickupLong") : t("kind.deliveryLong")}
            </span>
            {date ? (
              <span className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-white/85">
                <ICalendar className="h-5 w-5 text-white/60" />
                {dayText(date)}
                {time ? ` · ${time}` : ""}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 font-display text-[27px] leading-[1.15] font-extrabold tracking-[-0.01em]">{view.site.address}</h1>
          <p className="mt-1 text-[16px] text-white/75">
            {view.customer.name} · {Math.round(view.estimate.area)} m² · {jobTypeLabel(t, view.house.jobType)}
          </p>
          {flow.steps.length ? <StepTrack flow={flow} shown={shown} onPick={(s) => setViewStep(s === flow.current ? null : s)} /> : null}
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        <nav aria-label={t("jv.quick")} className="grid grid-cols-3 gap-2">
          <QuickBtn href={mapsUrl(view.site.address, view.geo)} target="_blank" icon={<INavigate className="h-6 w-6" />} label={t("drive.navigate")} />
          <QuickBtn href={tel} icon={<IPhone className="h-6 w-6" />} label={t("drive.call")} />
          <QuickBtn onClick={canReport ? () => setReport(true) : undefined} icon={<IFlag className="h-6 w-6" />} label={t("op.report")} disabled={!canReport} />
        </nav>
        <QueueBanner />
        {view.pending ? (
          <p className="flex items-center gap-2 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] font-semibold text-[#7a5a00] ring-1 ring-sun/50">
            <IUpload className="h-5 w-5 shrink-0" />
            {t("jv.pendingSync", { n: view.pending })}
          </p>
        ) : null}
        {view.status === "received" ? <p className="rounded-2xl bg-[#fff1e6] px-4 py-3 text-[16px] font-semibold text-[#7c2d12] ring-1 ring-[#fbc59a]">{t("jv.notConfirmed")}</p> : null}
        {view.status === "closed" ? <p className="rounded-2xl bg-white px-4 py-3 text-[16px] font-semibold ring-1 ring-line">{t("jv.closed")}</p> : null}

        <div>{panel}</div>

        {flow.mode !== "cancelled" ? (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <PhotosSection view={view} stage={photoStage} act={act} hint={photoHint} />
          </div>
        ) : null}

        {view.changes.length ? (
          <section className="space-y-3" aria-label={t("ch.title")}>
            <h2 className="px-1 font-display text-[19px] font-bold">
              {t("ch.title")}
              {pendingChanges ? <span className="ml-2 rounded-full bg-sun px-2.5 py-0.5 align-middle font-sans text-[14px] font-bold">{pendingChanges}</span> : null}
            </h2>
            {[...view.changes].reverse().map((c) => (
              <ChangeCard key={c.id} change={c} canDecide={isLeader} onDecided={() => void load()} localImages={view.localImages} />
            ))}
          </section>
        ) : null}

        {canReport ? (
          <Btn variant="light" size="lg" block onClick={() => setReport(true)}>
            <IFlag className="h-6 w-6" />
            {t("rep.button")}
          </Btn>
        ) : null}

        {shown !== "build" ? (
          <Collapsible title={t("build.model")} icon={<IHome className="h-5 w-5" />} open={!!open.site} onToggle={() => toggle("site")}>
            <SiteModel view={view} />
          </Collapsible>
        ) : null}
        {shown !== "drive" ? (
          <Collapsible
            title={t("drive.notes")}
            icon={<IChat className="h-5 w-5" />}
            open={open.notes ?? !!(view.notes || view.internalNotes || view.messages?.length)}
            onToggle={() => setOpen((o) => ({ ...o, notes: !(o.notes ?? !!(view.notes || view.internalNotes || view.messages?.length)) }))}
          >
            <NotesBlock view={view} />
          </Collapsible>
        ) : null}
        <Collapsible title={t("info.schedule")} icon={<ICalendar className="h-5 w-5" />} open={!!open.sched} onToggle={() => toggle("sched")}>
          <ScheduleInfo view={view} />
        </Collapsible>
        <Collapsible title={t("info.history")} icon={<IHistory className="h-5 w-5" />} open={!!open.hist} onToggle={() => toggle("hist")}>
          <History entries={view.history} />
        </Collapsible>
      </main>

      <ReportSheet view={view} open={report} onClose={() => setReport(false)} act={act} />
    </div>
  );
}

function QuickBtn({ href, target, onClick, icon, label, disabled }: { href?: string; target?: string; onClick?: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  const cls = cx(
    "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl bg-white px-2 py-2 text-center text-[15px] font-semibold text-ink ring-1 ring-line transition-colors active:bg-line",
    disabled && "pointer-events-none opacity-40"
  );
  if (href)
    return (
      <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined} className={cls}>
        {icon}
        {label}
      </a>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {icon}
      {label}
    </button>
  );
}

function StepTrack({ flow, shown, onPick }: { flow: Flow; shown: StepId; onPick: (s: StepId) => void }) {
  const { t } = useApp();
  const idx = flow.steps.indexOf(flow.current);
  const finished = flow.current === "up" || flow.current === "done";
  return (
    <ol className="mt-4 flex gap-1.5" aria-label={t("jv.steps")}>
      {flow.steps.map((s, i) => {
        const done = i < idx || (finished && i === idx);
        const current = i === idx && !finished;
        const reachable = i <= idx;
        return (
          <li key={s} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onPick(s)}
              aria-current={current ? "step" : undefined}
              aria-pressed={shown === s}
              className={cx("group flex min-h-12 w-full flex-col items-stretch gap-1.5 rounded-lg pt-1 text-left disabled:cursor-default", reachable && "active:opacity-80")}
            >
              <span className={cx("h-1.5 rounded-full", done ? "bg-sun" : current ? "bg-white" : "bg-white/20", shown === s && !current && "ring-2 ring-white/70")} />
              <span className={cx("truncate text-[13px] leading-tight font-semibold", current ? "text-white" : done ? "text-sun" : "text-white/45", shown === s && "underline underline-offset-4")}>
                {done ? "✓ " : ""}
                {t(STEP_LABEL[s])}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
