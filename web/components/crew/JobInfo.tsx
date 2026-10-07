"use client";
// Parts of the job card that don't change the job: the house and scaffold, notes and messages, photos,
// schedule and history.
import { useRef, useState } from "react";
import { fileUrl, getJobPlan, shrinkImage, type HistoryEntry } from "@/lib/platform";
import { Plan3DOverlay } from "../scaffold3d/Plan3DOverlay";
import { HouseModel } from "../HouseModel";
import { useApp } from "./context";
import { fmtDay, fmtNum, fmtStamp, roofLabel, sideLabel, stageLabel, statusLabel, urgencyLabel, jobTypeLabel, type Key } from "./i18n";
import { ICamera, IChat, IClose, IWarn } from "./icons";
import type { Op, ViewCard } from "./queue";
import { Btn, Chip, cx, IconBtn, SectionTitle, Spinner } from "./ui";

/** Sends a write (or keeps it on the phone when offline). `okMsg` is shown on success; `silent` hides the "saved on this phone" note. */
export type Act = (op: Op, okMsg?: string, silent?: boolean) => Promise<boolean>;

/* ---------------- House and scaffold ---------------- */
export function SiteModel({ view }: { view: ViewCard }) {
  const { t, lang } = useApp();
  const [show3d, setShow3d] = useState(false);
  const h = view.house, e = view.estimate;
  const shape = { length: h.length, width: h.width, eave: h.eave, roofType: h.roofType, pitch: h.pitch, jobType: h.jobType, gables: h.gables };
  const tiles: [string, string][] = [
    [t("build.lengthWidth"), `${fmtNum(h.length, lang)} × ${fmtNum(h.width, lang)} m`],
    [t("build.eave"), `${fmtNum(h.eave, lang)} m`],
    [t("build.roof"), `${roofLabel(t, h.roofType)}${h.roofType !== "flat" ? ` ${t("build.pitch", { n: h.pitch })}` : ""}`],
    [t("build.area"), `${fmtNum(e.area, lang, 0)} m²`],
    [t("build.run"), `${fmtNum(e.runM, lang)} m`],
    [t("build.weight"), `${fmtNum(e.weightKg, lang, 0)} kg`]
  ];
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-[#e9eff5] to-white ring-1 ring-line">
        <HouseModel shape={shape} className="mx-auto block h-[230px] w-full max-w-lg px-2 pt-3 sm:h-[300px]" label={`${t("build.model")}: ${jobTypeLabel(t, h.jobType)}, ${fmtNum(h.length, lang)} × ${fmtNum(h.width, lang)} m`} />
        <p className="px-4 pb-3 text-center text-[15px] font-semibold text-ink-soft">{jobTypeLabel(t, h.jobType)}</p>
      </div>
      <Btn variant="dark" className="w-full" onClick={() => setShow3d(true)}>
        {t("p3d.open")}
      </Btn>
      {show3d ? (
        <Plan3DOverlay
          title={t("p3d.title")}
          load={() => getJobPlan(view.ref).then((r) => r.plan)}
          onClose={() => setShow3d(false)}
          texts={{
            hint: t("p3d.hint"), reset: t("p3d.reset"), loading: t("p3d.loading"), failed: t("p3d.failed"), close: t("p3d.close"),
            sideName: (s) => sideLabel(t, s.name), sideInfo: (s) => t("p3d.info", { bays: s.bays, levels: s.lifts, area: s.area })
          }}
        />
      ) : null}
      {view.checks?.length ? (
        <ul className="space-y-2 rounded-2xl bg-mist p-4 text-[15px] leading-snug">
          {view.checks.filter((c) => c.level !== "ok").map((c, k) => (
            <li key={k} className={c.level === "engineer" ? "font-semibold text-[#b91c1c]" : "text-ink"}>
              • {t(`chk.${c.code}` as Key, Object.fromEntries(Object.entries(c.vars).map(([k, v]) => [k, typeof v === "number" ? fmtNum(v, lang) : v])) as Record<string, string | number>)}
            </li>
          ))}
        </ul>
      ) : null}
      {e.catchRunM > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl bg-[#fff1e6] p-4 text-[#7c2d12] ring-1 ring-[#fbc59a]" role="note">
          <IWarn className="mt-0.5 h-6 w-6 shrink-0" />
          <p className="text-[16px] leading-snug font-semibold">{t("build.catchWarn", { m: fmtNum(e.catchRunM, lang) })}</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-mist px-3 py-2.5">
            <dt className="text-[13px] font-semibold text-muted">{k}</dt>
            <dd className="font-display text-[19px] leading-tight font-bold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {e.sides?.length ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-line">
          <table className="w-full text-left text-[16px]">
            <caption className="sr-only">{t("build.sides")}</caption>
            <thead className="bg-mist text-[13px] font-semibold text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">{t("build.side")}</th>
                <th scope="col" className="px-2 py-2 text-right">{t("build.bays")}</th>
                <th scope="col" className="px-2 py-2 text-right">{t("build.levels")}</th>
                <th scope="col" className="px-3 py-2 text-right">{t("build.guard")}</th>
              </tr>
            </thead>
            <tbody>
              {e.sides.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <th scope="row" className="px-3 py-2.5 font-semibold">{sideLabel(t, s.name)}</th>
                  <td className="px-2 py-2.5 text-right font-display text-[18px] font-bold tabular-nums">{s.bays}</td>
                  <td className="px-2 py-2.5 text-right font-display text-[18px] font-bold tabular-nums">{s.lifts}</td>
                  <td className="px-3 py-2.5 text-right">{s.catchOn ? <Chip tone="sun">{t("common.yes")}</Chip> : <span className="text-muted">{t("common.no")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Notes and messages ---------------- */
export function NotesBlock({ view, compact = false }: { view: ViewCard; compact?: boolean }) {
  const { t, lang } = useApp();
  const msgs = (view.messages || []).slice(-5).reverse();
  const nothing = !view.notes && !view.internalNotes && !msgs.length;
  if (nothing) return compact ? null : <p className="rounded-xl bg-mist px-4 py-3 text-[16px] text-muted">{t("drive.noNotes")}</p>;
  return (
    <div className="space-y-3">
      {view.notes ? (
        <div className="rounded-2xl bg-sun-soft p-4 ring-1 ring-sun/50">
          <p className="text-[14px] font-bold tracking-wide text-[#7a5a00] uppercase">{t("drive.notes")}</p>
          <p className="mt-1 text-[17px] leading-snug whitespace-pre-line text-ink">{view.notes}</p>
        </div>
      ) : null}
      {view.internalNotes ? (
        <div className="rounded-2xl bg-[#eef3fb] p-4 ring-1 ring-[#c4d5f2]">
          <p className="text-[14px] font-bold tracking-wide text-[#1d4ed8] uppercase">{t("drive.internal")}</p>
          <p className="mt-1 text-[17px] leading-snug whitespace-pre-line text-ink">{view.internalNotes}</p>
        </div>
      ) : null}
      {msgs.length ? (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <p className="flex items-center gap-2 text-[14px] font-bold tracking-wide text-ink-soft uppercase">
            <IChat className="h-5 w-5" />
            {t("drive.messages")}
          </p>
          <ul className="mt-2 space-y-2">
            {msgs.map((m, i) => (
              <li key={i} className={cx("rounded-xl px-3 py-2.5", m.from === "customer" ? "bg-mist" : "bg-[#eef3fb]")}>
                <p className="text-[13px] font-semibold text-muted">
                  {m.from === "customer" ? view.customer.name : t("drive.office")} · {fmtStamp(m.at, lang)}
                </p>
                <p className="mt-0.5 text-[17px] leading-snug whitespace-pre-line">{m.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Photos ---------------- */
export function PhotosSection({ view, stage, act, hint }: { view: ViewCard; stage: string; act: Act; hint?: string }) {
  const { t, lang, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const photos = [...view.photos].reverse();

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      setBusy((b) => b + 1);
      try {
        let image: string;
        try {
          image = await shrinkImage(f);
        } catch {
          toast(t("err.image"), "error");
          continue;
        }
        await act({ kind: "photo", ref: view.ref, image, stage }, t("photos.added"));
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (input.current) input.current.value = "";
  }
  const src = (id: string) => view.localImages[id] || fileUrl(id);
  const current = open ? view.photos.find((p) => p.id === open) : null;

  return (
    <section className="space-y-3" aria-labelledby={`ph-${view.ref}`}>
      <SectionTitle icon={<ICamera className="h-5 w-5" />} right={photos.length ? <span className="text-[15px] font-semibold text-muted">{photos.length}</span> : null}>
        <span id={`ph-${view.ref}`}>{t("photos.title")}</span>
      </SectionTitle>
      {hint ? <p className="text-[15px] text-muted">{hint}</p> : null}
      {photos.length || busy ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {busy ? (
            <li className="grid aspect-square place-items-center rounded-xl bg-mist text-muted ring-1 ring-line" aria-label={t("photos.uploading")}>
              <Spinner className="h-7 w-7" />
            </li>
          ) : null}
          {photos.map((p) => (
            <li key={p.id} className="relative">
              <button type="button" onClick={() => setOpen(p.id)} aria-label={`${t("photos.open")}: ${stageLabel(t, p.stage)}, ${fmtStamp(p.at, lang)}`} className="block aspect-square w-full overflow-hidden rounded-xl bg-mist ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(p.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
              <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-ink/75 px-1.5 py-0.5 text-[12px] font-semibold text-white">{stageLabel(t, p.stage)}</span>
              {p.id.startsWith("local:") ? <span className="pointer-events-none absolute top-1 left-1 rounded-md bg-sun px-1.5 py-0.5 text-[12px] font-bold text-ink">{t("photos.waiting")}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-mist px-4 py-3 text-[15px] text-muted">{t("photos.none")}</p>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFiles(e.target.files)} data-testid="photo-input" />
      <Btn block size="lg" variant="light" onClick={() => input.current?.click()} busy={busy > 0}>
        <ICamera className="h-6 w-6" />
        {t("photos.take")}
      </Btn>

      {current ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={stageLabel(t, current.stage)}>
          <div className="flex items-center gap-2 px-2 pt-[env(safe-area-inset-top)] text-white">
            <p className="flex-1 truncate py-3 pl-3 text-[16px] font-semibold">
              {stageLabel(t, current.stage)} · {fmtStamp(current.at, lang)} · {current.by}
            </p>
            <IconBtn dark label={t("common.close")} onClick={() => setOpen(null)}>
              <IClose className="h-7 w-7" />
            </IconBtn>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2 pb-[max(8px,env(safe-area-inset-bottom))]" onClick={() => setOpen(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(current.id)} alt={stageLabel(t, current.stage)} className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------- Schedule, crew and history ---------------- */
export function ScheduleInfo({ view }: { view: ViewCard }) {
  const { t, lang, crew } = useApp();
  const a = view.assignment || {};
  const dCrew = crew(a.crewId);
  const pCrew = crew(a.pickupCrewId || a.crewId);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="text-right text-[16px] font-semibold">{children}</dd>
    </div>
  );
  const CrewTag = ({ c }: { c: { name: string; color: string } | null }) =>
    c ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
        {c.name}
      </span>
    ) : (
      <span className="text-muted">{t("info.notAssigned")}</span>
    );
  return (
    <dl>
      <Row label={t("kind.deliveryLong")}>
        {a.date ? `${fmtDay(a.date, lang)}${a.time ? ` ${a.time}` : ""}` : t("info.notScheduled")}
        <br />
        <CrewTag c={dCrew} />
      </Row>
      <Row label={t("kind.pickupLong")}>
        {a.pickupDate ? `${fmtDay(a.pickupDate, lang)}${a.pickupTime ? ` ${a.pickupTime}` : ""}` : t("info.notScheduled")}
        {a.pickupDate ? (
          <>
            <br />
            <CrewTag c={pCrew} />
          </>
        ) : null}
      </Row>
      <Row label={t("ch.days")}>{t("info.rental", { n: view.schedule.days })}</Row>
      <Row label={t("info.urgency")}>{urgencyLabel(t, view.schedule.urgency)}</Row>
    </dl>
  );
}

export function History({ entries }: { entries: HistoryEntry[] }) {
  const { t, lang } = useApp();
  const [all, setAll] = useState(false);
  const list = [...(entries || [])].reverse();
  const shown = all ? list : list.slice(0, 6);
  const by = (b?: string) => (b === "customer" ? t("hist.customer") : b === "office" ? t("hist.office") : b || "");
  const label = (h: HistoryEntry) => {
    if (h.status) return statusLabel(t, h.status);
    if (h.code === "extended") return t("hist.extended", { days: h.days || "" });
    const key = `hist.${h.code}` as Key;
    if (h.code && ["scheduled", "arrived", "visit", "change_requested", "change_approved", "change_rejected"].includes(h.code)) {
      if (h.code === "visit" && h.event) return `${t(key)}: ${/problems/i.test(h.event) ? t("visit.issueShort") : t("visit.okShort")}`;
      return t(key);
    }
    return h.event || "";
  };
  return (
    <div>
      <ol className="relative space-y-0">
        {shown.map((h, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            <span aria-hidden className="relative flex w-4 justify-center">
              <span className={cx("mt-1.5 h-3 w-3 rounded-full ring-4 ring-white", i === 0 ? "bg-sun-deep" : "bg-steel")} />
              {i < shown.length - 1 ? <span className="absolute top-5 bottom-[-6px] w-0.5 bg-line" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">{label(h)}</span>
              <span className="block text-[14px] text-muted">
                {fmtStamp(h.at, lang)}
                {h.by ? ` · ${by(h.by)}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {list.length > 6 ? (
        <Btn variant="ghost" className="mt-2 -ml-2 underline" onClick={() => setAll((v) => !v)}>
          {all ? t("info.showLess") : t("info.showAll")}
        </Btn>
      ) : null}
    </div>
  );
}
