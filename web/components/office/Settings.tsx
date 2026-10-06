"use client";
// Settings (head of company): prices, operations, company details, message templates, website content, messaging.
import { useEffect, useMemo, useState } from "react";
import type { Pricing } from "@/lib/api";
import { FAQ as SITE_FAQ } from "@/lib/content";
import { SITE } from "@/lib/site";
import {
  getContent,
  getPricing,
  getSettings,
  getTemplates,
  saveContent,
  savePricing,
  saveSettings,
  saveTemplates,
  type Content,
  type Ops,
  type TemplateEvent,
  type Templates
} from "@/lib/platform";
import { IconPlus } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { number } from "./format";
import { eventLabel, type Lang } from "./i18n";
import { IDown, ITrash, IUp } from "./icons";
import { MessagingStatus } from "./Messages";
import { Async, Badge, Btn, Callout, Card, CardHead, Check, Field, IconBtn, Input, NumInput, Switch, Tabs, TextArea, cx } from "./ui";

type Tab = "prices" | "ops" | "company" | "templates" | "website" | "messaging";
const TABS: Tab[] = ["prices", "ops", "company", "templates", "website", "messaging"];
const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Sticky save bar shown while there are unsaved changes. */
function SaveBar({ dirty, busy, onSave, onUndo, error }: { dirty: boolean; busy: boolean; onSave: () => void; onUndo: () => void; error?: string | null }) {
  const { t } = useT();
  if (!dirty) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_16px_40px_-12px_rgba(14,18,23,0.6)] sm:px-5" role="region" aria-label={t("set.unsaved")}>
      <p className="text-[14px] font-medium">{error ? <span className="text-[#ffb4ae]">{error}</span> : t("set.unsaved")}</p>
      <div className="flex gap-2">
        <Btn size="sm" variant="quiet" className="!text-white/80 hover:!bg-white/10 hover:!text-white" onClick={onUndo}>
          {t("ui.undo")}
        </Btn>
        <Btn size="sm" variant="primary" onClick={onSave} busy={busy} disabled={!!error}>
          {t("ui.saveChanges")}
        </Btn>
      </div>
    </div>
  );
}

function Def({ v, unit, lang }: { v: number; unit?: string; lang: Lang }) {
  const { t } = useT();
  return <>{t("set.default", { v: `${number(v, lang, 2)}${unit ? ` ${unit}` : ""}` })}</>;
}

