// Minimal stand-in for framer-motion so the site can be rendered and tested without the real package.
// Renders every element in its final state; no animation.
import React, { forwardRef, useEffect, useState } from "react";

const MOTION_PROPS = new Set(["initial","animate","exit","variants","transition","whileHover","whileTap","whileInView","whileFocus","whileDrag","viewport","custom","layout","layoutId","onAnimationComplete","onAnimationStart","onUpdate","transformTemplate","drag"]);
const TRANSFORM_KEYS = new Set(["x","y","z","rotate","rotateX","rotateY","rotateZ","scale","scaleX","scaleY","skew","skewX","skewY","transformPerspective","originX","originY"]);
function isMV(v) { return v && typeof v === "object" && typeof v.get === "function"; }

const cache = {};
function make(tag) {
  if (cache[tag]) return cache[tag];
  const C = forwardRef(function M(props, ref) {
    const out = {};
    for (const k in props) {
      if (MOTION_PROPS.has(k)) continue;
      if (k === "style" && props.style) {
        const s = {};
        for (const sk in props.style) {
          if (TRANSFORM_KEYS.has(sk)) continue;
          const v = props.style[sk];
          s[sk] = isMV(v) ? v.get() : v;
        }
        out.style = s;
        continue;
      }
      out[k] = props[k];
    }
    return React.createElement(tag, { ...out, ref });
  });
  cache[tag] = C;
  return C;
}
export const motion = new Proxy({}, { get: (_, tag) => make(tag) });
export const AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children);
export const MotionConfig = ({ children }) => React.createElement(React.Fragment, null, children);
export const LayoutGroup = MotionConfig;

class MV {
  constructor(v) { this.v = v; this.subs = new Set(); }
  get() { return this.v; }
  set(v) { this.v = v; this.subs.forEach((f) => f(v)); }
  on(_e, f) { this.subs.add(f); return () => this.subs.delete(f); }
}
let scrollMV = null;
export function useScroll() {
  if (!scrollMV) {
    scrollMV = new MV(typeof window !== "undefined" ? window.scrollY : 0);
    if (typeof window !== "undefined") window.addEventListener("scroll", () => scrollMV.set(window.scrollY), { passive: true });
  }
  return { scrollY: scrollMV, scrollYProgress: new MV(0), scrollX: new MV(0), scrollXProgress: new MV(0) };
}
export function useTransform(mv, input, output) { if (typeof input === "function") return new MV(input(mv.get())); return new MV(Array.isArray(output) ? output[output.length - 1] : 0); }
export function useSpring(mv) { return mv; }
export function useMotionValue(v) { const [m] = useState(() => new MV(v)); return m; }
export function useMotionValueEvent(mv, _e, cb) { useEffect(() => mv.on("change", cb), [mv]); }
export function useInView() { return true; }
export function useReducedMotion() { return false; }
export function animate(from, to, opts = {}) {
  if (typeof from === "number" && typeof to === "number" && opts.duration > 0 && typeof requestAnimationFrame !== "undefined" && window.__realTween) {
    let stopped = false; const t0 = performance.now(); const d = opts.duration * 1000;
    const tick = (t) => { if (stopped) return; const k = Math.min(1, (t - t0) / d); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      if (opts.onUpdate) opts.onUpdate(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); else if (opts.onComplete) opts.onComplete(); };
    requestAnimationFrame(tick); return { stop() { stopped = true; } };
  } if (opts.onUpdate) opts.onUpdate(to); if (opts.onComplete) opts.onComplete(); return { stop() {} }; }
