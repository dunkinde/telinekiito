"use client";
// The guided steps of a job. Each panel ends in one big button for its next step (sticky at the bottom).
import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, fileUrl, mapsUrl, type InspectionItem, type PartKey, type Parts } from "@/lib/platform";
import { useApp } from "./context";
import { fmtDay, fmtDuration, fmtNum, fmtStamp, fmtTime, inspLabel, partLabel } from "./i18n";
import { IBox, ICheck, IClock, IDismantle, INavigate, IPen, IPhone, IPlay, IShield, IStop, ITruck, IWarn } from "./icons";
import { NotesBlock, SiteModel, type Act } from "./JobInfo";
import type { ViewCard } from "./queue";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { ActionBar, Btn, Card, CheckRow, Chip, cx, Field, inputCls, Progress, Sheet, Stepper, Confirm } from "./ui";

export interface StepProps {
  view: ViewCard;
  act: Act;
  isCurrent: boolean;
  backBar: React.ReactNode;
}

function StepHead({ n, of, title, children }: { n?: number; of?: number; title: string; children?: React.ReactNode }) {
  return (
    <div>
      {n && of ? <p className="text-[14px] font-bold tracking-[0.08em] text-muted uppercase">{`${n} / ${of}`}</p> : null}
      <h2 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.01em]">{title}</h2>
      {children}
    </div>
  );
}

/** Saves a form a moment after the last change, and right away when the panel closes. */
function useAutosave(save: () => void, deps: unknown[], delay = 1200) {
  const dirty = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => {
      dirty.current = false;
      saveRef.current();
    }, delay);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(
    () => () => {
      if (dirty.current) {
        dirty.current = false;
        saveRef.current();
      }
    },
    []
  );
  return {
    touch: () => (dirty.current = true),
    flushed: () => (dirty.current = false)
  };
}

