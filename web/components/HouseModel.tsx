"use client";
// Isometric 3D model of a house with its scaffold, built from the same bays and levels as the quote.
// "play" mode assembles the scaffold level by level when it appears (or when the house changes);
// "progress" mode ties the assembly to a 0–1 value, e.g. scroll position. Only opacity and transform animate.
import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { useMemo } from "react";
import { FRAME, GAP, JACK, LIFT, iso, roofRise, scaffoldSides, type HouseShape, type ScaffoldSide, type SidePos } from "@/lib/geometry";

type P3 = [number, number, number];
interface Piece {
  key: string;
  order: number;
  front: boolean; // drawn after the house
  lines: { a: P3; b: P3; kind: "tube" | "brace" | "guard" | "catch" }[];
  decks: P3[][];
}

const SIDE_ORDER: Record<SidePos, number> = { front: 0, right: 1, back: 2, left: 3 };
const COL = { tube: "#7d8996", brace: "#a6b0ba", guard: "#5d6773", catch: "#e5484d", deck: "#ffc20e", deckEdge: "#b98a00" };

/** A point on a scaffold side: t along the side, outer = outer row of standards, z = height. */
function sidePoint(h: HouseShape, s: ScaffoldSide, t: number, outer: boolean, z: number): P3 {
  const run = s.bays * s.bay;
  const d = GAP + (outer ? FRAME : 0);
  switch (s.pos) {
    case "front":
      return [h.length / 2 - run / 2 + t, h.width + d, z];
    case "back":
      return [h.length / 2 - run / 2 + t, -d, z];
    case "left":
      return [-d, h.width / 2 - run / 2 + t, z];
    case "right":
      return [h.length + d, h.width / 2 - run / 2 + t, z];
  }
}

function buildPieces(h: HouseShape): Piece[] {
  const pieces: Piece[] = [];
  for (const s of scaffoldSides(h)) {
    const front = s.pos === "front" || s.pos === "right";
    for (let k = 1; k <= s.lifts; k++) {
      const zLo = k === 1 ? 0 : JACK + LIFT * (k - 1);
      const zHi = JACK + LIFT * k;
      const top = k === s.lifts;
      for (let b = 0; b < s.bays; b++) {
        const t0 = b * s.bay, t1 = (b + 1) * s.bay, last = b === s.bays - 1;
        const P = (t: number, outer: boolean, z: number) => sidePoint(h, s, t, outer, z);
        const lines: Piece["lines"] = [];
        for (const t of last ? [t0, t1] : [t0]) {
          lines.push({ a: P(t, false, zLo), b: P(t, false, zHi), kind: "tube" });
          lines.push({ a: P(t, true, zLo), b: P(t, true, zHi), kind: "tube" });
          lines.push({ a: P(t, false, zHi), b: P(t, true, zHi), kind: "tube" });
          if (top) {
            lines.push({ a: P(t, true, zHi), b: P(t, true, zHi + (s.catchOn ? 2 : 1)), kind: s.catchOn ? "catch" : "guard" });
          }
        }
        lines.push({ a: P(t0, false, zHi), b: P(t1, false, zHi), kind: "tube" });
        lines.push({ a: P(t0, true, zHi), b: P(t1, true, zHi), kind: "tube" });
        if ((b + k) % 2 === 0) lines.push({ a: P(t0, true, zLo), b: P(t1, true, zHi), kind: "brace" });
        const decks: P3[][] = [];
        if (s.deckAll || top) {
          decks.push([P(t0 + 0.06, false, zHi), P(t1 - 0.06, false, zHi), P(t1 - 0.06, true, zHi), P(t0 + 0.06, true, zHi)]);
          lines.push({ a: P(t0, true, zHi + 0.5), b: P(t1, true, zHi + 0.5), kind: "guard" });
          lines.push({ a: P(t0, true, zHi + 1), b: P(t1, true, zHi + 1), kind: "guard" });
        }
        if (top && s.catchOn) {
          lines.push({ a: P(t0, true, zHi + 2), b: P(t1, true, zHi + 2), kind: "catch" });
          lines.push({ a: P(t0, true, zHi + 1.5), b: P(t1, true, zHi + 1.5), kind: "catch" });
        }
        pieces.push({ key: `${s.pos}-${k}-${b}`, order: k * 1000 + SIDE_ORDER[s.pos] * 100 + b, front, lines, decks });
      }
    }
  }
  // Number the pieces in build order: level by level, front first.
  const sorted = [...pieces].sort((a, b) => a.order - b.order);
  sorted.forEach((p, i) => (p.order = i));
  return pieces;
}

const pts = (ps: P3[]) => ps.map((p) => iso(...p).map((n) => n.toFixed(3)).join(",")).join(" ");

