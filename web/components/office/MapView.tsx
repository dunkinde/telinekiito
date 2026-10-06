"use client";
// Map of sites: where scaffolds are up, where deliveries are coming, and wind warnings.
import { useMemo, useState } from "react";
import { getMap, type MapSite, type OrderStatus } from "@/lib/platform";
import { IconClose } from "../ui/Icons";
import { useLoad, useOffice, useT } from "./context";
import { dateTime, day, number } from "./format";
import { statusLabel } from "./i18n";
import { IMap, IWind } from "./icons";
import { SlippyMap, type MapMarker } from "./SlippyMap";
import { CrewChip, CrewDot } from "./bits";
import { Badge, Btn, Chips, ExampleBadge, LoadError, STATUS_HEX, StatusBadge, cx } from "./ui";

type Filter = "active" | "upcoming" | "all";
type ColorBy = "status" | "crew";
const ACTIVE = new Set<OrderStatus>(["loading", "en_route", "erected", "pickup_requested"]);
const UPCOMING = new Set<OrderStatus>(["received", "confirmed"]);

export function MapView() {
  const i = useT();
  const { t, lang } = i;
  const { openOrder } = useOffice();
  const st = useLoad(getMap, [], { poll: true });
  const [filter, setFilter] = useState<Filter>("all");
  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; n: number } | null>(null);

  const sites = useMemo(() => {
    const all = st.data?.sites || [];
    return all.filter((s) => (filter === "all" ? true : filter === "active" ? ACTIVE.has(s.status) : UPCOMING.has(s.status)));
  }, [st.data, filter]);
  const placed = sites.filter((s) => s.geo);
  const unplaced = sites.filter((s) => !s.geo);
  const colorOf = (s: MapSite) => (colorBy === "crew" ? s.crew?.color || "#8a929c" : STATUS_HEX[s.status]);
  const markers: MapMarker[] = placed.map((s) => ({
    id: s.ref,
    lat: s.geo!.lat,
    lon: s.geo!.lon,
    color: colorOf(s),
    warn: !!s.wind?.warn,
    dim: s.status === "dismantled",
    label: `${s.ref}, ${s.address}, ${statusLabel(i, s.status)}${s.wind?.warn ? `, ${t("map.windWarn")}` : ""}`
  }));
  const selected = sel ? sites.find((s) => s.ref === sel) : null;
  const counts = useMemo(() => {
    const all = st.data?.sites || [];
    return { all: all.length, active: all.filter((s) => ACTIVE.has(s.status)).length, upcoming: all.filter((s) => UPCOMING.has(s.status)).length };
  }, [st.data]);
  const statusesShown = Array.from(new Set(sites.map((s) => s.status)));
  const crewsShown = Array.from(new Set(sites.map((s) => s.crew?.name || ""))).map((n) => sites.find((s) => (s.crew?.name || "") === n)!.crew);

  const popup = selected ? (
    <div className="rounded-2xl bg-white p-4 shadow-[0_18px_40px_-12px_rgba(14,18,23,0.45)] ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-bold text-ink">{selected.ref}</p>
          <p className="mt-0.5 text-[14px] leading-snug font-semibold text-ink">{selected.address}</p>
          <p className="text-[12.5px] text-muted">{selected.customer}</p>
        </div>
        <button type="button" onClick={() => setSel(null)} aria-label={t("ui.close")} className="-mt-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-mist">
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StatusBadge status={selected.status} />
        {selected.example ? <ExampleBadge /> : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
        <div>
          <dt className="text-muted">{t("map.start")}</dt>
          <dd className="font-semibold text-ink">{day(selected.start, lang)}</dd>
        </div>
        <div>
          <dt className="text-muted">{selected.pickupDate ? t("map.pickup") : t("map.rentalEnd")}</dt>
          <dd className="font-semibold text-ink">{day(selected.pickupDate || selected.rentalEnd, lang)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("map.crew")}</dt>
          <dd>
            <CrewChip crew={selected.crew} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t("map.area")}</dt>
          <dd className="font-semibold text-ink">{number(selected.area, lang, 0)} m²</dd>
        </div>
      </dl>
      {selected.wind ? (
        <p className={cx("mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px]", selected.wind.warn ? "bg-[#fff0ef] text-[#7a1d14]" : "bg-mist text-ink-soft")}>
          <IWind className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {selected.wind.warn ? <strong>{t("map.windWarn")}: </strong> : null}
            {t("map.gusts", { ms: number(selected.wind.maxGust, lang, 0), at: dateTime(selected.wind.peakAt, lang) })}
          </span>
        </p>
      ) : null}
      <Btn size="sm" variant="dark" className="mt-3 w-full" onClick={() => openOrder(selected.ref)}>
        {t("map.open")}
      </Btn>
    </div>
  ) : null;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:flex-row">
      <div className="relative h-[58vh] min-h-[320px] flex-1 lg:h-auto">
        {st.error && !st.data ? <LoadError error={st.error} onRetry={st.reload} className="absolute inset-x-0 top-0 z-40" /> : null}
        <SlippyMap
          className="absolute inset-0"
          label={t("map.label")}
          markers={markers}
          selectedId={sel}
          onSelect={setSel}
          popup={popup}
          fitKey={`${filter}-${st.data ? "1" : "0"}`}
          focus={focus}
        />
        {st.data && !placed.length ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center px-4">
            <div className="rounded-2xl bg-white/95 px-5 py-4 text-center shadow-md ring-1 ring-line">
              <IMap className="mx-auto h-6 w-6 text-muted" />
              <p className="mt-1 font-display font-bold text-ink">{t("map.noneTitle")}</p>
              <p className="text-[13px] text-muted">{t("map.noneText")}</p>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="flex w-full flex-col border-line bg-white lg:w-[340px] lg:border-l" aria-label={t("map.sites")}>
        <div className="space-y-3 border-b border-line p-4">
          <Chips
            label={t("map.filter")}
            value={filter}
            onChange={(k) => {
              setFilter(k);
              setSel(null);
            }}
            options={[
              { key: "active", label: t("map.f.active"), count: counts.active },
              { key: "upcoming", label: t("map.f.upcoming"), count: counts.upcoming },
              { key: "all", label: t("map.f.all"), count: counts.all }
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold text-muted">{t("map.colorBy")}</span>
            <Chips
              label={t("map.colorBy")}
              value={colorBy}
              onChange={setColorBy}
              options={[
                { key: "status", label: t("map.byStatus") },
                { key: "crew", label: t("map.byCrew") }
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{t("map.legend")}</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12.5px] text-ink-soft">
              {colorBy === "status"
                ? statusesShown.map((s) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <span aria-hidden className="h-3 w-3 rounded-full border-2 border-white shadow ring-1 ring-line" style={{ background: STATUS_HEX[s] }} />
                      {statusLabel(i, s)}
                    </li>
                  ))
                : crewsShown.map((c, k) => (
                    <li key={c?.name || k} className="flex items-center gap-1.5">
                      <CrewDot color={c?.color || "#8a929c"} />
                      {c?.name || t("cal.noCrew")}
                    </li>
                  ))}
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-signal text-[8px] font-black text-signal">!</span>
                {t("map.windLegend", { ms: st.data?.windWarnMs ?? 15 })}
              </li>
            </ul>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-line">
            {placed.map((s) => (
              <li key={s.ref}>
                <button
                  type="button"
                  aria-pressed={sel === s.ref}
                  onClick={() => {
                    setSel(s.ref);
                    setFocus({ lat: s.geo!.lat, lon: s.geo!.lon, n: Date.now() });
                  }}
                  className={cx("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-mist/70", sel === s.ref && "bg-sun-soft/60")}
                >
                  <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white shadow ring-1 ring-line" style={{ background: colorOf(s) }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-bold text-ink">{s.ref}</span>
                      {s.wind?.warn ? (
                        <Badge tone="red">
                          <span className="inline-flex items-center gap-1">
                            <IWind className="h-3.5 w-3.5" />
                            {number(s.wind.maxGust, lang, 0)} m/s
                          </span>
                        </Badge>
                      ) : null}
                    </span>
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{s.address}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {statusLabel(i, s.status)} · {s.crew?.name || t("cal.noCrew")} · {number(s.area, lang, 0)} m²
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {unplaced.length ? (
            <div className="border-t border-line bg-mist/50 px-4 py-3">
              <p className="text-[12.5px] font-semibold text-ink-soft">{t("map.unplaced", { n: unplaced.length })}</p>
              {st.data?.locating ? <p className="mt-0.5 text-[12px] text-muted">{t("map.locating", { n: st.data.locating })}</p> : null}
              <ul className="mt-2 space-y-1">
                {unplaced.map((s) => (
                  <li key={s.ref} className="flex items-center gap-2 text-[12.5px]">
                    <button type="button" onClick={() => openOrder(s.ref)} className="font-mono font-semibold text-ink hover:underline">
                      {s.ref}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-muted">{s.address}</span>
                    {s.example ? <ExampleBadge /> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!sites.length && st.data ? <p className="px-4 py-6 text-center text-[13px] text-muted">{t("map.noSites")}</p> : null}
        </div>
      </aside>
    </div>
  );
}