/* ======================= Prices ======================= */
function PricesTab() {
  const { t, lang } = useT();
  const st = useLoad(getPricing, []);
  const { busy, run } = useAct();
  const [d, setD] = useState<Pricing | null>(null);
  useEffect(() => {
    if (st.data) setD(clone(st.data.pricing));
  }, [st.data]);
  return (
    <Async state={st}>
      {(data) => {
        if (!d) return null;
        const def = data.defaults;
        const dirty = !same(d, data.pricing);
        const nums: unknown[] = [d.rentPerM2Day, d.minRentDays, d.erectPerM2, d.dismantlePerM2, d.catchPerMetre, d.extraLevelPerM, d.truckCapacityKg, d.minOrder, d.vat, d.rangePct, d.zones.A.trip, d.zones.B.trip, d.zones.C.trip, d.urgency.express.pct, d.urgency.emergency.pct];
        const bad = nums.some((n) => n == null || !Number.isFinite(n as number) || (n as number) < 0);
        const f = (k: keyof Pricing, label: string, unit: string, hint?: string) => (
          <Field label={label} hint={<>{hint ? `${hint} ` : ""}<Def v={def[k] as number} unit={unit} lang={lang} /></>}>
            {(id, h) => <NumInput id={id} lang={lang} value={d[k] as number} onChange={(v) => setD({ ...d, [k]: v as number })} suffix={unit} describedBy={h} />}
          </Field>
        );
        return (
          <div className="space-y-4">
            <Callout tone="info">{t("set.prices.intro")}</Callout>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card aria-labelledby="p-rent">
                <CardHead id="p-rent" title={t("set.prices.rent")} />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  {f("rentPerM2Day", t("set.prices.rentPerM2Day"), lang === "fi" ? "€/m²/pv" : lang === "ru" ? "€/м²/день" : "€/m²/day")}
                  {f("minRentDays", t("set.prices.minRentDays"), t("ui.daysUnit"))}
                </div>
              </Card>
              <Card aria-labelledby="p-work">
                <CardHead id="p-work" title={t("set.prices.work")} />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  {f("erectPerM2", t("set.prices.erectPerM2"), "€/m²")}
                  {f("dismantlePerM2", t("set.prices.dismantlePerM2"), "€/m²")}
                  {f("catchPerMetre", t("set.prices.catchPerMetre"), lang === "fi" ? "€/jm" : lang === "ru" ? "€/пог. м" : "€/m")}
                  {f("extraLevelPerM", t("set.prices.extraLevelPerM"), lang === "fi" ? "€/jm" : lang === "ru" ? "€/пог. м" : "€/m")}
                </div>
              </Card>
              <Card aria-labelledby="p-trans">
                <CardHead id="p-trans" title={t("set.prices.transport")} sub={t("set.prices.transportSub")} />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  {(["A", "B", "C"] as const).map((z) => (
                    <Field key={z} label={t("set.prices.zone", { z })} hint={<>{t(`rep.zoneName.${z}`)} · <Def v={def.zones[z].trip} unit="€" lang={lang} /></>}>
                      {(id, h) => (
                        <NumInput id={id} lang={lang} value={d.zones[z].trip} onChange={(v) => setD({ ...d, zones: { ...d.zones, [z]: { ...d.zones[z], trip: v as number } } })} suffix="€" describedBy={h} />
                      )}
                    </Field>
                  ))}
                  {f("truckCapacityKg", t("set.prices.truckCapacityKg"), "kg", t("set.prices.truckHint"))}
                </div>
              </Card>
              <Card aria-labelledby="p-speed">
                <CardHead id="p-speed" title={t("set.prices.speed")} sub={t("set.prices.speedSub")} />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  {(["express", "emergency"] as const).map((u) => (
                    <Field key={u} label={t(`set.prices.${u}`)} hint={<Def v={def.urgency[u].pct} unit="%" lang={lang} />}>
                      {(id, h) => (
                        <NumInput id={id} lang={lang} value={d.urgency[u].pct} onChange={(v) => setD({ ...d, urgency: { ...d.urgency, [u]: { ...d.urgency[u], pct: v as number } } })} suffix="%" describedBy={h} />
                      )}
                    </Field>
                  ))}
                </div>
              </Card>
              <Card aria-labelledby="p-total" className="xl:col-span-2">
                <CardHead id="p-total" title={t("set.prices.totals")} />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
                  {f("minOrder", t("set.prices.minOrder"), "€", t("set.prices.minOrderHint"))}
                  {f("vat", t("set.prices.vat"), "%")}
                  {f("rangePct", t("set.prices.rangePct"), "%", t("set.prices.rangeHint"))}
                </div>
              </Card>
            </div>
            <div className="flex justify-end">
              <Btn size="sm" variant="ghost" onClick={() => setD(clone(def))} disabled={same(d, def)}>
                {t("set.resetDefaults")}
              </Btn>
            </div>
            <SaveBar
              dirty={dirty}
              busy={busy === "save"}
              error={bad ? t("set.fixNumbers") : null}
              onUndo={() => setD(clone(data.pricing))}
              onSave={async () => {
                const r = await run("save", () => savePricing(d), t("set.prices.saved"), { refresh: false });
                if (r) st.setData({ ...data, pricing: r.pricing });
              }}
            />
          </div>
        );
      }}
    </Async>
  );
}

/* ======================= Operations and company ======================= */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/;
const SMS_EVENTS: TemplateEvent[] = ["order_received", "confirmed", "on_the_way", "ready", "rental_ending", "pickup_scheduled", "collected", "invoice", "change_approved", "change_rejected", "office_reply"];

function useOps() {
  const st = useLoad(getSettings, []);
  const [d, setD] = useState<Ops | null>(null);
  useEffect(() => {
    if (st.data) setD(clone(st.data.settings));
  }, [st.data]);
  return { st, d, setD };
}

