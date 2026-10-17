import type { Metadata, Viewport } from "next";
import OfficeApp from "@/components/office/OfficeApp";

// The office for the head of company and team leaders. Installable on phones (office.webmanifest). Not for search engines.
export const metadata: Metadata = {
  title: "TelineKiito – Toimisto",
  robots: { index: false, follow: false },
  manifest: "/office.webmanifest",
  appleWebApp: { capable: true, title: "Toimisto", statusBarStyle: "black" }
};
export const viewport: Viewport = { themeColor: "#0e1217", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function OfficePage() {
  return <OfficeApp />;
}