function House({ h }: { h: HouseShape }) {
  const L = h.length, W = h.width, H = h.eave, rise = roofRise(h), o = 0.45;
  const floors = H >= 5 ? 2 : 1;
  const windows: P3[][] = [];
  for (let f = 0; f < floors; f++) {
    const z0 = 0.9 + f * 2.7;
    const n = Math.max(2, Math.floor(L / 3.2));
    for (let i = 0; i < n; i++) {
      const cx = (L / n) * (i + 0.5);
      if (f === 0 && i === Math.floor(n / 2)) continue;
      windows.push([[cx - 0.6, W, z0], [cx + 0.6, W, z0], [cx + 0.6, W, z0 + 1.3], [cx - 0.6, W, z0 + 1.3]]);
    }
    windows.push([[L, W * 0.3 - 0.5, z0], [L, W * 0.3 + 0.5, z0], [L, W * 0.3 + 0.5, z0 + 1.3], [L, W * 0.3 - 0.5, z0 + 1.3]]);
  }
  const door: P3[] = [[L / 2 - 0.5, W, 0], [L / 2 + 0.5, W, 0], [L / 2 + 0.5, W, 2.1], [L / 2 - 0.5, W, 2.1]];
  const stroke = { stroke: "#0e1217", strokeOpacity: 0.35, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };

  let roof: React.ReactNode = null;
  if (h.roofType === "gable") {
    roof = (
      <>
        <polygon points={pts([[L, 0, H], [L, W, H], [L, W / 2, H + rise]])} fill="#e3e9ee" {...stroke} />
        <polygon points={pts([[-o, W + o, H - 0.1], [L + o, W + o, H - 0.1], [L + o, W / 2, H + rise], [-o, W / 2, H + rise]])} fill="#3f4852" {...stroke} />
        <polyline points={pts([[L + o, W + o, H - 0.1], [L + o, W / 2, H + rise], [L + o, -o, H - 0.1]])} fill="none" stroke="#1b2026" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </>
    );
  } else if (h.roofType === "hip") {
    const r1: P3 = L >= W ? [W / 2, W / 2, H + rise] : [L / 2, W / 2, H + rise];
    const r2: P3 = L >= W ? [L - W / 2, W / 2, H + rise] : [L / 2, W / 2, H + rise];
    roof = (
      <>
        <polygon points={pts([[-o, W + o, H - 0.1], [L + o, W + o, H - 0.1], r2, r1])} fill="#3f4852" {...stroke} />
        <polygon points={pts([[L + o, W + o, H - 0.1], [L + o, -o, H - 0.1], r2])} fill="#2f363f" {...stroke} />
      </>
    );
  } else {
    roof = <polygon points={pts([[-o, -o, H], [L + o, -o, H], [L + o, W + o, H], [-o, W + o, H]])} fill="#4a535d" {...stroke} />;
  }

  return (
    <g>
      <polygon points={pts([[L, W, 0], [L, 0, 0], [L, 0, H], [L, W, H]])} fill="#e3e9ee" {...stroke} />
      <polygon points={pts([[0, W, 0], [L, W, 0], [L, W, H], [0, W, H]])} fill="#ffffff" {...stroke} />
      {windows.map((w, i) => (
        <polygon key={i} points={pts(w)} fill="#c9d6e2" {...stroke} />
      ))}
      <polygon points={pts(door)} fill="#2b323b" />
      {roof}
    </g>
  );
}

function PieceView({ p, total, mode, progress, delayStep }: { p: Piece; total: number; mode: "play" | "progress"; progress?: MotionValue<number>; delayStep: number }) {
  const reduce = useReducedMotion();
  const start = (p.order / Math.max(1, total)) * 0.85;
  const one = useMotionValue(1);
  const source = progress ?? one;
  const opacity = useTransform(source, [start, start + 0.1], [0, 1]);
  const y = useTransform(source, [start, start + 0.1], [-0.7, 0]);

  const content = (
    <>
      {p.decks.map((d, i) => (
        <polygon key={i} points={pts(d)} fill={COL.deck} stroke={COL.deckEdge} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      ))}
      {p.lines.map((l, i) => {
        const [x1, y1] = iso(...l.a), [x2, y2] = iso(...l.b);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={COL[l.kind]}
            strokeWidth={l.kind === "brace" ? 0.8 : 1.2}
            strokeDasharray={l.kind === "catch" ? "3 2" : undefined}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </>
  );

  if (mode === "progress" && progress && !reduce) return <motion.g style={{ opacity, y }}>{content}</motion.g>;
  return (
    <motion.g
      initial={reduce ? false : { opacity: 0, y: -0.7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 + p.order * delayStep, ease: [0.16, 1, 0.3, 1] }}
    >
      {content}
    </motion.g>
  );
}

export function HouseModel({
  shape,
  mode = "play",
  progress,
  className = "",
  label
}: {
  shape: HouseShape;
  mode?: "play" | "progress";
  progress?: MotionValue<number>;
  className?: string;
  label: string;
}) {
  const key = JSON.stringify(shape);
  const { pieces, viewBox } = useMemo(() => {
    const ps = buildPieces(shape);
    // Fit the drawing: project every point we draw and take the bounds.
    const all: P3[] = [];
    const { length: L, width: W, eave: H } = shape;
    const rise = roofRise(shape);
    all.push([-1.6, -1.6, 0], [L + 1.6, W + 1.6, 0], [L, 0, H + rise], [0, W, H + rise], [L / 2, W / 2, H + rise + 0.3]);
    ps.forEach((p) => p.lines.forEach((l) => all.push(l.a, l.b)));
    const xy = all.map((p) => iso(...p));
    const xs = xy.map((q) => q[0]), ys = xy.map((q) => q[1]);
    const pad = 0.8;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    return { pieces: ps, viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${(Math.max(...xs) - minX + pad).toFixed(2)} ${(Math.max(...ys) - minY + pad).toFixed(2)}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const total = pieces.length;
  const delayStep = Math.min(0.05, 1.6 / Math.max(1, total));
  const L = shape.length, W = shape.width;

  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={label}>
      <g key={key}>
        {/* Ground shadow */}
        <polygon points={pts([[-1.6, -1.6, 0], [L + 1.6, -1.6, 0], [L + 1.6, W + 1.6, 0], [-1.6, W + 1.6, 0]])} fill="#0e1217" opacity={0.06} />
        {pieces.filter((p) => !p.front).map((p) => (
          <PieceView key={p.key} p={p} total={total} mode={mode} progress={progress} delayStep={delayStep} />
        ))}
        <House h={shape} />
        {pieces.filter((p) => p.front).map((p) => (
          <PieceView key={p.key} p={p} total={total} mode={mode} progress={progress} delayStep={delayStep} />
        ))}
      </g>
    </svg>
  );
}
