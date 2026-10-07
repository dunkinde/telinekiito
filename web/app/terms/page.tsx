import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = {
  title: "Sopimusehdot | Terms of service – TelineKiito",
  description: "TelineKiiton telinevuokran sopimusehdot. Terms of service for TelineKiito scaffolding rental."
};

export default function TermsPage() {
  return <Legal doc="terms" />;
}
