"use client";
// Order tracking: reference + last four phone digits → status timeline, details, changes, documents,
// invoices, messages, and the customer actions (ask for a longer rental, request pickup, message the office,
// rate us after pickup). A longer rental is a request the office approves; the new price shows before → after.
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { answerPriceChange, getOrder, getOrderPlan, orderAction, STATUSES, uploadOrderPhoto, type OrderChange, type OrderView, type PriceChange } from "@/lib/api";
import { Plan3DOverlay } from "../scaffold3d/Plan3DOverlay";
import { siteTexts } from "../scaffold3d/siteTexts";
import { shrinkImage } from "@/lib/image";
import { digits, eur, fmtDate, fmtStamp } from "@/lib/format";
import { errText, lineLabel, useI18n } from "@/lib/i18n";
import { useSite } from "../SiteContext";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

function normRef(v: string): string {
  let s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let prefix = "TK";
  if (s.startsWith("TK") || s.startsWith("TP")) {
    prefix = s.slice(0, 2);
    s = s.slice(2);
  }
  return s ? `${prefix}-${s}` : "";
}

export function TrackOrder() {
  const { track, closeTrack } = useSite();
  const { t } = useI18n();
  return (
    <Modal open={track.open} onClose={closeTrack} label={t("tr.title")} closeLabel={t("q.close")} size="md">
      <TrackBody key={`${track.ref || ""}-${track.open}`} initialRef={track.ref} initialPhone={track.phone4} />
    </Modal>
  );
}

