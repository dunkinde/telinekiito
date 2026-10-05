"use client";
// The whole one-page site. Providers first (language, shared state, toasts), then the sections in order.
// MotionConfig "user" turns off transform animations for visitors who ask for reduced motion.
import { MotionConfig } from "framer-motion";
import { LangProvider } from "@/lib/i18n";
import { Header } from "./Header";
import { Intro } from "./Intro";
import { QuoteWizard } from "./quote/QuoteWizard";
import { TrackOrder } from "./quote/TrackOrder";
import { Contact } from "./sections/Contact";
import { Faq } from "./sections/Faq";
import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Pricing } from "./sections/Pricing";
import { Projects } from "./sections/Projects";
import { Services } from "./sections/Services";
import { SiteProvider } from "./SiteContext";
import { ToastProvider } from "./ui/Toast";

export default function Site() {
  return (
    <MotionConfig reducedMotion="user">
      <LangProvider>
        <SiteProvider>
          <ToastProvider>
            <Intro />
            <Header />
            <main>
              <Hero />
              <Services />
              <HowItWorks />
              <Projects />
              <Pricing />
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
