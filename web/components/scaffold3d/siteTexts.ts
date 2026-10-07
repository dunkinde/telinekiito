// Texts for the 3D view on the public website (calculator, tracking page, share page), in the visitor's language.
import type { I18n } from "@/lib/i18n";
import type { PlanSide } from "@/lib/plan";
import type { Scaffold3DTexts } from "./Scaffold3D";

/** "Long side A" → "Pitkä sivu A", "Wall 3" → "Seinä 3". */
export function siteSideName(i: I18n, s: PlanSide) {
  const m = /^(Long side|Short side|Gable end|Wall) (\w+)$/.exec(s.name);
  if (!m) return s.name;
  const k = m[1] === "Long side" ? "p3d.side.long" : m[1] === "Short side" ? "p3d.side.short" : m[1] === "Wall" ? "p3d.side.wall" : "p3d.side.gable";
  return i.t(k, { x: m[2] });
}

export function siteTexts(i: I18n): Scaffold3DTexts {
  return {
    hint: i.t("p3d.hint"),
    reset: i.t("p3d.reset"),
    loading: i.t("p3d.loading"),
    failed: i.t("p3d.failed"),
    close: i.t("p3d.close"),
    sideName: (s) => siteSideName(i, s),
    sideInfo: (s) => i.t("p3d.info", { bays: s.bays, levels: s.lifts, area: s.area })
  };
}