function OpsTab() {
  const i = useT();
  const { t, lang } = i;
  const { st, d, setD } = useOps();
  const { busy, run } = useAct();
  return (
    <Async state={st}>
      {(data) => {
        if (!d) return null;
        const def = data.defaults;
        const keys: (keyof Ops)[] = ["urgencies", "zones", "aiDrawing", "jobsPerCrewDay", "windWarnMs", "inspectionEveryDays", "rentalReminderDays", "crewHourCost", "truckTripCost", "officeEmail", "siteUrl", "smsEvents"];
        const pickOps = (o: Ops) => Object.fromEntries(keys.map((k) => [k, o[k]])) as Partial<Ops>;
        const dirty = !same(pickOps(d), pickOps(data.settings));
        const emailBad = !!d.officeEmail && !EMAIL.test(d.officeEmail.trim());
        const urlBad = !!d.siteUrl && !URL_RE.test(d.siteUrl.trim());
        const range = (v: number | null, lo: number, hi: number) => v != null && v >= lo && v <= hi;
        const numsBad = !range(d.jobsPerCrewDay, 1, 10) || !range(d.windWarnMs, 5, 60) || !range(d.inspectionEveryDays, 1, 60) || !range(d.rentalReminderDays, 0, 14) || !range(d.crewHourCost, 0, 500) || !range(d.truckTripCost, 0, 2000);
        const n = (k: "jobsPerCrewDay" | "windWarnMs" | "inspectionEveryDays" | "rentalReminderDays" | "crewHourCost" | "truckTripCost", label: string, unit: string, hint: string, lo: number, hi: number) => (
          <Field label={label} hint={<>{hint} <Def v={def[k]} unit={unit} lang={lang} /></>} error={range(d[k], lo, hi) ? null : t("set.range", { lo, hi })}>
            {(id, h) => <NumInput id={id} lang={lang} value={d[k]} onChange={(v) => setD({ ...d, [k]: v as number })} suffix={unit} describedBy={h} />}
          </Field>
        );
        return (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card aria-labelledby="o-web">
                <CardHead id="o-web" title={t("set.ops.web")} sub={t("set.ops.webSub")} />
                <div className="space-y-4 px-5 pb-5">
                  <Switch checked={d.urgencies.express} onChange={(v) => setD({ ...d, urgencies: { ...d.urgencies, express: v } })} label={t("set.ops.express")} hint={t("set.ops.expressHint")} />
                  <Switch checked={d.urgencies.emergency} onChange={(v) => setD({ ...d, urgencies: { ...d.urgencies, emergency: v } })} label={t("set.ops.emergency")} hint={t("set.ops.emergencyHint")} />
                  <div className="border-t border-line pt-4">
                    <p className="mb-3 text-[13px] font-semibold text-ink-soft">{t("set.ops.zones")}</p>
                    <div className="space-y-3">
                      {(["A", "B", "C"] as const).map((z) => (
                        <Switch key={z} checked={d.zones[z]} onChange={(v) => setD({ ...d, zones: { ...d.zones, [z]: v } })} label={t("set.prices.zone", { z })} hint={t(`rep.zoneName.${z}`)} />
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-line pt-4">
                    <Switch checked={d.aiDrawing} onChange={(v) => setD({ ...d, aiDrawing: v })} label={t("set.ops.ai")} hint={t("set.ops.aiHint")} />
                  </div>
                </div>
              </Card>
              <div className="space-y-4">
                <Card aria-labelledby="o-cap">
                  <CardHead id="o-cap" title={t("set.ops.capacity")} />
                  <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                    {n("jobsPerCrewDay", t("set.ops.jobsPerCrewDay"), t("set.ops.jobsUnit"), t("set.ops.jobsHint"), 1, 10)}
                    {n("windWarnMs", t("set.ops.windWarnMs"), "m/s", t("set.ops.windHint"), 5, 60)}
                    {n("inspectionEveryDays", t("set.ops.inspectionEveryDays"), t("ui.daysUnit"), t("set.ops.inspectionHint"), 1, 60)}
                    {n("rentalReminderDays", t("set.ops.rentalReminderDays"), t("ui.daysUnit"), t("set.ops.reminderHint"), 0, 14)}
                  </div>
                </Card>
                <Card aria-labelledby="o-cost">
                  <CardHead id="o-cost" title={t("set.ops.costs")} sub={t("set.ops.costsSub")} />
                  <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                    {n("crewHourCost", t("set.ops.crewHourCost"), "€/h", "", 0, 500)}
                    {n("truckTripCost", t("set.ops.truckTripCost"), "€", "", 0, 2000)}
                  </div>
                </Card>
              </div>
              <Card aria-labelledby="o-msg" className="xl:col-span-2">
                <CardHead id="o-msg" title={t("set.ops.messages")} />
                <div className="grid gap-5 px-5 pb-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <Field label={t("set.ops.officeEmail")} hint={t("set.ops.officeEmailHint")} error={emailBad ? t("set.badEmail") : null}>
                      {(id, h) => <Input id={id} type="email" value={d.officeEmail} onChange={(v) => setD({ ...d, officeEmail: v })} describedBy={h} placeholder="toimisto@yritys.fi" />}
                    </Field>
                    <Field label={t("set.ops.siteUrl")} hint={t("set.ops.siteUrlHint")} error={urlBad ? t("set.badUrl") : null}>
                      {(id, h) => <Input id={id} type="url" value={d.siteUrl} onChange={(v) => setD({ ...d, siteUrl: v })} describedBy={h} placeholder="https://telinekiito.fi" />}
                    </Field>
                  </div>
                  <fieldset>
                    <legend className="text-[13px] font-semibold text-ink-soft">{t("set.ops.smsEvents")}</legend>
                    <p className="mb-2 text-[12.5px] text-muted">{t("set.ops.smsEventsHint")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SMS_EVENTS.map((ev) => (
                        <Check
                          key={ev}
                          checked={d.smsEvents.includes(ev)}
                          onChange={(v) => setD({ ...d, smsEvents: v ? [...d.smsEvents, ev] : d.smsEvents.filter((x) => x !== ev) })}
                          label={eventLabel(i, ev)}
                        />
                      ))}
                    </div>
                  </fieldset>
                </div>
              </Card>
            </div>
            <SaveBar
              dirty={dirty}
              busy={busy === "save"}
              error={emailBad ? t("set.badEmail") : urlBad ? t("set.badUrl") : numsBad ? t("set.fixNumbers") : null}
              onUndo={() => setD(clone(data.settings))}
              onSave={async () => {
                const r = await run("save", () => saveSettings({ ...pickOps(d), officeEmail: d.officeEmail.trim(), siteUrl: d.siteUrl.trim() }), t("set.saved"), { refresh: false });
                if (r) st.setData(r);
              }}
            />
          </div>
        );
      }}
    </Async>
  );
}

function CompanyTab() {
  const { t, lang } = useT();
  const { st, d, setD } = useOps();
  const { busy, run } = useAct();
  return (
    <Async state={st}>
      {(data) => {
        if (!d) return null;
        const pick = (o: Ops) => ({ company: o.company, paymentDays: o.paymentDays, invoiceNote: o.invoiceNote });
        const dirty = !same(pick(d), pick(data.settings));
        const c = d.company;
        const setC = (p: Partial<Ops["company"]>) => setD({ ...d, company: { ...c, ...p } });
        const daysBad = d.paymentDays == null || d.paymentDays < 0 || d.paymentDays > 90;
        const missing = !c.name || !c.businessId || !c.iban;
        return (
          <div className="space-y-4">
            {missing ? <Callout tone="warn">{t("set.co.missing")}</Callout> : null}
            <Card aria-labelledby="c-co">
              <CardHead id="c-co" title={t("set.co.title")} sub={t("set.co.sub")} />
              <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
                <Field label={t("set.co.name")}>{(id) => <Input id={id} value={c.name} onChange={(v) => setC({ name: v })} maxLength={140} />}</Field>
                <Field label={t("set.co.businessId")}>{(id) => <Input id={id} value={c.businessId} onChange={(v) => setC({ businessId: v })} maxLength={20} placeholder="1234567-8" />}</Field>
                <Field label={t("set.co.address")}>{(id) => <Input id={id} value={c.address} onChange={(v) => setC({ address: v })} maxLength={140} />}</Field>
                <Field label={t("set.co.phone")}>{(id) => <Input id={id} type="tel" value={c.phone} onChange={(v) => setC({ phone: v })} maxLength={40} />}</Field>
                <Field label={t("set.co.email")}>{(id) => <Input id={id} type="email" value={c.email} onChange={(v) => setC({ email: v })} maxLength={140} />}</Field>
                <div />
                <Field label="IBAN">{(id) => <Input id={id} value={c.iban} onChange={(v) => setC({ iban: v.toUpperCase() })} maxLength={40} className="font-mono" placeholder="FI00 0000 0000 0000 00" />}</Field>
                <Field label="BIC">{(id) => <Input id={id} value={c.bic} onChange={(v) => setC({ bic: v.toUpperCase() })} maxLength={11} className="font-mono" />}</Field>
              </div>
            </Card>
            <Card aria-labelledby="c-inv">
              <CardHead id="c-inv" title={t("set.co.invoices")} />
              <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <Field label={t("set.co.paymentDays")} hint={t("set.co.paymentDaysHint")} error={daysBad ? t("set.range", { lo: 0, hi: 90 }) : null}>
                  {(id, h) => <NumInput id={id} lang={lang} value={d.paymentDays} onChange={(v) => setD({ ...d, paymentDays: v as number })} suffix={t("ui.daysUnit")} describedBy={h} />}
                </Field>
                <Field label={t("set.co.note")} hint={t("set.co.noteHint")}>
                  {(id, h) => <TextArea id={id} rows={3} value={d.invoiceNote} onChange={(v) => setD({ ...d, invoiceNote: v })} maxLength={500} describedBy={h} />}
                </Field>
              </div>
            </Card>
            <SaveBar
              dirty={dirty}
              busy={busy === "save"}
              error={daysBad ? t("set.fixNumbers") : null}
              onUndo={() => setD(clone(data.settings))}
              onSave={async () => {
                const r = await run("save", () => saveSettings(pick(d)), t("set.saved"), { refresh: false });
                if (r) st.setData(r);
              }}
            />
          </div>
        );
      }}
    </Async>
  );
}

/* ======================= Message templates ======================= */
const BASE_VARS = ["name", "ref", "total", "date", "time", "crew", "eta", "address", "endDate", "link"];
const EXTRA_VARS: Partial<Record<TemplateEvent, string[]>> = {
  invoice: ["invoiceNo", "due", "reference"],
  change_approved: ["change"],
  change_rejected: ["change", "reason"],
  office_reply: ["text"]
};

function TemplatesTab() {
  const i = useT();
  const { t } = i;
  const st = useLoad(() => Promise.all([getTemplates(), getSettings()]).then(([a, b]) => ({ ...a, smsEvents: b.settings.smsEvents })), []);
  const { busy, run } = useAct();
  const [d, setD] = useState<Templates | null>(null);
  const [ev, setEv] = useState<TemplateEvent>("order_received");
  useEffect(() => {
    if (st.data) setD(clone(st.data.templates));
  }, [st.data]);
  return (
    <Async state={st}>
      {(data) => {
        if (!d) return null;
        const dirty = !same(d, data.templates);
        const vars = [...BASE_VARS, ...(EXTRA_VARS[ev] || [])];
        const smsOn = data.smsEvents.includes(ev);
        const set = (l: "fi" | "en", part: "subject" | "body" | "sms", v: string) => setD({ ...d, [ev]: { ...d[ev], [l]: { ...d[ev][l], [part]: v } } });
        return (
          <div>
            <Callout tone="info" className="mb-4">
              {t("set.tpl.intro")}
            </Callout>
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <nav aria-label={t("set.tpl.events")}>
                <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {data.events.map((e) => {
                    const changed = !same(d[e], data.templates[e]);
                    return (
                      <li key={e} className="shrink-0">
                        <button
                          type="button"
                          aria-current={e === ev ? "true" : undefined}
                          onClick={() => setEv(e)}
                          className={cx("flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold whitespace-nowrap", e === ev ? "bg-ink text-white" : "text-ink-soft hover:bg-white hover:text-ink")}
                        >
                          {eventLabel(i, e)}
                          {changed ? <span aria-label={t("set.tpl.edited")} className="h-2 w-2 rounded-full bg-sun" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="min-w-0 space-y-4">
                <Card aria-labelledby="tpl-head">
                  <CardHead
                    id="tpl-head"
                    title={eventLabel(i, ev)}
                    sub={t(`set.tpl.when.${ev}`)}
                    actions={<Badge tone={smsOn ? "green" : "gray"}>{smsOn ? t("set.tpl.smsOn") : t("set.tpl.smsOff")}</Badge>}
                  />
                  <div className="px-5 pb-4">
                    <p className="text-[12.5px] font-semibold text-ink-soft">{t("set.tpl.vars")}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {vars.map((v) => (
                        <li key={v} title={i.tk(`set.var.${v}`)} className="rounded-lg bg-mist px-2 py-1 text-[12px] ring-1 ring-line">
                          <code className="font-mono font-semibold text-ink">{`{${v}}`}</code> <span className="text-muted">{i.tk(`set.var.${v}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
                <div className="grid gap-4 2xl:grid-cols-2">
                  {(["fi", "en"] as const).map((l) => (
                    <Card key={l} aria-label={l === "fi" ? "Suomi" : "English"}>
                      <CardHead title={l === "fi" ? t("set.tpl.fi") : t("set.tpl.en")} />
                      <div className="space-y-3 px-5 pb-5">
                        <Field label={t("set.tpl.subject")}>{(id) => <Input id={id} value={d[ev][l].subject} onChange={(v) => set(l, "subject", v)} maxLength={400} />}</Field>
                        <Field label={t("set.tpl.body")}>{(id) => <TextArea id={id} rows={9} value={d[ev][l].body} onChange={(v) => set(l, "body", v)} maxLength={4000} className="font-mono !text-[13px]" />}</Field>
                        <Field label={t("set.tpl.sms")} hint={t("set.tpl.smsCount", { n: d[ev][l].sms.length })}>
                          {(id, h) => <TextArea id={id} rows={3} value={d[ev][l].sms} onChange={(v) => set(l, "sms", v)} maxLength={400} describedBy={h} className="font-mono !text-[13px]" />}
                        </Field>
                      </div>
                    </Card>
                  ))}
                </div>
                <p className="text-[12.5px] text-muted">{t("set.tpl.emptyDefault")}</p>
              </div>
            </div>
            <SaveBar
              dirty={dirty}
              busy={busy === "save"}
              onUndo={() => setD(clone(data.templates))}
              onSave={async () => {
                const r = await run("save", () => saveTemplates(d), t("set.tpl.saved"), { refresh: false });
                if (r) st.setData({ ...data, templates: r.templates });
              }}
            />
          </div>
        );
      }}
    </Async>
  );
}

/* ======================= Website content ======================= */
type FaqItem = NonNullable<Content["faq"]>[number];
type ContactC = NonNullable<Content["contact"]>;
const emptyContact: ContactC = { phone: "", email: "", hours: { fi: "", en: "" }, area: { fi: "", en: "" } };

function WebsiteTab() {
  const { t } = useT();
  const st = useLoad(getContent, []);
  const { busy, run } = useAct();
  const [faq, setFaq] = useState<FaqItem[] | null>(null);
  const [contact, setContact] = useState<ContactC>(emptyContact);
  const reset = (c: Content) => {
    setFaq(c.faq ? clone(c.faq) : null);
    setContact(c.contact ? clone(c.contact) : clone(emptyContact));
  };
  useEffect(() => {
    if (st.data) reset(st.data.content);
  }, [st.data]);
  const saved = st.data?.content;
  const contactEmpty = !contact.phone && !contact.email && !contact.hours.fi && !contact.hours.en && !contact.area.fi && !contact.area.en;
  const current: Content = useMemo(() => ({ faq: faq && faq.length ? faq : null, contact: contactEmpty ? null : contact }), [faq, contact, contactEmpty]);
  const norm = (c?: Content) => (c ? { faq: c.faq, contact: c.contact && (c.contact.phone || c.contact.email || c.contact.hours.fi || c.contact.hours.en || c.contact.area.fi || c.contact.area.en) ? c.contact : null } : null);
  const dirty = !!saved && !same(norm(current), norm(saved));
  const move = (k: number, dir: -1 | 1) => {
    if (!faq) return;
    const n = [...faq];
    const j = k + dir;
    if (j < 0 || j >= n.length) return;
    [n[k], n[j]] = [n[j], n[k]];
    setFaq(n);
  };
  const upd = (k: number, part: "q" | "a", l: "fi" | "en", v: string) => setFaq((f) => (f ? f.map((x, idx) => (idx === k ? { ...x, [part]: { ...x[part], [l]: v } } : x)) : f));
  const blankQ = (): FaqItem => ({ q: { fi: "", en: "" }, a: { fi: "", en: "" } });
  return (
    <Async state={st}>
      {(data) => (
        <div className="space-y-4">
          <Card aria-labelledby="w-faq">
            <CardHead
              id="w-faq"
              title={t("set.web.faq")}
              sub={faq ? t("set.web.faqCount", { n: faq.length }) : t("set.web.faqDefault")}
              actions={
                faq ? (
                  <Btn size="sm" variant="ghost" onClick={() => setFaq(null)}>
                    {t("set.web.useDefaults")}
                  </Btn>
                ) : null
              }
            />
            <div className="px-5 pb-5">
              {!faq ? (
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-[14px] text-ink-soft">{t("set.web.faqDefaultText", { n: SITE_FAQ.length })}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn size="sm" variant="dark" onClick={() => setFaq(clone(SITE_FAQ))}>
                      {t("set.web.editDefaults")}
                    </Btn>
                    <Btn size="sm" variant="light" onClick={() => setFaq([blankQ()])}>
                      {t("set.web.startEmpty")}
                    </Btn>
                  </div>
                </div>
              ) : (
                <ol className="space-y-3">
                  {faq.map((f, k) => (
                    <li key={k} className="rounded-2xl ring-1 ring-line">
                      <div className="flex items-center justify-between gap-2 border-b border-line bg-mist/50 px-4 py-2">
                        <p className="text-[13px] font-semibold text-ink">{t("set.web.question", { n: k + 1 })}</p>
                        <div className="flex gap-1">
                          <IconBtn label={t("set.web.up", { n: k + 1 })} tone="quiet" onClick={() => move(k, -1)} disabled={k === 0}>
                            <IUp className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn label={t("set.web.down", { n: k + 1 })} tone="quiet" onClick={() => move(k, 1)} disabled={k === faq.length - 1}>
                            <IDown className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn label={t("set.web.remove", { n: k + 1 })} tone="quiet" onClick={() => setFaq(faq.filter((_, idx) => idx !== k))}>
                            <ITrash className="h-4 w-4" />
                          </IconBtn>
                        </div>
                      </div>
                      <div className="grid gap-3 p-4 lg:grid-cols-2">
                        {(["fi", "en"] as const).map((l) => (
                          <div key={l} className="space-y-2">
                            <Field label={t(l === "fi" ? "set.web.qFi" : "set.web.qEn")}>{(id) => <Input id={id} value={f.q[l]} onChange={(v) => upd(k, "q", l, v)} maxLength={200} />}</Field>
                            <Field label={t(l === "fi" ? "set.web.aFi" : "set.web.aEn")}>{(id) => <TextArea id={id} rows={3} value={f.a[l]} onChange={(v) => upd(k, "a", l, v)} maxLength={2000} />}</Field>
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {faq ? (
                <Btn size="sm" variant="light" className="mt-3" icon={<IconPlus className="h-4 w-4" />} onClick={() => setFaq([...faq, blankQ()])} disabled={faq.length >= 30}>
                  {t("set.web.add")}
                </Btn>
              ) : null}
            </div>
          </Card>
          <Card aria-labelledby="w-contact">
            <CardHead id="w-contact" title={t("set.web.contact")} sub={t("set.web.contactSub")} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label={t("set.web.phone")}>{(id) => <Input id={id} type="tel" value={contact.phone} onChange={(v) => setContact({ ...contact, phone: v })} placeholder={SITE.phone} />}</Field>
              <Field label={t("set.web.email")}>{(id) => <Input id={id} type="email" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} placeholder={SITE.email} />}</Field>
              <Field label={t("set.web.hoursFi")}>{(id) => <Input id={id} value={contact.hours.fi} onChange={(v) => setContact({ ...contact, hours: { ...contact.hours, fi: v } })} placeholder="Ma–pe 7–17 · kiirekohteet 24/7" />}</Field>
              <Field label={t("set.web.hoursEn")}>{(id) => <Input id={id} value={contact.hours.en} onChange={(v) => setContact({ ...contact, hours: { ...contact.hours, en: v } })} placeholder="Mon–Fri 7–17 · emergencies 24/7" />}</Field>
              <Field label={t("set.web.areaFi")}>{(id) => <Input id={id} value={contact.area.fi} onChange={(v) => setContact({ ...contact, area: { ...contact.area, fi: v } })} placeholder="Koko Suomi – nopeimmin Uudellamaalla" />}</Field>
              <Field label={t("set.web.areaEn")}>{(id) => <Input id={id} value={contact.area.en} onChange={(v) => setContact({ ...contact, area: { ...contact.area, en: v } })} placeholder="Across Finland – fastest in Uusimaa" />}</Field>
            </div>
          </Card>
          <SaveBar
            dirty={dirty}
            busy={busy === "save"}
            error={faq && faq.some((f) => !f.q.fi.trim() && !f.q.en.trim()) ? t("set.web.emptyQ") : null}
            onUndo={() => reset(data.content)}
            onSave={async () => {
              const r = await run("save", () => saveContent(current), t("set.web.saved"), { refresh: false });
              if (r) st.setData({ content: r.content });
            }}
          />
        </div>
      )}
    </Async>
  );
}

/* ======================= Messaging (email and SMS connection) ======================= */
function MessagingTab() {
  const { t } = useT();
  const { nav } = useOffice();
  const st = useLoad(getSettings, []);
  return (
    <Async state={st}>
      {(d) => {
        const m = d.messaging;
        return (
          <div className="space-y-4">
            <MessagingStatus s={m} />
            <div className="grid gap-4 xl:grid-cols-2">
              <Card aria-labelledby="m-email">
                <CardHead id="m-email" title={t("set.msg.emailTitle")} sub={t("set.msg.emailSub")} />
                <div className="px-5 pb-5">
                  <pre className="overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/90">
                    {`SMTP_HOST=smtp.example.com\nSMTP_PORT=587\nSMTP_USER=…\nSMTP_PASS=…\nMAIL_FROM=tilaukset@yritys.fi\nMAIL_FROM_NAME=TelineKiito`}
                  </pre>
                </div>
              </Card>
              <Card aria-labelledby="m-sms">
                <CardHead id="m-sms" title={t("set.msg.smsTitle")} sub={t("set.msg.smsSub")} />
                <div className="space-y-2 px-5 pb-5">
                  <pre className="overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/90">{`SMS_PROVIDER=twilio\nTWILIO_SID=…\nTWILIO_TOKEN=…\nSMS_FROM=+358…`}</pre>
                  <p className="text-[12.5px] text-muted">{t("set.msg.or")}</p>
                  <pre className="overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/90">{`SMS_PROVIDER=bulkgate\nBULKGATE_APP_ID=…\nBULKGATE_APP_TOKEN=…\nSMS_FROM=TelineKiito`}</pre>
                </div>
              </Card>
            </div>
            <Callout tone="info" title={t("set.msg.howTitle")}>
              <p>{t("set.msg.how")}</p>
              <p className="mt-1">{m.siteUrl ? t("set.msg.links", { url: m.siteUrl }) : t("set.msg.noLinks")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn size="xs" variant="light" onClick={() => nav("messages", { tab: "outbox" })}>
                  {t("set.msg.toOutbox", { n: m.waiting + m.failed })}
                </Btn>
                <Btn size="xs" variant="light" onClick={() => nav("settings", { tab: "ops" })}>
                  {t("set.msg.toOps")}
                </Btn>
              </div>
            </Callout>
          </div>
        );
      }}
    </Async>
  );
}

export function Settings() {
  const { t } = useT();
  const { route, setParams } = useOffice();
  const tab = (TABS as string[]).includes(route.params.tab) ? (route.params.tab as Tab) : "prices";
  return (
    <div>
      <Tabs className="mb-4" label={t("nav.settings")} value={tab} onChange={(k) => setParams({ tab: k === "prices" ? null : k })} tabs={TABS.map((k) => ({ key: k, label: t(`set.tab.${k}`) }))} />
      {tab === "prices" ? <PricesTab /> : null}
      {tab === "ops" ? <OpsTab /> : null}
      {tab === "company" ? <CompanyTab /> : null}
      {tab === "templates" ? <TemplatesTab /> : null}
      {tab === "website" ? <WebsiteTab /> : null}
      {tab === "messaging" ? <MessagingTab /> : null}
    </div>
  );
}
