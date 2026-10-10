import type { MetadataRoute } from "next";
import { citySlugs } from "@/lib/cities";
import { abs, cityPath } from "@/lib/seo";

export const dynamic = "force-static";

// Public pages only; the office, crew, business portal and API are disallowed in robots.txt.
export default function sitemap(): MetadataRoute.Sitemap {
  const cities: MetadataRoute.Sitemap = citySlugs().flatMap((slug) =>
    (["fi", "en"] as const).map((lang) => ({
      url: abs(cityPath(slug, lang)),
      changeFrequency: "monthly" as const,
      priority: 0.8,
      alternates: { languages: { fi: abs(cityPath(slug, "fi")), en: abs(cityPath(slug, "en")) } }
    }))
  );
  return [
    { url: abs("/"), changeFrequency: "weekly", priority: 1 },
    ...cities,
    { url: abs("/privacy"), changeFrequency: "yearly", priority: 0.2 }
  ];
}
