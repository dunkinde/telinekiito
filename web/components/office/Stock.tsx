"use client";
// Stock: parts owned, out on sites and reserved; free quantity over the next 60 days; purchases and write-offs.
import { Fragment, useEffect, useMemo, useState } from "react";
import { PART_KEYS, systemOfPart, getStock, saveStock, stockMove, type PartKey, type Parts, type StockOverview } from "@/lib/platform";
import { useAct, useLoad, useOffice, useT } from "./context";
import { dateTime, day, dayMonth, money, number } from "./format";
import { partLabel, statusLabel } from "./i18n";
import { IconPlus } from "../ui/Icons";
import { IEdit, IStock } from "./icons";
import { Line, Legend, SERIES } from "./charts";
import { RefLink } from "./bits";
import { Async, Badge, Btn, Callout, Card, CardHead, Field, Input, NumInput, Select, Switch, TableWrap, cx, td, th } from "./ui";

const sum = (p: Parts) => PART_KEYS.reduce((s, k) => s + (p[k] || 0), 0);

export function Stock() {
  const st = useLoad(getStock, [], { poll: true });
  return <Async state={st}>{(d) => <StockBody d={d} set={(n) => st.setData(n)} />}</Async>;
}

function StockBody({ d, set }: { d: StockOverview; set: (d: StockOverview) => void }) {
  const i = useT();
  const { t, lang } = i;
  const { owner } = useOffice();
  const [part, setPart] = useState<PartKey>(() => d.parts.find((p) => p.low)?.key || "frames");
  const sel = d.parts.find((p) => p.key === part)!;
  const series = d.days.map((x, k) => ({ x, y: d.free[k]?.[part] ?? 0 }));
  const lowLine = sel.owned ? Math.round((sel.owned * d.lowWarnPct) / 100) : null;
  const lowParts = d.parts.filter((p) => p.low);
  const negative = d.parts.filter((p) => p.minFree < 0);

  return (
    <div className="space-y-4 lg:space-y-5">
      <CheckingCard d={d} set={set} />
      {negative.length ? (
        <Callout tone="danger" title={t("stock.overbooked")}>
          {negative.map((p) => `${partLabel(i, p.key)} (${t("stock.shortOn", { n: -p.minFree, date: day(p.minFreeOn, lang) })})`).join(" · ")}
        </Callout>
      ) : lowParts.length ? (
        <Callout tone="warn" title={t("stock.lowTitle", { n: lowParts.length })}>
          {lowParts.map((p) => partLabel(i, p.key)).join(", ")}
        </Callout>
      ) : null}

      <PartsTable d={d} set={set} part={part} setPart={setPart} />

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card aria-labelledby="stock-chart">
          <CardHead
            id="stock-chart"
            title={t("stock.chart")}
            sub={t("stock.chartSub")}
            actions={
              <div className="flex min-w-0 max-w-full items-center gap-2">
                <label htmlFor="stock-part" className="sr-only">
                  {t("stock.part")}
                </label>
                <Select id="stock-part" className="!w-auto max-w-[16rem] !py-2 sm:max-w-none" value={part} onChange={(v) => setPart(v as PartKey)} options={d.parts.map((p) => ({ value: p.key, label: partLabel(i, p.key) }))} />
              </div>
            }
          />
          <div className="px-4 pb-4">
            <Legend
              className="mb-2 pl-1"
              items={[{ name: t("stock.free"), color: SERIES[0] }, ...(lowLine != null ? [{ name: t("stock.lowLine", { pct: d.lowWarnPct }), color: "#e5484d", dashed: true }] : [])]}
            />
            <Line
              label={t("stock.chartLabel", { part: partLabel(i, part) })}
              points={series}
              threshold={lowLine}
              seriesName={t("stock.free")}
              fmt={(v) => number(v, lang, 0)}
              dayFmt={(x) => day(x, lang)}
              tickFmt={(x) => dayMonth(x, lang)}
            />
            <p className="mt-2 text-[13px] text-ink-soft">
              {sel.owned
                ? t("stock.chartSummary", { part: partLabel(i, part), owned: sel.owned, min: sel.minFree, date: day(sel.minFreeOn, lang) })
                : t("stock.chartNoOwned")}
            </p>
          </div>
        </Card>
        <Holders d={d} />
      </div>

      <Moves d={d} set={set} canEdit={owner} />
    </div>
  );
}

