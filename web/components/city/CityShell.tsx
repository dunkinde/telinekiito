"use client";
// Client frame of a city page: language (fixed by the URL), shared state, a small header, and the quote and
// tracking dialogs. The page text itself is rendered on the server and passed in as children.
import { MotionConfig } from "framer-motion";
import { CITY_UI } from "@/lib/cities";
import { LangProvider, useI18n, type Lang } from "@/lib/i18n";
import { eur } from "@/lib/format";
import type { Zone } from "@/lib/api";
import { Logo } from "../Logo";
import { QuoteWizard } from "../quote/QuoteWizard";
import { TrackOrder } from "../quote/TrackOrder";
import { AddressBar } from "../sections/Hero";
import { SiteProvider, useSite } from "../SiteContext";
import { Button } from "../ui/Button";
import { ToastProvider } from "../ui/Toast";

export function CityShell({ lang, alternate, children }: { lang: Lang; alternate: string; children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LangProvider fixed={lang}>
        <SiteProvider>
          <ToastProvider>
            <CityHeader alternate={alternate} />
            {children}
            <QuoteWizard />
            <TrackOrder />
          </ToastProvider>
        </SiteProvider>
      </LangProvider>
    </MotionConfig>
  );
}

function CityHeader({ alternate }: { alternate: string }) {
  const { lang, t } = useI18n();
  const { openQuote, openTrack } = useSite();
  const other: Lang = lang === "fi" ? "en" : "fi";
  return (
    <>
      <a href="#main" className="skip-link">
        {t("skip")}
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <a href={lang === "fi" ? "/" : "/?lang=en"} aria-label={`${CITY_UI.home[lang]} – TelineKiito`}>
            <Logo />
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            <button type="button" onClick={() => openTrack()} className="nav-link hidden text-sm font-semibold text-ink-soft hover:text-ink sm:inline">
              {CITY_UI.track[lang]}
            </button>
            {/* Each language has its own URL, so switching is a plain link. */}
            <a href={alternate} hrefLang={other} lang={other} className="grid h-9 min-w-11 place-items-center rounded-full px-2 text-xs font-bold uppercase ring-1 ring-inset ring-ink/15 hover:ring-ink/40">
              <span className="sr-only">{t("lang.label")}: </span>
              {other}
            </a>
            <Button size="sm" onClick={() => openQuote()}>
              {CITY_UI.quote[lang]}
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}

/** The hero address bar; the placeholder names the city. */
export function CityAddressBar({ placeholder }: { placeholder: string }) {
  return <AddressBar placeholder={placeholder} className="mt-8 max-w-xl" />;
}

/** Opens the calculator without an address (bottom call to action). */
export function QuoteButton({ label }: { label: string }) {
  const { openQuote } = useSite();
  return (
    <Button size="lg" onClick={() => openQuote()}>
      {label}
    </Button>
  );
}

/** One-way transport price for the zone, from the live price config (the same one the calculator uses). */
export function ZonePrice({ zone }: { zone: Zone }) {
  const { config } = useSite();
  const trip = config?.pricing.zones[zone]?.trip;
  return <span className="tabular-nums">{trip != null ? eur(trip) : "–"}</span>;
}
