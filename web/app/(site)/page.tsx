import type { Metadata } from "next";
import Site from "@/components/Site";
import { homeLd, ldJson, ogImages } from "@/lib/seo";
import { SITE } from "@/lib/site";

const title = "TelineKiito – Rakennustelineet nopeasti | Fast scaffolding in Finland";
const description =
  "Rakennustelineet omakotitaloihin ja yrityksille koko Suomessa. Hinta osoitteella noin minuutissa, kiirepystytys 24 tunnissa. Scaffolding priced online in about a minute.";

export const metadata: Metadata = {
  alternates: { canonical: "/", languages: { fi: "/", "x-default": "/" } },
  openGraph: { title, description, type: "website", url: "/", siteName: SITE.name, locale: "fi_FI", alternateLocale: ["en_GB"], images: ogImages(title) },
  twitter: { card: "summary_large_image", title, description, images: ogImages(title) }
};

// The whole website is one page. Everything interactive lives in client components under /components.
export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(homeLd()) }} />
      <Site />
    </>
  );
}
