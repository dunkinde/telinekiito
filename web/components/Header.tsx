"use client";
// Sticky header. After a little scrolling its background fades in (with blur) and the bar shrinks:
// the background layer scales down and the content moves up, so only transform and opacity change.
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useEffect, useState } from "react";
import { useI18n, type Key, type Lang } from "@/lib/i18n";
import { useSite } from "./SiteContext";
import { Logo } from "./Logo";
import { Button } from "./ui/Button";

const NAV: { id: string; key: Key }[] = [
  { id: "services", key: "nav.services" },
  { id: "how", key: "nav.how" },
  { id: "projects", key: "nav.projects" },
  { id: "pricing", key: "nav.pricing" },
  { id: "faq", key: "nav.faq" },
  { id: "contact", key: "nav.contact" }
];

export function LangSwitch({ dark = false }: { dark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("lang.label")} className={`relative inline-flex rounded-full p-0.5 text-xs font-bold ring-1 ring-inset ${dark ? "ring-white/20" : "ring-ink/15"}`}>
      {(["fi", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`relative z-10 h-7 w-9 rounded-full uppercase transition-colors ${lang === l ? "text-ink" : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"}`}
        >
          {lang === l ? <motion.span layoutId={dark ? "lang-pill-dark" : "lang-pill"} className="absolute inset-0 -z-10 rounded-full bg-sun" transition={{ type: "spring", stiffness: 500, damping: 35 }} /> : null}
          {l}
        </button>
      ))}
    </div>
  );
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const NAV_IDS = NAV.map((n) => n.id);

export function Header() {
  const { t } = useI18n();
  const { openQuote, openTrack } = useSite();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const active = useActiveSection(NAV_IDS);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  // Close the mobile menu with Esc or when the screen grows to desktop size.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => mq.matches && setMenu(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [menu]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-20">
      <motion.div
        aria-hidden
        className="absolute inset-0 origin-top border-b border-line/80 bg-white/80 backdrop-blur-xl backdrop-saturate-150"
        initial={false}
        animate={{ opacity: scrolled || menu ? 1 : 0, scaleY: scrolled && !menu ? 0.8 : 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="relative mx-auto flex h-20 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8"
        initial={false}
        animate={{ y: scrolled && !menu ? -8 : 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <a href="#top" aria-label={t("nav.home")} className="mr-auto shrink-0">
          <motion.span className="block origin-left" animate={{ scale: scrolled ? 0.92 : 1 }} transition={{ duration: 0.35 }}>
            <Logo />
          </motion.span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} data-active={active === n.id} className="nav-link text-[15px] font-medium text-ink-soft transition-colors hover:text-ink">
              {t(n.key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LangSwitch />
          <button type="button" onClick={() => openTrack()} className="nav-link hidden text-[15px] font-medium text-ink-soft hover:text-ink xl:inline">
            {t("nav.track")}
          </button>
          <span className="hidden sm:block">
            <Button size="sm" onClick={() => openQuote()}>
              {t("nav.quote")}
            </Button>
          </span>
          {/* Hamburger: three bars that turn into a cross. */}
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-controls="mobile-menu"
            aria-label={menu ? t("nav.close") : t("nav.menu")}
            className="relative grid h-10 w-10 place-items-center rounded-full ring-1 ring-inset ring-ink/15 lg:hidden"
          >
            <span className="relative block h-3.5 w-5">
              <motion.span className="absolute left-0 top-0 h-[2px] w-5 rounded bg-ink" animate={menu ? { y: 6, rotate: 45 } : { y: 0, rotate: 0 }} transition={{ duration: 0.3 }} />
              <motion.span className="absolute left-0 top-[6px] h-[2px] w-5 rounded bg-ink" animate={{ opacity: menu ? 0 : 1, scaleX: menu ? 0.4 : 1 }} transition={{ duration: 0.2 }} />
              <motion.span className="absolute left-0 top-[12px] h-[2px] w-5 rounded bg-ink" animate={menu ? { y: -6, rotate: -45 } : { y: 0, rotate: 0 }} transition={{ duration: 0.3 }} />
            </span>
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {menu ? (
          <motion.nav
            key="menu"
            id="mobile-menu"
            aria-label="Mobile"
            className="absolute inset-x-0 top-20 border-b border-line bg-white px-4 pb-6 shadow-xl sm:px-6 lg:hidden"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.ul
              className="divide-y divide-line"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
            >
              {NAV.map((n) => (
                <motion.li key={n.id} variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}>
                  <a href={`#${n.id}`} onClick={() => setMenu(false)} className="flex items-center justify-between py-4 font-display text-xl font-bold text-ink">
                    {t(n.key)}
                    <span aria-hidden className="text-muted">→</span>
                  </a>
                </motion.li>
              ))}
            </motion.ul>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button className="w-full" onClick={() => { setMenu(false); openQuote(); }}>
                {t("nav.quote")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setMenu(false); openTrack(); }}>
                {t("nav.track")}
              </Button>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
