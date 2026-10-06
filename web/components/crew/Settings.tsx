"use client";
// Settings sheet: language, who is logged in, installing the app, what's still waiting to be sent, log out.
import { useEffect, useState } from "react";
import { useApp, useSync } from "./context";
import { LANG_NAMES, LANGS, type Key } from "./i18n";
import { IDownload, ILogout, IUpload, IUser } from "./icons";
import { Btn, Card, Confirm, Segmented, Sheet } from "./ui";

export const APP_VERSION = "1.0.0";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferredPrompt: InstallPrompt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPrompt;
  });
}

export function Settings({ open, onClose, onLogout }: { open: boolean; onClose: () => void; onLogout: () => void }) {
  const { t, lang, setLang, me, crew, sync } = useApp();
  const snap = useSync();
  const [confirm, setConfirm] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCanPrompt(!!deferredPrompt);
    setStandalone(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, [open]);

  const n = snap.items.length;
  const c = crew(me.user.crewId);
  const leaderOrOwner = me.user.role !== "worker";

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    setCanPrompt(false);
  }

  return (
    <>
      <Sheet open={open && !confirm} onClose={onClose} title={t("set.title")} closeLabel={t("common.close")}>
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold text-ink-soft">{t("set.lang")}</h3>
            <Segmented label={t("set.lang")} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} />
          </section>

          <Card tone="mist" className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-sun">
              <IUser className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] text-muted">{t("set.you")}</p>
              <p className="truncate text-[18px] font-bold">{me.user.name}</p>
              <p className="text-[15px] text-ink-soft">
                {t(`set.role.${me.user.role}` as Key)} · {c ? c.name : t("set.noCrew")}
                {me.user.phone ? ` · ${me.user.phone}` : ""}
              </p>
            </div>
          </Card>

          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold text-ink-soft">{t("set.queue")}</h3>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
              <IUpload className="h-6 w-6 shrink-0 text-ink-soft" />
              <p className="flex-1 text-[16px] font-semibold">{n ? t("q.waiting", { n }) : t("set.queueNone")}</p>
              {n ? (
                <Btn variant="dark" busy={snap.syncing} onClick={() => void sync.syncNow()}>
                  {t("q.sendNow")}
                </Btn>
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold text-ink-soft">{t("set.install")}</h3>
            {standalone ? (
              <p className="rounded-2xl bg-[#e3f6ea] px-4 py-3 text-[16px] font-semibold text-[#15803d]">✓ {t("set.installed")}</p>
            ) : (
              <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-line">
                <p className="text-[16px] leading-snug">{t("set.installHint")}</p>
                {canPrompt ? (
                  <Btn variant="primary" block onClick={() => void install()}>
                    <IDownload className="h-5 w-5" />
                    {t("set.installBtn")}
                  </Btn>
                ) : (
                  <p className="rounded-xl bg-mist px-3 py-2.5 text-[15px] text-ink-soft">{ios ? t("set.installIos") : t("set.installAndroid")}</p>
                )}
              </div>
            )}
          </section>

          <div className="grid gap-2">
            {leaderOrOwner ? (
              <Btn variant="light" block href="/office">
                {t("set.office")}
              </Btn>
            ) : null}
            <Btn variant="danger" block onClick={() => (n ? setConfirm(true) : onLogout())}>
              <ILogout className="h-5 w-5" />
              {t("set.logout")}
            </Btn>
          </div>
          <p className="text-center text-[14px] text-muted">
            TelineKiito · {t("set.version", { v: APP_VERSION })}
          </p>
        </div>
      </Sheet>
      <Confirm
        open={confirm}
        danger
        title={t("set.logout")}
        text={t("set.logoutQueued", { n })}
        yes={t("set.logoutAnyway")}
        no={t("common.cancel")}
        closeLabel={t("common.close")}
        onYes={() => {
          setConfirm(false);
          onLogout();
        }}
        onNo={() => setConfirm(false)}
      />
    </>
  );
}
