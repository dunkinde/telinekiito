"use client";
// For business customers: what a company account gives (own price, all sites, ordering, invoicing), how to get one
// (register → we call → order) and the way into the business portal (/business).
import { useI18n, type Key } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { IconArrow, IconCheck, IconMap, IconTruck } from "../ui/Icons";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";

const Percent = ({ className = "" }: { className?: string }) => (
  <span aria-hidden className={`font-display text-lg leading-none font-extrabold ${className}`}>
    %
  </span>
);

const BENEFITS: { n: 1 | 2 | 3 | 4; Icon: (p: { className?: string }) => React.ReactNode }[] = [
  { n: 1, Icon: Percent },
  { n: 2, Icon: IconMap },
  { n: 3, Icon: IconTruck },
  { n: 4, Icon: IconCheck }
];

export function Business() {
  const { t, lang } = useI18n();
  const portal = `/business/?lang=${lang}`;
  return (
    <section id="business" className="snap-screen section-pad relative overflow-hidden bg-mist">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead split eyebrow={t("sec.biz.eyebrow")} title={t("sec.biz.title")} intro={t("sec.biz.intro")} />
        <div className="head-gap grid gap-4 lg:grid-cols-12 lg:gap-5">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:col-span-8 lg:gap-5">
            {BENEFITS.map(({ n, Icon }) => (
              <StaggerItem key={n} className="h-full">
                <div className="flex h-full flex-col rounded-3xl bg-white p-5 ring-1 ring-line lg:p-6 short:py-4">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sun text-ink">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 font-display text-lg leading-tight font-bold text-ink">{t(`sec.biz.b${n}.title` as Key)}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted short:text-sm">{t(`sec.biz.b${n}.text` as Key)}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
          <div className="flex flex-col rounded-3xl bg-ink p-6 text-white lg:col-span-4 lg:p-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-sun uppercase">{t("sec.biz.steps")}</p>
            <ol className="mt-4 space-y-4">
              {(["sec.biz.s1", "sec.biz.s2", "sec.biz.s3"] as Key[]).map((k, i) => (
                <li key={k} className="flex gap-3">
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 font-display text-sm font-bold text-sun">
                    {i + 1}
                  </span>
                  <span className="pt-1 text-[15px] leading-snug text-white/85">{t(k)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 lg:mt-auto lg:pt-6">
              <Button href={`${portal}#/register`} className="w-full">
                {t("sec.biz.register")}
                <IconArrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
              <p className="mt-4 text-center text-sm text-white/60">
                {t("sec.biz.have")}{" "}
                <a href={portal} className="font-semibold text-white underline underline-offset-2 hover:text-sun">
                  {t("sec.biz.login")}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
