// Flat illustrations of typical jobs: a house elevation with scaffolding in front of it.
// Drawn in SVG from a few parameters, so they stay sharp, light and on-brand.
import type { SceneKind } from "@/lib/content";

type Roof = "gable" | "hip" | "low";
interface SceneCfg {
  floors: number;
  roof: Roof;
  width: number;
  units?: number;
  decks: "top" | "all";
  catchGuard: boolean;
  storm?: boolean;
  steep?: boolean;
  bg: [string, string];
}

const SCENES: Record<SceneKind, SceneCfg> = {
  roof: { floors: 1, roof: "gable", width: 230, decks: "top", catchGuard: true, bg: ["#fff4cc", "#ffffff"] },
  facade: { floors: 2, roof: "gable", width: 200, decks: "all", catchGuard: false, bg: ["#e6edf3", "#ffffff"] },
  storm: { floors: 1, roof: "gable", width: 220, decks: "top", catchGuard: true, storm: true, bg: ["#4a5663", "#7d8894"] },
  row: { floors: 1, roof: "low", width: 320, units: 3, decks: "top", catchGuard: false, bg: ["#f3f4f1", "#ffffff"] },
  both: { floors: 1.5, roof: "gable", width: 200, decks: "all", catchGuard: true, steep: true, bg: ["#fff4cc", "#ffffff"] },
  hip: { floors: 1, roof: "hip", width: 250, decks: "top", catchGuard: true, bg: ["#e6edf3", "#ffffff"] }
};

const W = 400, H = 400, GROUND = 262, FLOOR = 50, LIFT = 42;
const INK = "#0e1217", ROOF = "#2b323b", STEEL = "#7f8b97", DECK = "#ffc20e", GLASS = "#c9d6e2", WALL = "#ffffff";

/** Sky colour at the top of a scene, used to fill the frame above the drawing. */
export const sceneSky = (kind: SceneKind) => SCENES[kind].bg[0];

