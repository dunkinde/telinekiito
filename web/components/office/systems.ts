// Scaffold systems as the office sees them: our own aluminium systems and the partners' steel systems.
import { SYSTEM_NAMES, type SystemKey } from "@/lib/api";

/** Who rents us the material of a partner system (office and crew only, never shown to customers). */
export const SYSTEM_SUPPLIER: Partial<Record<SystemKey, string>> = { alfix100: "Renta", allround: "Ramirent" };
export const isPartnerSystem = (k: SystemKey | undefined | null) => Boolean(k && SYSTEM_SUPPLIER[k]);
/** "ALFIX 100 · Renta" for a partner system, the plain name for our own. */
export const systemLabel = (k: SystemKey | undefined | null) => {
  const key = k || "layher";
  return SYSTEM_SUPPLIER[key] ? `${SYSTEM_NAMES[key]} · ${SYSTEM_SUPPLIER[key]}` : SYSTEM_NAMES[key];
};
