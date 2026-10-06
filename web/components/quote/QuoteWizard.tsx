"use client";
// The quote wizard: address → house → job → timing → contact → order.
// The price on the side (bottom bar on phones) is calculated live by the server's /api/quote,
// with the same engine and prices the order will use.
import { AnimatePresence, animate, motion } from "framer-motion";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  EAVE_BY_FLOORS,
  getQuote,
  lookupAddress,
  placeOrder,
  readDrawing,
  type AddressResult,
  type Estimate,
  type Floors,
  type JobType,
  type Quote,
  type QuoteResult,
  type RoofType,
  type Urgency,
  type Zone
} from "@/lib/api";
import { digits, eur, fmtDate, num } from "@/lib/format";
import { errText, lineLabel, useI18n, type Key } from "@/lib/i18n";
import { useSite, type QuoteStart } from "../SiteContext";
import { Button } from "../ui/Button";
import { IconArrow, IconCheck, IconChevron, IconPin, IconUpload } from "../ui/Icons";
import { Modal } from "../ui/Modal";
import { HouseModel } from "../HouseModel";

interface Form {
  address: string;
  length: string;
  width: string;
  floors: Floors | "";
  roofType: RoofType;
  pitch: string;
  eave: string;
  eaveAuto: boolean;
  jobType: JobType;
  gables: boolean;
  urgency: Urgency;
  start: string;
  days: string;
  zone: Zone;
  name: string;
  phone: string;
  email: string;
  notes: string;
  partnerCode: string;
}

const JOBS: JobType[] = ["roof", "facade", "roof_facade", "gutters"];
const URGENCIES: Urgency[] = ["standard", "express", "emergency"];
const FLOORS: { v: Floors; label: string }[] = [
  { v: "1", label: "1" },
  { v: "1.5", label: "1½" },
  { v: "2", label: "2" }
];
const ROOFS: RoofType[] = ["gable", "hip", "flat"];
const STEP_KEYS: Key[] = ["q.step1", "q.step2", "q.step3", "q.step4"];

/** Earliest start if the server's dates aren't loaded yet (same rule as the engine). */
function localEarliest(u: Urgency): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (u === "emergency") d.setDate(d.getDate() + 1);
  else if (u === "express") d.setDate(d.getDate() + 2);
  else {
    let added = 0;
    while (added < 3) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Shrink a photo or drawing in the browser before upload (max 1600 px, JPEG). */
function shrink(file: File, badFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error(badFile));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(badFile));
    };
    img.src = url;
  });
}

/** A number that tweens to its new value (text updated directly, no re-renders per frame). */
function AnimatedEur({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = eur(value);
      return;
    }
    const c = animate(from, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = eur(v)) });
    return () => c.stop();
  }, [value]);
  return (
    <span ref={ref} className={className}>
      {eur(value)}
    </span>
  );
}

