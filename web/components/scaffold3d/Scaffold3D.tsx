"use client";
// Interactive 3D view of a scaffold plan: drag to turn, pinch or scroll to zoom, tap a side (or its number) to see
// its bays, levels and area. three.js loads only when the view opens. Texts come from the page that uses it, so
// the website, office, crew app and share page each show their own language.
import { useEffect, useRef, useState } from "react";
import type { PlanSide, ScaffoldPlan } from "@/lib/plan";
import { COLORS, buildScene, type SideObjects } from "./buildScene";

export interface Scaffold3DTexts {
  /** e.g. "Turn: drag · Zoom: pinch or scroll · Tap a side for details". */
  hint: string;
  reset: string;
  loading: string;
  failed: string;
  /** Name of a side in the page's language ("Wall 3" → "Seinä 3"). */
  sideName: (s: PlanSide) => string;
  /** One line about a side, e.g. "8 bays · 1 level · 96 m²". */
  sideInfo: (s: PlanSide) => string;
  close: string;
}

export function Scaffold3D({ plan, texts, className = "h-[420px]", selected, onSelect, compact = false }: {
  plan: ScaffoldPlan;
  texts: Scaffold3DTexts;
  className?: string;
  /** Small preview: no hint, buttons or side details; the camera still turns. */
  compact?: boolean;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [pick, setPick] = useState<number | null>(selected ?? null);
  const api = useRef<{ reset: () => void; select: (i: number | null) => void } | null>(null);

  useEffect(() => setPick(selected ?? null), [selected]);
  useEffect(() => api.current?.select(pick), [pick]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const T = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const el = host.current;
        if (disposed || !el) return;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);
        renderer.domElement.style.touchAction = "none";

        const scene = new T.Scene();
        scene.add(new T.HemisphereLight(0xffffff, 0xb9b4a8, 1.1));
        const sun = new T.DirectionalLight(0xffffff, 1.6);
        sun.position.set(-30, 50, 25);
        scene.add(sun);

        const built = buildScene(T, plan);
        scene.add(built.root);
        const center = built.box.getCenter(new T.Vector3());
        const radius = built.box.getSize(new T.Vector3()).length() / 2;

        const camera = new T.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.1, radius * 20);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2 - 0.04;
        controls.minDistance = radius * 0.6;
        controls.maxDistance = radius * 6;
        const reset = () => {
          const d = radius / Math.sin((35 * Math.PI) / 360) * 0.95;
          camera.position.set(center.x - d * 0.55, center.y + d * 0.5, center.z + d * 0.65);
          controls.target.copy(center);
          controls.update();
        };
        reset();

        // Numbers above the sides.
        const labels = built.sides.map((s) => {
          const c = document.createElement("canvas");
          c.width = c.height = 128;
          const g = c.getContext("2d")!;
          g.fillStyle = "#0e1217";
          g.beginPath();
          g.arc(64, 64, 56, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#ffc20e";
          g.font = "bold 64px Inter, system-ui, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(s.side.i), 64, 68);
          const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false }));
          sprite.scale.setScalar(Math.max(0.9, radius / 14));
          sprite.position.copy(s.labelAt);
          sprite.userData.side = s.side.i;
          sprite.renderOrder = 10;
          scene.add(sprite);
          return sprite;
        });

        const select = (i: number | null) => {
          built.sides.forEach((s: SideObjects) => {
            for (const m of s.materials) {
              m.emissive.setHex(s.side.i === i ? COLORS.selected : 0x000000);
              m.emissiveIntensity = s.side.i === i ? 0.45 : 0;
            }
          });
        };
        api.current = { reset, select };
        select(pick);

        // Tap or click picks the side under the pointer (a drag doesn't).
        const ray = new T.Raycaster(), ndc = new T.Vector2();
        let down: { x: number; y: number } | null = null;
        const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
        const onUp = (e: PointerEvent) => {
          if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
          const r = renderer.domElement.getBoundingClientRect();
          ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(ndc, camera);
          const hit = ray.intersectObjects([...labels, ...built.sides.map((s) => s.group)], true)[0];
          const i = hit ? (hit.object.userData.side as number | undefined) ?? null : null;
          setPick(i);
          onSelect?.(i);
        };
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointerup", onUp);

        const ro = new ResizeObserver(() => {
          const w = el.clientWidth, h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        });
        ro.observe(el);

        let raf = 0;
        const loop = () => {
          raf = requestAnimationFrame(loop);
          controls.update();
          renderer.render(scene, camera);
        };
        loop();
        setState("ready");

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointerup", onUp);
          controls.dispose();
          scene.traverse((o) => {
            const m = o as unknown as { geometry?: { dispose: () => void }; material?: { dispose: () => void; map?: { dispose: () => void } } | { dispose: () => void }[] };
            m.geometry?.dispose();
            const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
            for (const x of mats) { (x as { map?: { dispose: () => void } }).map?.dispose(); x.dispose(); }
          });
          renderer.dispose();
          renderer.domElement.remove();
          api.current = null;
        };
      } catch {
        if (!disposed) setState("failed");
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // The scene is rebuilt only when the plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const side = plan.sides.find((s) => s.i === pick) || null;
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#f4f6f8] to-[#e9ece6] ${className}`}>
      <div ref={host} className="absolute inset-0" />
      {state !== "ready" ? (
        <p className="absolute inset-0 grid place-items-center text-sm text-[#5d6773]" role="status">
          {state === "loading" ? texts.loading : texts.failed}
        </p>
      ) : null}
      {compact ? null : (
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <p className="rounded-full bg-white/85 px-3 py-1 text-[12px] text-[#3b434c] shadow-sm backdrop-blur">{texts.hint}</p>
        <button
          type="button"
          onClick={() => api.current?.reset()}
          className="pointer-events-auto shrink-0 rounded-full bg-white/90 px-3 py-1 text-[12px] font-semibold text-[#0e1217] shadow-sm hover:bg-white"
        >
          {texts.reset}
        </button>
      </div>
      )}
      {side && !compact ? (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-xl bg-[#0e1217]/90 px-4 py-3 text-white shadow-lg" role="status">
          <div className="min-w-0">
            <p className="font-semibold">
              <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-[#ffc20e] text-[13px] font-bold text-[#0e1217]">{side.i}</span>
              {texts.sideName(side)}
            </p>
            <p className="mt-0.5 text-[13px] text-white/75">{texts.sideInfo(side)}</p>
          </div>
          <button type="button" onClick={() => { setPick(null); onSelect?.(null); }} className="shrink-0 rounded-full px-2 py-1 text-[13px] text-white/80 hover:text-white" aria-label={texts.close}>
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
