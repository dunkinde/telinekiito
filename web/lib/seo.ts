// Search-engine helpers: shared metadata, page URLs with their language versions, and JSON-LD structured data.
// All absolute URLs are built from SITE_URL (lib/site.ts).
import type { Metadata, Viewport } from "next";
import { CITIES, CITY_UI, type City } from "./cities";
import { FAQ, type Faq } from "./content";
import type { Lang } from "./i18n";
import { CONTROLLER } from "./privacy";
import { SITE, SITE_URL } from "./site";

export const BASE_METADATA: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE.name,
  robots: { index: true, follow: true }
};

export const VIEWPORT: Viewport = {
  themeColor: "#0e1217",
  width: "device-width",
  initialScale: 1
};

export const OG_LOCALE: Record<Lang, string> = { fi: "fi_FI", en: "en_GB" };

/** Path of a city page: /telineet/hamina (Finnish) or /en/scaffolding/hamina (English). */
export const cityPath = (slug: string, lang: Lang) => (lang === "fi" ? `/telineet/${slug}` : `/en/scaffolding/${slug}`);
export const abs = (path: string) => SITE_URL + (path === "/" ? "" : path);

/** File name of a share image under /og/ (app/og/[file]/route.ts); no arguments = the home page image. */
export const ogFile = (slug?: string, lang?: Lang) => (slug && lang ? `${lang}-${slug}.png` : "home.png");
export const ogImages = (alt: string, slug?: string, lang?: Lang) => [{ url: `/og/${ogFile(slug, lang)}`, width: 1200, height: 630, alt }];

/** Canonical link and hreflang alternates of a city page. */
export function cityAlternates(slug: string, lang: Lang): Metadata["alternates"] {
  return {
    canonical: cityPath(slug, lang),
    languages: { fi: cityPath(slug, "fi"), en: cityPath(slug, "en"), "x-default": cityPath(slug, "fi") }
  };
}

/** The general FAQ entries shown on every city page under the local ones. */
export const CITY_GENERAL_FAQ: Faq[] = [FAQ[0], FAQ[1], FAQ[5]];
export const cityFaq = (c: City): Faq[] => [...c.faq, ...CITY_GENERAL_FAQ];

/* ---------- JSON-LD ---------- */
type Json = Record<string, unknown>;
const BUSINESS_ID = `${SITE_URL}/#business`;

/** The company, with the placeholder details from lib/privacy.ts until the company exists. */
export function businessLd(lang: Lang): Json {
  return {
    "@type": "LocalBusiness",
    "@id": BUSINESS_ID,
    name: SITE.name,
    legalName: CONTROLLER.name,
    identifier: CONTROLLER.businessId,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    image: `${SITE_URL}/og/${ogFile()}`,
    telephone: SITE.phone,
    email: SITE.email,
    priceRange: "€€",
    currenciesAccepted: "EUR",
    address: { "@type": "PostalAddress", streetAddress: CONTROLLER.address, addressCountry: "FI" },
    areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name[lang] })),
    knowsLanguage: ["fi", "en"]
  };
}

function faqLd(list: Faq[], lang: Lang): Json {
  return {
    "@type": "FAQPage",
    mainEntity: list.map((f) => ({
      "@type": "Question",
      name: f.q[lang],
      acceptedAnswer: { "@type": "Answer", text: f.a[lang] }
    }))
  };
}

export function homeLd(): Json {
  return { "@context": "https://schema.org", "@graph": [businessLd("fi"), { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE.name, inLanguage: "fi" }] };
}

export function cityLd(c: City, lang: Lang): Json {
  const url = abs(cityPath(c.slug, lang));
  return {
    "@context": "https://schema.org",
    "@graph": [
      businessLd(lang),
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: c.h1[lang],
        serviceType: CITY_UI.serviceType[lang],
        url,
        provider: { "@id": BUSINESS_ID },
        areaServed: {
          "@type": "City",
          name: c.name[lang],
          ...(c.sv ? { alternateName: c.sv } : {}),
          geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon },
          containedInPlace: { "@type": "AdministrativeArea", name: c.region[lang] }
        },
        offers: { "@type": "Offer", priceCurrency: "EUR", url, availability: "https://schema.org/InStock" }
      },
      { ...faqLd(cityFaq(c), lang), "@id": `${url}#faq` },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: CITY_UI.home[lang], item: lang === "fi" ? SITE_URL : `${SITE_URL}/?lang=en` },
          { "@type": "ListItem", position: 2, name: c.name[lang], item: url }
        ]
      }
    ]
  };
}

/** Script tag content: "<" is escaped so no text can close the tag. */
export const ldJson = (data: Json) => JSON.stringify(data).replace(/</g, "\\u003c");