export function ScaffoldScene({ kind, title }: { kind: SceneKind; title: string }) {
  const c = SCENES[kind];
  const wallH = c.floors === 1.5 ? FLOOR + 30 : c.floors * FLOOR + 8;
  const x0 = (W - c.width) / 2, x1 = x0 + c.width;
  const eaveY = GROUND - wallH;
  const roofH = c.roof === "low" ? 24 : c.width * (c.steep ? 0.42 : 0.3);
  const mid = (x0 + x1) / 2;

  const roofPts =
    c.roof === "hip"
      ? `${x0 - 12},${eaveY + 4} ${x0 + c.width * 0.3},${eaveY - roofH * 0.8} ${x1 - c.width * 0.3},${eaveY - roofH * 0.8} ${x1 + 12},${eaveY + 4}`
      : `${x0 - 12},${eaveY + 4} ${mid},${eaveY - roofH} ${x1 + 12},${eaveY + 4}`;

  // Windows: one row per full floor, plus a gable window on 1½-storey houses.
  const windows: { x: number; y: number; w: number; h: number }[] = [];
  const perRow = Math.max(2, Math.floor(c.width / 58));
  const fullFloors = Math.floor(c.floors);
  for (let f = 0; f < fullFloors; f++) {
    for (let i = 0; i < perRow; i++) {
      const cx = x0 + (c.width / perRow) * (i + 0.5);
      if (f === 0 && i === Math.floor(perRow / 2) && !c.units) continue; // door goes here
      windows.push({ x: cx - 11, y: GROUND - (f + 1) * FLOOR + 12, w: 22, h: 26 });
    }
  }
  if (c.floors === 1.5) windows.push({ x: mid - 10, y: eaveY - 12, w: 20, h: 22 });

  // Scaffold layout.
  const sx0 = x0 - 18, sx1 = x1 + 18;
  const bays = Math.max(3, Math.round((sx1 - sx0) / 46));
  const bay = (sx1 - sx0) / bays;
  const xs = Array.from({ length: bays + 1 }, (_, i) => sx0 + i * bay);
  const levels: number[] = [];
  if (c.decks === "top") levels.push(eaveY + 12);
  else for (let y = GROUND - LIFT; y > eaveY - 30; y -= LIFT) levels.push(y);
  const top = Math.min(...levels);
  const guardTop = top - 22;
  const lifts = [GROUND, ...levels.slice().sort((a, b) => b - a)];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={title} preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id={`sky-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.bg[0]} />
          <stop offset="1" stopColor={c.bg[1]} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#sky-${kind})`} />
      {!c.storm ? <circle cx={W - 62} cy={58} r={26} fill="#ffc20e" opacity={0.35} /> : null}
      {c.storm
        ? Array.from({ length: 26 }, (_, i) => (
            <path key={i} d={`M${(i * 37) % W} ${(i * 53) % 160}l-8 18`} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.4} strokeLinecap="round" />
          ))
        : null}

      {/* Ground */}
      <rect y={GROUND} width={W} height={H - GROUND} fill={c.storm ? "#5e6a5f" : "#e7eae4"} />
      <path d={`M0 ${GROUND}H${W}`} stroke={INK} strokeOpacity={0.25} />

      {/* House */}
      <polygon points={roofPts} fill={ROOF} />
      {c.storm ? (
        // A tarp pulled over the damaged slope: a band along the right roof edge.
        <polygon
          points={[0.12, 0.78, 0.78, 0.12]
            .map((f, i) => {
              const x = mid + (x1 + 12 - mid) * f, y = eaveY - roofH + (roofH + 4) * f;
              return `${x.toFixed(1)},${(y + (i < 2 ? -5 : 14)).toFixed(1)}`;
            })
            .join(" ")}
          fill="#2f6fde"
          opacity={0.92}
        />
      ) : null}
      <rect x={x0} y={eaveY} width={c.width} height={wallH} fill={WALL} stroke={INK} strokeOpacity={0.5} />
      {c.units
        ? Array.from({ length: c.units - 1 }, (_, i) => (
            <path key={i} d={`M${x0 + (c.width / c.units!) * (i + 1)} ${eaveY}V${GROUND}`} stroke={INK} strokeOpacity={0.35} />
          ))
        : null}
      {windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} rx={2} fill={GLASS} stroke={INK} strokeOpacity={0.45} />
      ))}
      {c.units
        ? Array.from({ length: c.units }, (_, i) => (
            <rect key={i} x={x0 + (c.width / c.units!) * (i + 0.5) + 14} y={GROUND - 34} width={16} height={34} fill={ROOF} />
          ))
        : <rect x={mid - 10} y={GROUND - 38} width={20} height={38} fill={ROOF} />}

      {/* Scaffold: standards, ledgers, braces, decks, guardrails */}
      <g stroke={STEEL} strokeWidth={2} strokeLinecap="round">
        {xs.map((x, i) => (
          <path key={`s${i}`} d={`M${x} ${GROUND}V${guardTop}`} />
        ))}
        {lifts.map((y, i) => (
          <path key={`l${i}`} d={`M${sx0} ${y}H${sx1}`} strokeOpacity={0.8} />
        ))}
        {lifts.slice(0, -1).map((y, li) =>
          xs.slice(0, -1).map((x, i) =>
            (i + li) % 2 === 0 ? <path key={`b${li}-${i}`} d={`M${x} ${y}L${x + bay} ${lifts[li + 1]}`} strokeOpacity={0.55} strokeWidth={1.5} /> : null
          )
        )}
        {levels.map((y, i) => (
          <g key={`g${i}`}>
            <path d={`M${sx0} ${y - 11}H${sx1}`} strokeWidth={1.5} />
            <path d={`M${sx0} ${y - 21}H${sx1}`} strokeWidth={1.5} />
          </g>
        ))}
      </g>
      {levels.map((y) =>
        xs.slice(0, -1).map((x, i) => <rect key={`d${y}-${i}`} x={x + 2} y={y - 3} width={bay - 4} height={5} rx={1} fill={DECK} stroke={INK} strokeOpacity={0.35} strokeWidth={0.6} />)
      )}
      {xs.map((x, i) => (
        <rect key={`p${i}`} x={x - 5} y={GROUND - 2} width={10} height={4} fill={INK} opacity={0.6} />
      ))}

      {/* Roof-catch guard above the top deck */}
      {c.catchGuard ? (
        <g stroke="#e5484d" strokeWidth={1.8} strokeLinecap="round">
          {xs.map((x, i) => (
            <path key={`c${i}`} d={`M${x} ${guardTop}V${guardTop - 16}`} strokeOpacity={0.8} />
          ))}
          <path d={`M${sx0} ${guardTop - 16}H${sx1}`} strokeDasharray="6 4" />
          <path d={`M${sx0} ${guardTop - 8}H${sx1}`} strokeDasharray="6 4" strokeOpacity={0.7} />
        </g>
      ) : null}
    </svg>
  );
}
