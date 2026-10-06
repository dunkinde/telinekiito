import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain (no Google requests from visitors).
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "TelineKiito – Rakennustelineet nopeasti | Fast scaffolding in Finland",
  description:
    "Rakennustelineet omakotitaloihin ja yrityksille koko Suomessa. Hinta osoitteella noin minuutissa, kiirepystytys 24 tunnissa. Scaffolding priced online in about a minute.",
  applicationName: "TelineKiito",
  robots: { index: true, follow: true },
  openGraph: {
    title: "TelineKiito – Scaffolding up fast. Priced in a minute.",
    description: "Type your address and get a complete scaffolding price for your house.",
    type: "website",
    locale: "fi_FI",
    alternateLocale: ["en_GB"]
  }
};

export const viewport: Viewport = {
  themeColor: "#0e1217",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi" className={`${archivo.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
