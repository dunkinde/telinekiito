import type { Metadata } from "next";
import OfficeApp from "@/components/office/OfficeApp";

// The office for the head of company and team leaders. Not for search engines.
export const metadata: Metadata = {
  title: "TelineKiito – Toimisto",
  robots: { index: false, follow: false }
};

export default function OfficePage() {
  return <OfficeApp />;
}
