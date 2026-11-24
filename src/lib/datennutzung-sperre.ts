// Widerspruch gegen Amazon Web Services (Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“, lib/datennutzung.ts):
// Für diesen Kunden laufen die KI für Gesprächszusammenfassungen („Mit KI formulieren“), die KI-Vorschläge der Gründe
// (Gesprächszusammenfassung und Beratungsdokumentation) und das Auslesen von Unterlagen nicht mehr, unabhängig davon,
// welcher Anbieter gerade eingestellt ist (so sagt es der Dialogtext). Eigene kleine Datei nur mit dem Lesezugriff,
// damit die Dokument-KI (lib/policen/auslesen) und die Policen-Strecke nichts weiter einbinden.
//
// Geprüft wird an jedem Eingang, der Daten an den Dienst schicken würde:
//   lib/zusammenfassung-server.ts   zusammenfassungKi, gruendeVorschlag (Server Actions der zwei Blätter)
//   lib/policen/auslesen/server.ts  sperreFuer (vor jedem Auslesen: Eingang per WhatsApp, Vergleichsblatt, Sparten-Wahl)
//   lib/policen/flow/server.ts      kiSatzAktiv (kein Satz „damit Ihr Vergleich schon fertig ist“ an den Lead)
// Der Test tests/unit/datennutzung-aufrufstellen.test.ts hält fest, dass es keine weiteren Aufrufer gibt.

import { prisma } from "@/lib/prisma";

/**
 * Zeitpunkt des Widerspruchs gegen Amazon Web Services, null = kein Widerspruch. Wirft bei einem Datenbankfehler
 * (dann wird nichts an den Dienst geschickt, die Aufrufer brechen ab).
 */
export async function awsWiderspruchAm(customerId: string): Promise<Date | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { awsWiderspruchAt: true } });
  return c?.awsWiderspruchAt ?? null;
}
