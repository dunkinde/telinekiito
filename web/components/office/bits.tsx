"use client";
// Small pieces shared by several office views: crew chips, job rows, order links.
import type { Crew, Job } from "@/lib/platform";
import { IconTruck } from "../ui/Icons";
import { useOffice, useT } from "./context";
import { number } from "./format";
import { jobLabel } from "./i18n";
import { IPickup } from "./icons";
import { ExampleBadge, StatusBadge, cx } from "./ui";

export function CrewDot({ color, className }: { color?: string; className?: string }) {
  return <span aria-hidden className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white", className)} style={{ background: color || "#c4cad1" }} />;
}
export function CrewChip({ crew, className }: { crew?: Pick<Crew, "name" | "color"> | null; className?: string }) {
  const { t } = useT();
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-medium", crew ? "text-ink" : "text-muted", className)}>
      <CrewDot color={crew?.color} />
      {crew ? crew.name : t("cal.noCrew")}
    </span>
  );
}

export function KindTag({ kind, className }: { kind: "delivery" | "pickup"; className?: string }) {
  const { t } = useT();
  return (
    <span className={cx("inline-flex items-center gap-1 text-[12px] font-bold tracking-wide uppercase", kind === "delivery" ? "text-[#1f4fa8]" : "text-[#a4470a]", className)}>
      {kind === "delivery" ? <IconTruck className="h-4 w-4 shrink-0" /> : <IPickup className="h-4 w-4 shrink-0" />}
      {t(kind === "delivery" ? "cal.delivery" : "cal.pickup")}
    </span>
  );
}

/** Clickable order reference (opens the order panel). */
export function RefLink({ refNo, className }: { refNo: string; className?: string }) {
  const { openOrder } = useOffice();
  const { t } = useT();
  return (
    <button type="button" onClick={() => openOrder(refNo)} className={cx("font-mono text-[13px] font-semibold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-sun-deep", className)} title={t("orders.open")}>
      {refNo}
    </button>
  );
}

/** One job (delivery or pickup) in a list: time, what, where, crew, status. */
export function JobRow({ job }: { job: Job }) {
  const i = useT();
  const { lang, t } = i;
  const { openOrder, crewById } = useOffice();
  const crew = crewById(job.crewId);
  return (
    <li>
      <button type="button" onClick={() => openOrder(job.ref)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-mist">
        <span className="w-12 shrink-0 pt-0.5 font-display text-[15px] font-bold text-ink tabular-nums">{job.time || "–"}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <KindTag kind={job.kind} />
            <span className="font-mono text-[12px] text-muted">{job.ref}</span>
            {job.example ? <ExampleBadge /> : null}
          </span>
          <span className="mt-0.5 block truncate text-[14px] font-semibold text-ink">{job.address}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <span>{job.customer}</span>
            <span>
              {jobLabel(i, job.jobType)} · {number(job.area, lang, 0)} m²
            </span>
            <CrewChip crew={crew} />
          </span>
        </span>
        <span className="hidden shrink-0 sm:block">
          <StatusBadge status={job.status} />
        </span>
        <span className="sr-only">{t("orders.open")}</span>
      </button>
    </li>
  );
}
