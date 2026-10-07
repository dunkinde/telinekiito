"use client";
// Full-screen 3D view over the current page (crew app, tracking page): loads the plan when opened.
import { useEffect, useState } from "react";
import type { ScaffoldPlan } from "@/lib/plan";
import { Scaffold3D, type Scaffold3DTexts } from "./Scaffold3D";

export function Plan3DOverlay({ load, texts, title, onClose }: {
  load: () => Promise<ScaffoldPlan>;
  texts: Scaffold3DTexts;
  title: string;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<ScaffoldPlan | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    load().then((p) => alive && setPlan(p)).catch(() => alive && setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-[#0e1217]/85 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-3 text-white">
        <p className="font-semibold">{title}{plan ? ` · ${plan.systemName}` : ""}</p>
        <button type="button" onClick={onClose} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#0e1217]">
          {texts.close}
        </button>
      </div>
      {plan ? (
        <Scaffold3D plan={plan} texts={texts} className="flex-1" />
      ) : (
        <p className="grid flex-1 place-items-center rounded-2xl bg-white/95 text-sm text-[#3b434c]" role="status">{failed ? texts.failed : texts.loading}</p>
      )}
    </div>
  );
}
