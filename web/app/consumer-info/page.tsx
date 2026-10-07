import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = {
  title: "Ennakkotiedot ja peruuttamisoikeus | Pre-contract information – TelineKiito",
  description: "Ennakkotiedot kuluttajalle, peruuttamisoikeus ja peruuttamislomake. Pre-contract information, right of withdrawal and model withdrawal form."
};

export default function ConsumerInfoPage() {
  return <Legal doc="info" />;
}
