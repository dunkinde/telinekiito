"use client";
// The dark top bar and the banner that tells what is still waiting on the phone.
import { actionLabel, errorText, type Key } from "./i18n";
import { useApp, useSync } from "./context";
import { ICloudOff, IRefresh, IUpload, IWarn } from "./icons";
import { cx, Spinner } from "./ui";
import { ApiError } from "@/lib/platform";

export function TopBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <header className={cx("sticky top-0 z-30 bg-ink text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]", className)}>
      <div className="mx-auto w-full max-w-2xl px-2 pt-[env(safe-area-inset-top)]">{children}</div>
    </header>
  );
}

/** Offline state, writes waiting on the phone, writes the server refused, and a new app version. */
export function QueueBanner() {
  const { t, sync } = useApp();
  const snap = useSync();
  const n = snap.items.length;
  return (
    <div className="space-y-2 empty:hidden">
      {snap.updateReady ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-left text-[15px] font-semibold text-white"
        >
          <IRefresh className="h-5 w-5 shrink-0 text-sun" />
          <span className="flex-1">{t("net.update")}</span>
        </button>
      ) : null}
      {n ? (
        <div className="flex items-center gap-3 rounded-2xl bg-sun px-4 py-3 text-ink shadow-sm" role="status">
          {snap.syncing && snap.online ? <Spinner className="h-6 w-6 shrink-0" /> : <IUpload className="h-6 w-6 shrink-0" />}
          <p className="flex-1 text-[15px] leading-snug font-semibold">{snap.syncing && snap.online ? t("q.sending", { n }) : t("q.waiting", { n })}</p>
          {!snap.syncing ? (
            <button type="button" onClick={() => void sync.syncNow()} className="min-h-11 shrink-0 rounded-full bg-ink px-4 text-[15px] font-semibold text-white active:bg-ink-soft">
              {t("q.sendNow")}
            </button>
          ) : null}
        </div>
      ) : !snap.online ? (
        <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-ink-soft px-4 py-2 text-white" role="status">
          <ICloudOff className="h-5 w-5 shrink-0 text-sun" />
          <p className="flex-1 text-[15px] font-semibold">{t("net.offline")}</p>
        </div>
      ) : null}
      {snap.failures.map((f) => {
        const what = f.kind === "action" && f.action ? actionLabel(t, f.action) : t(`op.${f.kind}` as Key);
        const err = errorText(t, new ApiError(f.message, f.code, 400, f.info));
        return (
          <div key={f.id} className="flex items-start gap-3 rounded-2xl bg-[#fde8e8] px-4 py-3 text-[#8a1c13] ring-1 ring-[#f6c0c2]" role="alert">
            <IWarn className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1 text-[15px] leading-snug font-semibold">
              <span className="mr-1 font-display">{f.ref}</span>
              {t("q.failed", { what, err })}
            </p>
            <button type="button" onClick={() => sync.dismissFailure(f.id)} className="min-h-11 shrink-0 rounded-full bg-white px-4 text-[15px] font-semibold text-ink ring-1 ring-[#f6c0c2]">
              {t("q.dismiss")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
