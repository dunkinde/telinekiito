import type { Metadata } from "next";
import SharedPlan from "@/components/scaffold3d/SharedPlan";

export const metadata: Metadata = {
  title: "Telinesuunnitelma 3D | Scaffold plan – TelineKiito",
  robots: { index: false }
};

export default function SharedPlanPage() {
  return <SharedPlan />;
}
