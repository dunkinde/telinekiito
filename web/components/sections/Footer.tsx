"use client";
// Footer: brand, section links, customer links, social icons and copyright.
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { LangSwitch } from "../Header";
import { Logo } from "../Logo";
import { useSite } from "../SiteContext";

export function Footer() {
  const { t, pick } = useI18n();
  const { openQuote, openTrack } = useSite();
  const linkCls = "nav-link text-white/70 transition-colors hover:text-white";
  // Only real profiles are shown (fill them in lib/site.ts).
  const social = [
    { href: SITE.social.linkedin, label: "LinkedIn", Icon: FaLinkedinIn },
    { href: SITE.social.instagram, label: "Instagram", Icon: FaInstagram },
    { href: SITE.social.facebook, label: "Facebook", Icon: FaFacebookF }
  ].filter((s) => s.href);
  return (
    <footer className="snap-end bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo dark />
            <p className="mt-5 max-w-sm leading-relaxed text-white/65">{t("foot.tagline")}</p>
            <div className="mt-6">
              <LangSwitch dark />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sun">{t("foot.services")}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  { job: "roof" as const, l: { fi: "Kattoremontti", en: "Roof renovation" } },
                  { job: "facade" as const, l: { fi: "Julkisivutyö", en: "Facade work" } },
                  { job: "roof_facade" as const, l: { fi: "Katto ja julkisivu", en: "Roof and facade" } },
                  { job: "gutters" as const, l: { fi: "Rännit ja räystäät", en: "Gutters and eaves" } }
                ].map((s) => (
                  <li key={s.job}>
                    <button type="button" onClick={() => openQuote({ jobType: s.job })} className={linkCls}>
                      {pick(s.l)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sun">{t("foot.company")}</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><a href="#how" className={linkCls}>{t("nav.how")}</a></li>
                <li><a href="#projects" className={linkCls}>{t("nav.projects")}</a></li>
                <li><a href="#pricing" className={linkCls}>{t("nav.pricing")}</a></li>
                <li><a href="#coverage" className={linkCls}>{t("nav.coverage")}</a></li>
                <li><a href="#faq" className={linkCls}>{t("nav.faq")}</a></li>
                <li><a href="#contact" className={linkCls}>{t("nav.contact")}</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sun">{t("foot.customers")}</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><button type="button" onClick={() => openQuote()} className={linkCls}>{t("nav.quote")}</button></li>
                <li><button type="button" onClick={() => openTrack()} className={linkCls}>{t("nav.track")}</button></li>
                <li><a href="/terms" className={linkCls}>{t("terms.link")}</a></li>
                <li><a href="/consumer-info" className={linkCls}>{t("info.link")}</a></li>
                <li><a href="/privacy" className={linkCls}>{t("privacy.link")}</a></li>
                <li><a href="/office" className={linkCls}>{t("foot.office")}</a></li>
              </ul>
              {social.length ? (
                <>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-sun">{t("foot.social")}</p>
              <div className="mt-4 flex gap-3">
                {social.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener"
                    aria-label={label}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-transform duration-300 hover:-translate-y-1 hover:bg-sun hover:text-ink"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {SITE.year} TelineKiito. {t("foot.rights")}</p>
          <a href="#top" className="nav-link self-start text-white/60 hover:text-white sm:self-auto">{t("foot.top")} ↑</a>
        </div>
      </div>
    </footer>
  );
}