function CheckingCard({ d, set }: { d: StockOverview; set: (d: StockOverview) => void }) {
  const { t, lang } = useT();
  const { owner } = useOffice();
  const { busy, run } = useAct();
  const [buffer, setBuffer] = useState<number | null>(d.bufferDays);
  const [warn, setWarn] = useState<number | null>(d.lowWarnPct);
  useEffect(() => {
    setBuffer(d.bufferDays);
    setWarn(d.lowWarnPct);
  }, [d.bufferDays, d.lowWarnPct]);
  const dirty = buffer !== d.bufferDays || warn !== d.lowWarnPct;
  async function toggle(on: boolean) {
    const r = await run("toggle", () => saveStock({ enabled: on }), on ? t("stock.onDone") : t("stock.offDone"), { refresh: false });
    if (r) set(r);
  }
  async function saveRules() {
    const r = await run("rules", () => saveStock({ bufferDays: buffer ?? d.bufferDays, lowWarnPct: warn ?? d.lowWarnPct }), t("ui.saved"), { refresh: false });
    if (r) set(r);
  }
  return (
    <Card aria-labelledby="stock-check" className={cx(!d.enabled && "ring-[#f3dc8a]")}>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 id="stock-check" className="sr-only">
            {t("stock.checking")}
          </h2>
          {owner ? (
            <Switch checked={d.enabled} onChange={toggle} disabled={busy === "toggle"} label={t("stock.checking")} hint={t("stock.checkingHint")} />
          ) : (
            <div>
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                {t("stock.checking")}
                <Badge tone={d.enabled ? "green" : "sun"} dot>
                  {d.enabled ? t("stock.on") : t("stock.off")}
                </Badge>
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">{t("stock.checkingHint")}</p>
            </div>
          )}
          {!d.enabled ? (
            <Callout tone="warn" className="mt-3" title={t("stock.offTitle")}>
              {t("stock.offText")}
            </Callout>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("stock.buffer")} hint={t("stock.bufferHint")}>
            {(id, h) => <NumInput id={id} lang={lang} value={buffer} onChange={setBuffer} suffix={t("ui.daysUnit")} describedBy={h} disabled={!owner} />}
          </Field>
          <Field label={t("stock.lowWarn")} hint={t("stock.lowWarnHint")}>
            {(id, h) => <NumInput id={id} lang={lang} value={warn} onChange={setWarn} suffix="%" describedBy={h} disabled={!owner} />}
          </Field>
          {owner && dirty ? (
            <div className="col-span-2 flex justify-end">
              <Btn size="sm" variant="dark" busy={busy === "rules"} onClick={saveRules}>
                {t("ui.save")}
              </Btn>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function PartsTable({ d, set, part, setPart }: { d: StockOverview; set: (d: StockOverview) => void; part: PartKey; setPart: (k: PartKey) => void }) {
  const i = useT();
  const { t, lang } = i;
  const { owner } = useOffice();
  const { busy, run } = useAct();
  const [edit, setEdit] = useState(false);
  const [owned, setOwned] = useState<Record<string, number | null>>({});
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  function start() {
    setOwned(Object.fromEntries(d.parts.map((p) => [p.key, p.owned])));
    setPrices(Object.fromEntries(d.parts.map((p) => [p.key, p.price])));
    setEdit(true);
  }
  async function save() {
    const o: Parts = {}, pr: Parts = {};
    for (const p of d.parts) {
      const a = owned[p.key], b = prices[p.key];
      if (a != null && a >= 0) o[p.key] = Math.round(a);
      if (b != null && b >= 0) pr[p.key] = b;
    }
    const r = await run("save", () => saveStock({ owned: o, prices: pr }), t("stock.saved"), { refresh: false });
    if (r) {
      set(r);
      setEdit(false);
    }
  }
  const totalValue = d.parts.reduce((s, p) => s + p.owned * p.price, 0);
  return (
    <Card aria-labelledby="stock-parts">
      <CardHead
        id="stock-parts"
        title={t("stock.parts")}
        sub={owner && totalValue ? t("stock.value", { v: money(totalValue, lang, 0) }) : t("stock.partsSub")}
        actions={
          owner ? (
            edit ? (
              <>
                <Btn size="sm" variant="quiet" onClick={() => setEdit(false)}>
                  {t("ui.cancel")}
                </Btn>
                <Btn size="sm" variant="dark" onClick={save} busy={busy === "save"}>
                  {t("ui.save")}
                </Btn>
              </>
            ) : (
              <Btn size="sm" variant="light" icon={<IEdit className="h-4 w-4" />} onClick={start}>
                {t("stock.edit")}
              </Btn>
            )
          ) : null
        }
      />
      <TableWrap>
        <table className="w-full min-w-[860px] border-collapse">
          <caption className="sr-only">{t("stock.parts")}</caption>
          <thead>
            <tr className="border-y border-line bg-mist/50">
              <th scope="col" className={th}>
                {t("stock.col.part")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("stock.col.owned")}
              </th>
              {edit ? (
                <th scope="col" className={cx(th, "text-right")}>
                  {t("stock.col.price")}
                </th>
              ) : null}
              <th scope="col" className={cx(th, "text-right")}>
                {t("stock.col.onSite")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("stock.col.reserved")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("stock.col.freeToday")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("stock.col.min")}
              </th>
              <th scope="col" className={th}>
                <span className="sr-only">{t("stock.col.state")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.parts.map((p, n) => {
              const on = p.key === part;
              const sys = systemOfPart(p.key);
              const head = n === 0 || systemOfPart(d.parts[n - 1].key) !== sys;
              return (
                <Fragment key={p.key}>
                {head ? (
                  <tr className="border-b border-line bg-mist/60">
                    <th scope="colgroup" colSpan={99} className="px-3 py-2 text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
                      {t(`stock.sys.${sys}`)}
                    </th>
                  </tr>
                ) : null}
                <tr key={p.key} className={cx("border-b border-line last:border-0", on && "bg-sun-soft/40")}>
                  <th scope="row" className={cx(td, "text-left font-normal")}>
                    <button type="button" onClick={() => setPart(p.key)} aria-pressed={on} className="text-left font-semibold text-ink hover:underline" title={t("stock.showChart")}>
                      {partLabel(i, p.key)}
                    </button>
                    {!edit && owner && p.price ? <span className="block text-[12px] text-muted">{t("stock.replacement", { v: money(p.price, lang) })}</span> : null}
                  </th>
                  <td className={cx(td, "text-right tabular-nums")}>
                    {edit ? (
                      <NumInput lang={lang} value={owned[p.key] ?? null} onChange={(v) => setOwned((s) => ({ ...s, [p.key]: v }))} className="ml-auto w-24" aria-label={t("stock.ownedOf", { part: partLabel(i, p.key) })} />
                    ) : (
                      number(p.owned, lang, 0)
                    )}
                  </td>
                  {edit ? (
                    <td className={cx(td, "text-right")}>
                      <NumInput lang={lang} value={prices[p.key] ?? null} onChange={(v) => setPrices((s) => ({ ...s, [p.key]: v }))} suffix="€" className="ml-auto w-28" aria-label={t("stock.priceOf", { part: partLabel(i, p.key) })} />
                    </td>
                  ) : null}
                  <td className={cx(td, "text-right tabular-nums")}>{number(p.onSite, lang, 0)}</td>
                  <td className={cx(td, "text-right tabular-nums")}>{number(p.reserved, lang, 0)}</td>
                  <td className={cx(td, "text-right font-semibold tabular-nums", p.freeToday < 0 && "text-[#b42318]")}>{number(p.freeToday, lang, 0)}</td>
                  <td className={cx(td, "text-right tabular-nums", p.minFree < 0 ? "font-bold text-[#b42318]" : p.low ? "font-semibold text-[#a4470a]" : "")}>
                    {number(p.minFree, lang, 0)}
                    <span className="block text-[12px] font-normal text-muted">{day(p.minFreeOn, lang)}</span>
                  </td>
                  <td className={td}>
                    {p.minFree < 0 ? (
                      <Badge tone="red" dot>
                        {t("stock.short")}
                      </Badge>
                    ) : p.low ? (
                      <Badge tone="orange" dot>
                        {t("stock.low")}
                      </Badge>
                    ) : p.owned ? (
                      <Badge tone="green" dot>
                        {t("stock.ok")}
                      </Badge>
                    ) : (
                      <Badge tone="gray">{t("stock.notSet")}</Badge>
                    )}
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {edit ? <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">{t("stock.editHint")}</p> : null}
    </Card>
  );
}

function Holders({ d }: { d: StockOverview }) {
  const i = useT();
  const { t, lang } = i;
  return (
    <Card aria-labelledby="stock-holders">
      <CardHead id="stock-holders" title={t("stock.holders")} sub={t("stock.holdersSub")} />
      {d.holders.length ? (
        <ul className="max-h-[360px] divide-y divide-line overflow-y-auto border-t border-line">
          {d.holders.map((h) => (
            <li key={h.ref} className="flex items-start gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <RefLink refNo={h.ref} />
                  <Badge tone={h.onSite ? "green" : "blue"} dot>
                    {h.onSite ? t("stock.atSite") : t("stock.booked")}
                  </Badge>
                </p>
                <p className="truncate text-[13px] text-ink-soft">{h.address}</p>
                <p className="text-[12px] text-muted">
                  {statusLabel(i, h.status)} · {dayMonth(h.from, lang)} – {day(h.to, lang)}
                </p>
              </div>
              <p className="shrink-0 text-right text-[13px] font-semibold text-ink tabular-nums">{t("ui.pcs", { n: sum(h.parts) })}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-[13.5px] text-muted">{t("stock.noHolders")}</p>
      )}
    </Card>
  );
}

type MoveKind = "purchase" | "writeoff" | "correction";
function Moves({ d, set, canEdit }: { d: StockOverview; set: (d: StockOverview) => void; canEdit: boolean }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MoveKind>("purchase");
  const [part, setPart] = useState<PartKey>("frames");
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const delta = qty == null ? 0 : kind === "purchase" ? Math.abs(qty) : kind === "writeoff" ? -Math.abs(qty) : qty;
  const cur = d.parts.find((p) => p.key === part)?.owned ?? 0;
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!delta) return;
    const why = reason.trim() || t(`stock.kind.${kind}`);
    const r = await run("move", () => stockMove(part, Math.round(delta), why, ref.trim().toUpperCase() || undefined), t("stock.moveDone"), { refresh: false });
    if (r) {
      set(r);
      setQty(null);
      setReason("");
      setRef("");
      setOpen(false);
    }
  }
  const list = useMemo(() => d.moves.slice(0, 100), [d.moves]);
  return (
    <Card aria-labelledby="stock-moves">
      <CardHead
        id="stock-moves"
        title={t("stock.moves")}
        sub={t("stock.movesSub")}
        actions={
          canEdit && !open ? (
            <Btn size="sm" variant="primary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
              {t("stock.addMove")}
            </Btn>
          ) : null
        }
      />
      {open ? (
        <form onSubmit={add} className="mx-5 mb-4 grid gap-3 rounded-2xl bg-mist p-4 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-[180px_minmax(0,1.3fr)_130px_minmax(0,1.5fr)_140px_auto] lg:items-end">
          <Field label={t("stock.kind")}>
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(v) => setKind(v as MoveKind)}
                options={(["purchase", "writeoff", "correction"] as MoveKind[]).map((k) => ({ value: k, label: t(`stock.kind.${k}`) }))}
              />
            )}
          </Field>
          <Field label={t("stock.part")}>{(id) => <Select id={id} value={part} onChange={(v) => setPart(v as PartKey)} options={PART_KEYS.map((k) => ({ value: k, label: partLabel(i, k) }))} />}</Field>
          <Field label={kind === "correction" ? t("stock.qtySigned") : t("stock.qty")}>{(id) => <NumInput id={id} lang={lang} value={qty} onChange={setQty} suffix={t("ui.pcsUnit")} />}</Field>
          <Field label={t("stock.reason")} optional>
            {(id) => <Input id={id} value={reason} onChange={setReason} maxLength={200} placeholder={t(`stock.reasonPh.${kind}`)} />}
          </Field>
          <Field label={t("stock.ref")} optional>
            {(id) => <Input id={id} value={ref} onChange={setRef} maxLength={12} placeholder="TK-…" />}
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Btn variant="quiet" size="sm" onClick={() => setOpen(false)}>
              {t("ui.cancel")}
            </Btn>
            <Btn type="submit" variant="dark" size="sm" busy={busy === "move"} disabled={!delta}>
              {t("stock.addBtn")}
            </Btn>
          </div>
          {delta ? (
            <p className="text-[12.5px] text-ink-soft sm:col-span-2 lg:col-span-6">
              {t("stock.preview", { part: partLabel(i, part), from: cur, to: Math.max(0, cur + Math.round(delta)) })}
            </p>
          ) : null}
        </form>
      ) : null}
      {list.length ? (
        <TableWrap>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-y border-line bg-mist/50">
                <th scope="col" className={th}>
                  {t("stock.col.when")}
                </th>
                <th scope="col" className={th}>
                  {t("stock.col.part")}
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  {t("stock.col.change")}
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  {t("stock.col.after")}
                </th>
                <th scope="col" className={th}>
                  {t("stock.col.reason")}
                </th>
                <th scope="col" className={th}>
                  {t("stock.col.by")}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className={cx(td, "text-[13px] whitespace-nowrap text-ink-soft")}>{dateTime(m.createdAt, lang)}</td>
                  <td className={td}>{partLabel(i, m.part)}</td>
                  <td className={cx(td, "text-right font-semibold tabular-nums", m.delta > 0 ? "text-[#17663a]" : "text-[#b42318]")}>
                    {m.delta > 0 ? "+" : "−"}
                    {number(Math.abs(m.delta), lang, 0)}
                  </td>
                  <td className={cx(td, "text-right tabular-nums")}>{number(m.after, lang, 0)}</td>
                  <td className={td}>
                    {m.reason || "–"}
                    {m.ref ? (
                      <>
                        {" · "}
                        <RefLink refNo={m.ref} />
                      </>
                    ) : null}
                  </td>
                  <td className={cx(td, "text-[13px] text-muted")}>{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <div className="flex items-center gap-3 px-5 pb-5 text-[13.5px] text-muted">
          <IStock className="h-5 w-5" />
          {t("stock.noMoves")}
        </div>
      )}
    </Card>
  );
}
