// Share images as static PNG files with stable names: /og/home.png, /og/fi-hamina.png, /og/en-hamina.png …
// (Route handlers keep the .png extension in the static export; opengraph-image files would get hashed names
// without one.)
import { CITY_UI, ZONE_SPEED, cityBySlug, citySlugs } from "@/lib/cities";
import { ogImage } from "@/lib/og";
import { ogFile } from "@/lib/seo";

export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => [
  { file: ogFile() },
  ...citySlugs().flatMap((slug) => (["fi", "en"] as const).map((lang) => ({ file: ogFile(slug, lang) })))
];

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^(fi|en)-(.+)\.png$/.exec((await params).file);
  const c = m && cityBySlug(m[2]);
  if (!m || !c) {
    return ogImage({ eyebrow: "Rakennustelineet", title: "Telineet pystyyn nopeasti. Hinta minuutissa.", sub: "Kirjoita osoite – toimitus, asennus ja purku samassa hinnassa." });
  }
  const lang = m[1] as "fi" | "en";
  return ogImage({ eyebrow: CITY_UI.eyebrow[lang].replace("{region}", c.region[lang]), title: c.h1[lang], sub: ZONE_SPEED[c.zone][lang] });
}
