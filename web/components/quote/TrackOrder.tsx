"use client";
// Order tracking: reference + last four phone digits → status timeline, details, messages,
// and the customer actions (extend by a week, request pickup, message the office).
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { getOrder, orderAction, STATUSES, type OrderView } from "@/lib/api";
import { digits, eur, fmtDate, fmtStamp } from "@/lib/format";
import { errText, useI18n } from "@/lib/i18n";
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
  const creds = useRef<{ ref: string; phone4: string } | null>(null);
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

  // Opened from the wizard's "Track this order": look it up right away.
  useEffect(() => {
    if (initialRef && initialPhone) void find(initialRef, initialPhone);
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
        setOrder((prev) => (prev && prev.updatedAt === o.updatedAt ? prev : o));
      } catch {
        /* keep showing the last state */
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [order]);

  async function act(action: "extend" | "pickup" | "message", extra: Record<string, unknown>, ok: (o: OrderView) => string) {
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
            <input className="field-input" inputMode="numeric" maxLength={4} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="4567" autoComplete="off" />
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

  return (
    <div className="min-h-0 overflow-y-auto p-6 sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t("tr.title")}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3 pr-10">
        <h2 className="font-mono text-3xl font-bold tracking-wider">{order.ref}</h2>
        <span className="rounded-full bg-sun px-3 py-1 text-xs font-bold text-ink">{tk("status." + order.status)}</span>
      </div>
      <p className="mt-1 text-muted">{order.site.address}</p>
      {order.eta ? (
        <p className="mt-3 rounded-xl bg-mist px-4 py-2.5 text-sm">
          <b>{t("tr.arrival")}:</b> {order.eta}
          {order.crew ? ` · ${order.crew}` : ""}
        </p>
      ) : null}

      <ol className="mt-6 space-y-0">
        {steps.map((s, i) => {
          const idx = STATUSES.indexOf(s);
          const state = idx < cur ? "done" : idx === cur ? "now" : "todo";
          const at = lastAt(s);
          return (
            <motion.li
              key={s}
              className="relative flex gap-4 pb-5 last:pb-0"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {i < steps.length - 1 ? <span aria-hidden className={`absolute top-6 left-[11px] h-[calc(100%-12px)] w-[2px] ${idx < cur ? "bg-ink" : "bg-line"}`} /> : null}
              <span
                className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-ink" : state === "now" ? "bg-sun ring-4 ring-sun/30" : "bg-white ring-2 ring-line"}`}
              />
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

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          [t("tr.start"), fmt(order.schedule.start)],
          [t("tr.rental"), t("tr.days", { n: order.quote?.rentDays ?? order.schedule.days })],
          [t("tr.scaffold"), `${order.estimate.area} m² · ${tk("job." + order.house.jobType)}`],
          [t("tr.price"), order.quote ? eur(order.quote.total) : "—"],
          [t("tr.zone"), tk("zone." + order.site.zone)]
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-mist p-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button size="sm" variant="ghost" disabled={finished} onClick={() => act("extend", {}, (o) => t("tr.extended", { days: o.schedule.days, price: eur(o.quote.total) }))}>
          {t("tr.extend")}
        </Button>
        <Button size="sm" variant="ghost" disabled={order.status !== "erected"} onClick={() => act("pickup", {}, () => t("tr.pickupDone"))}>
          {t("tr.pickup")}
        </Button>
      </div>

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
        <label className="flex-1">
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
