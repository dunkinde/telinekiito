"use client";
// A new site from the portal: address lookup (the 3D model measures the building, tall ones too), job, scaffold
// system side by side with load class, limits and the company's price, timing, and the company's PO / project / site
// contact. Jobs the online price can't cover go to the office as a quote request; the company accepts the offer here.
import { useEffect, useMemo, useRef, useState } from "react";
import { EAVE_BY_FLOORS, lookupAddress, modelRefFor, WEATHER_JOBS, type AddressResult, type Floors, type JobType, type ModelRef, type RoofType, type SystemKey, type Urgency, type Zone } from "@/lib/api";
import { bizOrder, bizOrders, bizPlaceOrder, bizQuote, type BizDetails, type BizQuote, type BizType, type SiteContact } from "@/lib/business";
import type { PlanSide } from "@/lib/plan";
import { useT } from "../office/context";
import { day, money, numText, parseNum } from "../office/format";
import { errMessage, jobLabel, lineText, roofLabel, sideText, urgLabel } from "../office/i18n";
import { Badge, Btn, Callout, Card, CardHead, Chips, Field, Input, Select, TextArea, cx, inputCls } from "../office/ui";
import { Plan3DOverlay } from "../scaffold3d/Plan3DOverlay";
import { Scaffold3D } from "../scaffold3d/Scaffold3D";
import { AddressInput } from "../ui/AddressInput";
import { useBiz, useBizAct } from "./context";
import { BizFields } from "./OrderView";
import { go } from "./BizApp";

const JOBS: JobType[] = ["roof", "facade", "roof_facade", "gutters"];
const ROOFS: RoofType[] = ["gable", "hip", "flat"];
const FLOORS: Floors[] = ["1", "1.5", "2"];
/** What the online price covers without the 3D model; measured buildings and quote requests go further. */
const NORMAL = { L: 60, W: 40, E: 12 };
const LARGE = { L: 300, W: 300, E: 60 };
/** Load classes per EN 12811-1, for the legend under the systems. */
const CLASSES = [
  { cls: 3, kn: 2.0 },
  { cls: 4, kn: 3.0 },
  { cls: 5, kn: 4.5 },
  { cls: 6, kn: 6.0 }
];

type Form = {
  address: string;
  length: string;
  width: string;
  floors: Floors | "";
  roofType: RoofType;
  pitch: string;
  eave: string;
  jobType: JobType;
  gables: boolean;
  sheeting: boolean;
  weatherRoof: boolean;
  zone: Zone;
  urgency: Urgency;
  start: string;
  days: string;
  notes: string;
  /** "" = the first system the office has switched on. */
  system: SystemKey | "";
};
const blank: Form = { address: "", length: "", width: "", floors: "", roofType: "gable", pitch: "30", eave: "", jobType: "roof", gables: true, sheeting: false, weatherRoof: false, zone: "A", urgency: "standard", start: "", days: "28", notes: "", system: "" };
const blankBiz: BizDetails = { po: "", project: "", costCentre: "", siteContact: { name: "", phone: "" }, siteInfo: "" };
type Geo = { lat: number; lon: number; for: string; checks?: string[]; result?: AddressResult; storeys?: number | null };
type Model = { id: string; lat: number; lon: number; date: string | null; perimeterM: number; corners: number; eaveMin: number | null; eaveMax: number | null; ridge: number | null };
/** The measured building of a lookup, when the 3D model has one (not just a map outline). */
const modelOf = (r: AddressResult | null | undefined): Model | null => {
  const m = r?.model as (Partial<Model> & { id?: unknown }) | undefined;
  return m && typeof m.id === "string" ? (m as Model) : null;
};

