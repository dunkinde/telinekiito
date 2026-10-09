"use client";
// The shared 3D plan page (/3d?t=…): the office sends this link to the customer or crew. It shows only the
// scaffold and the house shape – no names, phone numbers or address.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LangProvider, useI18n } from "@/lib/i18n";
import type { ScaffoldPlan } from "@/lib/plan";
import { LangSwitch } from "../Header";
import { Logo } from "../Logo";
import { Scaffold3D } from "./Scaffold3D";
import { siteSideName, siteTexts } from "./siteTexts";

export default function SharedPlan() {
  return (
    <LangProvider>
      <Body />
    </LangProvider>
  );
}

function Body() {
  const i18n = useI18n();
  const { t } = i18n;
  const [data, setData] = useState<{ ref: string; plan: ScaffoldPlan } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") || "";
    if (!/^[\w-]{12,40}$/.test(token)) return setFailed(true);
    api<{ ref: string; plan: ScaffoldPlan }>("GET", `/api/plan/${encodeURIComponent(token)}`).then(setData).catch(() => setFailed(true));
  }, []);
  const p = data?.plan;
  return (
    <div className="flex min-h-[100svh] flex-col bg-mist">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/" aria-label="TelineKiito">
            <Logo dark />
          </a>
          <LangSwitch dark />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        {failed ? (
          <p className="rounded-2xl bg-white p-6 text-ink ring-1 ring-line">{t("p3d.notFound")}</p>
        ) : !p ? (
          <p className="text-muted" role="status">{t("p3d.loading")}</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{data!.ref}</p>
              <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-ink">{t("p3d.title")}</h1>
              <p className="mt-1 text-sm text-ink-soft">{t("p3d.sub", { system: p.systemName, area: p.area, sides: p.sides.length })}</p>
            </div>
            <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_260px]">
              <Scaffold3D plan={p} texts={siteTexts(i18n)} className="h-[62svh] min-h-[360px] lg:h-full" selected={pick} onSelect={setPick} />
              <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                <p className="field-label">{t("p3d.sides")}</p>
                <ul className="space-y-1">
                  {p.sides.map((s) => (
                    <li key={s.i}>
                      <button
                        type="button"
                        onClick={() => setPick(pick === s.i ? null : s.i)}
                        aria-pressed={pick === s.i}
                        className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm ${pick === s.i ? "bg-sun-soft" : "hover:bg-mist"}`}
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-bold text-sun">{s.i}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink">{siteSideName(i18n, s)}</span>
                          <span className="block text-xs text-muted">{t("p3d.info", { bays: s.bays, levels: s.lifts, area: s.area })}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">{p.house.measured ? t("p3d.measured") : p.house.outline ? t("p3d.outline") : t("p3d.box")}</p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
