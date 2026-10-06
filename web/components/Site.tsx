"use client";
// The whole one-page site. Providers first (language, shared state, toasts), then the sections in order.
// MotionConfig "user" turns off transform animations for visitors who ask for reduced motion.
import { MotionConfig } from "framer-motion";
import { LangProvider, useI18n } from "@/lib/i18n";
import { BlockScroll } from "./BlockScroll";
import { Header } from "./Header";
import { Intro } from "./Intro";
import { QuoteWizard } from "./quote/QuoteWizard";
import { TrackOrder } from "./quote/TrackOrder";
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
import { SiteProvider } from "./SiteContext";
import { ToastProvider } from "./ui/Toast";

function SkipLink() {
  const { t } = useI18n();
  return (
    <a href="#main" className="skip-link">
      {t("skip")}
    </a>
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
            <QuoteWizard />
            <TrackOrder />
          </ToastProvider>
        </SiteProvider>
      </LangProvider>
    </MotionConfig>
  );
}
