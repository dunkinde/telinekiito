import type { Metadata, Viewport } from "next";
import { RootHtml } from "@/components/RootHtml";
import { BASE_METADATA, VIEWPORT } from "@/lib/seo";

// English landing pages (/en/...). Everything else lives under app/(site) with the Finnish root layout.
export const metadata: Metadata = BASE_METADATA;
export const viewport: Viewport = VIEWPORT;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootHtml lang="en">{children}</RootHtml>;
}
