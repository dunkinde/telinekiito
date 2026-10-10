import type { Metadata, Viewport } from "next";
import CrewApp from "@/components/crew/CrewApp";

// The crew app for workers' phones. Installable from the browser (crew.webmanifest). Not for search engines.
export const metadata: Metadata = {
  title: "TelineKiito – Työmaa",
  robots: { index: false, follow: false },
  manifest: "/crew.webmanifest",
  appleWebApp: { capable: true, title: "TelineKiito", statusBarStyle: "black-translucent" }
};
export const viewport: Viewport = { themeColor: "#0e1217", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function CrewPage() {
  return <CrewApp />;
}