/* ---------- Small form pieces ---------- */
function Seg<T extends string>({ value, options, onChange, label }: { value: T | ""; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-mist p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`relative h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors ${value === o.v ? "text-ink" : "text-muted hover:text-ink"}`}
        >
          {value === o.v ? <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-line" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function NumField({ label, hint, unit, value, onChange, min, max, step = 0.1 }: { label: string; hint?: string; unit: string; value: string; onChange: (v: string) => void; min: number; max: number; step?: number }) {
  return (
    <label className="block">
      <span className="field-label">
        {label} {hint ? <span className="font-normal text-muted">· {hint}</span> : null}
      </span>
      <span className="relative block">
        <input className="field-input pr-12" type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">{unit}</span>
      </span>
    </label>
  );
}

function Choice({ selected, onClick, title, text, extra }: { selected: boolean; onClick: () => void; title: string; text: string; extra?: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={`relative flex w-full flex-col items-start rounded-2xl p-4 text-left ring-1 transition-colors sm:p-5 ${selected ? "bg-white ring-2 ring-ink" : "bg-white ring-line hover:ring-ink/30"}`}
    >
      <span className={`absolute top-4 right-4 grid h-5 w-5 place-items-center rounded-full ${selected ? "bg-sun text-ink" : "ring-1 ring-line"}`}>{selected ? <IconCheck className="h-3.5 w-3.5" /> : null}</span>
      <span className="pr-8 font-display text-lg font-bold text-ink">{title}</span>
      <span className="mt-1 text-sm text-muted">{text}</span>
      {extra}
    </motion.button>
  );
}

/* ---------- Address result ---------- */
function OutlinePic({ outline, length, width, estimated }: { outline?: [number, number][]; length: number; width: number; estimated: boolean }) {
  const pts = outline && outline.length >= 3 ? outline : ([[0, 0], [length, 0], [length, width], [0, width]] as [number, number][]);
  const W = 120, H = 84, pad = 8;
  const maxX = Math.max(...pts.map((p) => p[0])), maxY = Math.max(...pts.map((p) => p[1]));
  const sc = Math.min((W - 2 * pad) / Math.max(maxX, 1), (H - 2 * pad) / Math.max(maxY, 1));
  const ox = (W - maxX * sc) / 2, oy = (H - maxY * sc) / 2;
  const poly = pts.map(([x, y]) => `${(ox + x * sc).toFixed(1)},${(oy + (maxY - y) * sc).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-28 shrink-0" aria-hidden>
      <motion.polygon
        points={poly}
        fill="#fff4cc"
        stroke="#0e1217"
        strokeWidth={1.5}
        strokeDasharray={estimated ? "4 3" : undefined}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  );
}

function AddressCard({ r }: { r: AddressResult }) {
  const { t, tk } = useI18n();
  const hs = r.house, d = r.details || {}, reg = d.register;
  const estimated = d.sizeSource === "estimate";
  const facts: [string, string][] = [];
  if (hs.length && hs.width) facts.push([`${num(hs.length)} × ${num(hs.width)} m`, estimated ? t("a.estimated") : d.footprintM2 ? t("a.measuredArea", { m2: d.footprintM2 }) : t("a.measured")]);
  if (hs.floors) facts.push([t("a.floors", { n: hs.floors === "2" ? 2 : 1 }), d.floorsSource === "OpenStreetMap" ? t("a.fromMap") : t("a.register")]);
  if (reg?.floorArea || reg?.grossFloorArea) facts.push([t("a.floorArea", { m2: num(reg.floorArea || reg.grossFloorArea || 0) }), t("a.register")]);
  if (reg?.completed) facts.push([t("a.built", { year: reg.completed }), t("a.register")]);
  const notes = (r.noteCodes || []).filter((n) => n.code !== "roof_assumed").map((n) => tk("note." + n.code, { n: n.n ?? "" }));
  const mapLink = d.osmWayId
    ? `https://www.openstreetmap.org/${encodeURIComponent(d.osmType || "way")}/${encodeURIComponent(String(d.osmWayId))}`
    : `https://www.openstreetmap.org/?mlat=${r.match.lat}&mlon=${r.match.lon}#map=19/${r.match.lat}/${r.match.lon}`;
  const ok = Boolean(hs.length && hs.width && hs.floors) && !estimated && r.match.houseLevel;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-l-4 bg-white p-4 ring-1 ring-line sm:p-5 ${ok ? "border-l-emerald-600" : "border-l-sun-deep"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">{r.match.short || r.match.display}</p>
        <a href={mapLink} target="_blank" rel="noopener" className="nav-link text-sm font-medium text-ink-soft">
          {t("a.map")} ↗
        </a>
      </div>
      <div className="mt-3 flex items-center gap-4">
        {hs.length && hs.width ? <OutlinePic outline={d.outline} length={hs.length} width={hs.width} estimated={estimated} /> : null}
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2">
          {facts.map(([v, s]) => (
            <div key={v}>
              <dt className="font-semibold text-ink">{v}</dt>
              <dd className="text-xs text-muted">{s}</dd>
            </div>
          ))}
        </dl>
      </div>
      {notes.length ? (
        <ul className="mt-3 space-y-1 text-sm text-sun-deep">
          {notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-muted">{ok ? t("a.filled") : t("a.partial")}</p>
    </motion.div>
  );
}

/* ---------- Price panel ---------- */
function PriceDetails({ quote, estimate, vat }: { quote: Quote; estimate: Estimate | null; vat: number }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <div className="text-sm">
      {estimate ? (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-3 ring-1 ring-line">
            <p className="text-xs text-muted">{t("q.priceArea")}</p>
            <p className="font-semibold">{estimate.area} m²</p>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-line">
            <p className="text-xs text-muted">{t("q.priceWeight")}</p>
            <p className="font-semibold">{num(estimate.weightKg / 1000)} t</p>
          </div>
        </div>
      ) : null}
      <ul className="space-y-2">
        {quote.lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-3">
            <span className="text-ink-soft">{lineLabel(i18n, l, quote)}</span>
            <AnimatedEur value={l.amount} className="tabular-nums" />
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
          <span>{t("q.priceNet")}</span>
          <AnimatedEur value={quote.net} className="tabular-nums" />
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-ink-soft">{t("q.priceVat", { vat: num(vat) })}</span>
          <AnimatedEur value={quote.vat} className="tabular-nums" />
        </li>
      </ul>
      <p className="mt-4 rounded-xl bg-sun-soft px-3 py-2 text-xs text-ink-soft">{t("q.priceLabour", { amount: eur(quote.labourGross) })}</p>
    </div>
  );
}

/* ---------- The wizard ---------- */
export function QuoteWizard() {
  const { quote: q, closeQuote } = useSite();
  const { t } = useI18n();
  return (
    <Modal open={q.open} onClose={closeQuote} label={t("q.title")} closeLabel={t("q.close")} layoutId={q.start.origin === "hero" ? "quote-shell" : undefined}>
      <WizardBody key={q.key} start={q.start} />
    </Modal>
  );
}

function WizardBody({ start }: { start: QuoteStart }) {
  const i18n = useI18n();
  const { t, lang } = i18n;
  const { config, closeQuote, openTrack } = useSite();
  const [avail, setAvail] = useState<QuoteResult["available"] | null>(null);
  const earliest = useCallback((u: Urgency) => avail?.[u] ?? config?.earliest[u] ?? localEarliest(u), [config, avail]);
  // Speeds the office has switched off aren't offered.
  const urgencies = URGENCIES.filter((u) => u === "standard" || config?.urgencies?.[u] !== false);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<Form>(() => {
    const urgency = start.urgency ?? "standard";
    return {
      address: start.address ?? "",
      length: "",
      width: "",
      floors: "",
      roofType: "gable",
      pitch: "30",
      eave: "",
      eaveAuto: true,
      jobType: start.jobType ?? "roof",
      gables: true,
      urgency,
      start: "",
      days: "28",
      zone: "A",
      name: "",
      phone: "",
      email: "",
      notes: "",
      partnerCode: ""
    };
  });
  const [source, setSource] = useState<"form" | "address" | "ai">("form");
  const [zoneAuto, setZoneAuto] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [lookup, setLookup] = useState<{ status: "idle" | "loading" | "done" | "notfound" | "error"; result?: AddressResult; message?: string; query?: string }>({ status: "idle" });
  // Buildings above the storeys the online price covers go to the office for a price check.
  const reg = lookup.status === "done" ? lookup.result?.details?.register : undefined;
  const tooTall = reg?.storeys && reg.storeys >= 3 ? reg.storeys : 0;
  const [ai, setAi] = useState<{ files: File[]; status: "idle" | "reading" | "done" | "error"; message?: string }>({ files: [], status: "idle" });
  const [price, setPrice] = useState<{ quote: Quote | null; estimate: Estimate | null; loading: boolean }>({ quote: null, estimate: null, loading: false });
  // First free start per speed for this house (from /api/quote), and whether the partner code matched.
  const [partner, setPartner] = useState<QuoteResult["partner"]>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ ref: string; total: number; phone4: string; review: boolean } | null>(null);
  const addressId = useId();

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  const fmt = (iso: string) => fmtDate(iso, lang);

  useEffect(() => {
    if (form.urgency !== "standard" && config?.urgencies?.[form.urgency] === false) setForm((f) => ({ ...f, urgency: "standard" }));
  }, [config, form.urgency]);

  // Start date: the earliest possible one for the chosen speed, never earlier.
  useEffect(() => {
    const e = earliest(form.urgency);
    setForm((f) => (!f.start || f.start < e ? { ...f, start: e } : f));
  }, [form.urgency, earliest]);

  /* ----- house validity and live price ----- */
  const house = useMemo(() => {
    const L = Number(form.length), W = Number(form.width), eave = Number(form.eave), pitch = form.roofType === "flat" ? 0 : Number(form.pitch);
    const ok = L >= 3 && L <= 60 && W >= 3 && W <= 40 && !!form.floors && eave >= 2 && eave <= 12 && pitch >= 0 && pitch <= 60;
    return { ok, L, W, eave, pitch };
  }, [form.length, form.width, form.eave, form.pitch, form.roofType, form.floors]);

  // The house as the 3D model draws it (same scaffold rules as the price).
  const modelShape = useMemo(
    () =>
      house.ok
        ? { length: house.L, width: house.W, eave: house.eave, roofType: form.roofType, pitch: house.pitch || 30, jobType: form.jobType, gables: form.roofType === "gable" && form.jobType === "roof" && form.gables }
        : null,
    [house, form.roofType, form.jobType, form.gables]
  );

  // Rebuild the model only once typing pauses, so it doesn't restart on every digit.
  const modelKey = JSON.stringify(modelShape);
  const [shownShape, setShownShape] = useState<typeof modelShape>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setShownShape(modelShape), 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  const reqId = useRef(0);
  useEffect(() => {
    if (!house.ok) {
      setPrice({ quote: null, estimate: null, loading: false });
      return;
    }
    const id = ++reqId.current;
    setPrice((p) => ({ ...p, loading: true }));
    const timer = window.setTimeout(() => {
      getQuote({
        length: house.L,
        width: house.W,
        eave: house.eave,
        roofType: form.roofType,
        pitch: house.pitch,
        jobType: form.jobType,
        gables: form.roofType === "gable" && form.jobType === "roof" && form.gables,
        days: Math.max(1, Math.round(Number(form.days) || 28)),
        zone: form.zone,
        urgency: form.urgency,
        partnerCode: form.partnerCode.trim() || undefined
      })
        .then((r) => {
          if (id !== reqId.current) return;
          setPrice({ quote: r.quote, estimate: r.estimate, loading: false });
          setAvail(r.available || null);
          setPartner(r.partner || null);
        })
        .catch(() => id === reqId.current && setPrice((p) => ({ ...p, loading: false })));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [house, form.roofType, form.jobType, form.gables, form.days, form.zone, form.urgency, form.partnerCode]);

  /* ----- address lookup ----- */
  const runLookup = useCallback(
    async (address: string) => {
      const text = address.trim();
      if (text.length < 5) {
        setLookup({ status: "error", message: t("a.short") });
        return;
      }
      setLookup({ status: "loading" });
      try {
        const r = await lookupAddress(text);
        if (!r.found) {
          setLookup({ status: "notfound" });
          return;
        }
        const h = r.house;
        setForm((f) => {
          const floors = h.floors ?? f.floors;
          const next: Form = { ...f, zone: r.zone ?? f.zone };
          if (h.length && h.width) Object.assign(next, { length: String(h.length), width: String(h.width) });
          if (floors) next.floors = floors;
          if (h.roofType) next.roofType = h.roofType;
          if (h.pitch) next.pitch = String(h.pitch);
          if (h.eave) Object.assign(next, { eave: String(h.eave), eaveAuto: false });
          else if (floors) Object.assign(next, { eave: String(EAVE_BY_FLOORS[floors]), eaveAuto: true });
          return next;
        });
        setZoneAuto(true);
        setSource("address");
        setLookup({ status: "done", result: r, query: text });
      } catch (e) {
        setLookup({ status: "error", message: errText(i18n, e, fmt) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n]
  );

  // Coming from the hero address bar: look the address up straight away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (start.address) void runLookup(start.address);
  }, [start.address, runLookup]);

  /* ----- drawing reading ----- */
  async function readImages() {
    if (!ai.files.length) return;
    setAi((a) => ({ ...a, status: "reading", message: t("ai.reading") }));
    try {
      const images = await Promise.all(ai.files.slice(0, 3).map((f) => shrink(f, t("ai.badFile"))));
      const r = await readDrawing(images, lang);
      const h = r.house;
      setForm((f) => ({
        ...f,
        length: String(h.length),
        width: String(h.width),
        floors: h.floors,
        roofType: h.roofType,
        pitch: String(h.pitch),
        eave: String(h.eave ?? EAVE_BY_FLOORS[h.floors]),
        eaveAuto: !h.eave
      }));
      setSource("ai");
      setAi((a) => ({ ...a, status: "done", message: t("ai.done", { conf: i18n.tk("ai.conf." + h.confidence) }) + (h.notes ? ` ${h.notes}` : "") }));
    } catch (e) {
      setAi((a) => ({ ...a, status: "error", message: e instanceof Error && !("code" in e) ? e.message : errText(i18n, e, fmt) }));
    }
  }

  /* ----- navigation ----- */
  const canNext = step === 0 ? house.ok : step === 2 ? !!form.start && Number(form.days) >= 1 : true;
  function go(n: number) {
    setDir(n > step ? 1 : -1);
    setError("");
    setStep(n);
  }

  async function submit() {
    setError("");
    if (!form.name.trim()) return setError(t("q.err.name"));
    if (digits(form.phone).length < 6) return setError(t("q.err.phone"));
    if (!form.address.trim()) return setError(t("err.address_required"));
    setSubmitting(true);
    // The map position only if the address is still the one that was looked up.
    const found = lookup.status === "done" && lookup.result && lookup.query === form.address.trim() ? lookup.result : null;
    try {
      const r = await placeOrder({
        length: house.L,
        width: house.W,
        eave: house.eave,
        floors: form.floors,
        roofType: form.roofType,
        pitch: house.pitch,
        jobType: form.jobType,
        gables: form.roofType === "gable" && form.jobType === "roof" && form.gables,
        zone: form.zone,
        urgency: form.urgency,
        start: form.start,
        days: Math.round(Number(form.days)),
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        notes: form.notes,
        source,
        lang,
        lat: found?.match.lat,
        lon: found?.match.lon,
        partnerCode: form.partnerCode.trim() || undefined,
        storeys: tooTall || undefined
      });
      setDone({ ref: r.ref, total: r.order.quote.total, phone4: digits(form.phone).slice(-4), review: Boolean(tooTall) });
    } catch (e) {
      const err = e as { code?: string; info?: { date?: string } | null };
      // Parts or crews are booked on that date: move to the first free date and show the timing step.
      if ((err.code === "not_enough_stock" || err.code === "fully_booked") && err.info?.date) {
        const date = err.info.date;
        setForm((f) => ({ ...f, start: date }));
        setAvail((a) => (a ? { ...a, [form.urgency]: date } : a));
        setDir(-1);
        setStep(2);
        setError(t("q.moved", { date: fmt(date) }));
        return;
      }
      setError(errText(i18n, e, fmt));
    } finally {
      setSubmitting(false);
    }
  }

  const vat = config?.pricing.vat ?? 25.5;
  const total = price.quote?.total ?? 0;

  /* ----- done screen ----- */
  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-16 text-center">
        <motion.span
          className="grid h-20 w-20 place-items-center rounded-full bg-sun text-ink"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <IconCheck className="h-10 w-10" />
        </motion.span>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}>
          <h2 className="mt-8 font-display text-4xl font-extrabold">{t("q.done")}</h2>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t("q.doneRef")}</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-wider">{done.ref}</p>
          <p className="mt-3 text-lg">
            {eur(done.total)} <span className="text-muted">{t("q.priceIncl", { vat: num(vat) })}</span>
          </p>
          <p className="mx-auto mt-4 max-w-md text-muted">{t("q.doneText")}</p>
          {done.review ? <p className="mx-auto mt-3 max-w-md rounded-xl bg-sun-soft px-4 py-3 text-sm text-ink">{t("q.doneReview")}</p> : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                closeQuote();
                openTrack(done.ref, done.phone4);
              }}
            >
              {t("q.doneTrack")}
            </Button>
            <Button variant="ghost" onClick={closeQuote}>
              {t("q.doneClose")}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Shown when this house's parts push the first possible start past the general earliest date.
  const free = avail?.[form.urgency], general = config?.earliest[form.urgency];
  const firstFree = free && general && free > general ? free : null;

  /* ----- step content ----- */
  const stepView = [
    // 1. House
    <div key="s1" className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runLookup(form.address);
        }}
      >
        <label htmlFor={addressId} className="field-label">
          {t("q.address")}
        </label>
        <div className="flex gap-2">
          <span className="relative flex-1">
            <IconPin className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
            <input id={addressId} className="field-input pl-11" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder={t("hero.addressPh")} autoComplete="street-address" />
          </span>
          <Button type="submit" variant="dark" disabled={lookup.status === "loading"}>
            {lookup.status === "loading" ? t("q.finding") : t("q.find")}
          </Button>
        </div>
      </form>

      <AnimatePresence mode="wait">
        {lookup.status === "loading" ? (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
            <motion.span className="h-4 w-4 rounded-full border-2 border-sun border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
            {t("a.looking")}
          </motion.div>
        ) : lookup.status === "done" && lookup.result ? (
          <AddressCard key="r" r={lookup.result} />
        ) : lookup.status === "notfound" || lookup.status === "error" ? (
          <motion.p key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl bg-sun-soft p-4 text-sm text-ink" role="alert">
            {lookup.status === "notfound" ? t("a.notFound") : lookup.message}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {config?.features.ai ? (
        <div className="rounded-2xl border border-dashed border-ink/20 bg-white p-4 sm:p-5">
          <p className="font-semibold text-ink">{t("ai.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("ai.text")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-mist px-4 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:ring-ink/30">
              <IconUpload className="h-4 w-4" />
              {ai.files.length ? t("ai.files", { n: ai.files.length }) : t("ai.choose")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => setAi({ files: Array.from(e.target.files || []).slice(0, 3), status: "idle" })}
              />
            </label>
            <Button size="sm" variant="ghost" disabled={!ai.files.length || ai.status === "reading"} onClick={readImages}>
              {t("ai.go")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            {t("ai.privacy")}{" "}
            <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
              {t("privacy.link")}
            </a>
          </p>
          {ai.message ? <p className={`mt-3 text-sm ${ai.status === "error" ? "text-signal" : ai.status === "done" ? "text-ink" : "text-muted"}`}>{ai.message}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <NumField label={t("q.length")} hint={t("q.lengthHint")} unit="m" min={3} max={60} value={form.length} onChange={(v) => set("length", v)} />
        <NumField label={t("q.width")} hint={t("q.widthHint")} unit="m" min={3} max={40} value={form.width} onChange={(v) => set("width", v)} />
      </div>
      <div>
        <span className="field-label">{t("q.floors")}</span>
        <Seg
          label={t("q.floors")}
          value={form.floors}
          options={FLOORS}
          onChange={(v) => setForm((f) => ({ ...f, floors: v, ...(f.eaveAuto ? { eave: String(EAVE_BY_FLOORS[v]) } : {}) }))}
        />
      </div>
      <div>
        <span className="field-label">{t("q.roof")}</span>
        <Seg label={t("q.roof")} value={form.roofType} options={ROOFS.map((r) => ({ v: r, label: t(`roof.${r}`) }))} onChange={(v) => set("roofType", v)} />
      </div>
      <div>
        <button type="button" onClick={() => setShowMore((s) => !s)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink" aria-expanded={showMore}>
          <motion.span animate={{ rotate: showMore ? 180 : 0 }} className="inline-flex">
            <IconChevron className="h-4 w-4" />
          </motion.span>
          {t("q.more")}
        </button>
        <AnimatePresence initial={false}>
          {showMore ? (
            <motion.div key="more" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 grid grid-cols-2 gap-4">
              <NumField label={t("q.eave")} hint={form.eaveAuto ? t("q.eaveAuto") : undefined} unit="m" min={2} max={12} value={form.eave} onChange={(v) => setForm((f) => ({ ...f, eave: v, eaveAuto: false }))} />
              {form.roofType !== "flat" ? <NumField label={t("q.pitch")} unit="°" min={0} max={60} step={1} value={form.pitch} onChange={(v) => set("pitch", v)} /> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>,

    // 2. Job
    <div key="s2" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {JOBS.map((j) => (
          <Choice key={j} selected={form.jobType === j} onClick={() => set("jobType", j)} title={t(`job.${j}`)} text={t(`job.${j}.desc`)} />
        ))}
      </div>
      {form.roofType === "gable" && form.jobType === "roof" ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-ink" checked={form.gables} onChange={(e) => set("gables", e.target.checked)} />
          <span>
            <span className="font-semibold text-ink">{t("q.gables")}</span>
            <span className="block text-sm text-muted">{t("q.gablesHint")}</span>
          </span>
        </label>
      ) : null}
    </div>,

    // 3. Timing
    <div key="s3" className="space-y-6">
      <div>
        <span className="field-label">{t("q.urgency")}</span>
        <div className={`grid gap-3 ${urgencies.length === 3 ? "sm:grid-cols-3" : urgencies.length === 2 ? "sm:grid-cols-2" : ""}`}>
          {urgencies.map((u) => {
            const pct = config?.pricing.urgency[u].pct ?? 0;
            return (
              <Choice
                key={u}
                selected={form.urgency === u}
                onClick={() => set("urgency", u)}
                title={t(`urg.${u}`)}
                text={`${t(`urgLead.${u}`)} · ${t("q.earliest", { date: fmt(earliest(u)) })}`}
                extra={<span className={`mt-3 rounded-full px-2.5 py-0.5 text-xs font-bold ${pct > 0 ? "bg-sun text-ink" : "bg-mist text-ink-soft"}`}>{pct > 0 ? t("price.surcharge", { pct }) : t("price.noSurcharge")}</span>}
              />
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">{t("q.start")}</span>
          <input className="field-input" type="date" min={earliest(form.urgency)} value={form.start} onChange={(e) => set("start", e.target.value)} />
        </label>
        <NumField label={t("q.days")} unit={t("q.daysUnit")} min={1} max={365} step={1} value={form.days} onChange={(v) => set("days", v)} />
      </div>
      {firstFree ? <p className="rounded-xl bg-sun-soft px-4 py-2.5 text-sm text-ink">{t("q.firstFree", { date: fmt(firstFree) })}</p> : null}
      <div className="flex flex-wrap gap-2">
        {[2, 4, 6, 8].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => set("days", String(w * 7))}
            aria-pressed={Number(form.days) === w * 7}
            className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors ${Number(form.days) === w * 7 ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line hover:ring-ink/30"}`}
          >
            {t("q.weeks", { n: w })}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="field-label">
          {t("q.zone")} {zoneAuto ? <span className="font-normal text-muted">· {t("q.zoneAuto")}</span> : null}
        </span>
        <select
          className="field-input"
          value={form.zone}
          onChange={(e) => {
            set("zone", e.target.value as Zone);
            setZoneAuto(false);
          }}
        >
          {(["A", "B", "C"] as Zone[]).map((z) => (
            <option key={z} value={z}>
              {t(`zone.${z}`)}
              {config ? ` — ${eur(config.pricing.zones[z].trip)}` : ""}
            </option>
          ))}
        </select>
      </label>
    </div>,

    // 4. Contact
    <div key="s4" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">{t("q.name")}</span>
          <input className="field-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
        </label>
        <label className="block">
          <span className="field-label">{t("q.phone")}</span>
          <input className="field-input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder="040 123 4567" />
        </label>
      </div>
      <label className="block">
        <span className="field-label">{t("q.email")}</span>
        <input className="field-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
      </label>
      <label className="block">
        <span className="field-label">{t("q.address")}</span>
        <input className="field-input" value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" placeholder={t("hero.addressPh")} />
      </label>
      <label className="block">
        <span className="field-label">
          {t("q.partner")} <span className="font-normal text-muted">· {t("q.partnerHint")}</span>
        </span>
        <input className="field-input font-mono uppercase sm:max-w-xs" value={form.partnerCode} onChange={(e) => set("partnerCode", e.target.value.slice(0, 12))} autoComplete="off" spellCheck={false} />
        {form.partnerCode.trim() && partner ? (
          <span className={`mt-1.5 block text-sm ${"invalid" in partner ? "text-signal" : "text-ink-soft"}`} role="status">
            {"invalid" in partner ? t("q.partnerBad") : t("q.partnerOk", { name: partner.name, pct: partner.discountPct })}
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className="field-label">{t("q.notes")}</span>
        <textarea className="field-input min-h-24" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("q.notesPh")} />
      </label>
      <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
        <p className="font-semibold text-ink">{t("q.summary")}</p>
        <p className="mt-1 text-muted">
          {num(house.L)} × {num(house.W)} m · {t("a.floors", { n: form.floors === "2" ? 2 : 1 })}
          {form.floors === "1.5" ? " (1½)" : ""} · {t(`roof.${form.roofType}`)}
        </p>
        <p className="text-muted">
          {t(`job.${form.jobType}`)} · {t(`urg.${form.urgency}`)} · {fmt(form.start)} · {t("tr.days", { n: Math.round(Number(form.days)) })}
        </p>
        {tooTall ? <p className="mt-2 rounded-lg bg-sun-soft px-3 py-2 text-ink">{t("q.review", { n: tooTall })}</p> : null}
      </div>
      <p className="text-xs text-muted">
        {t("q.privacy")}{" "}
        <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
          {t("privacy.link")}
        </a>
      </p>
    </div>
  ];

  const titles: [Key, Key][] = [
    ["q.h1", "q.h1.sub"],
    ["q.h2", "q.h2.sub"],
    ["q.h3", "q.h3.sub"],
    ["q.h4", "q.h4.sub"]
  ];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Left: steps */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-line px-5 pt-5 pb-4 sm:px-8 sm:pt-7">
          <p className="pr-12 font-display text-sm font-bold uppercase tracking-[0.14em] text-muted">{t("q.title")}</p>
          <ol className="mt-4 flex items-center gap-2 pr-10" aria-label={t("q.title")}>
            {STEP_KEYS.map((k, i) => (
              <li key={k} className="flex flex-1 flex-col gap-2">
                <span className="relative h-1 overflow-hidden rounded-full bg-line">
                  <motion.span className="absolute inset-0 origin-left rounded-full bg-ink" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
                </span>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`text-left text-xs font-semibold sm:text-sm ${i === step ? "text-ink" : i < step ? "text-ink-soft hover:text-ink" : "text-muted"} ${i === step ? "" : "hidden sm:block"}`}
                >
                  <span className="sm:hidden">{i + 1}/4 · </span>
                  {t(k)}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -28 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-ink sm:text-4xl">{t(titles[step][0])}</h2>
              <p className="mt-2 mb-6 text-muted">{t(titles[step][1])}</p>
              {stepView[step]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Phone: live price bar with an expandable breakdown. */}
        <div className="border-t border-line bg-mist px-5 py-3 lg:hidden">
          <AnimatePresence initial={false}>
            {showBreakdown && price.quote ? (
              <motion.div key="bd" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mb-3 max-h-[45vh] overflow-y-auto">
                {shownShape ? <HouseModel shape={shownShape} className="mb-3 h-36 w-full" label={t("q.title")} /> : null}
                <PriceDetails quote={price.quote} estimate={price.estimate} vat={vat} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted">{t("q.price")}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{price.quote ? <AnimatedEur value={total} /> : eur(0)}</p>
            </div>
            {price.quote ? (
              <button type="button" onClick={() => setShowBreakdown((s) => !s)} className="text-sm font-semibold text-ink-soft underline-offset-4 hover:underline">
                {showBreakdown ? t("q.breakdownHide") : t("q.breakdown")}
              </button>
            ) : (
              <p className="max-w-[55%] text-right text-xs text-muted">{t("q.priceEmpty")}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-8">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
            {t("q.back")}
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            {error ? (
              <p className="min-w-0 text-right text-sm font-medium text-signal" role="alert">
                {error}
              </p>
            ) : step === 0 && !house.ok ? (
              <p className="hidden min-w-0 text-right text-sm text-muted sm:block">{t("q.needSize")}</p>
            ) : null}
            {step < 3 ? (
              <Button onClick={() => go(step + 1)} disabled={!canNext}>
                {t("q.next")}
                <IconArrow className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting || !house.ok}>
                {submitting ? t("q.ordering") : t("q.order")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: live price panel */}
      <aside className="hidden w-[360px] shrink-0 flex-col overflow-y-auto border-l border-line bg-mist p-7 lg:flex xl:w-[400px]">
        {shownShape ? <HouseModel shape={shownShape} className="-mx-2 mb-4 h-44 w-[calc(100%+1rem)]" label={t("q.title")} /> : null}
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t("q.price")}</p>
        <p className="mt-2 font-display text-5xl font-extrabold tracking-[-0.02em] tabular-nums">{price.quote ? <AnimatedEur value={total} /> : eur(0)}</p>
        <p className="mt-1 text-sm text-muted">
          {price.quote ? (
            <>
              {t("q.priceIncl", { vat: num(vat) })} · {t("q.priceRange", { low: eur(price.quote.low), high: eur(price.quote.high) })}
            </>
          ) : (
            t("q.priceEmpty")
          )}
        </p>
        <motion.div className="mt-1 h-5 text-xs text-muted" animate={{ opacity: price.loading ? 1 : 0 }}>
          {t("q.updating")}
        </motion.div>
        <div className="mt-4">{price.quote ? <PriceDetails quote={price.quote} estimate={price.estimate} vat={vat} /> : <div className="space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="h-5 rounded bg-white/70" />)}</div>}</div>
      </aside>
    </div>
  );
}
