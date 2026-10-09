"use client";
// A new site from the portal: address lookup (or the size by hand, or copied from an earlier site), job, timing,
// and the company's PO / project / site contact. The company's own price and the first free dates update live.
import { useEffect, useMemo, useRef, useState } from "react";
import { EAVE_BY_FLOORS, getQuote, lookupAddress, modelRefFor, WEATHER_JOBS, type AddressResult, type SystemKey, type Floors, type JobType, type QuoteResult, type RoofType, type Urgency, type Zone } from "@/lib/api";
import { bizOrder, bizOrders, bizPlaceOrder, type BizDetails } from "@/lib/business";
import { useT } from "../office/context";
import { day, money, numText, parseNum } from "../office/format";
import { errMessage, jobLabel, lineText, roofLabel, urgLabel } from "../office/i18n";
import { Btn, Callout, Card, CardHead, Chips, Field, Input, Select, TextArea, cx, inputCls } from "../office/ui";
import { AddressInput } from "../ui/AddressInput";
import { useBiz, useBizAct } from "./context";
import { BizFields } from "./OrderView";
import { go } from "./BizApp";

const JOBS: JobType[] = ["roof", "facade", "roof_facade", "gutters"];
const ROOFS: RoofType[] = ["gable", "hip", "flat"];
const FLOORS: Floors[] = ["1", "1.5", "2"];

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
  system: SystemKey;
};
const blank: Form = { address: "", length: "", width: "", floors: "", roofType: "gable", pitch: "30", eave: "", jobType: "roof", gables: true, sheeting: false, weatherRoof: false, zone: "A", urgency: "standard", start: "", days: "28", notes: "", system: "layher" };
const blankBiz: BizDetails = { po: "", project: "", costCentre: "", siteContact: { name: "", phone: "" }, siteInfo: "" };

