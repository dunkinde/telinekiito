"use client";
// Delivery map: Finland's outline draws itself, then rings around Helsinki grow out to show
// where the 24 h, 48 h and 3-day deliveries reach. Outline: Natural Earth 1:110m (public domain).
import { motion, useReducedMotion } from "framer-motion";
import { COVERAGE } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { CountUp } from "../ui/CountUp";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";

// [lon, lat]
const FINLAND: [number, number][] = [
  [28.59193, 69.064777], [28.445944, 68.364613], [29.977426, 67.698297], [29.054589, 66.944286], [30.21765, 65.80598],
  [29.54443, 64.948672], [30.444685, 64.204453], [30.035872, 63.552814], [31.516092, 62.867687], [31.139991, 62.357693],
  [30.211107, 61.780028], [28.069998, 60.503517], [26.255173, 60.423961], [24.496624, 60.057316], [22.869695, 59.846373],
  [22.290764, 60.391921], [21.322244, 60.72017], [21.544866, 61.705329], [21.059211, 62.607393], [21.536029, 63.189735],
  [22.442744, 63.81781], [24.730512, 64.902344], [25.398068, 65.111427], [25.294043, 65.534346], [23.903379, 66.006927],
  [23.56588, 66.396051], [23.539473, 67.936009], [21.978535, 68.616846], [20.645593, 69.106247], [21.244936, 69.370443],
  [22.356238, 68.841741], [23.66205, 68.891247], [24.735679, 68.649557], [25.689213, 69.092114], [26.179622, 69.825299],
  [27.732292, 70.164193], [29.015573, 69.766491], [28.59193, 69.064777]
];
const CITIES: { name: string; lon: number; lat: number; major?: boolean; left?: boolean }[] = [
  { name: "Helsinki", lon: 24.94, lat: 60.17, major: true, left: true },
  { name: "Turku", lon: 22.27, lat: 60.45, left: true },
  { name: "Tampere", lon: 23.76, lat: 61.5, left: true },
  { name: "Lahti", lon: 25.66, lat: 60.98 },
  { name: "Jyväskylä", lon: 25.75, lat: 62.24 },
  { name: "Oulu", lon: 25.47, lat: 65.01 },
  { name: "Rovaniemi", lon: 25.73, lat: 66.5 }
];

// Simple projection: degrees of longitude shrink with cos(latitude); 1 unit ≈ 2.8 km.
const K = 40, LON0 = 19.8, LAT0 = 70.4, COSL = Math.cos((64 * Math.PI) / 180);
const proj = (lon: number, lat: number): [number, number] => [(lon - LON0) * COSL * K + 10, (LAT0 - lat) * K + 10];
const kmToUnits = (km: number) => (km / 111.2) * K;

const outline = FINLAND.map(([lon, lat], i) => `${i ? "L" : "M"}${proj(lon, lat).map((n) => n.toFixed(1)).join(" ")}`).join("") + "Z";
const HKI = proj(24.94, 60.17);
const RING_FILL = ["rgba(255,194,14,0.35)", "rgba(255,194,14,0.2)", "rgba(255,194,14,0.1)"];

export function Coverage() {
  const { t, pick } = useI18n();
  const reduce = useReducedMotion();
  return (
    <section id="coverage" className="snap-screen section-pad overflow-hidden bg-white">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8">
        <div className="lg:col-span-7">
          <SectionHead eyebrow={t("cov.eyebrow")} title={t("cov.title")} intro={t("cov.intro")} />
          <Stagger as="ul" className="head-gap grid gap-3 sm:grid-cols-3" stagger={0.12}>
            {COVERAGE.map((c, i) => (
              <StaggerItem as="li" key={c.km} className="h-full">
                <div className="flex h-full items-center gap-4 rounded-2xl bg-mist p-4 ring-1 ring-line sm:flex-col sm:items-start sm:gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ background: RING_FILL[i], boxShadow: "inset 0 0 0 2px #ffc20e" }}>
                    <span className="font-display text-base font-extrabold">{pick(c.speed)}</span>
                  </span>
                  <div>
                    <p className="font-display text-lg font-bold">
                      <CountUp to={c.km} /> km
                    </p>
                    <p className="text-sm leading-snug text-muted">{pick(c.text)}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="mt-4 text-sm text-muted">{t("cov.rest")}</p>
        </div>

        <div className="lg:col-span-5">
          <div className="mx-auto flex max-w-md items-center justify-center rounded-3xl bg-mist p-4 ring-1 ring-line sm:p-6 lg:max-w-none">
            <svg viewBox="0 0 230 485" className="h-[min(70svh,34rem)] w-auto lg:h-[clamp(18rem,calc(100svh-13.5rem),36rem)]" role="img" aria-label={t("cov.mapLabel")}>
              {/* Country outline */}
              <motion.path
                d={outline}
                fill="#ffffff"
                stroke="#0e1217"
                strokeOpacity={0.35}
                strokeWidth={1.2}
                strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0, fillOpacity: reduce ? 1 : 0 }}
                whileInView={{ pathLength: 1, fillOpacity: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ pathLength: { duration: 1.6, ease: [0.65, 0, 0.35, 1] }, fillOpacity: { duration: 0.6, delay: 1.2 } }}
              />
              {/* Delivery rings, largest first so the smaller ones sit on top. */}
              {[...COVERAGE].reverse().map((c, ri) => {
                const i = COVERAGE.length - 1 - ri;
                return (
                  <motion.circle
                    key={c.km}
                    cx={HKI[0]}
                    cy={HKI[1]}
                    r={kmToUnits(c.km)}
                    fill={RING_FILL[i]}
                    stroke="#e0a800"
                    strokeWidth={1}
                    strokeDasharray={i === 2 ? "3 2" : undefined}
                    initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.9, delay: 1.3 + i * 0.25, ease: [0.16, 1, 0.3, 1] }}
                  />
                );
              })}
              {/* Pulse at the base */}
              {!reduce ? (
                <motion.circle
                  cx={HKI[0]}
                  cy={HKI[1]}
                  r={8}
                  fill="none"
                  stroke="#e0a800"
                  strokeWidth={1.5}
                  animate={{ scale: [1, 3.2], opacity: [0.8, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: 2.2 }}
                />
              ) : null}
              {CITIES.map((c, i) => {
                const [x, y] = proj(c.lon, c.lat);
                const left = Boolean(c.left);
                return (
                  <motion.g
                    key={c.name}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.6 + i * 0.06 }}
                  >
                    <circle cx={x} cy={y} r={c.major ? 3.2 : 2.2} fill="#0e1217" />
                    <text
                      x={left ? x - 5 : x + 5}
                      y={y + 3.2}
                      textAnchor={left ? "end" : "start"}
                      fontSize={c.major ? 11.5 : 9}
                      fontWeight={c.major ? 700 : 600}
                      fill="#2b323b"
                      stroke="#ffffff"
                      strokeWidth={3}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      {c.name}
                    </text>
                  </motion.g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