export function NewOrder({ copyFrom, onPlaced }: { copyFrom?: string; onPlaced?: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { me } = useBiz();
  const { run } = useBizAct();
  const rc = Boolean(me.account.reverseCharge);
  const [sending, setSending] = useState(false);
  const [f, setF] = useState<Form>(blank);
  const [biz, setBiz] = useState<BizDetails>(blankBiz);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [lookup, setLookup] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const [price, setPrice] = useState<BizQuote | null>(null);
  const [priceBlocked, setPriceBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<{ ref: string; label: string }[]>([]);
  const [contacts, setContacts] = useState<SiteContact[]>([]);
  const [placed, setPlaced] = useState<{ ref: string; address: string; request: boolean } | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  // Earlier sites to copy from, and the site contacts used before.
  const loadPrevious = () =>
    bizOrders()
      .then((r) => {
        setPrevious(r.orders.filter((o) => !o.example).slice(0, 30).map((o) => ({ ref: o.ref, label: `${o.address}${o.project ? ` · ${o.project}` : ""} (${o.ref})` })));
        setContacts(r.contacts || []);
      })
      .catch(() => {});
  useEffect(() => {
    void loadPrevious();
  }, []);
  const copy = async (ref: string) => {
    if (!ref) return;
    const r = await run("copy", () => bizOrder(ref));
    if (!r) return;
    const o = r.order;
    setF((x) => ({
      ...x, address: o.address, length: String(o.house.length), width: String(o.house.width), floors: o.house.floors || "", roofType: o.house.roofType, pitch: String(o.house.pitch),
      eave: String(o.house.eave), jobType: o.house.jobType, gables: o.house.gables, sheeting: Boolean(o.house.sheeting), weatherRoof: Boolean(o.house.weatherRoof), zone: o.zone, days: String(o.days), system: o.house.system || ""
    }));
    setBiz({ ...blankBiz, project: o.business.project, costCentre: o.business.costCentre, siteContact: { ...o.business.siteContact }, siteInfo: o.business.siteInfo });
    setGeo(o.geo ? { ...o.geo, for: o.address } : null);
    setUnlocked(false);
    // Look the address up again so the 3D model and the size checks come back with it (the copied size stays).
    if (o.address) void find(o.address, 0, true);
  };
  const copied = useRef(false);
  useEffect(() => {
    if (copyFrom && !copied.current) {
      copied.current = true;
      void copy(copyFrom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyFrom]);

  // Speeds the office has switched off aren't offered.
  const urgencies = (["standard", "express", "emergency"] as Urgency[]).filter((u) => u === "standard" || me.urgencies[u]);

  // The lookup's building while the address is unchanged. A building measured in the 3D model keeps its measured
  // size: the fields are locked so a stray edit doesn't swap the real shape for a box (they can be unlocked on purpose).
  const looked = geo && geo.for === f.address.trim() ? geo.result || null : null;
  const model = modelOf(looked);
  const locked = Boolean(model) && !unlocked;
  const house = useMemo(() => {
    const L = parseNum(f.length), W = parseNum(f.width), E = parseNum(f.eave), P = f.roofType === "flat" ? 0 : parseNum(f.pitch);
    const ok = L != null && L >= 3 && L <= LARGE.L && W != null && W >= 3 && W <= LARGE.W && !!f.floors && E != null && E >= 2 && E <= LARGE.E && P != null && P >= 0 && P <= 60;
    const large = (L ?? 0) > NORMAL.L || (W ?? 0) > NORMAL.W || (E ?? 0) > NORMAL.E;
    return { ok, large, L: L || 0, W: W || 0, E: E || 0, P: P || 0 };
  }, [f.length, f.width, f.eave, f.pitch, f.roofType, f.floors]);
  const days = Math.max(1, Math.round(Number(f.days) || 0));
  const modelRef = useMemo<ModelRef | undefined>(
    () =>
      locked && model
        ? { id: model.id, lat: model.lat, lon: model.lon }
        : house.ok
          ? modelRefFor(looked, { length: house.L, width: house.W, eave: house.E, pitch: house.P, roofType: f.roofType })
          : undefined,
    [locked, model, looked, house, f.roofType]
  );
  const modelId = modelRef ? JSON.stringify(modelRef) : "";
  const measured = Boolean(modelRef && "id" in modelRef);
  // Bigger than the online price covers and not measured: only the office can price it.
  const offerOnly = house.ok && house.large && !measured;
  const storeys = geo && geo.for === f.address.trim() ? geo.storeys ?? null : null;

  // Live price with the company's discount, every system side by side, and the first free start dates.
  useEffect(() => {
    if (!house.ok || offerOnly) {
      setPriceBlocked(offerOnly);
      return setPrice(null);
    }
    let alive = true;
    const id = window.setTimeout(() => {
      bizQuote({
        length: house.L, width: house.W, eave: house.E, roofType: f.roofType, pitch: house.P, jobType: f.jobType, gables: f.roofType === "gable" && f.jobType === "roof" && f.gables,
        sheeting: f.sheeting, weatherRoof: f.weatherRoof, days, zone: f.zone, urgency: f.urgency, system: f.system || undefined, storeys: storeys ?? undefined, model: modelRef
      })
        .then((r) => {
          if (!alive) return;
          setPrice(r);
          setPriceBlocked(false);
        })
        .catch((e) => {
          if (!alive) return;
          setPrice(null);
          setPriceBlocked((e as { code?: string }).code === "model_required");
        });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house, offerOnly, f.roofType, f.jobType, f.gables, days, f.zone, f.urgency, modelId, f.system, f.sheeting, f.weatherRoof, storeys]);
  const chosen: BizType | null = price ? price.types.find((x) => x.system === (f.system || price.system)) || price.types[0] || null : null;
  const firstFree = (chosen?.earliest ?? price?.available?.[f.urgency]) || null;
  useEffect(() => {
    if (firstFree && (!f.start || f.start < firstFree)) setF((x) => ({ ...x, start: firstFree }));
  }, [firstFree, f.start]);
  // The office prices it: too big without a model, or the scaffold needs its own plan or calculation.
  const mustAsk = offerOnly || priceBlocked || Boolean(price?.review.request);

  const addressNow = useRef("");
  addressNow.current = f.address.trim();
  const fNow = useRef(f);
  fNow.current = f;
  async function find(address?: string, retry = 0, keepSize = false) {
    const text = (address ?? f.address).trim();
    if (text.length < 5) return setLookup({ busy: false, msg: t("biz.new.addrShort"), ok: false });
    setLookup({ busy: true, msg: null, ok: false });
    try {
      const r = await lookupAddress(text);
      if (!r.found) return setLookup({ busy: false, msg: t("biz.new.notFound"), ok: false });
      const h = r.house;
      if (keepSize) {
        // A copied site keeps its size; the measured building is used only while that size still matches it.
        const now = fNow.current;
        const near = (x: number | null | undefined, y: string) => x != null && Math.abs(x - (parseNum(y) ?? -99)) < 0.051;
        setUnlocked(!(near(h.length, now.length) && near(h.width, now.width) && near(h.eave, now.eave)));
      } else {
        setUnlocked(false);
        setF((x) => {
          const floors = h.floors ?? x.floors;
          return {
            ...x,
            zone: r.zone ?? x.zone,
            ...(h.length && h.width ? { length: String(h.length), width: String(h.width) } : {}),
            ...(floors ? { floors } : {}),
            ...(h.roofType ? { roofType: h.roofType } : {}),
            ...(h.pitch != null ? { pitch: String(h.pitch) } : {}),
            eave: h.eave ? String(h.eave) : floors ? String(EAVE_BY_FLOORS[floors]) : x.eave
          };
        });
      }
      const reg = r.details?.register?.storeys ?? null;
      setGeo({
        lat: r.match.lat, lon: r.match.lon, for: text, result: r, storeys: reg,
        checks: (r.noteCodes || []).map((n) => n.code).filter((c) => ["size_mismatch", "not_rectangle", "size_estimated", "street_only", "other_place", "outbuilding", "model_mismatch", "model_old", "model_slope"].includes(c))
      });
      const full = Boolean(r.model) || Boolean(h.length && h.width && h.floors) && r.match.houseLevel && r.details?.sizeSource !== "estimate" && !(r.noteCodes || []).some((n) => n.code === "size_mismatch");
      const how = modelOf(r) ? t("biz.new.model") : full ? t("biz.new.found") : t("biz.new.partial");
      setLookup({ busy: false, msg: `${r.match.short || r.match.display} – ${how}${r.modelPending ? ` (${t("biz.new.modelPending")})` : ""}`, ok: full });
      // The 3D model for a new area takes a moment to download: look again while the address is unchanged.
      if (r.modelPending && retry < 3) window.setTimeout(() => addressNow.current === text && void find(text, retry + 1, keepSize), 6000);
    } catch (e) {
      setLookup({ busy: false, msg: errMessage(i, e), ok: false });
    }
  }

  async function submit(request = false) {
    setError(null);
    if (!f.address.trim()) return setError(t("biz.new.needAddress"));
    if (!house.ok) return setError(house.L > LARGE.L || house.W > LARGE.W || house.E > LARGE.E ? t("biz.new.tooLarge") : t("biz.new.needSize"));
    if (!f.start) return setError(t("biz.new.needStart"));
    const g = geo && geo.for === f.address.trim() ? geo : null;
    const asking = request || mustAsk;
    setSending(true);
    try {
      const r = await bizPlaceOrder({
        address: f.address.trim(),
        length: house.L,
        width: house.W,
        eave: house.E,
        floors: f.floors,
        roofType: f.roofType,
        pitch: house.P,
        jobType: f.jobType,
        gables: f.roofType === "gable" && f.jobType === "roof" && f.gables,
        sheeting: f.sheeting,
        weatherRoof: f.weatherRoof,
        zone: f.zone,
        urgency: f.urgency,
        start: f.start,
        days,
        notes: f.notes,
        source: g ? "address" : "form",
        lat: g?.lat,
        lon: g?.lon,
        checks: g?.checks?.length ? g.checks : undefined,
        storeys: storeys && storeys >= 3 ? storeys : undefined,
        system: chosen?.system || f.system || undefined,
        model: modelRef,
        request: asking || undefined,
        ...biz
      });
      setPlaced({ ref: r.ref, address: r.order.address, request: r.order.quoteRequest === "open" });
      onPlaced?.();
      void loadPrevious();
      window.scrollTo(0, 0);
    } catch (e) {
      // Booked on that date: move to the first free date and let them send again.
      const err = e as { code?: string; info?: { date?: string } | null };
      if ((err.code === "not_enough_stock" || err.code === "fully_booked") && err.info?.date) {
        const date = err.info.date;
        setF((x) => ({ ...x, start: date }));
        setError(t("biz.new.moved", { date: day(date, lang) }));
      } else setError(errMessage(i, e));
    } finally {
      setSending(false);
    }
  }

  // Sent: offer the next site with the same PO, project, cost centre and site contact.
  if (placed)
    return (
      <Card as="div" className="mx-auto max-w-2xl p-6 sm:p-8">
        <div role="status">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-sun text-2xl font-bold text-ink">✓</span>
          <h1 className="mt-4 font-display text-[1.6rem] leading-tight font-extrabold text-ink">{placed.request ? t("biz.new.requestSentTitle") : t("biz.new.sentTitle")}</h1>
          <p className="mt-1 font-mono text-[13px] text-muted">
            {placed.ref} · {placed.address}
          </p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{placed.request ? t("biz.new.requestSentText") : t("biz.new.submitHint")}</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Btn
            variant="primary"
            onClick={() => {
              setF((x) => ({ ...blank, jobType: x.jobType, urgency: x.urgency, days: x.days, system: x.system }));
              setBiz((b) => ({ ...b, siteInfo: "" }));
              setGeo(null);
              setLookup({ busy: false, msg: null, ok: false });
              setPrice(null);
              setError(null);
              setPlaced(null);
              window.scrollTo(0, 0);
            }}
          >
            {t("biz.new.another")}
          </Btn>
          <Btn variant="light" href={`#/sites/${placed.ref}`}>
            {t("biz.new.openSite")}
          </Btn>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">{t("biz.new.anotherHint")}</p>
      </Card>
    );

  const texts3d = {
    hint: t("p3d.hint"), reset: t("p3d.reset"), loading: t("p3d.loading"), failed: t("p3d.failed"), close: t("p3d.close"), notice: t("biz.p3d.notice"),
    sideName: (s: PlanSide) => sideText(i, s.name),
    sideInfo: (s: PlanSide) => t("p3d.info", { bays: s.bays, levels: s.lifts, area: s.area })
  };
  const cheapest = price?.types.length ? Math.min(...price.types.map((x) => x.total)) : 0;
  // Every system costs the same until the office sets rates per system: then none is "the lowest".
  const sameAll = Boolean(price && price.types.length > 1 && price.types.every((x) => Math.round(x.total) === Math.round(cheapest)));
  const engineerText = (codes: string[]) => codes.map((c) => i.tk(`biz.eng.${c}`, undefined, c)).join(", ");

  return (
    <div>
      <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink">{t("biz.new.title")}</h1>
      <p className="mb-5 text-[14px] text-muted">{t("biz.new.sub")}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {previous.length ? (
            <Card>
              <CardHead title={t("biz.new.copy")} sub={t("biz.new.copySub")} />
              <div className="px-5 pb-5">
                <Select aria-label={t("biz.new.copy")} value="" onChange={copy} options={[{ value: "", label: t("biz.new.copyPick") }, ...previous.map((p) => ({ value: p.ref, label: p.label }))]} />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title={t("biz.new.site")} />
            <div className="space-y-4 px-5 pb-5">
              <Field label={t("biz.new.address")}>
                {(id) => (
                  <div className="flex gap-2">
                    <AddressInput
                      id={id}
                      value={f.address}
                      onChange={(v) => set("address", v)}
                      onPick={(s) => void find(s.label)}
                      listLabel={t("biz.new.suggestions")}
                      placeholder={t("biz.new.addressPh")}
                      wrapperClassName="flex-1"
                      className={inputCls}
                    />
                    <Btn variant="dark" onClick={() => void find()} busy={lookup.busy}>
                      {t("biz.new.find")}
                    </Btn>
                  </div>
                )}
              </Field>
              {lookup.msg ? <p className={cx("text-[13px]", lookup.ok ? "text-[#17663a]" : "text-[#b45309]")} role="status">{lookup.msg}</p> : null}
              {storeys && storeys >= 3 ? <Callout tone="info">{model ? t("biz.new.storeysMany", { n: storeys }) : t("biz.new.storeysNoModel", { n: storeys })}</Callout> : null}
              {model ? (
                <div className="rounded-xl bg-mist px-4 py-3 text-[13px] text-ink-soft">
                  <p className="font-semibold text-ink">{t("biz.model.title")}</p>
                  <p className="mt-0.5">
                    {t("biz.model.facts", { corners: model.corners, perimeter: numText(model.perimeterM, lang) })}
                    {model.eaveMin != null && model.eaveMax != null ? ` · ${t("biz.model.eaves", { min: numText(model.eaveMin, lang), max: numText(model.eaveMax, lang) })}` : ""}
                    {model.ridge != null ? ` · ${t("biz.model.ridge", { m: numText(model.ridge, lang) })}` : ""}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">{t("biz.model.credit", { date: model.date ? model.date.slice(0, 4) : "" })}</p>
                  {locked ? (
                    <button type="button" className="mt-1.5 text-[12.5px] font-semibold text-ink underline underline-offset-2" onClick={() => setUnlocked(true)}>
                      {t("biz.model.unlock")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label={t("biz.new.length")}>{(id) => <Input id={id} inputMode="decimal" value={f.length} onChange={(v) => set("length", v)} placeholder="m" disabled={locked} />}</Field>
                <Field label={t("biz.new.width")}>{(id) => <Input id={id} inputMode="decimal" value={f.width} onChange={(v) => set("width", v)} placeholder="m" disabled={locked} />}</Field>
                <Field label={t("biz.new.floors")}>
                  {(id) => (
                    <Select
                      id={id}
                      value={f.floors}
                      onChange={(v) => setF((x) => ({ ...x, floors: v as Floors, eave: x.eave || String(EAVE_BY_FLOORS[v as Floors] ?? "") }))}
                      options={[{ value: "", label: "–" }, ...FLOORS.map((x) => ({ value: x, label: x === "1.5" ? "1½" : x === "2" ? t("biz.new.floors2plus") : x }))]}
                    />
                  )}
                </Field>
                <Field label={t("biz.new.eave")}>{(id) => <Input id={id} inputMode="decimal" value={f.eave} onChange={(v) => set("eave", v)} placeholder="m" disabled={locked} />}</Field>
                <Field label={t("biz.new.roof")}>{(id) => <Select id={id} value={f.roofType} onChange={(v) => set("roofType", v as RoofType)} options={ROOFS.map((r) => ({ value: r, label: roofLabel(i, r) }))} disabled={locked} />}</Field>
                {f.roofType !== "flat" ? <Field label={t("biz.new.pitch")}>{(id) => <Input id={id} inputMode="numeric" value={f.pitch} onChange={(v) => set("pitch", v)} placeholder="°" disabled={locked} />}</Field> : null}
              </div>
              {offerOnly ? <Callout tone="warn">{t("biz.new.largeNoModel", { l: NORMAL.L, w: NORMAL.W, e: NORMAL.E })}</Callout> : null}
            </div>
          </Card>

          <Card>
            <CardHead title={t("biz.new.job")} />
            <div className="space-y-4 px-5 pb-5">
              <Chips label={t("biz.new.job")} value={f.jobType} onChange={(v) => set("jobType", v)} options={JOBS.map((j) => ({ key: j, label: jobLabel(i, j) }))} />
              {f.roofType === "gable" && f.jobType === "roof" ? (
                <label className="flex items-center gap-2 text-[14px] text-ink-soft">
                  <input type="checkbox" className="h-4 w-4 accent-ink" checked={f.gables} onChange={(e) => set("gables", e.target.checked)} /> {t("biz.new.gables")}
                </label>
              ) : null}
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {WEATHER_JOBS.sheeting.includes(f.jobType) ? (
                  <label className="flex items-center gap-2 text-[14px] text-ink-soft">
                    <input type="checkbox" className="h-4 w-4 accent-ink" checked={f.sheeting} onChange={(e) => set("sheeting", e.target.checked)} /> {t("biz.new.sheeting")}
                  </label>
                ) : null}
                {WEATHER_JOBS.weatherRoof.includes(f.jobType) ? (
                  <label className="flex items-center gap-2 text-[14px] text-ink-soft">
                    <input type="checkbox" className="h-4 w-4 accent-ink" checked={f.weatherRoof} onChange={(e) => set("weatherRoof", e.target.checked)} /> {t("biz.new.weatherRoof")}
                  </label>
                ) : null}
              </div>
              <Chips label={t("biz.new.speed")} value={f.urgency} onChange={(v) => set("urgency", v)} options={urgencies.map((u) => ({ key: u, label: urgLabel(i, u) }))} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("biz.new.start")} hint={firstFree ? t("biz.new.firstFree", { date: day(firstFree, lang) }) : undefined}>
                  {(id, h) => <Input id={id} type="date" value={f.start} onChange={(v) => set("start", v)} describedBy={h} />}
                </Field>
                <Field label={t("biz.new.days")}>{(id) => <Input id={id} type="number" inputMode="numeric" value={f.days} onChange={(v) => set("days", v)} />}</Field>
                <Field label={t("biz.new.zone")}>{(id) => <Select id={id} value={f.zone} onChange={(v) => set("zone", v as Zone)} options={(["A", "B", "C"] as Zone[]).map((z) => ({ value: z, label: `${t("orders.zone", { z })} – ${t(`rep.zoneName.${z}`)}` }))} />}</Field>
              </div>
            </div>
          </Card>

          {price && price.types.length ? (
            <Card>
              <CardHead title={t("biz.type.title")} sub={t("biz.type.sub")} />
              <div className="px-5 pb-5">
                <div role="radiogroup" aria-label={t("biz.type.title")} className="grid gap-3 xl:grid-cols-2">
                  {price.types.map((ty) => {
                    const on = chosen?.system === ty.system;
                    const diff = Math.round(ty.total - cheapest);
                    return (
                      <button
                        key={ty.system}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set("system", ty.system)}
                        className={cx("flex h-full flex-col rounded-2xl p-4 text-left ring-1 transition-colors", on ? "bg-sun-soft/40 ring-2 ring-ink" : "bg-white ring-line hover:ring-ink/30")}
                      >
                        <span className="flex w-full items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block font-display text-[16px] font-bold text-ink">{ty.name}</span>
                            <span className="mt-0.5 block text-[13px] text-ink-soft">{t(`biz.sys.${ty.system}.kind`)}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-display text-[18px] font-extrabold text-ink tabular-nums">{money(ty.total, lang, 0)}</span>
                            <span className="block text-[12px] font-semibold text-muted">{diff > 0 ? t("biz.type.more", { v: money(diff, lang, 0) }) : sameAll ? t("biz.type.same") : t("biz.type.cheapest")}</span>
                          </span>
                        </span>
                        <span className="mt-2 block text-[13px] leading-relaxed text-ink-soft">{t(`biz.sys.${ty.system}.desc`)}</span>
                        <span className="mt-3 flex flex-wrap gap-1.5">
                          <Badge tone="neutral">{t("biz.type.class", { cls: ty.loadClass, kn: numText(ty.kNm2, lang), kg: ty.kgM2 })}</Badge>
                          <Badge tone="neutral">{t("biz.type.width", { wc: ty.widthClass, w: numText(ty.walkway, lang) })}</Badge>
                          <Badge tone="neutral">{ty.maxHeightBrackets ? t("biz.type.maxHB", { m: ty.maxHeight, b: ty.maxHeightBrackets }) : t("biz.type.maxH", { m: ty.maxHeight })}</Badge>
                        </span>
                        <span className="mt-2 block text-[12.5px] text-muted">
                          <b className="font-semibold text-ink-soft">{t("biz.type.uses")}</b> {t(`biz.sys.${ty.system}.uses`)}
                        </span>
                        <span className="mt-2 block text-[12.5px] text-muted">
                          {[ty.perM2 != null ? t("biz.type.perM2", { v: money(ty.perM2, lang) }) : "", t("biz.type.weight", { t: numText(Math.round(ty.weightKg / 100) / 10, lang) }), ty.height != null ? t("biz.type.height", { m: numText(ty.height, lang) }) : "", ty.earliest ? t("biz.type.earliest", { date: day(ty.earliest, lang) }) : ""].filter(Boolean).join(" · ")}
                        </span>
                        {ty.engineer.length ? <span className="mt-2 block rounded-lg bg-[#fff4e5] px-2.5 py-1.5 text-[12.5px] font-medium text-[#8a4b00]">{t("biz.type.engineer", { what: engineerText(ty.engineer) })}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <details className="mt-4 rounded-xl bg-mist px-4 py-3 text-[13px] text-ink-soft">
                  <summary className="cursor-pointer font-semibold text-ink">{t("biz.type.legend")}</summary>
                  <ul className="mt-2 space-y-1">
                    {CLASSES.map((c) => (
                      <li key={c.cls}>
                        <b className="text-ink">{t("biz.type.classShort", { cls: c.cls, kn: numText(c.kn, lang), kg: Math.round(c.kn * 100) })}</b> – {i.tk(`biz.cls.${c.cls}`, undefined, "")}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12.5px] text-muted">{t("biz.type.heavier")}</p>
                </details>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title={t("biz.details.title")} sub={t("biz.new.detailsSub")} />
            <div className="space-y-4 px-5 pb-5">
              <BizFields d={biz} setD={setBiz} contacts={contacts} />
              <Field label={t("biz.new.notes")} optional>{(id) => <TextArea id={id} rows={3} value={f.notes} onChange={(v) => set("notes", v)} maxLength={1000} placeholder={t("biz.new.notesPh")} />}</Field>
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="lg:sticky lg:top-32">
            <CardHead title={mustAsk ? t("biz.new.priceRequest") : t("biz.new.price")} sub={me.account.discountPct ? t("biz.new.discount", { pct: me.account.discountPct }) : undefined} />
            <div className="px-5 pb-5">
              {price ? (
                <>
                  {mustAsk ? <p className="text-[12.5px] font-semibold tracking-wide text-[#8a4b00] uppercase">{t("biz.new.preliminary")}</p> : null}
                  <p className="font-display text-[2rem] leading-none font-extrabold tabular-nums text-ink">{money(price.quote.total, lang, 0)}</p>
                  <p className="mt-1 text-[12.5px] text-muted">{rc ? t("biz.new.rc") : t("biz.new.inclVat")}</p>
                  {chosen ? <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">{chosen.name}</p> : null}
                  <ul className="mt-4 space-y-1.5 text-[13px]">
                    {price.quote.lines.map((l) => (
                      <li key={l.key} className="flex justify-between gap-3">
                        <span className="text-ink-soft">{lineText(i, l, price.quote)}</span>
                        <span className="tabular-nums">{money(l.amount, lang, 0)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12.5px] text-muted">{t("biz.new.area", { area: numText(price.estimate.area, lang), t: numText(Math.round(price.estimate.weightKg / 100) / 10, lang) })}</p>
                  <p className="mt-2 text-[12.5px] text-muted">{t("biz.new.rentNote", { min: me.minRentDays ?? 7 })}</p>
                  {price.plan ? (
                    <div className="mt-4">
                      <Scaffold3D plan={price.plan} texts={texts3d} compact className="h-56" />
                      <Btn size="sm" variant="light" className="mt-2 w-full" onClick={() => setShow3d(true)}>
                        {t("biz.p3d.open")}
                      </Btn>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[13px] text-muted">{offerOnly || priceBlocked ? t("biz.new.priceByOffer") : t("biz.new.priceEmpty")}</p>
              )}
              {mustAsk ? (
                <Callout tone="warn" className="mt-4">
                  {t("biz.new.askWhy")}{" "}
                  {[offerOnly || priceBlocked ? t("biz.ask.large") : "", price?.review.engineer.length ? t("biz.ask.engineer", { what: engineerText(price.review.engineer) }) : ""].filter(Boolean).join(" ")}
                </Callout>
              ) : null}
              {error ? (
                <Callout tone="danger" className="mt-4">
                  {error}
                </Callout>
              ) : null}
              <Btn variant="primary" className="mt-5 w-full" onClick={() => void submit()} busy={sending} disabled={!house.ok || !f.address.trim()}>
                {mustAsk ? t("biz.new.quoteBtn") : t("biz.new.submit")}
              </Btn>
              {!house.ok || !f.address.trim() ? <p className="mt-2 text-[12px] text-[#8a4b00]">{!f.address.trim() ? t("biz.new.needAddress") : house.L > LARGE.L || house.W > LARGE.W || house.E > LARGE.E ? t("biz.new.tooLarge") : t("biz.new.needSize")}</p> : null}
              <p className="mt-2 text-[12px] text-muted">{mustAsk ? t("biz.new.quoteHint") : t("biz.new.submitHint")}</p>
              {!mustAsk && house.ok && f.address.trim() ? (
                <button type="button" className="mt-3 text-[12.5px] font-semibold text-ink-soft underline underline-offset-2 hover:text-ink" onClick={() => void submit(true)} disabled={sending}>
                  {t("biz.new.askInstead")}
                </button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
      {show3d && price?.plan ? (
        <Plan3DOverlay load={() => Promise.resolve(price.plan!)} texts={texts3d} title={t("biz.p3d.title")} showSystem onClose={() => setShow3d(false)} />
      ) : null}
    </div>
  );
}
