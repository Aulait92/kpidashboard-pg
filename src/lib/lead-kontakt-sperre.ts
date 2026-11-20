// Produkte ohne automatische Nachrichten an Leads (Ole, 20.11.2026: „PKV Tarifoptimierung bei allen Kunden keine
// Nachrichten per E-Mail und WhatsApp!“). Gilt für alle Kunden und alle automatischen Kanäle: WhatsApp-Erstanschreiben
// (outreach.ts), Antworten des Assistenten (gateway.ts), Nachfass-Abfolgen (lead-sequences.ts) und die Mail-/SMS-Strecke
// (mail-strecke/server.ts). Der Vermittler kann weiter selbst anrufen bzw. schreiben. Rein, ohne Datenbank.

const OHNE_AUTO = /tarif-?optim|§\s*204/i;

/** Bekommt ein Lead dieses Produkts keine automatischen Nachrichten? */
export function ohneAutoNachrichten(source: string | null | undefined): boolean {
  return OHNE_AUTO.test(source ?? "");
}

/** Prisma-Filter: Leads ohne Sperre (für Abfragen, die Leads zum Anschreiben auswählen). */
export const MIT_AUTO_NACHRICHTEN = {
  NOT: [{ source: { contains: "tarifoptim", mode: "insensitive" as const } }, { source: { contains: "tarif-optim", mode: "insensitive" as const } }, { source: { contains: "204" } }],
};
