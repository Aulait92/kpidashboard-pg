// Du/Sie gegenüber dem Vermittler selbst, also unserem Kunden (Ole, 18.11.2026): Begrüßung im Kundenbereich,
// persönliche Mails, Push. Nicht verwechseln mit Customer.leadAddress (wie der Vermittler seine Leads anspricht).
// Menüs, Knöpfe und Hinweise im Kundenbereich bleiben immer in Sie-Form (AGENTS.md).
//
// Reihenfolge: Einstellung am Kunden (Customer.vermittlerDu, im Admin änderbar, beim Annehmen des Angebots gesetzt)
// > angenommenes Angebot (Offer.mailDu über Onboarding.offerId) > Sie. Rein, ohne Datenbank
// (Laden: lib/vermittler-ansprache-server.ts).

/** true = Du, false = Sie. Unbekannt (beides leer) = Sie. */
export function vermittlerDuAus(o: { kunde?: boolean | null; angebot?: boolean | null }): boolean {
  if (typeof o.kunde === "boolean") return o.kunde;
  if (typeof o.angebot === "boolean") return o.angebot;
  return false;
}

/** Anzeige im Admin: „Du“ bzw. „Sie“, mit Herkunft, wenn die Einstellung am Kunden fehlt. */
export function vermittlerAnredeLabel(o: { kunde?: boolean | null; angebot?: boolean | null }): string {
  const du = vermittlerDuAus(o);
  if (typeof o.kunde === "boolean") return du ? "Du" : "Sie";
  if (typeof o.angebot === "boolean") return `${du ? "Du" : "Sie"} (aus dem Angebot)`;
  return "Sie (Standard)";
}