const STAR_PATH = "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";
function Stars({ n, className = "h-4 w-4" }: { n: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5 text-sun-deep" aria-hidden>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} viewBox="0 0 24 24" className={className} fill={k <= n ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

function TrackBody({ initialRef, initialPhone }: { initialRef?: string; initialPhone?: string }) {
  const i18n = useI18n();
  const { t, tk, lang } = i18n;
  const toast = useToast();
  const [ref, setRef] = useState(initialRef || "");
  const [phone, setPhone] = useState(initialPhone || "");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rating, setRating] = useState({ stars: 0, text: "", consent: true });
  const [uploading, setUploading] = useState(0);
  const creds = useRef<{ ref: string; phone4: string } | null>(null);
  const [show3d, setShow3d] = useState(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const fmt = (iso: string) => fmtDate(iso, lang);

  const find = useCallback(
    async (r: string, p: string) => {
      const nr = normRef(r), p4 = digits(p);
      setError("");
      if (nr.length < 9) return setError(t("tr.err.ref"));
      if (p4.length !== 4) return setError(t("tr.err.phone"));
      setBusy(true);
      try {
        const o = await getOrder(nr, p4);
        creds.current = { ref: nr, phone4: p4 };
        setRef(nr);
        setOrder(o);
      } catch (e) {
        setError(errText(i18n, e, fmt));
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n]
  );

  // Opened from the wizard's "Track this order": look it up right away. From a message link (/?track=REF)
  // only the reference is known, so the phone digits field gets the focus.
  useEffect(() => {
    if (initialRef && initialPhone) void find(initialRef, initialPhone);
    else if (initialRef) window.setTimeout(() => phoneInput.current?.focus(), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh every 30 s while open.
  useEffect(() => {
    if (!order) return;
    const id = window.setInterval(async () => {
      const c = creds.current;
      if (!c || document.hidden) return;
      try {
        const o = await getOrder(c.ref, c.phone4);
        setOrder((prev) => (prev && prev.updatedAt === o.updatedAt && (prev.changes || []).length === (o.changes || []).length ? prev : o));
      } catch {
        /* keep showing the last state */
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [order]);

  async function act(action: "extend" | "pickup" | "message" | "review", extra: Record<string, unknown>, ok: (o: OrderView) => string) {
    const c = creds.current;
    if (!c) return false;
    try {
      const o = await orderAction(c.ref, action, { phone: c.phone4, ...extra });
      setOrder(o);
      toast(ok(o));
      return true;
    } catch (e) {
      toast(errText(i18n, e, fmt));
      return false;
    }
  }

  if (!order) {
    return (
      <div className="min-h-0 overflow-y-auto p-6 sm:p-9">
        <h2 className="pr-10 font-display text-3xl font-extrabold tracking-[-0.02em]">{t("tr.title")}</h2>
        <p className="mt-2 text-muted">{t("tr.intro")}</p>
        <form
          className="mt-6 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void find(ref, phone);
          }}
        >
          <label className="block">
            <span className="field-label">{t("tr.ref")}</span>
            <input className="field-input font-mono uppercase" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="TK-XXXXXX" autoComplete="off" spellCheck={false} />
          </label>
          <label className="block">
            <span className="field-label">{t("tr.phone")}</span>
            <input ref={phoneInput} className="field-input" inputMode="numeric" maxLength={4} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="4567" autoComplete="off" />
          </label>
          <Button type="submit" variant="dark" disabled={busy}>
            {busy ? t("tr.finding") : t("tr.find")}
          </Button>
        </form>
        <AnimatePresence>
          {error ? (
            <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 text-sm font-medium text-signal" role="alert">
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  const lastAt = (s: string) => {
    let at: string | null = null;
    for (const h of order.history || []) if (h.status === s) at = h.at;
    return at;
  };
  const steps = STATUSES.filter((s) => s !== "pickup_requested" || order.status === "pickup_requested" || lastAt("pickup_requested"));
  const cur = STATUSES.indexOf(order.status as (typeof STATUSES)[number]);
  const finished = order.status === "dismantled" || order.status === "closed";
  const cancelled = Boolean(order.cancelled) || order.status === "cancelled";
  const changes = (order.changes || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = changes.some((c) => c.status === "pending" && c.by?.role === "customer");
  const plan = order.plan;
  const q = order.access ? `?t=${encodeURIComponent(order.access)}` : "";
  const docs = [
    { href: `/doc/confirmation/${order.ref}${q}`, label: t("tr.doc.confirmation"), show: Boolean(order.docs?.confirmation) && !cancelled },
    { href: `/doc/inspection/${order.ref}${q}`, label: t("tr.doc.inspection"), show: Boolean(order.docs?.inspection) }
  ].filter((d) => d.show && order.access);
  const invoices = order.invoices || [];
  const time = (d: string | null | undefined, tm?: string) => (d ? `${fmt(d)}${tm ? ` ${tm}` : ""}` : "");

  const facts: [string, string][] = [
    [t("tr.start"), time(plan?.date, plan?.time) || fmt(order.schedule.start)],
    [t("tr.rental"), t("tr.days", { n: order.schedule.days ?? order.quote?.rentDays })],
    ...(order.rentalEnd && !cancelled ? ([[t("tr.ends"), fmt(order.rentalEnd)]] as [string, string][]) : []),
    ...(plan?.pickupDate ? ([[t("tr.pickupOn"), time(plan.pickupDate, plan.pickupTime)]] as [string, string][]) : []),
    [t("tr.scaffold"), `${order.estimate.area} m² · ${tk("job." + order.house.jobType)}`],
    [t("tr.price"), order.quote ? eur(order.quote.total) : "—"],
    [t("tr.zone"), tk("zone." + order.site.zone)]
  ];

  return (
    <div className="min-h-0 overflow-y-auto p-6 sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t("tr.title")}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3 pr-10">
        <h2 className="font-mono text-3xl font-bold tracking-wider">{order.ref}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${cancelled ? "bg-signal/10 text-signal" : "bg-sun text-ink"}`}>{tk("status." + order.status, undefined, order.status)}</span>
      </div>
      <p className="mt-1 text-muted">{order.site.address}</p>
      {cancelled ? <p className="mt-3 rounded-xl bg-signal/10 px-4 py-2.5 text-sm font-medium text-signal">{t("tr.cancelled")}</p> : null}
      {order.eta && !cancelled ? (
        <p className="mt-3 rounded-xl bg-mist px-4 py-2.5 text-sm">
          <b>{t("tr.arrival")}:</b> {order.eta}
          {order.crew ? ` · ${order.crew}` : ""}
        </p>
      ) : null}

      {order.priceChange && !cancelled && ["pending", "accepted", "declined", "outdated"].includes(order.priceChange.status) ? (
        <PriceChangeCard
          pc={order.priceChange}
          fmt={(iso) => fmtStamp(iso, lang)}
          onAnswer={async (accept, note) => {
            const c = creds.current;
            if (!c || !order.priceChange) return;
            try {
              setOrder(await answerPriceChange(c.ref, c.phone4, accept, order.priceChange.id, note));
              toast(accept ? t("tr.pc.acceptedToast") : t("tr.pc.declinedToast"));
            } catch (e) {
              toast(errText(i18n, e, fmt));
              // The offer may have changed meanwhile: show the current one.
              try {
                setOrder(await getOrder(c.ref, c.phone4));
              } catch {
                /* keep the last state */
              }
            }
          }}
        />
      ) : null}

      {!cancelled ? (
        <ol className="mt-6 space-y-0">
          {steps.map((s, i) => {
            const idx = STATUSES.indexOf(s);
            const state = idx < cur ? "done" : idx === cur ? "now" : "todo";
            const at = lastAt(s);
            return (
              <motion.li key={s} className="relative flex gap-4 pb-5 last:pb-0" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                {i < steps.length - 1 ? <span aria-hidden className={`absolute top-6 left-[11px] h-[calc(100%-12px)] w-[2px] ${idx < cur ? "bg-ink" : "bg-line"}`} /> : null}
                <span className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-ink" : state === "now" ? "bg-sun ring-4 ring-sun/30" : "bg-white ring-2 ring-line"}`} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={`font-semibold ${state === "todo" ? "text-muted" : "text-ink"}`}>{tk("status." + s)}</p>
                    {at && idx <= cur ? <p className="text-xs text-muted">{fmtStamp(at, lang)}</p> : null}
                  </div>
                  {state === "now" ? <p className="mt-0.5 text-sm text-muted">{tk("statusCust." + s)}</p> : null}
                </div>
              </motion.li>
            );
          })}
        </ol>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-mist p-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {!cancelled ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button size="sm" variant="ghost" disabled={finished || pending} onClick={() => act("extend", { days: 7 }, () => t("tr.extendSent"))}>
            {t("tr.extendAsk")}
          </Button>
          <Button size="sm" variant="ghost" disabled={order.status !== "erected"} onClick={() => act("pickup", {}, () => t("tr.pickupDone"))}>
            {t("tr.pickup")}
          </Button>
        </div>
      ) : null}

      {!cancelled && creds.current ? (
        <div className="mt-6">
          <Button size="sm" variant="ghost" onClick={() => setShow3d(true)}>
            {t("p3d.open")}
          </Button>
        </div>
      ) : null}
      {show3d && creds.current ? (
        <Plan3DOverlay title={t("p3d.title")} texts={siteTexts(i18n)} onClose={() => setShow3d(false)} load={() => getOrderPlan(creds.current!.ref, creds.current!.phone4).then((r) => r.plan)} />
      ) : null}

      {!finished && !cancelled ? (
        <section className={`mt-6 rounded-2xl p-4 sm:p-5 ${order.needsPhotos ? "bg-sun-soft" : "bg-mist"}`} aria-labelledby="tr-photos">
          <h3 id="tr-photos" className="font-display text-lg font-bold text-ink">
            {t("tr.photos")}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">{order.needsPhotos ? t("tr.photosNeeded") : t("tr.photosText")}</p>
          {order.photos?.length ? (
            <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {order.photos.map((p) => (
                <li key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${encodeURIComponent(p.id)}${q}`} alt={t("tr.photoAlt")} className="aspect-square w-full rounded-lg object-cover ring-1 ring-line" loading="lazy" />
                </li>
              ))}
            </ul>
          ) : null}
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft">
            {uploading ? t("tr.photosUploading", { n: uploading }) : t("tr.photosAdd")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={uploading > 0}
              onChange={async (e) => {
                const c = creds.current;
                const files = Array.from(e.target.files || []).slice(0, 12);
                e.target.value = "";
                if (!c || !files.length) return;
                let last: OrderView | null = null;
                for (let k = 0; k < files.length; k++) {
                  setUploading(files.length - k);
                  try {
                    last = await uploadOrderPhoto(c.ref, c.phone4, await shrinkImage(files[k], t("tr.photoBad")));
                  } catch (err) {
                    toast(errText(i18n, err, fmt));
                    break;
                  }
                }
                setUploading(0);
                if (last) {
                  setOrder(last);
                  toast(t("tr.photosSaved"));
                }
              }}
            />
          </label>
        </section>
      ) : null}

      {changes.length ? (
        <section className="mt-6" aria-labelledby="tr-changes">
          <h3 id="tr-changes" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {t("tr.changes")}
          </h3>
          <ul className="mt-2 space-y-2">
            {changes.map((c) => (
              <ChangeRow key={c.id} c={c} fmt={fmt} />
            ))}
          </ul>
        </section>
      ) : null}

      {docs.length || invoices.length ? (
        <section className="mt-6" aria-labelledby="tr-docs">
          <h3 id="tr-docs" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {t("tr.docs")}
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {docs.map((d) => (
              <li key={d.href}>
                <a href={d.href} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 rounded-xl bg-mist px-4 py-3 text-sm font-semibold text-ink ring-1 ring-transparent hover:ring-line">
                  {d.label} <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
            {invoices.map((iv) => (
              <li key={String(iv.no)}>
                <a
                  href={iv.id && order.access ? `/doc/invoice/${encodeURIComponent(iv.id)}${q}` : undefined}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center justify-between gap-3 rounded-xl bg-mist px-4 py-3 text-sm ring-1 ring-transparent hover:ring-line"
                >
                  <span>
                    <span className="block font-semibold text-ink">{t("tr.doc.invoice", { no: iv.no })}</span>
                    <span className="text-xs text-muted">{iv.status === "paid" ? t("tr.inv.paid", { total: eur(iv.total) }) : t("tr.inv.due", { total: eur(iv.total), date: fmt(iv.due) })}</span>
                  </span>
                  <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finished ? (
        <section className="mt-6 rounded-2xl bg-sun-soft p-4 sm:p-5" aria-labelledby="tr-rate">
          <h3 id="tr-rate" className="font-display text-lg font-bold text-ink">
            {order.review ? t("tr.rated") : t("tr.rate")}
          </h3>
          {order.review ? (
            <div className="mt-2">
              <Stars n={order.review.stars} className="h-5 w-5" />
              <span className="sr-only">{t("tr.star", { n: order.review.stars })}</span>
              {order.review.text ? <p className="mt-2 text-sm text-ink-soft">{order.review.text}</p> : null}
            </div>
          ) : (
            <form
              className="mt-1"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!rating.stars) return toast(t("err.bad_rating"));
                await act("review", { stars: rating.stars, text: rating.text.trim(), consent: rating.consent }, () => t("tr.rateThanks"));
              }}
            >
              <p className="text-sm text-ink-soft">{t("tr.rateText")}</p>
              <div role="radiogroup" aria-label={t("tr.rate")} className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating.stars === n}
                    aria-label={t("tr.star", { n })}
                    onClick={() => setRating((r) => ({ ...r, stars: n }))}
                    className="grid h-10 w-10 place-items-center rounded-lg text-sun-deep hover:bg-white/60"
                  >
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill={n <= rating.stars ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} aria-hidden>
                      <path d={STAR_PATH} />
                    </svg>
                  </button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="field-label">{t("tr.rateComment")}</span>
                <textarea className="field-input min-h-20 bg-white" maxLength={1000} value={rating.text} onChange={(e) => setRating((r) => ({ ...r, text: e.target.value }))} />
              </label>
              <label className="mt-3 flex items-start gap-3 text-sm text-ink-soft">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-ink" checked={rating.consent} onChange={(e) => setRating((r) => ({ ...r, consent: e.target.checked }))} />
                {t("tr.rateConsent")}
              </label>
              <Button type="submit" size="sm" variant="dark" className="mt-4">
                {t("tr.rateSend")}
              </Button>
            </form>
          )}
        </section>
      ) : null}

      {order.messages.length ? (
        <ul className="mt-6 space-y-2">
          {order.messages.map((m, i) => (
            <li key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "office" ? "bg-ink text-white" : "ml-auto bg-mist text-ink"}`}>
              <p className={`text-xs ${m.from === "office" ? "text-white/60" : "text-muted"}`}>
                {m.from === "office" ? t("msg.office") : t("msg.you")} · {fmtStamp(m.at, lang)}
              </p>
              {m.text}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="mt-5 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const text = msg.trim();
          if (!text) return;
          if (await act("message", { text }, () => t("tr.msgSent"))) setMsg("");
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("tr.msg")}</span>
          <input className="field-input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t("tr.msgPh")} />
        </label>
        <Button type="submit" variant="dark">
          {t("tr.send")}
        </Button>
      </form>

      <button type="button" onClick={() => setOrder(null)} className="nav-link mt-6 text-sm font-medium text-ink-soft">
        {t("tr.another")}
      </button>
    </div>
  );
}

/** The office changed the price after the order: old → new with the lines, and Accept / Decline while it waits. */
function PriceChangeCard({ pc, fmt, onAnswer }: { pc: PriceChange; fmt: (iso: string) => string; onAnswer: (accept: boolean, note?: string) => Promise<void> }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const pending = pc.status === "pending";
  const answer = async (accept: boolean) => {
    setBusy(true);
    await onAnswer(accept, accept ? undefined : note.trim());
    setBusy(false);
  };
  if (!pending) {
    const tone = pc.status === "accepted" ? "bg-emerald-50 text-emerald-800" : pc.status === "declined" ? "bg-mist text-ink-soft" : "bg-sun-soft text-ink";
    return (
      <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${tone}`}>
        <b>{t(`tr.pc.${pc.status as "accepted" | "declined" | "outdated"}`)}</b> · {t("tr.change.price", { before: eur(pc.before.total), after: eur(pc.after.total) })}
        {pc.decidedAt ? <span className="text-muted"> · {fmt(pc.decidedAt)}</span> : null}
      </p>
    );
  }
  // Lines of both quotes side by side, matched by their key.
  const keys = [...new Set([...pc.before.quote.lines.map((l) => l.key), ...pc.after.quote.lines.map((l) => l.key)])];
  const rows = keys.map((k) => {
    const b = pc.before.quote.lines.find((l) => l.key === k);
    const a = pc.after.quote.lines.find((l) => l.key === k);
    return { k, label: lineLabel(i18n, (a || b)!, a ? pc.after.quote : pc.before.quote), before: b?.amount, after: a?.amount };
  });
  const up = pc.after.total > pc.before.total;
  return (
    <section className="mt-5 rounded-2xl bg-sun-soft p-4 ring-2 ring-sun sm:p-5" aria-labelledby="tr-pc">
      <h3 id="tr-pc" className="font-display text-lg font-bold text-ink">
        {t("tr.pc.title")}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">{t("tr.pc.intro")}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-white/70 p-3">
          <p className="text-xs text-muted">{t("tr.pc.old")}</p>
          <p className="font-display text-xl font-bold tabular-nums text-ink-soft line-through decoration-1">{eur(pc.before.total)}</p>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-line">
          <p className="text-xs text-muted">{t("tr.pc.new")}</p>
          <p className="font-display text-xl font-bold tabular-nums text-ink">
            {eur(pc.after.total)} <span className={`text-sm ${up ? "text-signal" : "text-emerald-700"}`}>{up ? "▲" : "▼"} {eur(Math.abs(pc.after.total - pc.before.total))}</span>
          </p>
        </div>
      </div>
      {pc.reason ? (
        <p className="mt-3 text-sm">
          <b>{t("tr.pc.reason")}:</b> {pc.reason}
        </p>
      ) : null}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">{t("tr.pc.lines")}</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-medium">
                <span className="sr-only">{t("tr.pc.line")}</span>
              </th>
              <th className="py-1 text-right font-medium">{t("tr.pc.old")}</th>
              <th className="py-1 text-right font-medium">{t("tr.pc.new")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className={r.before === r.after ? "text-muted" : "font-semibold text-ink"}>
                <td className="py-1 pr-2">{r.label}</td>
                <td className="py-1 text-right">{r.before === undefined ? "—" : eur(r.before)}</td>
                <td className="py-1 text-right">{r.after === undefined ? "—" : eur(r.after)}</td>
              </tr>
            ))}
            <tr className="border-t border-line text-xs text-muted">
              <td className="py-1">{t("tr.pc.vat")}</td>
              <td className="py-1 text-right">{eur(pc.before.quote.vat)}</td>
              <td className="py-1 text-right">{eur(pc.after.quote.vat)}</td>
            </tr>
          </tbody>
        </table>
      </details>
      <p className="mt-3 text-xs text-muted">{t("tr.pc.valid")}</p>
      {declining ? (
        <div className="mt-3">
          <label className="block">
            <span className="field-label">{t("tr.pc.note")}</span>
            <textarea className="field-input min-h-16 bg-white" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="dark" disabled={busy} onClick={() => void answer(false)}>
              {t("tr.pc.declineSend")}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
              {t("tr.pc.back")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="dark" disabled={busy} onClick={() => void answer(true)}>
            {t("tr.pc.accept", { total: eur(pc.after.total) })}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(true)}>
            {t("tr.pc.decline")}
          </Button>
        </div>
      )}
    </section>
  );
}

function ChangeRow({ c, fmt }: { c: OrderChange; fmt: (iso: string) => string }) {
  const { t } = useI18n();
  const what =
    c.type === "days" ? t("tr.change.days", { n: c.proposed.days ?? c.after?.days ?? 0 }) : c.type === "pickup_date" && c.proposed.date ? t("tr.change.pickup_date", { date: fmt(c.proposed.date) }) : c.type === "house" ? t("tr.change.house") : t("tr.change.other");
  const tone = c.status === "approved" ? "bg-emerald-50 text-emerald-800" : c.status === "rejected" ? "bg-signal/10 text-signal" : "bg-sun-soft text-ink";
  return (
    <li className="rounded-xl bg-mist px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {what}
          {c.by?.role === "office" ? <span className="font-normal text-muted"> · {t("tr.change.fromOffice")}</span> : null}
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{t(`tr.change.${c.status}`)}</span>
      </div>
      {c.after && c.before ? <p className="mt-1 tabular-nums text-ink-soft">{t("tr.change.price", { before: eur(c.before.total), after: eur(c.after.total) })}</p> : null}
      {c.status === "rejected" && c.reason ? <p className="mt-1 text-muted">{c.reason}</p> : null}
    </li>
  );
}
