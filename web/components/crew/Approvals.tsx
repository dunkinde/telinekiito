"use client";
// Team leaders and the owner: change requests waiting for a decision (customers' extensions, crews' reports).
import { useCallback, useEffect, useState } from "react";
import { ApiError, getChanges, type ChangeRequest } from "@/lib/platform";
import { ChangeCard } from "./Changes";
import { useApp } from "./context";
import { errorText } from "./i18n";
import { IBack, ICheck, IRefresh, IWarn } from "./icons";
import { QueueBanner, TopBar } from "./Shell";
import { Btn, IconBtn, Spinner } from "./ui";

export function Approvals() {
  const { t, back, nav, authLost } = useApp();
  const [list, setList] = useState<ChangeRequest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getChanges("pending");
      setList(r.changes);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return authLost();
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [authLost]);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const offline = error instanceof ApiError && error.code === "network";
  return (
    <div className="min-h-[100dvh] bg-mist pb-[max(24px,env(safe-area-inset-bottom))]">
      <TopBar>
        <div className="flex items-center gap-1 py-1.5">
          <IconBtn dark label={t("common.back")} onClick={back}>
            <IBack className="h-7 w-7" />
          </IconBtn>
          <h1 className="flex-1 font-display text-[22px] font-extrabold">{t("appr.title")}</h1>
          <IconBtn dark label={t("common.refresh")} onClick={() => void load()} busy={loading}>
            <IRefresh className="h-6 w-6" />
          </IconBtn>
        </div>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        <QueueBanner />
        {list === null && !error ? (
          <div className="grid place-items-center py-24 text-muted">
            <Spinner className="h-9 w-9" />
          </div>
        ) : error && !list ? (
          <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-line">
            <IWarn className="mx-auto h-10 w-10 text-sun-deep" />
            <p className="mt-3 text-[17px] font-semibold">{offline ? t("appr.needOnline") : errorText(t, error)}</p>
            <Btn variant="dark" className="mt-4" busy={loading} onClick={() => void load()}>
              {t("common.retry")}
            </Btn>
          </div>
        ) : list && list.length ? (
          list.map((c) => (
            <ChangeCard
              key={c.id}
              change={c}
              canDecide
              showOrder
              onDecided={(d) => setList((xs) => (xs || []).filter((x) => x.id !== d.id))}
              onOpenJob={() => nav(`#/job/${c.ref}`)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-line">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e3f6ea] text-[#15803d]">
              <ICheck className="h-8 w-8" />
            </span>
            <p className="mt-4 font-display text-[20px] font-bold">{t("appr.empty")}</p>
            <p className="mt-1 text-[15px] text-muted">{t("appr.emptySub")}</p>
          </div>
        )}
      </main>
    </div>
  );
}
