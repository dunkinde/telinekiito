"use client";
// A small OpenStreetMap map without libraries: Web-Mercator tiles as <img>, drag to pan, wheel / buttons / keys to zoom.
// Without a network connection the tiles stay blank and the grid behind them still shows where things are.
import { useCallback, useEffect, useRef, useState } from "react";
import { IconPlus } from "../ui/Icons";
import { useT } from "./context";
import { IFit, IMinus } from "./icons";
import { cx } from "./ui";

const TILE = 256;
const MIN_Z = 5;
const MAX_Z = 17;
export function project(lat: number, lon: number, z: number) {
  const s = TILE * 2 ** z;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  return { x: ((lon + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}
export function unproject(x: number, y: number, z: number) {
  const s = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / s;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon: (x / s) * 360 - 180 };
}
const clampZ = (z: number) => Math.max(MIN_Z, Math.min(MAX_Z, z));

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  label: string;
  warn?: boolean;
  dim?: boolean;
}

function fitView(ms: MapMarker[], w: number, h: number) {
  if (!ms.length) return { center: { lat: 60.25, lon: 24.95 }, z: 9 };
  if (ms.length === 1) return { center: { lat: ms[0].lat, lon: ms[0].lon }, z: 13 };
  const pad = 70;
  for (let z = 15; z >= MIN_Z; z--) {
    const ps = ms.map((m) => project(m.lat, m.lon, z));
    const minX = Math.min(...ps.map((p) => p.x)), maxX = Math.max(...ps.map((p) => p.x));
    const minY = Math.min(...ps.map((p) => p.y)), maxY = Math.max(...ps.map((p) => p.y));
    if (maxX - minX <= w - pad * 2 && maxY - minY <= h - pad * 2) {
      return { center: unproject((minX + maxX) / 2, (minY + maxY) / 2, z), z };
    }
  }
  const ps = ms.map((m) => project(m.lat, m.lon, MIN_Z));
  return { center: unproject((Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2, (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2, MIN_Z), z: MIN_Z };
}

function niceScale(metersPerPx: number) {
  const target = metersPerPx * 110;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const n = [1, 2, 5, 10].map((k) => k * p).filter((v) => v <= target).pop() || p;
  return { m: n, px: n / metersPerPx };
}

export function SlippyMap({
  markers,
  selectedId,
  onSelect,
  popup,
  fitKey,
  focus,
  label,
  className
}: {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  popup?: React.ReactNode;
  /** Change this to fit the view to the markers again. */
  fitKey: string;
  /** Pan to a point (changing `n` repeats the pan). */
  focus?: { lat: number; lon: number; n: number } | null;
  label: string;
  className?: string;
}) {
  const { t, lang } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ center: { lat: 60.25, lon: 24.95 }, z: 9 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const fitted = useRef("");
  const [tileState, setTileState] = useState({ ok: 0, bad: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (w && h) setView(fitView(markers, w, h));
  }, [markers]);

  // Fit the markers on first show and whenever the filter changes.
  useEffect(() => {
    if (!size.w || !size.h) return;
    if (fitted.current === fitKey) return;
    fitted.current = fitKey;
    fit();
  }, [fitKey, size.w, size.h, fit]);

  useEffect(() => {
    if (focus) setView((v) => ({ center: { lat: focus.lat, lon: focus.lon }, z: Math.max(v.z, 11) }));
  }, [focus]);

  const zoomAt = useCallback((delta: number, px?: number, py?: number) => {
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    const z2 = clampZ(v.z + delta);
    if (z2 === v.z) return;
    const x = px ?? w / 2, y = py ?? h / 2;
    const c = project(v.center.lat, v.center.lon, v.z);
    const g = unproject(c.x - w / 2 + x, c.y - h / 2 + y, v.z);
    const c2 = project(g.lat, g.lon, z2);
    setView({ center: unproject(c2.x - x + w / 2, c2.y - y + h / 2, z2), z: z2 });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const v = viewRef.current;
    const c = project(v.center.lat, v.center.lon, v.z);
    setView({ center: unproject(c.x + dx, c.y + dy, v.z), z: v.z });
  }, []);

  // Wheel zoom around the pointer (a non-passive listener so the page doesn't scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let acc = 0, last = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      const now = Date.now();
      if (Math.abs(acc) < 50 || now - last < 200) return;
      const r = el.getBoundingClientRect();
      zoomAt(acc < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
      acc = 0;
      last = now;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-nopan]")) return;
    const v = viewRef.current;
    const c = project(v.center.lat, v.center.lon, v.z);
    drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    const z = viewRef.current.z;
    setView({ center: unproject(d.cx - dx, d.cy - dy, z), z });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) onSelect(null);
  }
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const step = 120;
    const k: Record<string, () => void> = {
      ArrowLeft: () => panBy(-step, 0),
      ArrowRight: () => panBy(step, 0),
      ArrowUp: () => panBy(0, -step),
      ArrowDown: () => panBy(0, step),
      "+": () => zoomAt(1),
      "=": () => zoomAt(1),
      "-": () => zoomAt(-1)
    };
    if (k[e.key]) {
      e.preventDefault();
      k[e.key]();
    }
  }

  const { w, h } = size;
  const { z, center } = view;
  const c = project(center.lat, center.lon, z);
  const tlx = c.x - w / 2, tly = c.y - h / 2;
  const n = 2 ** z;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  if (w && h) {
    for (let ty = Math.floor(tly / TILE); ty <= Math.floor((tly + h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(tlx / TILE); tx <= Math.floor((tlx + w) / TILE); tx++) {
        const wx = ((tx % n) + n) % n;
        tiles.push({ key: `${z}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`, x: Math.round(tx * TILE - tlx), y: Math.round(ty * TILE - tly) });
      }
    }
  }
  const pos = (m: { lat: number; lon: number }) => {
    const p = project(m.lat, m.lon, z);
    return { x: p.x - tlx, y: p.y - tly };
  };
  const sel = selectedId ? markers.find((m) => m.id === selectedId) : null;
  const sp = sel ? pos(sel) : null;
  const mpp = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / n;
  const scale = niceScale(mpp);
  const grid = 64;

  return (
    <div
      ref={box}
      tabIndex={0}
      role="region"
      aria-label={label}
      aria-describedby="map-help"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-nopan]")) return;
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(1, e.clientX - r.left, e.clientY - r.top);
      }}
      onKeyDown={onKey}
      className={cx(className?.includes("absolute") ? "" : "relative", "touch-none overflow-hidden bg-[#eef0ec] outline-none select-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset", drag.current ? "cursor-grabbing" : "cursor-grab", className)}
      style={{
        backgroundImage: "linear-gradient(rgba(14,18,23,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(14,18,23,0.06) 1px, transparent 1px)",
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${-(((tlx % grid) + grid) % grid)}px ${-(((tly % grid) + grid) % grid)}px`
      }}
    >
      <p id="map-help" className="sr-only">
        {t("map.help")}
      </p>
      <div aria-hidden className="absolute inset-0">
        {tiles.map((tl) => (
          <img
            key={tl.key}
            src={tl.src}
            alt=""
            draggable={false}
            width={TILE}
            height={TILE}
            onLoad={() => setTileState((s) => (s.ok ? s : { ...s, ok: 1 }))}
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
              setTileState((s) => (s.bad ? s : { ...s, bad: 1 }));
            }}
            className="absolute top-0 left-0 max-w-none"
            style={{ transform: `translate(${tl.x}px, ${tl.y}px)`, width: TILE, height: TILE }}
          />
        ))}
      </div>

      {/* Markers */}
      {markers.map((m) => {
        const p = pos(m);
        if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 60) return null;
        const on = m.id === selectedId;
        return (
          <button
            key={m.id}
            type="button"
            data-nopan
            aria-label={m.label}
            aria-pressed={on}
            onClick={() => onSelect(on ? null : m.id)}
            className={cx("absolute top-0 left-0 grid place-items-center rounded-full transition-transform", on ? "z-20" : "z-10 hover:z-20 hover:scale-110", m.dim && !on && "opacity-60")}
            style={{ transform: `translate(${p.x - 14}px, ${p.y - 14}px) ${on ? "scale(1.18)" : ""}`, width: 28, height: 28 }}
          >
            {m.warn ? <span aria-hidden className="absolute inset-[-5px] rounded-full border-[3px] border-signal bg-signal/15" /> : null}
            <span aria-hidden className={cx("block h-[22px] w-[22px] rounded-full border-[3px] shadow-[0_2px_6px_rgba(14,18,23,0.35)]", on ? "border-ink" : "border-white")} style={{ background: m.color }} />
            {m.warn ? (
              <span aria-hidden className="absolute -top-2 -right-2 grid h-4 w-4 place-items-center rounded-full bg-signal text-[10px] leading-none font-black text-white ring-2 ring-white">
                !
              </span>
            ) : null}
          </button>
        );
      })}

      {/* Popup for the selected marker */}
      {sel && sp && popup ? (
        <div
          data-nopan
          className="absolute z-30 w-[290px] cursor-auto"
          style={{
            left: Math.max(8, Math.min(w - 298, sp.x - 145)),
            top: sp.y < 260 ? sp.y + 22 : sp.y - 22,
            transform: sp.y < 260 ? undefined : "translateY(-100%)"
          }}
        >
          {popup}
        </div>
      ) : null}

      {/* Controls */}
      <div data-nopan className="absolute top-3 right-3 z-30 flex flex-col overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-line">
        <button type="button" onClick={() => zoomAt(1)} disabled={z >= MAX_Z} aria-label={t("map.zoomIn")} title={t("map.zoomIn")} className="grid h-9 w-9 place-items-center text-ink hover:bg-mist disabled:opacity-40">
          <IconPlus className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={() => zoomAt(-1)} disabled={z <= MIN_Z} aria-label={t("map.zoomOut")} title={t("map.zoomOut")} className="grid h-9 w-9 place-items-center border-t border-line text-ink hover:bg-mist disabled:opacity-40">
          <IMinus className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={fit} aria-label={t("map.fit")} title={t("map.fit")} className="grid h-9 w-9 place-items-center border-t border-line text-ink hover:bg-mist">
          <IFit className="h-[18px] w-[18px]" />
        </button>
      </div>

      {tileState.bad && !tileState.ok ? (
        <p className="absolute bottom-9 left-3 z-20 max-w-[calc(100%-24px)] rounded-lg bg-white/90 px-2.5 py-1 text-[12px] text-ink-soft shadow-sm ring-1 ring-line">{t("map.noTiles")}</p>
      ) : null}
      {/* Scale and attribution */}
      <div aria-hidden className="absolute bottom-2 left-3 z-20 rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
        <div className="border-x-2 border-b-2 border-ink-soft" style={{ width: Math.round(scale.px), height: 5 }} />
        {scale.m >= 1000 ? `${new Intl.NumberFormat(lang === "fi" ? "fi-FI" : lang === "ru" ? "ru-RU" : "en-GB").format(scale.m / 1000)} km` : `${scale.m} m`}
      </div>
      <div data-nopan className="absolute right-0 bottom-0 z-20 rounded-tl-lg bg-white/85 px-2 py-0.5 text-[11px] text-ink-soft">
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="underline hover:text-ink">
          OpenStreetMap
        </a>
        {lang === "fi" ? "" : " "}
        {t("map.contributors")}
      </div>
    </div>
  );
}
