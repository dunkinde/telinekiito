import type { Metadata } from "next";
import BizApp from "@/components/business/BizApp";

// The portal for business customers: their sites, orders, changes and invoices. Not for search engines.
export const metadata: Metadata = {
  title: "TelineKiito – Yritysasiakkaat | Business",
  robots: { index: false, follow: false }
};

export default function BusinessPage() {
  return <BizApp />;
}
