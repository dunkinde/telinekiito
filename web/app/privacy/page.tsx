import type { Metadata } from "next";
import Privacy from "@/components/Privacy";

export const metadata: Metadata = {
  title: "Tietosuojaseloste | Privacy notice – TelineKiito",
  description: "Miten TelineKiito käsittelee henkilötietojasi. How TelineKiito handles your personal data."
};

export default function PrivacyPage() {
  return <Privacy />;
}
