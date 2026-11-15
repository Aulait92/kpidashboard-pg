// Sichtbarkeit des Bestandskunden-Moduls laden (Regel: lib/bestand/sichtbar.ts).

import { prisma } from "@/lib/prisma";
import { BESTAND_MODULE_AVAILABLE, bestandVisible } from "@/lib/bestand/sichtbar";

export const BESTAND_SICHT_SELECT = { existingCustomersEnabled: true, bestandSichtbar: true } as const;

/** Sieht dieser Kunde das Modul? `preview` = Admin-Vorschau („Als Kunde ansehen“): für Admins immer an. */
export async function loadBestandVisible(customerId: string, opts: { preview?: boolean } = {}): Promise<boolean> {
  if (BESTAND_MODULE_AVAILABLE || opts.preview) return true;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: BESTAND_SICHT_SELECT });
  return bestandVisible(c);
}
