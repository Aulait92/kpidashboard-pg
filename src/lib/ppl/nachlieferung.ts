// Nachlieferung bei Leadbestellungen (Ole, 24.11.2026: „wir liefern Leads immer nach und erstatten nichts“).
// Reine Rechnung ohne Datenbank (Tests: tests/unit/ppl-nachlieferung.test.ts), genutzt von lib/ppl/engine.ts quotaFor
// für Bezüge mit stornoErsatz:
// - Offene Ersatzleads (anerkannte Reklamationen ohne gelieferten Ersatz) kommen zuerst, kostenlos, ohne Bestellung.
// - Danach die älteste bezahlte Wochenbestellung, die noch nicht voll ist: nicht gelieferte Reste vergangener Wochen
//   werden in den Folgewochen nachgeliefert statt erstattet.

export type BestellStand = { id: string; periodStart: Date; quantity: number; delivered: number };

export type NachlieferPlan = {
  /** offene Menge insgesamt: Reste aller Bestellungen plus offene Ersatzleads */
  offen: number;
  /** offene Ersatzleads */
  ersatzOffen: number;
  /** Ziel des nächsten Leads: Ersatz für diesen reklamierten Lead … */
  ersatzFuerId: string | null;
  /** … oder diese Bestellung (älteste mit Rest) */
  orderId: string | null;
};

/**
 * @param orders bezahlte Bestellungen bis einschließlich der laufenden Woche, mit gelieferter Menge
 * @param ersatzFuer IDs der reklamierten Leads, für die noch ein Ersatz offen ist (älteste zuerst)
 */
export function planNachlieferung(orders: BestellStand[], ersatzFuer: string[]): NachlieferPlan {
  const offeneBestellungen = orders
    .filter((o) => o.delivered < o.quantity)
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const rest = offeneBestellungen.reduce((n, o) => n + (o.quantity - o.delivered), 0);
  const ersatzFuerId = ersatzFuer[0] ?? null;
  return {
    offen: rest + ersatzFuer.length,
    ersatzOffen: ersatzFuer.length,
    ersatzFuerId,
    orderId: ersatzFuerId ? null : (offeneBestellungen[0]?.id ?? null),
  };
}
