"use client";
// The whole one-page site. Providers first (language, shared state, toasts), then the sections in order.
// MotionConfig "user" turns off transform animations for visitors who ask for reduced motion.
import { MotionConfig } from "framer-motion";
import { useEffect, useState, type ComponentType } from "react";
import { LangProvider, useI18n } from "@/lib/i18n";
import { BlockScroll } from "./BlockScroll";
import { Header } from "./Header";
import { Intro } from "./Intro";
import { BuildUp } from "./sections/BuildUp";
import { Contact } from "./sections/Contact";
import { Coverage } from "./sections/Coverage";
import { Faq } from "./sections/Faq";
import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Pricing } from "./sections/Pricing";
import { Projects } from "./sections/Projects";
import { Reviews } from "./sections/Reviews";
import { Services } from "./sections/Services";
import { SiteProvider, useSite } from "./SiteContext";
import { ToastProvider } from "./ui/Toast";

function SkipLink() {
  const { t } = useI18n();
  return (
    <a href="#main" className="skip-link">
      {t("skip")}
    </a>
  );
}

// The quote and tracking windows are about a third of the page's code. They load once the page is up, at the first
// touch or key press, or at once when a tracking link opens the page, so phones get the first screen sooner.
type Windows = { QuoteWizard: ComponentType; TrackOrder: ComponentType };
let windows: Promise<Windows> | null = null;
function loadWindows() {
  windows ??= Promise.all([import("./quote/QuoteWizard"), import("./quote/TrackOrder")]).then(
    ([q, tr]) => ({ QuoteWizard: q.QuoteWizard, TrackOrder: tr.TrackOrder }),
    (e) => {
      windows = null; // try again on the next open
      throw e;
    }
  );
  return windows;
}

function LazyWindows() {
  const { quote, track } = useSite();
  const [w, setW] = useState<Windows | null>(null);
  const wanted = quote.open || track.open;
  useEffect(() => {
    if (w) return;
    let alive = true;
    const go = () => loadWindows().then((m) => alive && setW(m), () => {});
    if (wanted) go();
    let timer = 0;
    const later = () => (timer = window.setTimeout(go, 1000));
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    window.addEventListener("pointerdown", go, { once: true, capture: true });
    window.addEventListener("keydown", go, { once: true, capture: true });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("load", later);
      window.removeEventListener("pointerdown", go, { capture: true });
      window.removeEventListener("keydown", go, { capture: true });
    };
  }, [w, wanted]);
  if (!w) return null;
  return (
    <>
      <w.QuoteWizard />
      <w.TrackOrder />
    </>
  );
}

export default function Site() {
  return (
    <MotionConfig reducedMotion="user">
      <LangProvider>
        <SiteProvider>
          <ToastProvider>
            <SkipLink />
            <Intro />
            <BlockScroll />
            <Header />
            <main id="main" tabIndex={-1} className="outline-none">
              <Hero />
              <Services />
              <HowItWorks />
              <BuildUp />
              <Projects />
              <Reviews />
              <Pricing />
              <Coverage />
              <Faq />
              <Contact />
            </main>
            <Footer />
            <LazyWindows />
          </ToastProvider>
        </SiteProvider>
      </LangProvider>
    </MotionConfig>
  );
}
