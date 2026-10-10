// The <html> shell shared by the root layouts: Finnish pages under app/(site), English pages under app/(en).
// Two root layouts let the static HTML carry the right lang attribute before any script runs.
import { Archivo, Inter } from "next/font/google";
import type { Lang } from "@/lib/i18n";
import "@/app/globals.css";

// Fonts are downloaded at build time and served from our own domain (no Google requests from visitors).
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export function RootHtml({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <html lang={lang} className={`${archivo.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
