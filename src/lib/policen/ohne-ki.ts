// Auflage A9 der Rechtsprüfung (docs/recht/policen-whatsapp-gesundheitsdaten.md, Stand 18.11.2026): Der Kontakt kann
// das automatische Auslesen per Stichwort „ohne KI“ ablehnen, vor oder nach dem Klick auf „Einverstanden“. Hier nur
// die Abfrage aus dem Nachweis (PolicenNachweis), ohne KI und ohne Chat. Genutzt vom Eingang (lib/policen/server.ts),
// vom Auslesen (lib/policen/auslesen/server.ts) und vom bisherigen Vertrag (lib/bisheriger-vertrag-server.ts).

import { prisma } from "@/lib/prisma";

/** Nachweis-Art für das Stichwort (Erklärung des Kontakts, nur anhängen). */
export const NACHWEIS_OHNE_KI = "ohne_ki";

/**
 * Hat der Kontakt dieses Leads das automatische Auslesen abgelehnt? Stichwort „ohne KI“ (gilt dauerhaft) bzw. letzte
 * Einwilligung mit ki = false.
 */
export async function kiAbgelehnt(leadId: string): Promise<boolean> {
  const [stichwort, letzte] = await Promise.all([
    prisma.policenNachweis.count({ where: { leadId, art: NACHWEIS_OHNE_KI } }),
    prisma.policenNachweis.findFirst({
      where: { leadId, art: { in: ["einwilligung", "abgelehnt", "widerruf"] } },
      orderBy: { createdAt: "desc" },
      select: { art: true, ki: true },
    }),
  ]);
  return stichwort > 0 || (letzte?.art === "einwilligung" && letzte.ki === false);
}
