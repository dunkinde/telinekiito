"use client";
// Finger signature on a canvas. Exports a PNG data URL on a white background (for the inspection record).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { label: string; onChange?: (empty: boolean) => void }>(function SignaturePad({ label, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const empty = useRef(true);
  const last = useRef<{ x: number; y: number } | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const paintBackground = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  }, []);

  // Size the drawing surface to the element (sharp on high-density screens).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (c.width === w && c.height === h) return;
      // Keep what's drawn when the phone turns.
      const old = !empty.current ? c.toDataURL() : null;
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0e1217";
      ctx.lineWidth = 2.6;
      paintBackground();
      if (old) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = old;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [paintBackground]);

  useImperativeHandle(ref, () => ({
    clear() {
      paintBackground();
      empty.current = true;
      changeRef.current?.(true);
    },
    isEmpty: () => empty.current,
    toDataUrl: () => canvas.current!.toDataURL("image/png")
  }));

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = point(e);
    last.current = p;
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = "#0e1217";
    ctx.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d")!;
    const events = (e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent]) as PointerEvent[];
    const r = e.currentTarget.getBoundingClientRect();
    for (const ev of events) {
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      const l = last.current!;
      const mid = { x: (l.x + p.x) / 2, y: (l.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.quadraticCurveTo(l.x, l.y, mid.x, mid.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }
    if (empty.current) {
      empty.current = false;
      changeRef.current?.(false);
    }
  };
  const up = () => {
    last.current = null;
  };

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className="block h-[200px] w-full cursor-crosshair touch-none rounded-2xl bg-white ring-2 ring-line sm:h-[240px]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        data-testid="signature-pad"
      />
      <span aria-hidden className="pointer-events-none absolute right-6 bottom-12 left-6 border-b-2 border-dashed border-line" />
      <span aria-hidden className="pointer-events-none absolute bottom-[3.4rem] left-6 font-display text-[22px] text-line">×</span>
    </div>
  );
});
