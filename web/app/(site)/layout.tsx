import type { Metadata, Viewport } from "next";
import { RootHtml } from "@/components/RootHtml";
import { BASE_METADATA, VIEWPORT } from "@/lib/seo";

export const metadata: Metadata = {
  ...BASE_METADATA,
  title: "TelineKiito – Rakennustelineet nopeasti | Fast scaffolding in Finland",
  description:
    "Rakennustelineet omakotitaloihin ja yrityksille koko Suomessa. Hinta osoitteella noin minuutissa, kiirepystytys 24 tunnissa. Scaffolding priced online in about a minute."
};

export const viewport: Viewport = VIEWPORT;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootHtml lang="fi">{children}</RootHtml>;
}