/* ======================= 1. Load the truck ======================= */
export function LoadStep({ view, act, isCurrent, backBar }: StepProps) {
  const { t, lang } = useApp();
  const parts = view.parts;
  const [checked, setChecked] = useState<Parts>(() => ({ ...(view.work.loaded?.checked || {}) }));
  const [notes, setNotes] = useState(view.work.loaded?.notes || "");
  const [edit, setEdit] = useState<{ key: PartKey; need: number } | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const ticked = parts.filter((p) => checked[p.key] !== undefined).length;
  const auto = useAutosave(() => void act({ kind: "loadlist", ref: view.ref, checked, notes }, undefined, true), [checked, notes]);

  const update = (fn: (c: Parts) => Parts) => {
    auto.touch();
    setChecked(fn);
  };
  const toggle = (key: PartKey, qty: number) =>
    update((c) => {
      const n = { ...c };
      if (n[key] !== undefined) delete n[key];
      else n[key] = qty;
      return n;
    });

  async function loaded(force = false) {
    if (!force && ticked < parts.length) return setConfirm(true);
    setConfirm(false);
    setBusy(true);
    auto.flushed();
    const ok = await act({ kind: "loadlist", ref: view.ref, checked, notes }, undefined, true);
    if (ok) await act({ kind: "action", ref: view.ref, action: "loaded" }, t("load.doneToast"));
    setBusy(false);
  }

  const done = view.work.loaded?.done;
  return (
    <div className="space-y-4">
      <StepHead n={1} of={4} title={t("load.title")}>
        <p className="mt-1 text-[16px] text-muted">{t("load.hint")}</p>
      </StepHead>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[22px] font-extrabold tabular-nums">{t("load.progress", { done: ticked, total: parts.length })}</span>
          {ticked < parts.length ? (
            <Btn variant="light" onClick={() => update(() => Object.fromEntries(parts.map((p) => [p.key, checked[p.key] ?? p.qty])))}>
              <ICheck className="h-5 w-5" />
              {t("load.allOn")}
            </Btn>
          ) : (
            <Chip tone="green">✓</Chip>
          )}
        </div>
        <Progress value={ticked} total={parts.length} tone={ticked === parts.length ? "green" : "sun"} />
        <p className="flex items-center gap-2 text-[15px] text-muted">
          <ITruck className="h-5 w-5" />
          {t("load.weight", { kg: fmtNum(view.estimate.weightKg, lang, 0) })}
          {done && view.work.loaded?.at ? ` · ${t("load.doneAt", { time: fmtTime(view.work.loaded.at, lang), by: view.work.loaded.by || "" })}` : ""}
        </p>
      </Card>

      {parts.length ? (
        <ul className="space-y-2">
          {parts.map((p) => {
            const v = checked[p.key];
            const on = v !== undefined;
            const diff = on && v !== p.qty;
            return (
              <li key={p.key} className="flex items-stretch gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.key, p.qty)}
                  className={cx(
                    "flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-2 ring-inset transition-colors",
                    on ? (diff ? "bg-[#fff6e0] ring-[#f2c94c]" : "bg-[#e8f7ee] ring-[#86d3a5]") : "bg-white ring-line active:bg-mist"
                  )}
                >
                  <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-2 ring-inset", on ? "bg-[#15803d] text-white ring-[#15803d]" : "bg-white text-transparent ring-ink/25")}>
                    <ICheck className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] leading-snug font-semibold text-ink">{partLabel(t, p.key)}</span>
                    {diff ? <span className="mt-0.5 block text-[14px] font-semibold text-[#92400e]">{t("load.need", { n: p.qty })}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-display text-[26px] leading-none font-extrabold tabular-nums">{on ? v : p.qty}</span>
                    <span className="block text-[13px] font-semibold text-muted">{t("common.pcs")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEdit({ key: p.key, need: p.qty });
                    setEditQty(v ?? p.qty);
                  }}
                  aria-label={`${t("load.editCount")}: ${partLabel(t, p.key)}`}
                  className="grid w-14 shrink-0 place-items-center rounded-2xl bg-white text-ink-soft ring-2 ring-line ring-inset active:bg-mist"
                >
                  <IPen className="h-6 w-6" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card tone="warn">{t("load.noParts")}</Card>
      )}

      <Field label={t("load.notes")} htmlFor={`ln-${view.ref}`}>
        <textarea
          id={`ln-${view.ref}`}
          rows={2}
          value={notes}
          placeholder={t("load.notesPh")}
          onChange={(e) => {
            auto.touch();
            setNotes(e.target.value.slice(0, 500));
          }}
          className={inputCls}
        />
      </Field>

      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit ? partLabel(t, edit.key) : ""}
        closeLabel={t("common.close")}
        footer={
          <Btn
            variant="primary"
            size="lg"
            block
            onClick={() => {
              if (edit) update((c) => ({ ...c, [edit.key]: editQty }));
              setEdit(null);
            }}
          >
            {t("common.save")}
          </Btn>
        }
      >
        {edit ? (
          <div className="space-y-3">
            <p className="text-[16px] text-muted">{t("load.need", { n: edit.need })}</p>
            <Stepper label={t("load.countTitle")} value={editQty} onChange={setEditQty} max={9999} />
            {editQty !== edit.need ? (
              <Btn variant="ghost" className="underline" onClick={() => setEditQty(edit.need)}>
                = {edit.need}
              </Btn>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      <Confirm
        open={confirm}
        title={t("load.cta")}
        text={t("load.confirmPartial", { done: ticked, total: parts.length })}
        yes={t("load.confirmYes")}
        no={t("common.cancel")}
        closeLabel={t("common.close")}
        onYes={() => void loaded(true)}
        onNo={() => setConfirm(false)}
      />

      {isCurrent ? (
        <ActionBar hint={view.status === "received" ? t("jv.notConfirmed") : undefined}>
          <Btn variant="primary" size="lg" block busy={busy} disabled={view.status === "received"} onClick={() => void loaded()}>
            <IBox className="h-6 w-6" />
            {t("load.cta")}
          </Btn>
        </ActionBar>
      ) : (
        backBar
      )}
    </div>
  );
}

/* ======================= 2. Drive ======================= */
export function DriveStep({ view, act, isCurrent, backBar }: StepProps) {
  const { t } = useApp();
  const enRoute = view.status === "en_route";
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState<"go" | "arrive" | null>(null);
  const chips = [t("drive.etaMin", { n: 15 }), t("drive.etaMin", { n: 30 }), t("drive.etaMin", { n: 45 }), t("drive.etaHour")];
  const tel = view.customer.phone ? `tel:${view.customer.phone.replace(/[^\d+]/g, "")}` : undefined;

  async function go() {
    setBusy("go");
    await act({ kind: "action", ref: view.ref, action: "on_the_way", extra: eta.trim() ? { eta: eta.trim() } : {} }, t("drive.onTheWayToast"));
    setBusy(null);
  }
  async function arrive() {
    setBusy("arrive");
    await act({ kind: "action", ref: view.ref, action: "arrived" }, t("drive.arrivedToast"));
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <StepHead n={2} of={4} title={t("drive.title")} />
      <Card className="space-y-3">
        <p className="text-[19px] leading-snug font-bold">{view.site.address}</p>
        <p className="text-[16px] text-muted">
          {view.customer.name}
          {view.customer.phone ? ` · ${view.customer.phone}` : ""}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="dark" size="lg" href={mapsUrl(view.site.address, view.geo)} target="_blank">
            <INavigate className="h-6 w-6 text-sun" />
            {t("drive.navigate")}
          </Btn>
          <Btn variant="light" size="lg" href={tel}>
            <IPhone className="h-6 w-6" />
            {t("drive.call")}
          </Btn>
        </div>
      </Card>

      <NotesBlock view={view} />

      {!enRoute ? (
        <Card className="space-y-3">
          <Field label={t("drive.eta")} htmlFor={`eta-${view.ref}`} hint={t("drive.etaHint")}>
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={eta === c}
                  onClick={() => setEta(eta === c ? "" : c)}
                  className={cx("min-h-12 rounded-full px-4 text-[16px] font-semibold ring-2 ring-inset", eta === c ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line active:bg-mist")}
                >
                  {c}
                </button>
              ))}
            </div>
            <input id={`eta-${view.ref}`} value={eta} onChange={(e) => setEta(e.target.value.slice(0, 40))} placeholder={t("drive.etaPh")} className={inputCls} />
          </Field>
        </Card>
      ) : (
        <Card tone="info" className="flex items-center gap-3">
          <IClock className="h-6 w-6 shrink-0 text-[#1d4ed8]" />
          <p className="text-[16px] font-semibold">{view.eta ? t("drive.notified", { eta: view.eta }) : t("drive.notifiedNoEta")}</p>
        </Card>
      )}

      {!enRoute && isCurrent ? (
        <Btn variant="light" block busy={busy === "arrive"} onClick={() => void arrive()}>
          {t("drive.skip")}
        </Btn>
      ) : null}

      {isCurrent ? (
        <ActionBar hint={!enRoute ? t("drive.etaHint") : undefined}>
          {enRoute ? (
            <Btn variant="primary" size="lg" block busy={busy === "arrive"} onClick={() => void arrive()}>
              <IShield className="h-6 w-6" />
              {t("drive.arrived")}
            </Btn>
          ) : (
            <Btn variant="primary" size="lg" block busy={busy === "go"} onClick={() => void go()}>
              <ITruck className="h-6 w-6" />
              {t("drive.onTheWay")}
            </Btn>
          )}
        </ActionBar>
      ) : (
        backBar
      )}
    </div>
  );
}

/* ======================= 3. Build ======================= */
export function TimerCard({ view, act }: { view: ViewCard; act: Act }) {
  const { t, lang, me } = useApp();
  const mine = view.timeEntries.find((e) => e.staffId === me.user.id && !e.end);
  const running = view.timeEntries.filter((e) => !e.end);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!running.length) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running.length]);
  const secs = mine ? Math.max(0, Math.floor((now - Date.parse(mine.start)) / 1000)) : 0;
  const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60;
  const clock = `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const total = view.minutes + running.reduce((m, e) => m + Math.max(0, (now - Date.parse(e.start)) / 60e3), 0);
  async function toggle() {
    setBusy(true);
    await act({ kind: "timer", ref: view.ref, action: mine ? "stop" : "start" });
    setBusy(false);
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-muted">
            <IClock className="h-5 w-5" />
            {t("build.timer")}
            {mine ? <Chip tone="green">● {t("build.timerRunning")}</Chip> : null}
          </p>
          <p className={cx("font-display text-[38px] leading-none font-extrabold tabular-nums", !mine && "text-ink/30")} aria-live="off">
            {clock}
          </p>
        </div>
        <Btn variant={mine ? "danger" : "dark"} size="lg" busy={busy} onClick={() => void toggle()}>
          {mine ? <IStop className="h-6 w-6" /> : <IPlay className="h-6 w-6 text-sun" />}
          {mine ? t("build.timerStop") : t("build.timerStart")}
        </Btn>
      </div>
      <p className="text-[15px] text-muted">{t("build.timerTotal", { t: fmtDuration(total, lang) })}</p>
    </Card>
  );
}

export function BuildStep({ view, act, isCurrent, backBar, onInspect }: StepProps & { onInspect: () => void }) {
  const { t, lang } = useApp();
  return (
    <div className="space-y-4">
      <StepHead n={3} of={4} title={t("build.title")}>
        {view.work.arrivedAt ? <p className="mt-1 text-[16px] text-muted">{t("build.arrivedAt", { time: fmtTime(view.work.arrivedAt, lang) })}</p> : null}
      </StepHead>
      <TimerCard view={view} act={act} />
      <SiteModel view={view} />
      {isCurrent ? (
        <ActionBar>
          <Btn variant="primary" size="lg" block onClick={onInspect}>
            <IShield className="h-6 w-6" />
            {t("build.cta")}
          </Btn>
        </ActionBar>
      ) : (
        backBar
      )}
    </div>
  );
}

/* ======================= 4. Inspect and hand over ======================= */
export function InspectStep({ view, act, isCurrent, backBar }: StepProps) {
  const { t, lang, toast } = useApp();
  const insp = view.work.inspection || {};
  const required = view.inspectionItems;
  const [items, setItems] = useState<Partial<Record<InspectionItem, boolean>>>(() => ({ ...(insp.items || {}) }));
  const [notes, setNotes] = useState(insp.notes || "");
  const [reason, setReason] = useState(insp.noSignatureReason || "");
  const [reasonDraft, setReasonDraft] = useState(insp.noSignatureReason || "");
  const [absent, setAbsent] = useState(!!insp.noSignatureReason && !insp.signature);
  const [signer, setSigner] = useState(insp.signer || "");
  const [resign, setResign] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const [busy, setBusy] = useState<"sig" | "reason" | "ready" | null>(null);
  const pad = useRef<SignaturePadHandle>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const body = useCallback(
    (over: { noSignatureReason?: string } = {}) => ({ items, notes, signer: signer.trim() || undefined, noSignatureReason: over.noSignatureReason ?? reason }),
    [items, notes, signer, reason]
  );
  const auto = useAutosave(() => void act({ kind: "inspection", ref: view.ref, body: body() }, undefined, true), [items, notes], 900);
  const okCount = required.filter((k) => items[k]).length;
  const sigId = view.work.inspection?.signature;
  const sigSrc = sigId ? view.localImages[sigId] || fileUrl(sigId) : null;

  async function saveSignature() {
    if (!pad.current || pad.current.isEmpty()) return toast(t("sig.empty"), "error");
    if (!signer.trim()) return toast(t("sig.needName"), "error");
    setBusy("sig");
    const ok = await act({ kind: "signature", ref: view.ref, image: pad.current.toDataUrl(), signer: signer.trim() }, t("sig.savedToast"));
    if (ok) {
      setResign(false);
      if (reason) {
        setReason("");
        setReasonDraft("");
        await act({ kind: "inspection", ref: view.ref, body: body({ noSignatureReason: "" }) }, undefined, true);
      }
    }
    setBusy(null);
  }
  async function saveReason() {
    const r = reasonDraft.trim();
    if (!r) return toast(t("sig.needReason"), "error");
    setBusy("reason");
    auto.flushed();
    const ok = await act({ kind: "inspection", ref: view.ref, body: body({ noSignatureReason: r }) }, t("common.saved"));
    if (ok) setReason(r);
    setBusy(null);
  }
  async function signInstead() {
    setAbsent(false);
    if (reason) {
      setReason("");
      await act({ kind: "inspection", ref: view.ref, body: body({ noSignatureReason: "" }) }, undefined, true);
    }
  }
  async function ready() {
    const missing = required.filter((k) => !items[k]);
    if (missing.length) {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return toast(`${t("insp.missing")} ${missing.map((k) => inspLabel(t, k)).join(", ")}`, "error");
    }
    if (!sigId && !reason) return toast(t("insp.needSig"), "error");
    setBusy("ready");
    auto.flushed();
    const ok = await act({ kind: "inspection", ref: view.ref, body: body() }, undefined, true);
    if (ok) await act({ kind: "action", ref: view.ref, action: "erected" }, t("insp.readyToast"));
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <StepHead n={4} of={4} title={t("insp.title")}>
        <p className="mt-1 text-[16px] text-muted">{t("insp.hint")}</p>
      </StepHead>
      <Card className="space-y-2">
        <p className="font-display text-[22px] font-extrabold tabular-nums">{t("insp.progress", { d: okCount, t: required.length })}</p>
        <Progress value={okCount} total={required.length} tone={okCount === required.length ? "green" : "sun"} />
      </Card>
      <ul ref={listRef} className="scroll-mt-24 space-y-2">
        {required.map((k) => (
          <li key={k}>
            <CheckRow
              checked={!!items[k]}
              onChange={(v) => {
                auto.touch();
                setItems((s) => ({ ...s, [k]: v }));
              }}
            >
              {inspLabel(t, k)}
            </CheckRow>
          </li>
        ))}
      </ul>
      <Field label={t("insp.notes")} htmlFor={`in-${view.ref}`}>
        <textarea
          id={`in-${view.ref}`}
          rows={2}
          value={notes}
          placeholder={t("insp.notesPh")}
          onChange={(e) => {
            auto.touch();
            setNotes(e.target.value.slice(0, 1000));
          }}
          className={inputCls}
        />
      </Field>

      <Card className="space-y-3">
        <h3 className="font-display text-[20px] font-bold">{t("sig.title")}</h3>
        {sigSrc && !resign ? (
          <>
            <div className="rounded-xl bg-white p-2 ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sigSrc} alt={t("sig.title")} className="mx-auto h-32 w-full object-contain" />
            </div>
            <p className="flex items-center gap-2 text-[16px] font-semibold text-[#15803d]">
              <ICheck className="h-5 w-5" />
              {t("sig.saved", { name: view.work.inspection?.signer || "", time: fmtStamp(view.work.inspection?.signedAt, lang) })}
            </p>
            <Btn variant="light" onClick={() => setResign(true)}>
              <IPen className="h-5 w-5" />
              {t("sig.again")}
            </Btn>
          </>
        ) : absent ? (
          <>
            {reason ? <p className="rounded-xl bg-[#e8f7ee] px-4 py-3 text-[16px] font-semibold text-[#15803d]">✓ {t("sig.reasonSaved", { r: reason })}</p> : null}
            <Field label={t("sig.reason")} htmlFor={`rs-${view.ref}`}>
              <input id={`rs-${view.ref}`} value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value.slice(0, 200))} placeholder={t("sig.reasonPh")} className={inputCls} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Btn variant="dark" busy={busy === "reason"} onClick={() => void saveReason()} disabled={reasonDraft.trim() === reason && !!reason}>
                {t("sig.reasonSave")}
              </Btn>
              <Btn variant="ghost" className="underline" onClick={() => void signInstead()}>
                {t("sig.useSignature")}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] text-muted">{t("sig.hint")}</p>
            <SignaturePad ref={pad} label={t("sig.pad")} onChange={setPadEmpty} />
            <Field label={t("sig.name")} htmlFor={`sn-${view.ref}`}>
              <input id={`sn-${view.ref}`} value={signer} autoComplete="off" onChange={(e) => setSigner(e.target.value.slice(0, 80))} className={inputCls} placeholder={view.customer.name} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="light" onClick={() => pad.current?.clear()} disabled={padEmpty}>
                {t("sig.clear")}
              </Btn>
              <Btn variant="dark" busy={busy === "sig"} onClick={() => void saveSignature()}>
                {t("sig.save")}
              </Btn>
            </div>
            <div className="flex flex-wrap gap-2">
              {resign ? (
                <Btn variant="ghost" className="underline" onClick={() => setResign(false)}>
                  {t("common.cancel")}
                </Btn>
              ) : null}
              <Btn variant="ghost" className="underline" onClick={() => setAbsent(true)}>
                {t("sig.absent")}
              </Btn>
            </div>
          </>
        )}
      </Card>

      {isCurrent ? (
        <ActionBar hint={t("insp.ctaHint")}>
          <Btn variant="primary" size="lg" block busy={busy === "ready"} onClick={() => void ready()}>
            <ICheck className="h-6 w-6" />
            {t("insp.cta")}
          </Btn>
        </ActionBar>
      ) : (
        backBar
      )}
    </div>
  );
}

/* ======================= Scaffold up: rental running, inspection visits ======================= */
export function UpPanel({ view, act, onStartPickup }: { view: ViewCard; act: Act; onStartPickup: () => void }) {
  const { t, lang, crew } = useApp();
  const [sheet, setSheet] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"ok" | "bad" | null>(null);
  const start = view.rental?.startedAt?.slice(0, 10) || view.assignment?.date || view.schedule.start;
  const end = addDays(start, Math.max(1, view.schedule.days));
  const visits = view.work.visits || [];
  const last = visits[visits.length - 1];
  const a = view.assignment || {};

  async function visit(ok: boolean) {
    if (!ok && !notes.trim()) return;
    setBusy(ok ? "ok" : "bad");
    const done = await act({ kind: "action", ref: view.ref, action: "visit", extra: { ok, notes: ok ? "" : notes.trim() } }, t("visit.saved"));
    if (done) {
      setSheet(false);
      setNotes("");
    }
    setBusy(null);
  }
  return (
    <div className="space-y-4">
      <Card tone="ok" className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#15803d] text-white">
          <ICheck className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <h2 className="font-display text-[24px] leading-tight font-extrabold">{t("up.title")}</h2>
          <p className="text-[16px]">{t("up.since", { date: fmtDay(start, lang) })}</p>
          <p className="text-[16px]">{t("up.ends", { date: fmtDay(end, lang) })}</p>
          <p className="text-[16px] font-semibold">
            {a.pickupDate ? t("up.pickup", { date: fmtDay(a.pickupDate, lang), time: a.pickupTime || "" }) : t("up.noPickup")}
            {a.pickupDate && crew(a.pickupCrewId || a.crewId) ? ` · ${crew(a.pickupCrewId || a.crewId)!.name}` : ""}
          </p>
        </div>
      </Card>
      {view.status === "pickup_requested" ? <Card tone="info">{t("up.pickupRequested")}</Card> : null}

      <Card className="space-y-3">
        <h3 className="flex items-center gap-2 font-display text-[20px] font-bold">
          <IShield className="h-5 w-5 text-ink-soft" />
          {t("visit.title")}
        </h3>
        <p className="text-[15px] text-muted">{t("visit.hint")}</p>
        <p className="text-[16px] font-semibold">
          {last ? (
            <>
              {t("visit.last", { date: fmtStamp(last.at, lang), by: last.by })} ·{" "}
              <span className={last.ok ? "text-[#15803d]" : "text-[#b42318]"}>{last.ok ? t("visit.okShort") : t("visit.issueShort")}</span>
            </>
          ) : (
            t("visit.none")
          )}
        </p>
        {last && !last.ok && last.notes ? <p className="rounded-xl bg-[#fde8e8] px-3 py-2 text-[15px]">{last.notes}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <Btn variant="success" size="lg" busy={busy === "ok"} onClick={() => void visit(true)}>
            <ICheck className="h-6 w-6" />
            {t("visit.ok")}
          </Btn>
          <Btn variant="danger" size="lg" onClick={() => setSheet(true)}>
            <IWarn className="h-6 w-6" />
            {t("visit.problems")}
          </Btn>
        </div>
      </Card>

      <Btn variant="light" size="lg" block onClick={onStartPickup}>
        <IDismantle className="h-6 w-6" />
        {t("up.startPickup")}
      </Btn>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t("visit.problems")}
        closeLabel={t("common.close")}
        footer={
          <Btn variant="primary" size="lg" block busy={busy === "bad"} disabled={!notes.trim()} onClick={() => void visit(false)}>
            {t("visit.save")}
          </Btn>
        }
      >
        <Field label={t("visit.notes")} htmlFor={`vn-${view.ref}`} hint={!notes.trim() ? t("visit.needNotes") : undefined}>
          <textarea id={`vn-${view.ref}`} data-autofocus rows={4} value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} className={inputCls} />
        </Field>
      </Sheet>
    </div>
  );
}

/* ======================= Pickup 1: count the parts back ======================= */
export function CountStep({ view, act, isCurrent, backBar }: StepProps) {
  const { t } = useApp();
  const rows = view.parts.map((p) => ({ key: p.key, delivered: view.work.loaded?.checked?.[p.key] ?? p.qty }));
  const prev = view.work.pickup;
  const [counted, setCounted] = useState<Parts>(() => Object.fromEntries(rows.map((r) => [r.key, prev?.at ? prev.counted?.[r.key] ?? 0 : r.delivered])));
  const [damaged, setDamaged] = useState<Parts>(() => ({ ...(prev?.damaged || {}) }));
  const [notes, setNotes] = useState(prev?.notes || "");
  const [edit, setEdit] = useState<{ key: PartKey; delivered: number } | null>(null);
  const [eBack, setEBack] = useState(0);
  const [eDmg, setEDmg] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!prev?.at);

  const missingOf = (k: PartKey, delivered: number) => Math.max(0, delivered - (counted[k] ?? 0));
  const totalMissing = rows.reduce((n, r) => n + missingOf(r.key, r.delivered), 0);
  const totalDamaged = rows.reduce((n, r) => n + (damaged[r.key] || 0), 0);

  async function save() {
    setBusy(true);
    const missing: Parts = {}, dmg: Parts = {};
    for (const r of rows) {
      const m = missingOf(r.key, r.delivered);
      if (m) missing[r.key] = m;
      if (damaged[r.key]) dmg[r.key] = damaged[r.key];
    }
    const ok = await act({ kind: "pickup", ref: view.ref, body: { counted, missing, damaged: dmg, notes: notes.trim() } }, t("pick.saved"));
    if (ok) setDirty(false);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <StepHead n={1} of={2} title={t("pick.title")}>
        <p className="mt-1 text-[16px] text-muted">{t("pick.hint")}</p>
      </StepHead>
      <Card tone={totalMissing || totalDamaged ? "warn" : "ok"} className="flex items-center gap-3">
        {totalMissing || totalDamaged ? <IWarn className="h-6 w-6 shrink-0" /> : <ICheck className="h-6 w-6 shrink-0 text-[#15803d]" />}
        <p className="font-display text-[19px] font-bold">{totalMissing || totalDamaged ? t("pick.summary", { m: totalMissing, d: totalDamaged }) : t("pick.summaryOk")}</p>
      </Card>
      <ul className="space-y-2">
        {rows.map((r) => {
          const back = counted[r.key] ?? 0;
          const m = missingOf(r.key, r.delivered);
          const d = damaged[r.key] || 0;
          const issue = m > 0 || d > 0;
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => {
                  setEdit({ key: r.key, delivered: r.delivered });
                  setEBack(back);
                  setEDmg(d);
                }}
                aria-label={`${t("pick.rowEdit")}: ${partLabel(t, r.key)}`}
                className={cx("flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-2 ring-inset active:bg-mist", issue ? "bg-[#fff6ee] ring-[#fbc59a]" : "bg-white ring-line")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] leading-snug font-semibold">{partLabel(t, r.key)}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className="text-[14px] text-muted">{t("pick.delivered", { n: r.delivered })}</span>
                    {m ? <Chip tone="red">{`${t("pick.missing")} ${m}`}</Chip> : null}
                    {d ? <Chip tone="sun">{`${t("pick.damaged")} ${d}`}</Chip> : null}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-display text-[26px] leading-none font-extrabold tabular-nums">{back}</span>
                  <span className="block text-[13px] font-semibold text-muted">{t("pick.counted")}</span>
                </span>
                <IPen className="h-5 w-5 shrink-0 text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
      <Field label={t("pick.notes")} htmlFor={`pn-${view.ref}`}>
        <textarea
          id={`pn-${view.ref}`}
          rows={2}
          value={notes}
          placeholder={t("pick.notesPh")}
          onChange={(e) => {
            setDirty(true);
            setNotes(e.target.value.slice(0, 1000));
          }}
          className={inputCls}
        />
      </Field>

      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit ? partLabel(t, edit.key) : ""}
        closeLabel={t("common.close")}
        footer={
          <Btn
            variant="primary"
            size="lg"
            block
            onClick={() => {
              if (edit) {
                setCounted((c) => ({ ...c, [edit.key]: eBack }));
                setDamaged((c) => ({ ...c, [edit.key]: Math.min(eDmg, eBack) }));
                setDirty(true);
              }
              setEdit(null);
            }}
          >
            {t("common.save")}
          </Btn>
        }
      >
        {edit ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[16px] text-muted">{t("pick.delivered", { n: edit.delivered })}</p>
              <Btn
                variant="light"
                onClick={() => {
                  setEBack(edit.delivered);
                  setEDmg(0);
                }}
              >
                <ICheck className="h-5 w-5" />
                {t("pick.allBack")}
              </Btn>
            </div>
            <Field label={t("pick.counted")}>
              <Stepper label={t("pick.counted")} value={eBack} onChange={setEBack} max={edit.delivered + 200} />
            </Field>
            <Field label={t("pick.ofWhich")}>
              <Stepper label={t("pick.damaged")} value={Math.min(eDmg, eBack)} onChange={setEDmg} max={eBack} />
            </Field>
            <p className="rounded-xl bg-mist px-4 py-3 text-[17px] font-semibold">
              {t("pick.missing")}: <span className="font-display text-[22px] font-extrabold">{Math.max(0, edit.delivered - eBack)}</span>
            </p>
          </div>
        ) : null}
      </Sheet>

      {isCurrent || dirty ? (
        <ActionBar>
          <Btn variant="primary" size="lg" block busy={busy} onClick={() => void save()}>
            <IBox className="h-6 w-6" />
            {t("pick.save")}
          </Btn>
        </ActionBar>
      ) : (
        backBar
      )}
    </div>
  );
}

/* ======================= Pickup 2: dismantled and loaded ======================= */
function CountSummary({ view }: { view: ViewCard }) {
  const { t, lang } = useApp();
  const p = view.work.pickup;
  if (!p?.at) return null;
  const issues = view.parts
    .map((x) => ({ key: x.key, m: p.missing?.[x.key] || 0, d: p.damaged?.[x.key] || 0 }))
    .filter((x) => x.m || x.d);
  const tm = issues.reduce((n, x) => n + x.m, 0), td = issues.reduce((n, x) => n + x.d, 0);
  return (
    <div className="space-y-2">
      <p className="text-[15px] text-muted">{t("pick.countedAt", { time: fmtStamp(p.at, lang), by: p.by || "" })}</p>
      <p className={cx("font-display text-[19px] font-bold", issues.length ? "text-[#9a3412]" : "text-[#15803d]")}>{issues.length ? t("pick.summary", { m: tm, d: td }) : `✓ ${t("pick.summaryOk")}`}</p>
      {issues.length ? (
        <ul className="space-y-1">
          {issues.map((x) => (
            <li key={x.key} className="flex flex-wrap items-center gap-2 text-[15px]">
              <span className="font-semibold">{partLabel(t, x.key)}</span>
              {x.m ? <Chip tone="red">{`${t("pick.missing")} ${x.m}`}</Chip> : null}
              {x.d ? <Chip tone="sun">{`${t("pick.damaged")} ${x.d}`}</Chip> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {p.notes ? <p className="rounded-xl bg-mist px-3 py-2 text-[15px] whitespace-pre-line">{p.notes}</p> : null}
    </div>
  );
}

export function DismantleStep({ view, act, isCurrent, backBar, onEditCount }: StepProps & { onEditCount: () => void }) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);
  async function done() {
    setBusy(true);
    await act({ kind: "action", ref: view.ref, action: "dismantled" }, t("dis.doneToast"));
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <StepHead n={2} of={2} title={t("dis.title")}>
        <p className="mt-1 text-[16px] text-muted">{t("dis.hint")}</p>
      </StepHead>
      <Card className="space-y-3">
        <CountSummary view={view} />
        <Btn variant="light" onClick={onEditCount}>
          <IPen className="h-5 w-5" />
          {t("pick.edit")}
        </Btn>
      </Card>
      {isCurrent ? (
        <ActionBar>
          <Btn variant="primary" size="lg" block busy={busy} onClick={() => void done()}>
            <ITruck className="h-6 w-6" />
            {t("dis.cta")}
          </Btn>
        </ActionBar>
      ) : (
        backBar
      )}
    </div>
  );
}

export function PickupDone({ view }: { view: ViewCard }) {
  const { t, lang } = useApp();
  return (
    <div className="space-y-4">
      <Card tone="ok" className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#15803d] text-white">
          <ICheck className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <h2 className="font-display text-[24px] leading-tight font-extrabold">{t("done.title")}</h2>
          {view.rental?.endedAt ? <p className="text-[16px]">{t("done.ended", { date: fmtDay(view.rental.endedAt.slice(0, 10), lang) })}</p> : null}
        </div>
      </Card>
      {view.work.pickup?.at ? (
        <Card>
          <CountSummary view={view} />
        </Card>
      ) : null}
    </div>
  );
}
