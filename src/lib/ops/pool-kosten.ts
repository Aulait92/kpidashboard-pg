// Kosten je Kunde aus Pool-Kampagnen nach Lead-Anteil (Admin v2, Paket A0, Ole 17.11.2026; docs/ux/admin-v2-plan.md).
//
// Pool-Kampagnen laufen auf Agentur-Werbekonten (AdSpendDaily ohne customerId) und liefern an mehrere Käufer. Die
// Ausgaben einer Kampagne werden auf die Kunden verteilt, im Verhältnis der Leads, die sie aus dieser Kampagne bekommen
// haben. Leads der Kampagne ohne Kunden (geparkt, Dublette, nicht verteilt) bekommen ihren Anteil als „nicht verteilt“,
// damit die Summe der Kunden nicht künstlich steigt. Kampagnen mit Ausgaben, aber ohne Leads landen unter „ohne Leads“.
//
// Reine Funktion ohne Datenbank, Beträge in Cent (Summen stimmen auf den Cent: Restcents nach größtem Rest).
// Nur als Hinweis gedacht (Arbeitsannahme 1 im Plan): die Zuordnung Lead → Kampagne ist bisher selten befüllt.

export type PoolAusgabe = { kampagneId: string; cent: number };
export type PoolLeadAnteil = { kampagneId: string; kundeId: string | null };

export type PoolKostenKunde = { kundeId: string; cent: number; leads: number; kampagnen: number };

export type PoolKosten = {
  kunden: PoolKostenKunde[];
  /** Anteil der Leads ohne Kunden (nicht verteilt) */
  nichtVerteiltCent: number;
  /** Ausgaben von Kampagnen ohne einen einzigen Lead */
  ohneLeadsCent: number;
  gesamtCent: number;
};

/** Betrag in Cent auf Gewichte verteilen; die Summe der Teile ist genau `cent` (größter Rest bekommt den Rest-Cent). */
export function verteileCent(cent: number, gewichte: number[]): number[] {
  const summe = gewichte.reduce((s, g) => s + g, 0);
  if (!summe || !Number.isFinite(cent)) return gewichte.map(() => 0);
  const roh = gewichte.map((g) => (cent * g) / summe);
  const teile = roh.map((r) => Math.floor(r));
  let rest = cent - teile.reduce((s, t) => s + t, 0);
  const reihenfolge = roh.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; rest > 0 && k < reihenfolge.length; k++, rest--) teile[reihenfolge[k].i]++;
  return teile;
}

/**
 * Kosten je Kunde aus Pool-Kampagnen. `ausgaben`: Ausgaben je Kampagne im Zeitraum (mehrere Zeilen je Kampagne werden
 * addiert). `leads`: je Lead die Kampagne und der Kunde, an den er ging (null = nicht verteilt), im selben Zeitraum.
 * Leads von Kampagnen ohne Ausgaben zählen bei `leads`, kosten aber nichts.
 */
export function poolKostenJeKunde(ausgaben: PoolAusgabe[], leads: PoolLeadAnteil[]): PoolKosten {
  const ausgabeJe = new Map<string, number>();
  for (const a of ausgaben) if (a.cent > 0) ausgabeJe.set(a.kampagneId, (ausgabeJe.get(a.kampagneId) ?? 0) + Math.round(a.cent));

  // Leads je Kampagne und Kunde ("" = nicht verteilt)
  const leadsJe = new Map<string, Map<string, number>>();
  for (const l of leads) {
    const m = leadsJe.get(l.kampagneId) ?? new Map<string, number>();
    const k = l.kundeId ?? "";
    m.set(k, (m.get(k) ?? 0) + 1);
    leadsJe.set(l.kampagneId, m);
  }

  const kunden = new Map<string, PoolKostenKunde>();
  const kunde = (id: string) => kunden.get(id) ?? kunden.set(id, { kundeId: id, cent: 0, leads: 0, kampagnen: 0 }).get(id)!;
  let nichtVerteiltCent = 0;
  let ohneLeadsCent = 0;

  for (const [kampagneId, m] of leadsJe) {
    const eintraege = [...m].sort(([a], [b]) => a.localeCompare(b));
    const teile = verteileCent(ausgabeJe.get(kampagneId) ?? 0, eintraege.map(([, n]) => n));
    eintraege.forEach(([id, n], i) => {
      if (!id) {
        nichtVerteiltCent += teile[i];
        return;
      }
      const k = kunde(id);
      k.cent += teile[i];
      k.leads += n;
      k.kampagnen++;
    });
  }
  for (const [kampagneId, cent] of ausgabeJe) if (!leadsJe.has(kampagneId)) ohneLeadsCent += cent;

  const gesamtCent = [...ausgabeJe.values()].reduce((s, c) => s + c, 0);
  return {
    kunden: [...kunden.values()].sort((a, b) => b.cent - a.cent || a.kundeId.localeCompare(b.kundeId)),
    nichtVerteiltCent,
    ohneLeadsCent,
    gesamtCent,
  };
}
