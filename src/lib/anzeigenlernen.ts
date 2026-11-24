// Gemeinsames Anzeigenlernen (Ole, 24.11.2026): Muster und Ergebnisse der Anzeigen aller Kunden fließen in Anzeigen
// anderer Kunden ein (lib/kampagnen, Parameter vorlagenVon; Leitplanken dort). Kunden können dem im Kundenbereich
// widersprechen (Einstellungen → KI-Hilfe und Anzeigenlernen, lib/datennutzung-server.ts). Hier nur die Lesefunktion
// für die Kampagnen-Agenten: Wer ist ausgenommen?
//
// Was dem Kunden beim Widerspruch zugesagt ist (Dialogtext, lib/datennutzung.ts DIALOG_TEXT): „Sie werden vom Lernen
// ausgenommen. Ihre Anzeigen werden nicht für andere Kunden genutzt.“ Ein ausgenommener Kunde darf also nicht Quelle
// sein (seine Anzeigen und Ergebnisse nie für andere), und er ist auch selbst nicht Teil des gemeinsamen Lernens.

import { prisma } from "@/lib/prisma";

/**
 * Kunden mit aktivem Widerspruch gegen das gemeinsame Anzeigenlernen (Customer.anzeigenlernenWiderspruchAt gesetzt),
 * als Menge der IDs aus `ids`. Vor jedem Lauf frisch abfragen (ein Widerspruch wirkt sofort, eine Rücknahme auch).
 * Wirft bei einem Datenbankfehler: ohne sichere Auskunft darf kein Kunde als „nicht ausgenommen“ gelten.
 */
export async function vomLernenAusgenommen(ids: string[]): Promise<Set<string>> {
  const eindeutig = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (!eindeutig.length) return new Set();
  const rows = await prisma.customer.findMany({
    where: { id: { in: eindeutig }, anzeigenlernenWiderspruchAt: { not: null } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
