"use client";
// Change requests: the crew reports a different house size or another problem from site; team leaders and the
// owner approve or decline requests (from customers or crews) right in the app.
import { useRef, useState } from "react";
import { ApiError, decideChange, fileUrl, shrinkImage, type ChangeRequest, type House } from "@/lib/platform";
import { useApp } from "./context";
import { errorText, fmtDay, fmtEur, fmtNum, fmtStamp, partLabel, statusLabel, type Key } from "./i18n";
import { ICamera, ICheck, IClose, IFlag, IWarn } from "./icons";
import type { Act } from "./JobInfo";
import type { ViewCard } from "./queue";
import { Btn, Chip, cx, Field, inputCls, Segmented, Sheet } from "./ui";

const sizeText = (h: Partial<House> | undefined, lang: Parameters<typeof fmtNum>[1]) =>
  h && h.length && h.width ? `${fmtNum(h.length, lang)} × ${fmtNum(h.width, lang)} m${h.eave ? ` · ${fmtNum(h.eave, lang)} m` : ""}` : "—";

export function ChangeCard({
  change,
  canDecide,
  onDecided,
  showOrder = false,
  onOpenJob,
  localImages
}: {
  change: ChangeRequest;
  canDecide: boolean;
  onDecided: (c: ChangeRequest) => void;
  showOrder?: boolean;
  onOpenJob?: () => void;
  localImages?: Record<string, string>;
}) {
  const { t, lang } = useApp();
  const [decide, setDecide] = useState<"approve" | "reject" | null>(null);
  const c = change;
  const local = c.id.startsWith("local:");
  const tone = c.status === "pending" ? "sun" : c.status === "approved" ? "green" : "red";
  const who = c.source === "customer" ? t("ch.from.customer") : c.source === "crew" ? t("ch.from.crew", { name: c.by?.name || "" }) : t("ch.from.office");
  const diff = c.after ? c.after.total - c.before.total : 0;
  const short = c.stock && !c.stock.ok ? Object.entries(c.stock.short || {}).filter(([, n]) => (n || 0) > 0) : [];
  const localPhotos = local && localImages ? Object.entries(localImages).filter(([k]) => k.startsWith(`${c.id}:`)).map(([, v]) => v) : [];

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-line">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[19px] leading-tight font-bold">{t(`ch.type.${c.type}` as Key)}</h3>
          <p className="mt-0.5 text-[14px] text-muted">
            {who} · {fmtStamp(c.createdAt, lang)}
          </p>
        </div>
        <Chip tone={tone}>{t(`ch.${c.status}` as Key)}</Chip>
      </header>

      {showOrder && c.order ? (
        <div className="rounded-xl bg-mist px-3 py-2.5">
          <p className="font-display text-[14px] font-bold text-muted">{c.ref}</p>
          <p className="text-[17px] leading-snug font-bold">{c.order.address}</p>
          <p className="text-[15px] text-muted">
            {c.order.customer} · {statusLabel(t, c.order.status)}
          </p>
        </div>
      ) : null}

      {c.note ? <p className="rounded-xl bg-sun-soft px-3 py-2.5 text-[16px] leading-snug whitespace-pre-line">{c.note}</p> : null}

      {c.type !== "other" && !local ? (
        <dl className="grid grid-cols-1 gap-2 text-[16px]">
          {c.type === "house" ? (
            <Compare label={t("ch.size")} before={sizeText(c.before.house, lang)} after={sizeText(c.proposed.house, lang)} />
          ) : null}
          {c.type === "house" && c.after ? <Compare label={t("ch.area")} before="" after={`${fmtNum(c.after.area, lang, 0)} m²`} /> : null}
          {c.type === "days" ? <Compare label={t("ch.days")} before={t("ch.daysVal", { n: c.before.days })} after={t("ch.daysVal", { n: c.proposed.days || c.after?.days || 0 })} /> : null}
          {c.type === "pickup_date" ? (
            <Compare label={t("ch.pickupDate")} before={t("ch.daysVal", { n: c.before.days })} after={`${fmtDay(c.proposed.date, lang)} · ${t("ch.daysVal", { n: c.proposed.days || 0 })}`} />
          ) : null}
          {c.after ? (
            <Compare
              label={t("ch.price")}
              before={fmtEur(c.before.total, lang)}
              after={
                <>
                  {fmtEur(c.after.total, lang)}{" "}
                  <span className={cx("text-[14px] font-bold", diff > 0 ? "text-[#15803d]" : diff < 0 ? "text-[#b42318]" : "text-muted")}>
                    ({diff > 0 ? "+" : diff < 0 ? "−" : "±"}
                    {fmtEur(Math.abs(diff), lang)})
                  </span>
                </>
              }
            />
          ) : null}
        </dl>
      ) : c.type === "house" && local ? (
        <Compare label={t("ch.size")} before={sizeText(c.before.house, lang)} after={sizeText(c.proposed.house, lang)} />
      ) : null}

      {short.length ? (
        <div className="flex items-start gap-2 rounded-xl bg-[#fde8e8] px-3 py-2.5 text-[#8a1c13]">
          <IWarn className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-[15px] font-semibold">
            {t("ch.stockShort")} {short.map(([k, n]) => `${partLabel(t, k as Parameters<typeof partLabel>[1])} ${n}`).join(", ")}
          </p>
        </div>
      ) : c.stock && c.stock.ok && c.status === "pending" ? (
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[#15803d]">
          <ICheck className="h-5 w-5" />
          {t("ch.stockOk")}
        </p>
      ) : null}

      {c.photos.length || localPhotos.length ? (
        <ul className="flex gap-2 overflow-x-auto">
          {c.photos.map((id) => (
            <li key={id} className="shrink-0">
              <a href={fileUrl(id)} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(id)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </a>
            </li>
          ))}
          {localPhotos.map((src, i) => (
            <li key={i} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      ) : null}

      {local ? <p className="text-[15px] font-semibold text-[#92400e]">{t("ch.waitingSync")}</p> : null}

      {c.status !== "pending" && c.decidedBy ? (
        <p className="text-[15px] text-muted">
          {t("ch.decided", { name: c.decidedBy.name, time: fmtStamp(c.decidedAt, lang) })}
          {c.reason ? <span className="mt-1 block rounded-xl bg-mist px-3 py-2 text-[15px] text-ink">{c.reason}</span> : null}
        </p>
      ) : null}

      {canDecide && c.status === "pending" && !local ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Btn variant="danger" size="lg" onClick={() => setDecide("reject")}>
            <IClose className="h-5 w-5" />
            {t("ch.decline")}
          </Btn>
          <Btn variant="success" size="lg" onClick={() => setDecide("approve")}>
            <ICheck className="h-5 w-5" />
            {t("ch.approve")}
          </Btn>
        </div>
      ) : null}
      {onOpenJob ? (
        <Btn variant="ghost" className="-ml-2 underline" onClick={onOpenJob}>
          {t("appr.open")}
        </Btn>
      ) : null}

      <DecideSheet change={c} mode={decide} onClose={() => setDecide(null)} onDone={onDecided} />
    </article>
  );
}

function Compare({ label, before, after }: { label: string; before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-mist px-3 py-2.5">
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 text-[16px]">
        {before ? (
          <>
            <span className="text-muted line-through decoration-1">{before}</span>
            <span aria-hidden className="text-muted">→</span>
          </>
        ) : null}
        <span className="font-display text-[18px] font-bold">{after}</span>
      </dd>
    </div>
  );
}

function DecideSheet({ change, mode, onClose, onDone }: { change: ChangeRequest; mode: "approve" | "reject" | null; onClose: () => void; onDone: (c: ChangeRequest) => void }) {
  const { t, toast, authLost } = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const approve = mode === "approve";
  async function submit() {
    if (!approve && !reason.trim()) return setError(t("ch.needReason"));
    setBusy(true);
    setError("");
    try {
      const r = await decideChange(change.id, approve, reason.trim());
      toast(approve ? t("ch.approvedToast") : t("ch.declinedToast"));
      setReason("");
      onClose();
      onDone(r.change);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return authLost();
      setError(e instanceof ApiError && e.code === "network" ? t("appr.needOnline") : errorText(t, e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={!!mode}
      onClose={onClose}
      title={approve ? t("ch.confirmApprove") : t("ch.confirmDecline")}
      closeLabel={t("common.close")}
      footer={
        <Btn variant={approve ? "success" : "danger"} size="lg" block busy={busy} onClick={() => void submit()}>
          {approve ? <ICheck className="h-6 w-6" /> : <IClose className="h-6 w-6" />}
          {approve ? t("ch.approve") : t("ch.decline")}
        </Btn>
      }
    >
      <div className="space-y-3">
        <p className="text-[16px] text-muted">{t("ch.notify")}</p>
        <Field label={approve ? t("ch.noteLabel") : t("ch.reason")} htmlFor={`dr-${change.id}`}>
          <textarea
            id={`dr-${change.id}`}
            data-autofocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={approve ? t("ch.notePh") : t("ch.reasonPh")}
            className={inputCls}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl bg-[#fde8e8] px-4 py-3 text-[16px] font-semibold text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/* ---------------- Report from site ---------------- */
const parseNum = (s: string) => {
  const n = Number(String(s).replace(",", ".").replace(/[^\d.]/g, ""));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export function ReportSheet({ view, open, onClose, act }: { view: ViewCard; open: boolean; onClose: () => void; act: Act }) {
  const { t, lang, toast } = useApp();
  const [type, setType] = useState<"house" | "other">("house");
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [eave, setEave] = useState("");
  const [note, setNote] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const h = view.house;

  const reset = () => {
    setLen(fmtNum(h.length, lang, 2));
    setWid(fmtNum(h.width, lang, 2));
    setEave(fmtNum(h.eave, lang, 2));
    setNote("");
    setImages([]);
    setError("");
  };
  // Fill in the order's measurements each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset();
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 6 - images.length)) {
      try {
        const img = await shrinkImage(f);
        setImages((xs) => [...xs, img].slice(0, 6));
      } catch {
        toast(t("err.image"), "error");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    setError("");
    let house: Partial<House> | undefined;
    if (type === "house") {
      const L = parseNum(len), W = parseNum(wid), E = parseNum(eave);
      if (L === null || W === null || E === null || L < 3 || L > 60 || W < 3 || W > 40 || E < 2 || E > 12) return setError(t("rep.badNumber"));
      house = {};
      if (Math.abs(L - h.length) > 0.001) house.length = L;
      if (Math.abs(W - h.width) > 0.001) house.width = W;
      if (Math.abs(E - h.eave) > 0.001) house.eave = E;
      if (!Object.keys(house).length) return setError(t("rep.needChange"));
    } else if (!note.trim()) {
      return setError(t("rep.needNote"));
    }
    setBusy(true);
    const ok = await act({ kind: "report", ref: view.ref, body: { type, house, note: note.trim() }, images, uploaded: [] }, t("rep.sent"));
    setBusy(false);
    if (ok) onClose();
  }

  const num = (id: string, label: string, value: string, set: (v: string) => void, was: number) => (
    <Field label={label} htmlFor={id} hint={t("rep.was", { v: fmtNum(was, lang, 2) })}>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} className={cx(inputCls, "h-14 font-display text-[22px] font-bold")} />
    </Field>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("rep.title")}
      closeLabel={t("common.close")}
      footer={
        <Btn variant="primary" size="lg" block busy={busy} onClick={() => void send()}>
          <IFlag className="h-6 w-6" />
          {t("rep.send")}
        </Btn>
      }
    >
      <div className="space-y-4">
        <Segmented
          label={t("rep.title")}
          value={type}
          onChange={(v) => {
            setType(v);
            setError("");
          }}
          options={[
            { value: "house", label: t("rep.typeHouse") },
            { value: "other", label: t("rep.typeOther") }
          ]}
        />
        <p className="text-[15px] text-muted">{type === "house" ? t("rep.houseHint") : t("rep.otherHint")}</p>
        {type === "house" ? (
          <div className="grid grid-cols-2 gap-3">
            {num(`rl-${view.ref}`, t("rep.length"), len, setLen, h.length)}
            {num(`rw-${view.ref}`, t("rep.width"), wid, setWid, h.width)}
            {num(`re-${view.ref}`, t("rep.eave"), eave, setEave, h.eave)}
          </div>
        ) : null}
        <Field label={`${t("rep.note")}${type === "house" ? ` (${t("common.optional")})` : ""}`} htmlFor={`rn-${view.ref}`}>
          <textarea id={`rn-${view.ref}`} rows={3} value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} placeholder={t("rep.notePh")} className={inputCls} />
        </Field>
        <div className="space-y-2">
          {images.length ? (
            <ul className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <li key={i} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={t("common.close")}
                    onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 grid h-8 w-8 place-items-center rounded-full bg-ink/80 text-white"
                  >
                    <IClose className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void addPhotos(e.target.files)} data-testid="report-photo-input" />
          {images.length < 6 ? (
            <Btn variant="light" block onClick={() => fileRef.current?.click()}>
              <ICamera className="h-5 w-5" />
              {t("rep.photos")}
            </Btn>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-[#fde8e8] px-4 py-3 text-[16px] font-semibold text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
