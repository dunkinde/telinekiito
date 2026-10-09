"use client";
// Hand-drawn SVG charts: bars (one or two series) and a line with a threshold. Hover or focus shows the values.
import { useState } from "react";
import { cx, useSize } from "./ui";

export const SERIES = ["#355f9e", "#b98500"]; // validated pair (colour-blind safe, 3:1 on white)

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, k) => (max / n) * k);
/** Axis values from lo to lo + span: four steps, or fewer when rounding would print the same label twice (0, 0, 1, 1, 1). */
function axisTicks(span: number, f: (v: number) => string, lo = 0) {
  for (const n of [4, 2, 1]) {
    const t = ticks(span, n).map((v) => v + lo);
    if (new Set(t.map(f)).size === t.length) return t;
  }
  return [lo, lo + span];
}

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}
function Tooltip({ tip, w }: { tip: Tip | null; w: number }) {
  if (!tip) return null;
  const left = Math.max(8, Math.min(w - 188, tip.x - 90));
  return (
    <div className="pointer-events-none absolute z-10 w-[180px] rounded-xl bg-ink px-3 py-2 text-[12.5px] text-white shadow-lg" style={{ left, top: Math.max(0, tip.y - 12), transform: "translateY(-100%)" }}>
      <p className="font-semibold">{tip.title}</p>
      {tip.rows.map((r) => (
        <p key={r.label} className="mt-0.5 flex items-center justify-between gap-3 text-white/85">
          <span className="flex items-center gap-1.5">
            {r.color ? <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="font-semibold text-white tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Vertical bars. One series, or two side by side per group.
 * `fmt` formats values (tooltips, direct labels); `axisFmt` the y axis.
 */
export function Bars({
  groups,
  series,
  fmt,
  axisFmt,
  height = 200,
  label,
  highlightLast
}: {
  groups: { label: string; title: string; values: number[] }[];
  series: { name: string; color: string }[];
  fmt: (v: number) => string;
  axisFmt?: (v: number) => string;
  height?: number;
  label: string;
  highlightLast?: boolean;
}) {
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44, padR = 8, padT = 18, padB = 26;
  const max = niceMax(Math.max(0, ...groups.flatMap((g) => g.values)));
  const iw = Math.max(0, w - padL - padR), ih = height - padT - padB;
  const gw = groups.length ? iw / groups.length : 0;
  const ns = series.length;
  const bw = Math.max(3, Math.min(28, (gw * 0.62 - (ns - 1) * 2) / ns));
  const y = (v: number) => padT + ih - (v / max) * ih;
  const tip: Tip | null =
    hover != null && groups[hover]
      ? {
          x: padL + gw * hover + gw / 2,
          y: y(Math.max(...groups[hover].values)),
          title: groups[hover].title,
          rows: series.map((s, k) => ({ label: s.name, value: fmt(groups[hover].values[k] || 0), color: ns > 1 ? s.color : undefined }))
        }
      : null;
  // Room for the longest label ("vk 40", "нед. 40"); counted back from the last group so the newest is always labelled.
  const need = Math.max(...groups.map((g) => String(g.label).length), 1) * 6.4 + 8;
  const labelEvery = gw < need ? Math.ceil(need / Math.max(gw, 1)) : 1;
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 ? (
        <svg width={w} height={height} role="img" aria-label={label} className="block overflow-visible" onMouseLeave={() => setHover(null)}>
          {axisTicks(max, axisFmt || fmt).map((tv) => (
            <g key={tv}>
              <line x1={padL} x2={w - padR} y1={y(tv)} y2={y(tv)} stroke="#e3e7ea" strokeDasharray={tv === 0 ? undefined : "3 4"} />
              <text x={padL - 8} y={y(tv)} dy="0.32em" textAnchor="end" fontSize="11" fill="#5d6773" className="tabular-nums">
                {(axisFmt || fmt)(tv)}
              </text>
            </g>
          ))}
          {groups.map((g, gi) => {
            const gx = padL + gw * gi + (gw - (bw * ns + (ns - 1) * 2)) / 2;
            const on = hover === gi;
            return (
              <g key={gi}>
                {on ? <rect x={padL + gw * gi + 1} y={padT - 6} width={gw - 2} height={ih + 6} rx={6} fill="#0e1217" fillOpacity={0.04} /> : null}
                {g.values.map((v, si) => {
                  const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
                  const x = gx + si * (bw + 2);
                  const r = Math.min(4, bw / 2, h);
                  return h > 0 ? (
                    <path
                      key={si}
                      d={`M${x},${padT + ih} V${padT + ih - h + r} Q${x},${padT + ih - h} ${x + r},${padT + ih - h} H${x + bw - r} Q${x + bw},${padT + ih - h} ${x + bw},${padT + ih - h + r} V${padT + ih} Z`}
                      fill={series[si].color}
                      fillOpacity={highlightLast && gi !== groups.length - 1 && ns === 1 ? 0.55 : 1}
                    />
                  ) : null;
                })}
                {(groups.length - 1 - gi) % labelEvery === 0 ? (
                  <text x={padL + gw * gi + gw / 2} y={height - 8} textAnchor="middle" fontSize="11" fill={on ? "#0e1217" : "#5d6773"} fontWeight={on ? 600 : 400}>
                    {g.label}
                  </text>
                ) : null}
                <rect
                  x={padL + gw * gi}
                  y={padT - 6}
                  width={gw}
                  height={ih + padB}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${g.title}: ${series.map((s, k) => `${s.name} ${fmt(g.values[k] || 0)}`).join(", ")}`}
                  onMouseEnter={() => setHover(gi)}
                  onFocus={() => setHover(gi)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      <Tooltip tip={tip} w={w} />
    </div>
  );
}

export function Legend({ items, className }: { items: { name: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-soft", className)}>
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-1.5">
          {it.dashed ? (
            <svg width="16" height="8" aria-hidden>
              <line x1="0" x2="16" y1="4" y2="4" stroke={it.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          ) : (
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          )}
          {it.name}
        </li>
      ))}
    </ul>
  );
}

/** Line over days with an optional threshold (dashed) and zero line. */
export function Line({
  points,
  threshold,
  fmt,
  dayFmt,
  tickFmt,
  height = 220,
  label,
  seriesName,
  thresholdName
}: {
  points: { x: string; y: number }[];
  threshold?: number | null;
  fmt: (v: number) => string;
  dayFmt: (d: string) => string;
  tickFmt: (d: string) => string;
  height?: number;
  label: string;
  seriesName: string;
  thresholdName?: string;
}) {
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44, padR = 12, padT = 14, padB = 26;
  const ys = points.map((p) => p.y);
  const lo = Math.min(0, ...ys);
  const hi = niceMax(Math.max(1, ...ys, threshold || 0));
  const iw = Math.max(0, w - padL - padR), ih = height - padT - padB;
  const x = (k: number) => padL + (points.length > 1 ? (k / (points.length - 1)) * iw : iw / 2);
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const d = points.map((p, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const area = points.length ? `${d} L${x(points.length - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z` : "";
  const step = Math.max(1, Math.round(points.length / Math.max(2, Math.floor(iw / 70))));
  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, k)));
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? 1) - 1));
  }
  const tip: Tip | null =
    hover != null && points[hover]
      ? { x: x(hover), y: y(points[hover].y), title: dayFmt(points[hover].x), rows: [{ label: seriesName, value: fmt(points[hover].y) }] }
      : null;
  const tickVals = axisTicks(hi - lo, fmt, lo);
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && points.length ? (
        <svg width={w} height={height} role="img" aria-label={label} className="block overflow-visible">
          {tickVals.map((tv) => (
            <g key={tv}>
              <line x1={padL} x2={w - padR} y1={y(tv)} y2={y(tv)} stroke="#e3e7ea" strokeDasharray={tv === 0 ? undefined : "3 4"} />
              <text x={padL - 8} y={y(tv)} dy="0.32em" textAnchor="end" fontSize="11" fill="#5d6773">
                {fmt(Math.round(tv))}
              </text>
            </g>
          ))}
          {lo < 0 ? <line x1={padL} x2={w - padR} y1={y(0)} y2={y(0)} stroke="#e5484d" strokeWidth={1} /> : null}
          <path d={area} fill={SERIES[0]} fillOpacity={0.08} />
          {threshold != null ? (
            <g>
              <line x1={padL} x2={w - padR} y1={y(threshold)} y2={y(threshold)} stroke="#e5484d" strokeWidth={1.5} strokeDasharray="5 4" />
              {thresholdName ? (
                <text x={w - padR} y={y(threshold) - 5} textAnchor="end" fontSize="11" fill="#b42318">
                  {thresholdName}
                </text>
              ) : null}
            </g>
          ) : null}
          <path d={d} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, k) =>
            k % step === 0 ? (
              <text key={p.x} x={x(k)} y={height - 8} textAnchor="middle" fontSize="11" fill="#5d6773">
                {tickFmt(p.x)}
              </text>
            ) : null
          )}
          {hover != null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#0e1217" strokeOpacity={0.25} />
              <circle cx={x(hover)} cy={y(points[hover].y)} r={4.5} fill="#fff" stroke={SERIES[0]} strokeWidth={2} />
            </g>
          ) : null}
          <rect
            x={padL}
            y={padT}
            width={iw}
            height={ih}
            fill="transparent"
            tabIndex={0}
            aria-label={label}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover((h) => h ?? 0)}
            onBlur={() => setHover(null)}
            onKeyDown={onKey}
            className="outline-none focus-visible:stroke-ink"
          />
        </svg>
      ) : null}
      <Tooltip tip={tip} w={w} />
    </div>
  );
}
