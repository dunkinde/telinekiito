"use client";
// Desktop "block to block" scrolling. Every section is one screen tall (see .snap-screen in globals.css);
// one wheel step, touchpad swipe or arrow key glides to the next block (or the next stage of the timelapse).
// Touchpad momentum after a swipe doesn't skip blocks. Dragging the scrollbar or following a link settles on the
// nearest block. Phones, small windows, open dialogs, text fields and the horizontal gallery scroll normally.
import { animate } from "framer-motion";
import { useEffect } from "react";

const QUERY = "(min-width: 1024px) and (min-height: 600px) and (pointer: fine)";
const HEADER = 80; // fixed header height; sections stop just below it

/** Scroll positions where the page may rest, top to bottom. */
function stops(): number[] {
  const H = window.innerHeight;
  const y0 = window.scrollY;
  const max = document.documentElement.scrollHeight - H;
  const raw: number[] = [0, max];
  document.querySelectorAll<HTMLElement>(".snap-screen").forEach((el) => {
    const r = el.getBoundingClientRect();
    const top = r.top + y0 - HEADER;
    raw.push(top);
    // A block taller than the window (e.g. a long FAQ answer open) also stops at its end, so nothing is skipped.
    if (r.height > H - HEADER + 4) raw.push(r.top + y0 + r.height - H);
  });
  document.querySelectorAll<HTMLElement>(".snap-full, .snap-point").forEach((el) => raw.push(el.getBoundingClientRect().top + y0));
  const out: number[] = [];
  raw
    .map((v) => Math.round(Math.min(max, Math.max(0, v))))
    .sort((a, b) => a - b)
    .forEach((v) => {
      if (!out.length || v - out[out.length - 1] > 2) out.push(v);
    });
  return out;
}

/** True if the element (or a parent) can scroll by itself in that direction, e.g. a textarea or a dialog body. */
function innerScroller(target: EventTarget | null, dir: number): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    el = el.parentElement;
  }
  return false;
}

const pageLocked = () => document.body.style.overflow === "hidden"; // a dialog or the menu is open

export function BlockScroll() {
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let anim: { stop: () => void } | null = null;
    let busy = false; // a glide is running
    let lastWheel = 0;
    let lastAbs = 0;
    let settleTimer = 0;

    function glide(target: number) {
      const from = window.scrollY;
      if (Math.abs(target - from) < 2) return;
      anim?.stop();
      const dist = Math.abs(target - from);
      if (reduce.matches) {
        window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
        return;
      }
      busy = true;
      anim = animate(from, target, {
        duration: Math.min(0.95, 0.5 + dist / 2600),
        ease: [0.65, 0, 0.35, 1],
        onUpdate: (v) => window.scrollTo({ top: v, behavior: "instant" as ScrollBehavior }),
        onComplete: () => {
          busy = false;
        }
      });
    }

    function step(dir: 1 | -1) {
      const y = window.scrollY;
      const pts = stops();
      const target = dir > 0 ? pts.find((p) => p > y + 2) : [...pts].reverse().find((p) => p < y - 2);
      if (target !== undefined) glide(target);
    }

    function onWheel(e: WheelEvent) {
      if (!mq.matches || e.ctrlKey || e.shiftKey || pageLocked()) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // sideways: the gallery slider
      const dir = e.deltaY > 0 ? 1 : -1;
      if (innerScroller(e.target, dir)) return;
      e.preventDefault();
      const now = performance.now();
      const abs = Math.abs(e.deltaY);
      const gap = now - lastWheel;
      const speedingUp = abs > lastAbs * 1.4 + 4;
      lastWheel = now;
      lastAbs = abs;
      if (busy || abs < 1) return;
      // Only a new gesture moves the page: after a pause, or when the swipe speeds up again.
      // The slowing tail of a touchpad swipe (momentum) is ignored.
      if (gap > 160 || speedingUp) step(dir);
    }

    function onKey(e: KeyboardEvent) {
      if (!mq.matches || pageLocked() || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
      const down = e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey);
      const up = e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      e.preventDefault();
      if (!busy) step(down ? 1 : -1);
    }

    // After the scrollbar is dragged (or anything else moves the page), settle on the nearest stop.
    function settle() {
      if (!mq.matches || busy || pageLocked() || performance.now() - lastWheel < 300) return;
      const y = window.scrollY;
      const pts = stops();
      const nearest = pts.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), pts[0]);
      if (Math.abs(nearest - y) > 2) glide(nearest);
    }
    const hasScrollEnd = "onscrollend" in window;
    function onScroll() {
      if (hasScrollEnd) return;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 180);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (hasScrollEnd) window.addEventListener("scrollend", settle);
    return () => {
      anim?.stop();
      window.clearTimeout(settleTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      if (hasScrollEnd) window.removeEventListener("scrollend", settle);
    };
  }, []);
  return null;
}
