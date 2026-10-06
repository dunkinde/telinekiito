"use client";
// Home: the jobs of a day (yesterday … next week), in time order. Team leaders can switch to all crews,
// see inspection visits that are due, and open the approvals.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, getJobs, ApiError, type Job, type JobsResponse } from "@/lib/platform";
import { LogoMark } from "../Logo";
import { lsGet, lsSet, ssGet, ssSet, useApp, useSync } from "./context";
import { errorText, fmtDay, fmtDayNum, fmtTime, fmtWeekday, jobTypeLabel, relDay, statusLabel, urgencyLabel, type T } from "./i18n";
import { IBuild, ICalendar, IChevronRight, IDismantle, IGear, IRefresh, IShield, IWarn } from "./icons";
import { applyQueueToJobs } from "./queue";
import { QueueBanner, TopBar } from "./Shell";
import { Btn, Chip, cx, IconBtn, Segmented, Spinner, StatusChip } from "./ui";

const jobsCache: Record<string, { data: JobsResponse; at: number }> = {};
const urlKey = (from: string, to: string, all: boolean) => `/api/crew/jobs?from=${from}&to=${to}${all ? "&all=1" : ""}`;

export function Today() {
  const { me, t, lang, today, setToday, sync, nav, isLeader, crew, openSettings, authLost } = useApp();
  const snap = useSync();
  const [all, setAllRaw] = useState(() => isLeader && lsGet("tk_crew_all") === "1");
  const from = addDays(today, -1), to = addDays(today, 6);
  const [day, setDayRaw] = useState(() => {
    const d = ssGet("tk_crew_day");
    return d && d >= from && d <= to ? d : today;
  });
  const key = urlKey(from, to, all);
  const [data, setData] = useState<JobsResponse | null>(() => jobsCache[key]?.data || null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => jobsCache[key]?.at || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lastLoad = useRef(0);
  const dayNav = useRef<HTMLElement>(null);

  const setAll = (v: boolean) => {
    setAllRaw(v);
    lsSet("tk_crew_all", v ? "1" : null);
  };
  const setDay = (d: string) => {
    setDayRaw(d);
    ssSet("tk_crew_day", d);
  };

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    setLoading(true);
    try {
      const r = await getJobs({ from, to, all });
      jobsCache[key] = { data: r, at: Date.now() };
      setData(r);
      setUpdatedAt(Date.now());
      setError(null);
      if (r.today && r.today !== today) setToday(r.today);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return authLost();
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [from, to, all, key, today, setToday, authLost]);

  useEffect(() => {
    setData(jobsCache[key]?.data || null);
    void load();
  }, [key, load]);
  // Fresh every minute while on screen, and when coming back to the app.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > 20_000) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);
  useEffect(() => sync.onDrained(() => void load()), [sync, load]);

  // Keep the chosen day visible in the day strip.
  useEffect(() => {
    const nav = dayNav.current, el = nav?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (nav && el) nav.scrollTo({ left: Math.max(0, el.offsetLeft - nav.clientWidth / 2 + el.offsetWidth / 2), behavior: "smooth" });
  }, [day]);

  const jobs = useMemo(() => applyQueueToJobs(data?.jobs || [], snap.items), [data, snap.items]);
  const days = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(from, i)), [from]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobs) c[j.date] = (c[j.date] || 0) + 1;
    return c;
  }, [jobs]);
  const dayJobs = jobs.filter((j) => j.date === day);
  const served = snap.served[key];
  const visits = data?.visits || [];
  const noCrew = me.user.role === "worker" && !me.user.crewId;
  const crewName = crew(me.user.crewId)?.name;

  return (
    <div className="min-h-[100dvh] bg-mist pb-[max(24px,env(safe-area-inset-bottom))]">
      <TopBar>
        <div className="flex items-center gap-2 py-2 pl-2">
          <LogoMark className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1 pl-1">
            <h1 className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.01em]">{t("today.title")}</h1>
            <p className="truncate text-[14px] text-white/70">
              {me.user.name}
              {crewName ? ` · ${crewName}` : ""}
            </p>
          </div>
          <IconBtn dark label={t("common.refresh")} onClick={() => void load()} busy={loading}>
            <IRefresh className="h-6 w-6" />
          </IconBtn>
          <IconBtn dark label={t("common.settings")} onClick={openSettings}>
            <IGear className="h-6 w-6" />
          </IconBtn>
        </div>
        {isLeader ? (
          <div className="px-2 pb-2">
            <Segmented
              dark
              label={t("today.all")}
              value={all ? "all" : "mine"}
              onChange={(v) => setAll(v === "all")}
              options={[
                { value: "mine", label: t("today.mine") },
                { value: "all", label: t("today.all") }
              ]}
            />
          </div>
        ) : null}
        <nav ref={dayNav} aria-label={t("today.dayPicker")} className="no-scrollbar -mx-2 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-2 pb-3">
          {days.map((d) => {
            const on = d === day;
            const n = counts[d] || 0;
            const rel = d === today ? t("day.today") : d === addDays(today, 1) ? t("day.tomorrow") : d === addDays(today, -1) ? t("day.yesterday") : fmtWeekday(d, lang);
            return (
              <button
                key={d}
                type="button"
                data-day={d}
                onClick={() => setDay(d)}
                aria-pressed={on}
                aria-label={`${fmtDay(d, lang)}${n ? `, ${t("today.jobsOnDay", { n })}` : ""}`}
                className={cx(
                  "relative flex min-h-16 min-w-[4.6rem] shrink-0 snap-start flex-col items-center justify-center rounded-2xl px-3 py-2 transition-colors",
                  on ? "bg-sun text-ink" : "bg-white/[0.08] text-white active:bg-white/15"
                )}
              >
                <span className={cx("text-[13px] font-semibold capitalize", on ? "text-ink" : "text-white/75")}>{rel}</span>
                <span className="font-display text-[19px] leading-tight font-extrabold">{fmtDayNum(d, lang)}</span>
                {n ? (
                  <span className={cx("absolute -top-1.5 -right-1.5 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-bold", on ? "bg-ink text-white" : "bg-sun text-ink")}>{n}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </TopBar>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        <QueueBanner />
        {served?.cached ? (
          <p className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-[15px] font-semibold text-ink-soft ring-1 ring-line">
            <IWarn className="h-5 w-5 shrink-0 text-sun-deep" />
            {t("today.offlineCopy", { time: fmtTime(new Date(served.at).toISOString(), lang) })}
          </p>
        ) : null}

        {isLeader ? (
          <button
            type="button"
            onClick={() => nav("#/approvals")}
            className={cx(
              "flex min-h-16 w-full items-center gap-4 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
              data?.pendingChanges ? "bg-white ring-2 ring-sun" : "bg-white ring-line"
            )}
          >
            <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", data?.pendingChanges ? "bg-sun text-ink" : "bg-mist text-ink-soft")}>
              <IShield className="h-6 w-6" />
            </span>
            <span className="flex-1">
              <span className="block text-[17px] font-bold">{t("today.approvals")}</span>
              <span className="block text-[15px] text-muted">{data?.pendingChanges ? t("today.approvalsWaiting", { n: data.pendingChanges }) : t("today.noApprovals")}</span>
            </span>
            {data?.pendingChanges ? <span className="grid h-8 min-w-8 place-items-center rounded-full bg-ink px-2 font-display text-[16px] font-extrabold text-white">{data.pendingChanges}</span> : null}
            <IChevronRight className="h-6 w-6 text-muted" />
          </button>
        ) : null}

        {isLeader && day === today && visits.length ? (
          <section aria-labelledby="tk-visits" className="space-y-2">
            <h2 id="tk-visits" className="px-1 font-display text-[18px] font-bold">
              {t("today.visits")}
            </h2>
            {visits.map((v) => (
              <button
                key={v.ref}
                type="button"
                onClick={() => nav(`#/job/${v.ref}`)}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line active:bg-mist"
              >
                <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", v.overdue ? "bg-[#fde8e8] text-[#b42318]" : "bg-[#e3f6ea] text-[#15803d]")}>
                  <IShield className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-bold">{v.address}</span>
                  <span className={cx("block text-[15px]", v.overdue ? "font-semibold text-[#b42318]" : "text-muted")}>
                    {v.overdue ? t("today.visitOverdue", { date: fmtDay(v.due, lang) }) : t("today.visitDue", { date: fmtDay(v.due, lang) })}
                  </span>
                </span>
                <IChevronRight className="h-6 w-6 text-muted" />
              </button>
            ))}
          </section>
        ) : null}

        <section aria-labelledby="tk-day" className="space-y-3">
          <h2 id="tk-day" className="flex items-baseline justify-between px-1">
            <span className="font-display text-[18px] font-bold capitalize">{relDay(day, today, lang, t)}{day === today || day === addDays(today, 1) || day === addDays(today, -1) ? ` · ${fmtDay(day, lang)}` : ""}</span>
            {dayJobs.length ? <span className="text-[15px] font-semibold text-muted">{t("today.jobsOnDay", { n: dayJobs.length })}</span> : null}
          </h2>

          {noCrew ? <p className="rounded-2xl bg-white p-4 text-[16px] ring-1 ring-line">{t("today.noCrew")}</p> : null}

          {!data && loading ? (
            <div className="grid place-items-center rounded-2xl bg-white py-16 text-muted ring-1 ring-line">
              <Spinner className="h-8 w-8" />
              <span className="mt-3 text-[16px]">{t("common.loading")}</span>
            </div>
          ) : !data && error ? (
            <div className="rounded-2xl bg-white p-5 text-center ring-1 ring-line">
              <p className="text-[17px] font-semibold">{t("today.loadFailed")}</p>
              <p className="mt-1 text-[15px] text-muted">{errorText(t, error)}</p>
              <Btn variant="dark" className="mt-4" onClick={() => void load()}>
                {t("common.retry")}
              </Btn>
            </div>
          ) : dayJobs.length ? (
            dayJobs.map((j) => <JobRow key={`${j.ref}-${j.kind}`} job={j} t={t} showCrew={all} crew={crew(j.crewId)} onOpen={() => nav(`#/job/${j.ref}/${j.kind}`)} />)
          ) : data ? (
            <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-line">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-mist text-ink-soft">
                <ICalendar className="h-8 w-8" />
              </span>
              <p className="mt-4 font-display text-[20px] font-bold">{t("today.empty")}</p>
              <p className="mt-1 text-[15px] text-muted">{t("today.emptySub")}</p>
            </div>
          ) : null}
        </section>

        {updatedAt ? <p className="pt-2 text-center text-[14px] text-muted">{t("common.updated", { time: fmtTime(new Date(updatedAt).toISOString(), lang) })}</p> : null}
      </main>
    </div>
  );
}

function JobRow({ job, t, showCrew, crew, onOpen }: { job: Job; t: T; showCrew: boolean; crew: { name: string; color: string } | null; onOpen: () => void }) {
  const delivery = job.kind === "delivery";
  const steps = delivery ? ["loading", "en_route", "erected"] : ["dismantled"];
  const reached = delivery
    ? { received: 0, confirmed: 0, loading: 1, en_route: 2, erected: 3, pickup_requested: 3, dismantled: 3, closed: 3, cancelled: 0 }[job.status]
    : job.status === "dismantled" || job.status === "closed" ? 1 : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx("flex w-full overflow-hidden rounded-2xl bg-white text-left shadow-[0_1px_2px_rgba(14,18,23,0.06)] ring-1 ring-line transition-transform active:scale-[0.99]", job.done && "opacity-80")}
    >
      <span aria-hidden className={cx("w-2 shrink-0", delivery ? "bg-sun" : "bg-[#2563eb]")} />
      <span className="min-w-0 flex-1 p-4">
        <span className="flex items-center justify-between gap-3">
          <span className={cx("inline-flex h-9 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-[15px] font-bold", delivery ? "bg-sun text-ink" : "bg-[#2563eb] text-white")}>
            {delivery ? <IBuild className="h-5 w-5" /> : <IDismantle className="h-5 w-5" />}
            {delivery ? t("kind.delivery") : t("kind.pickup")}
          </span>
          <span className={cx("font-display text-[26px] leading-none font-extrabold tabular-nums", !job.time && "text-[16px] font-semibold text-muted")}>{job.time || t("job.noTime")}</span>
        </span>
        <span className="mt-3 block text-[19px] leading-snug font-bold text-ink">{job.address}</span>
        <span className="mt-0.5 block text-[15px] text-muted">
          {job.customer} · {t("job.area", { n: job.area })} · {jobTypeLabel(t, job.jobType)}
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-2">
          {job.done ? (
            <Chip tone="green">✓ {t("job.done")}</Chip>
          ) : (
            <StatusChip status={job.status} label={statusLabel(t, job.status)} />
          )}
          {job.urgency !== "standard" ? <Chip tone="red">{urgencyLabel(t, job.urgency)}</Chip> : null}
          {job.example ? <Chip>{t("job.example")}</Chip> : null}
          {showCrew && crew ? (
            <Chip>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: crew.color }} />
              {crew.name}
            </Chip>
          ) : null}
        </span>
        {!job.done ? (
          <span className="mt-3 flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span key={s} className={cx("h-1.5 flex-1 rounded-full", i < reached ? (delivery ? "bg-sun-deep" : "bg-[#2563eb]") : "bg-line")} />
            ))}
          </span>
        ) : null}
      </span>
      <span className="grid w-9 shrink-0 place-items-center text-muted">
        <IChevronRight className="h-6 w-6" />
      </span>
    </button>
  );
}
