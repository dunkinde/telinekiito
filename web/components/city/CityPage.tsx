// A city landing page (server component): the text is in the static HTML; the address bar, transport price and
// dialogs are client islands inside CityShell. Used by /telineet/[city] and /en/scaffolding/[city].
import type { Metadata } from "next";
import { CITIES, CITY_UI, ZONE_SPEED, fill, type City } from "@/lib/cities";
import { STEPS } from "@/lib/content";
import type { Lang } from "@/lib/i18n";
import { OG_LOCALE, cityAlternates, ogImages, cityFaq, cityLd, cityPath, ldJson } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { CityAddressBar, CityShell, QuoteButton, ZonePrice } from "./CityShell";

export function cityMetadata(c: City, lang: Lang): Metadata {
  const title = c.title[lang];
  const description = c.description[lang];
  return {
    title,
    description,
    alternates: cityAlternates(c.slug, lang),
    openGraph: {
      title,
      description,
      type: "website",
      url: cityPath(c.slug, lang),
      siteName: SITE.name,
      locale: OG_LOCALE[lang],
      alternateLocale: [OG_LOCALE[lang === "fi" ? "en" : "fi"]],
      images: ogImages(c.h1[lang], c.slug, lang)
    },
    twitter: { card: "summary_large_image", title, description, images: ogImages(c.h1[lang], c.slug, lang) }
  };
}