export function NewOrder({ copyFrom }: { copyFrom?: string }) {
  const i = useT();
  const { t, lang } = i;
  const { me } = useBiz();
  const { run } = useBizAct();
  const [sending, setSending] = useState(false);
  const [f, setF] = useState<Form>(blank);
  const [biz, setBiz] = useState<BizDetails>(blankBiz);
  const [geo, setGeo] = useState<{ lat: number; lon: number; for: string; checks?: string[]; result?: AddressResult } | null>(null);
  const [lookup, setLookup] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const [price, setPrice] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<{ ref: string; label: string }[]>([]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  // Earlier sites to copy from.
  useEffect(() => {
    bizOrders()
      .then((r) => setPrevious(r.orders.filter((o) => !o.example).slice(0, 30).map((o) => ({ ref: o.ref, label: `${o.address}${o.project ? ` · ${o.project}` : ""} (${o.ref})` }))))
      .catch(() => {});
  }, []);
  const copy = async (ref: string) => {
    if (!ref) return;
    const r = await run("copy", () => bizOrder(ref));
    if (!r) return;
    const o = r.order;
    setF((x) => ({ ...x, address: o.address, length: String(o.house.length), width: String(o.house.width), floors: o.house.floors, roofType: o.house.roofType, pitch: String(o.house.pitch), eave: String(o.house.eave), jobType: o.house.jobType, gables: o.house.gables, zone: o.zone, days: String(o.days), system: o.house.system || "layher" }));
    setBiz({ ...blankBiz, project: o.business.project, costCentre: o.business.costCentre, siteContact: { ...o.business.siteContact }, siteInfo: o.business.siteInfo });
    setGeo(o.geo ? { ...o.geo, for: o.address } : null);
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

  const house = useMemo(() => {
    const L = parseNum(f.length), W = parseNum(f.width), E = parseNum(f.eave), P = f.roofType === "flat" ? 0 : parseNum(f.pitch);
    const ok = L != null && L >= 3 && L <= 60 && W != null && W >= 3 && W <= 40 && !!f.floors && E != null && E >= 2 && E <= 12 && P != null && P >= 0 && P <= 60;
    return { ok, L: L || 0, W: W || 0, E: E || 0, P: P || 0 };
  }, [f.length, f.width, f.eave, f.pitch, f.roofType, f.floors]);
  const days = Math.max(1, Math.round(Number(f.days) || 0));
  // The measured 3D building prices the walls one by one, while the size still matches what the lookup found.
  const modelRef = useMemo(() => {
    const g = geo && geo.for === f.address.trim() ? geo.result : null;
    return house.ok ? modelRefFor(g, { length: house.L, width: house.W, eave: house.E, pitch: house.P, roofType: f.roofType }) : undefined;
  }, [geo, f.address, house, f.roofType]);
  const modelId = modelRef ? JSON.stringify(modelRef) : "";

  // Live price with the company's discount, and the first free start dates for this house.
  useEffect(() => {
    if (!house.ok) return setPrice(null);
    let alive = true;
    const id = window.setTimeout(() => {
      getQuote({ length: house.L, width: house.W, eave: house.E, roofType: f.roofType, pitch: house.P, jobType: f.jobType, gables: f.roofType === "gable" && f.jobType === "roof" && f.gables, sheeting: f.sheeting, weatherRoof: f.weatherRoof, days, zone: f.zone, urgency: f.urgency, partnerCode: me.account.code, model: modelRef })
        .then((r) => alive && setPrice(r))
        .catch(() => alive && setPrice(null));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house, f.roofType, f.jobType, f.gables, days, f.zone, f.urgency, me.account.code, modelId, f.system, f.sheeting, f.weatherRoof]);
  const firstFree = price?.available?.[f.urgency] || null;
  useEffect(() => {
    if (firstFree && (!f.start || f.start < firstFree)) setF((x) => ({ ...x, start: firstFree }));
  }, [firstFree, f.start]);

  const addressNow = useRef("");
  addressNow.current = f.address.trim();
  async function find(address?: string, retry = 0) {
    const text = (address ?? f.address).trim();
    if (text.length < 5) return setLookup({ busy: false, msg: t("biz.new.addrShort"), ok: false });
    setLookup({ busy: true, msg: null, ok: false });
    try {
      const r = await lookupAddress(text);
      if (!r.found) return setLookup({ busy: false, msg: t("biz.new.notFound"), ok: false });
      const h = r.house;
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
      setGeo({ lat: r.match.lat, lon: r.match.lon, for: text, result: r, checks: (r.noteCodes || []).map((n) => n.code).filter((c) => ["size_mismatch", "not_rectangle", "size_estimated", "street_only", "outbuilding", "model_mismatch", "model_old", "model_slope"].includes(c)) });
      const full = Boolean(r.model) || Boolean(h.length && h.width && h.floors) && r.match.houseLevel && r.details?.sizeSource !== "estimate" && !(r.noteCodes || []).some((n) => n.code === "size_mismatch");
      const how = r.model ? t("biz.new.model") : full ? t("biz.new.found") : t("biz.new.partial");
      setLookup({ busy: false, msg: `${r.match.short || r.match.display} – ${how}${r.modelPending ? ` (${t("biz.new.modelPending")})` : ""}`, ok: full });
      // The 3D model for a new area takes a moment to download: look again while the address is unchanged.
      if (r.modelPending && retry < 3) window.setTimeout(() => addressNow.current === text && void find(text, retry + 1), 6000);
    } catch (e) {
      setLookup({ busy: false, msg: errMessage(i, e), ok: false });
    }
  }

  async function submit() {
    setError(null);
    if (!f.address.trim()) return setError(t("biz.new.needAddress"));
    if ((parseNum(f.length) ?? 0) > 60 || (parseNum(f.width) ?? 0) > 40) return setError(t("biz.new.tooLarge"));
    if (!house.ok) return setError(t("biz.new.needSize"));
    if (!f.start) return setError(t("biz.new.needStart"));
    const g = geo && geo.for === f.address.trim() ? geo : null;
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
        model: modelRef,
        ...biz
      });
      go(`#/sites/${r.ref}`);
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

  return (
    <div>
      <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink">{t("biz.new.title")}</h1>
      <p className="mb-5 text-[14px] text-muted">{t("biz.new.sub")}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label={t("biz.new.length")}>{(id) => <Input id={id} inputMode="decimal" value={f.length} onChange={(v) => set("length", v)} placeholder="m" />}</Field>
                <Field label={t("biz.new.width")}>{(id) => <Input id={id} inputMode="decimal" value={f.width} onChange={(v) => set("width", v)} placeholder="m" />}</Field>
                <Field label={t("biz.new.floors")}>
                  {(id) => (
                    <Select
                      id={id}
                      value={f.floors}
                      onChange={(v) => setF((x) => ({ ...x, floors: v as Floors, eave: x.eave || String(EAVE_BY_FLOORS[v as Floors] ?? "") }))}
                      options={[{ value: "", label: "–" }, ...FLOORS.map((x) => ({ value: x, label: x === "1.5" ? "1½" : x }))]}
                    />
                  )}
                </Field>
                <Field label={t("biz.new.eave")}>{(id) => <Input id={id} inputMode="decimal" value={f.eave} onChange={(v) => set("eave", v)} placeholder="m" />}</Field>
                <Field label={t("biz.new.roof")}>{(id) => <Select id={id} value={f.roofType} onChange={(v) => set("roofType", v as RoofType)} options={ROOFS.map((r) => ({ value: r, label: roofLabel(i, r) }))} />}</Field>
                {f.roofType !== "flat" ? <Field label={t("biz.new.pitch")}>{(id) => <Input id={id} inputMode="numeric" value={f.pitch} onChange={(v) => set("pitch", v)} placeholder="°" />}</Field> : null}
              </div>
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

          <Card>
            <CardHead title={t("biz.details.title")} sub={t("biz.new.detailsSub")} />
            <div className="space-y-4 px-5 pb-5">
              <BizFields d={biz} setD={setBiz} />
              <Field label={t("biz.new.notes")} optional>{(id) => <TextArea id={id} rows={3} value={f.notes} onChange={(v) => set("notes", v)} maxLength={1000} placeholder={t("biz.new.notesPh")} />}</Field>
            </div>
          </Card>
        </div>

        <div>
          <Card className="lg:sticky lg:top-32">
            <CardHead title={t("biz.new.price")} sub={me.account.discountPct ? t("biz.new.discount", { pct: me.account.discountPct }) : undefined} />
            <div className="px-5 pb-5">
              {price ? (
                <>
                  <p className="font-display text-[2rem] leading-none font-extrabold tabular-nums text-ink">{money(price.quote.total, lang, 0)}</p>
                  <p className="mt-1 text-[12.5px] text-muted">{t("biz.new.inclVat")}</p>
                  <ul className="mt-4 space-y-1.5 text-[13px]">
                    {price.quote.lines.map((l) => (
                      <li key={l.key} className="flex justify-between gap-3">
                        <span className="text-ink-soft">{lineText(i, l, price.quote)}</span>
                        <span className="tabular-nums">{money(l.amount, lang, 0)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12.5px] text-muted">{t("biz.new.area", { area: numText(price.estimate.area, lang), t: numText(Math.round(price.estimate.weightKg / 100) / 10, lang) })}</p>
                </>
              ) : (
                <p className="text-[13px] text-muted">{t("biz.new.priceEmpty")}</p>
              )}
              {error ? (
                <Callout tone="danger" className="mt-4">
                  {error}
                </Callout>
              ) : null}
              <Btn variant="primary" className="mt-5 w-full" onClick={submit} busy={sending} disabled={!house.ok || !f.address.trim()}>
                {t("biz.new.submit")}
              </Btn>
              <p className="mt-2 text-[12px] text-muted">{t("biz.new.submitHint")}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
