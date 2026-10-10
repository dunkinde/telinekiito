"use client";
// Sales funnel ("Myyntisuppilo"): anonymous visit counts per calculator step, with sources, zones, jobs and weather options.
import { useState } from "react";
import { getFunnel, type Funnel } from "@/lib/platform";
import { Bars, SERIES } from "./charts";
import { useLoad, useT } from "./context";
import { number } from "./format";
import { IReports } from "./icons";
import { Async, Card, CardHead, Empty, Input, Select, TableWrap, cx, td, th } from "./ui";

const PRESETS = ["7", "30", "90", "custom"] as const;
type Preset = (typeof PRESETS)[number];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBack = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

export function FunnelReport() {
  const { t, lang } = useT();
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState({ from: daysBack(29), to: iso(new Date()) });
  const from = preset === "custom" ? custom.from : daysBack(Number(preset) - 1);
  const to = preset === "custom" ? custom.to : iso(new Date());
  const st = useLoad(() => getFunnel(from, to), [from, to], { poll: true });
  const pct = (v: number | null) => (v == null ? "–" : `${number(v, lang, 1)} %`);
  const n = (v: number) => number(v, lang, 0);
  const right = cx(td, "text-right tabular-nums");
  const headR = cx(th, "text-right");

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label={t("fun.period")} className="w-auto" value={preset} onChange={(v) => setPreset(v as Preset)} options={PRESETS.map((p) => ({ value: p, label: t(`fun.preset.${p}`) }))} />
        {preset === "custom" ? (
          <>
            <Input aria-label={t("fun.from")} type="date" className="w-auto" value={custom.from} onChange={(v) => v && setCustom((c) => ({ ...c, from: v }))} />
            <Input aria-label={t("fun.to")} type="date" className="w-auto" value={custom.to} onChange={(v) => v && setCustom((c) => ({ ...c, to: v }))} />
          </>
        ) : null}
      </div>

      <Async state={st}>
        {(d: Funnel) => {
          const opened = d.steps[0]?.visits || 0;
          const orders = d.steps[d.steps.length - 1]?.visits || 0;
          return (
            <>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                {[
                  { k: t("fun.ev.calculator_opened"), v: n(opened) },
                  { k: t("fun.ev.order_placed"), v: n(orders), s: t("fun.ofOpened", { p: pct(d.steps[d.steps.length - 1]?.ofStart ?? null) }) },
                  { k: t("fun.ev.model_found"), v: n(d.side.model_found), s: t("fun.view3d", { n: n(d.side.view_3d_opened) }) },
                  { k: t("fun.ev.tracking_opened"), v: n(d.side.tracking_opened) }
                ].map((x) => (
                  <div key={x.k} className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-line">
                    <p className="text-[12.5px] font-semibold text-muted">{x.k}</p>
                    <p className="mt-1 font-display text-[24px] leading-none font-extrabold text-ink tabular-nums">{x.v}</p>
                    {x.s ? <p className="mt-1.5 text-[12.5px] text-muted">{x.s}</p> : null}
                  </div>
                ))}
              </div>

              <Card aria-labelledby="fun-steps">
                <CardHead id="fun-steps" title={t("fun.steps")} sub={t("fun.stepsSub", { from: d.from, to: d.to })} />
                {opened ? (
                  <>
                    <div className="px-5 pb-2">
                      <Bars
                        label={t("fun.steps")}
                        series={[{ name: t("fun.visits"), color: SERIES[0] }]}
                        groups={d.steps.map((s, k) => ({ label: String(k + 1), title: t(`fun.ev.${s.event}`), values: [s.visits] }))}
                        fmt={n}
                      />
                    </div>
                    <TableWrap>
                      <table className="w-full min-w-[560px] border-collapse">
                        <caption className="sr-only">{t("fun.steps")}</caption>
                        <thead>
                          <tr className="border-y border-line bg-mist/50">
                            <th scope="col" className={th}>{t("fun.col.step")}</th>
                            <th scope="col" className={headR}>{t("fun.visits")}</th>
                            <th scope="col" className={headR}>{t("fun.col.ofPrev")}</th>
                            <th scope="col" className={headR}>{t("fun.col.ofStart")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.steps.map((s, k) => (
                            <tr key={s.event} className="border-b border-line last:border-0">
                              <td className={td}>
                                <span className="mr-2 text-muted tabular-nums">{k + 1}.</span>
                                {t(`fun.ev.${s.event}`)}
                              </td>
                              <td className={right}>{n(s.visits)}</td>
                              <td className={right}>{k ? pct(s.ofPrev) : "–"}</td>
                              <td className={right}>{pct(s.ofStart)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  </>
                ) : (
                  <Empty icon={<IReports className="h-6 w-6" />} title={t("fun.none")} text={t("fun.noneText")} />
                )}
                <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">{t("fun.note")}</p>
              </Card>

              <Card aria-labelledby="fun-sources">
                <CardHead id="fun-sources" title={t("fun.bySource")} sub={t("fun.bySourceSub")} />
                {d.bySource.length ? (
                  <TableWrap>
                    <table className="w-full min-w-[640px] border-collapse">
                      <caption className="sr-only">{t("fun.bySource")}</caption>
                      <thead>
                        <tr className="border-y border-line bg-mist/50">
                          <th scope="col" className={th}>{t("fun.col.source")}</th>
                          <th scope="col" className={th}>{t("fun.col.campaign")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.calculator_opened")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.price_shown")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.order_placed")}</th>
                          <th scope="col" className={headR}>{t("fun.col.conv")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.bySource.map((s) => (
                          <tr key={`${s.kind}|${s.source}|${s.campaign}`} className="border-b border-line last:border-0">
                            <td className={td}>
                              {s.kind === "direct" ? t("fun.direct") : s.source}
                              {s.kind === "referrer" ? <span className="ml-1.5 text-[12.5px] text-muted">{t("fun.referrer")}</span> : null}
                            </td>
                            <td className={cx(td, "text-muted")}>{s.campaign || "–"}</td>
                            <td className={right}>{n(s.opened)}</td>
                            <td className={right}>{n(s.quotes)}</td>
                            <td className={right}>{n(s.orders)}</td>
                            <td className={cx(right, "font-semibold")}>{pct(s.conv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                ) : (
                  <p className="px-5 pb-5 text-[13px] text-muted">{t("fun.none")}</p>
                )}
              </Card>

              <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
                <Card aria-labelledby="fun-zones">
                  <CardHead id="fun-zones" title={t("fun.byZone")} sub={t("fun.byZoneSub")} />
                  <TableWrap>
                    <table className="w-full border-collapse">
                      <caption className="sr-only">{t("fun.byZone")}</caption>
                      <thead>
                        <tr className="border-y border-line bg-mist/50">
                          <th scope="col" className={th}>{t("fun.col.zone")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.price_shown")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.step_contact")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.order_placed")}</th>
                          <th scope="col" className={headR}>{t("fun.col.conv")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.byZone.map((z) => (
                          <tr key={z.zone} className="border-b border-line last:border-0">
                            <td className={td}>
                              {t("rep.zone", { z: z.zone })}
                              <p className="text-[12px] text-muted">{t(`rep.zoneName.${z.zone}`)}</p>
                            </td>
                            <td className={right}>{n(z.quotes)}</td>
                            <td className={right}>{n(z.contact)}</td>
                            <td className={right}>{n(z.orders)}</td>
                            <td className={cx(right, "font-semibold")}>{pct(z.conv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </Card>

                <Card aria-labelledby="fun-jobs">
                  <CardHead id="fun-jobs" title={t("fun.byJob")} sub={t("fun.byJobSub")} />
                  <TableWrap>
                    <table className="w-full border-collapse">
                      <caption className="sr-only">{t("fun.byJob")}</caption>
                      <thead>
                        <tr className="border-y border-line bg-mist/50">
                          <th scope="col" className={th}>{t("fun.col.job")}</th>
                          <th scope="col" className={headR}>{t("fun.col.chosen")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.step_contact")}</th>
                          <th scope="col" className={headR}>{t("fun.ev.order_placed")}</th>
                          <th scope="col" className={headR}>{t("fun.col.conv")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.byJob.map((j) => (
                          <tr key={j.job} className="border-b border-line last:border-0">
                            <td className={td}>{t(`job.${j.job}`)}</td>
                            <td className={right}>{n(j.chosen)}</td>
                            <td className={right}>{n(j.contact)}</td>
                            <td className={right}>{n(j.orders)}</td>
                            <td className={cx(right, "font-semibold")}>{pct(j.conv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
                <Card aria-labelledby="fun-weather">
                  <CardHead id="fun-weather" title={t("fun.weather")} sub={t("fun.weatherSub")} />
                  <dl className="grid grid-cols-2 gap-3 px-5 pb-5">
                    <div className="rounded-xl bg-mist px-4 py-3">
                      <dt className="text-[12.5px] text-muted">{t("fun.weatherQuotes", { n: n(d.weather.ticked), of: n(d.weather.quotes) })}</dt>
                      <dd className="mt-1 font-display text-[22px] font-extrabold text-ink tabular-nums">{pct(d.weather.tickedPct)}</dd>
                    </div>
                    <div className="rounded-xl bg-mist px-4 py-3">
                      <dt className="text-[12.5px] text-muted">{t("fun.weatherOrders", { n: n(d.weather.ordersWithWeather), of: n(d.weather.orders) })}</dt>
                      <dd className="mt-1 font-display text-[22px] font-extrabold text-ink tabular-nums">{pct(d.weather.ordersPct)}</dd>
                    </div>
                  </dl>
                </Card>

                <Card aria-labelledby="fun-landings">
                  <CardHead id="fun-landings" title={t("fun.landings")} />
                  {d.landings.length ? (
                    <TableWrap>
                      <table className="w-full border-collapse">
                        <caption className="sr-only">{t("fun.landings")}</caption>
                        <thead>
                          <tr className="border-y border-line bg-mist/50">
                            <th scope="col" className={th}>{t("fun.col.page")}</th>
                            <th scope="col" className={headR}>{t("fun.ev.calculator_opened")}</th>
                            <th scope="col" className={headR}>{t("fun.ev.order_placed")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.landings.map((l) => (
                            <tr key={l.path} className="border-b border-line last:border-0">
                              <td className={cx(td, "font-mono text-[13px]")}>{l.path}</td>
                              <td className={right}>{n(l.opened)}</td>
                              <td className={right}>{n(l.orders)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  ) : (
                    <p className="px-5 pb-5 text-[13px] text-muted">{t("fun.none")}</p>
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Async>
    </div>
  );
}