const Check = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-sun-deep" aria-hidden>
    <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function CityPage({ city: c, lang }: { city: City; lang: Lang }) {
  const other: Lang = lang === "fi" ? "en" : "fi";
  const name = c.name[lang];
  const vars = { city: name, region: c.region[lang], zone: c.zone, km: c.km, to: c.toFi, in: c.inFi };
  const faq = cityFaq(c);
  const others = CITIES.filter((o) => o.slug !== c.slug);

  return (
    <CityShell lang={lang} alternate={cityPath(c.slug, other)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(cityLd(c, lang)) }} />
      <main id="main" tabIndex={-1} className="outline-none">
        {/* Hero */}
        <section className="relative overflow-hidden bg-mist pt-12 pb-16 sm:pt-16 sm:pb-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
            <div className="lg:col-span-7">
              <nav aria-label="Breadcrumb" className="text-sm text-muted">
                <a href={lang === "fi" ? "/" : "/?lang=en"} className="nav-link hover:text-ink">
                  {CITY_UI.home[lang]}
                </a>
                <span aria-hidden> / </span>
                <span aria-current="page">{name}</span>
              </nav>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">{fill(CITY_UI.eyebrow[lang], vars)}</p>
              <h1 className="mt-3 font-display text-[clamp(2.2rem,5.6vw,4rem)] leading-[1.02] font-extrabold tracking-[-0.03em] text-ink">{c.h1[lang]}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{c.lead[lang]}</p>
              <CityAddressBar placeholder={fill(CITY_UI.addressPh[lang], vars)} />
              <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
                {CITY_UI.trust.map((tr) => (
                  <li key={tr.en} className="inline-flex items-center gap-1.5">
                    <Check />
                    {tr[lang]}
                  </li>
                ))}
              </ul>
            </div>

            {/* Delivery zone and transport price */}
            <aside className="self-end lg:col-span-5">
              <div className="rounded-[28px] bg-white p-6 ring-1 ring-line sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{fill(CITY_UI.zoneTitle[lang], vars)}</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink">{CITY_UI.zoneNames[c.zone][lang]}</p>
                <p className="mt-1 text-sm text-muted">{c.km ? fill(CITY_UI.distance[lang], vars) : CITY_UI.distanceHome[lang]}</p>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                    <dt className="text-ink-soft">{CITY_UI.transport[lang]}</dt>
                    <dd className="font-display text-xl font-bold text-ink">
                      <ZonePrice zone={c.zone} />
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="sr-only">{lang === "fi" ? "Toimitusaika" : "Delivery time"}</dt>
                    <dd className="font-semibold text-ink">{ZONE_SPEED[c.zone][lang]}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs leading-relaxed text-muted">{CITY_UI.transportNote[lang]}</p>
              </div>
            </aside>
          </div>
        </section>

        {/* Local section */}
        <section className="py-16 sm:py-20" aria-labelledby="local-title">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
            <div className="lg:col-span-7">
              <h2 id="local-title" className="font-display text-3xl font-extrabold tracking-[-0.02em] text-ink sm:text-4xl">
                {fill(CITY_UI.localTitle[lang], vars)}
              </h2>
              {c.local.map((p) => (
                <p key={p.en} className="mt-5 leading-relaxed text-ink-soft">
                  {p[lang]}
                </p>
              ))}
            </div>
            <div className="space-y-5 lg:col-span-5">
              <div className="rounded-3xl bg-sun-soft p-6">
                <h3 className="font-display text-lg font-bold text-ink">{c.tip.title[lang]}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{c.tip.text[lang]}</p>
              </div>
              <div className="rounded-3xl bg-mist p-6 ring-1 ring-line">
                <h3 className="font-display text-lg font-bold text-ink">{CITY_UI.areasTitle[lang]}</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {c.areas.map((a) => (
                    <li key={a} className="rounded-full bg-white px-3 py-1 text-sm text-ink-soft ring-1 ring-line">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How to order */}
        <section className="bg-ink py-16 text-white sm:py-20" aria-labelledby="steps-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="steps-title" className="font-display text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
              {CITY_UI.stepsTitle[lang]}
            </h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title.en} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                  <p className="font-display text-3xl font-extrabold text-sun">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 font-display text-xl font-bold">{s.title[lang]}</h3>
                  <p className="mt-2 leading-relaxed text-white/75">{s.text[lang]}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ: native disclosure, works without scripts; the same questions are in the FAQPage data. */}
        <section className="py-16 sm:py-20" aria-labelledby="faq-title">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 id="faq-title" className="font-display text-3xl font-extrabold tracking-[-0.02em] text-ink sm:text-4xl">
              {fill(CITY_UI.faqTitle[lang], vars)}
            </h2>
            <div className="mt-8 space-y-3">
              {faq.map((f, i) => (
                <details key={f.q.en} open={i === 0} className="group rounded-2xl bg-white ring-1 ring-line open:ring-ink/20">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-6 py-5 font-display text-lg font-bold text-ink [&::-webkit-details-marker]:hidden">
                    <h3>{f.q[lang]}</h3>
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-xl leading-none transition-transform group-open:rotate-45 group-open:bg-sun">
                      +
                    </span>
                  </summary>
                  <p className="px-6 pb-6 leading-relaxed text-muted">{f.a[lang]}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Call to action and the other cities */}
        <section className="bg-mist py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-white p-8 ring-1 ring-line md:flex-row md:items-center">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">{CITY_UI.ctaTitle[lang]}</h2>
                <p className="mt-2 max-w-xl text-muted">{CITY_UI.ctaText[lang]}</p>
              </div>
              <QuoteButton label={CITY_UI.quote[lang]} />
            </div>
            <nav aria-labelledby="others-title" className="mt-12">
              <h2 id="others-title" className="font-display text-xl font-bold text-ink">
                {CITY_UI.othersTitle[lang]}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-3">
                {others.map((o) => (
                  <li key={o.slug}>
                    <a href={cityPath(o.slug, lang)} className="inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-line transition-colors hover:ring-ink/40">
                      {lang === "fi" ? `Telineet ${o.name.fi}` : `Scaffolding ${o.name.en}`}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
      </main>

      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {SITE.year} {SITE.name}. {CITY_UI.rights[lang]}
          </p>
          <p className="flex gap-5">
            <a href={`mailto:${SITE.email}`} className="nav-link hover:text-white">
              {SITE.email}
            </a>
            <a href="/privacy" className="nav-link hover:text-white">
              {CITY_UI.privacy[lang]}
            </a>
          </p>
        </div>
      </footer>
    </CityShell>
  );
}
