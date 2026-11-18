// Leadpreis der letzten 7 Tage je Werbekonto gegen Ziel (Admin v2, Paket A6; Ole 17.11.2026, Fundtest Aufgabe 13).
// Reine Funktionen ohne Datenbank: Kosten und Meta-Leads aus AdSpendDaily (lib/anzeige-kosten.ts) je Konto
// zusammenzählen, Leadpreis gegen den Ziel-Leadpreis des Optimierungslaufs (refCplFor) stellen, teuerste zuerst.
// Laden: lib/optimierung/leadpreis-server.ts.

export const LEADPREIS_TAGE = 7;
/** Ab so viel Euro über Ziel: Hinweis in „Braucht Aufmerksamkeit“ (Liefern, Mein Tag). */
export const UEBER_ZIEL_EUR = 5;

export type KostenZeile = { customerId: string | null; adAccountId: string; campaignName: string | null; spend: number; metaLeads: number };
export type KontoFilter = {
  kind: "kunde" | "pool";
  customerId: string | null;
  adAccountId: string | null;
  /** Kampagnen-Stichwort des Kontos (wie im Optimierungslauf) */
  stichwort: string | null;
  /** Pool ohne Stichwort: Produkt des Pools, Kampagne über `produktVon` erkannt (wie im Optimierungslauf) */
  produkt?: string | null;
};

const ohneAct = (s: string | null) => (s ?? "").trim().replace(/^act_/, "");

/**
 * Kostenzeilen eines Kontos. Kunde: alle Zeilen mit seiner Kunden-ID (eigenes Konto und ihm zugeordnete
 * Agentur-Kampagnen; der Abgleich setzt sie nur bei eindeutigem Kunden). Nicht über die Konto-ID, weil sich mehrere
 * Kunden ein Konto teilen können. Pool: Agentur-Zeilen ohne Kunden, bei eingetragenem Konto nur auf diesem
 * Konto; Kampagne wie im Optimierungslauf: Name enthält das Stichwort, sonst erkanntes Produkt = Pool-Produkt
 * (Kampagnen mit „.“ im Namen gehören dann nicht dazu).
 */
export function zeilenFuerKonto(k: KontoFilter, zeilen: KostenZeile[], produktVon: (kampagne: string) => string | null = () => null): KostenZeile[] {
  const konto = ohneAct(k.adAccountId);
  if (k.kind === "kunde") return k.customerId ? zeilen.filter((z) => z.customerId === k.customerId) : [];
  const wort = (k.stichwort ?? "").trim().toLowerCase();
  const passt = wort
    ? (name: string) => name.toLowerCase().includes(wort)
    : k.produkt
      ? (name: string) => !name.includes(".") && produktVon(name) === k.produkt
      : () => false;
  return zeilen.filter((z) => !z.customerId && (!konto || ohneAct(z.adAccountId) === konto) && passt(z.campaignName ?? ""));
}

export type Leadpreis = {
  ausgaben: number;
  leads: number;
  /** null = keine Leads (oder keine Ausgaben) im Zeitraum */
  cpl: number | null;
  ziel: number | null;
  /** cpl − ziel in €, null ohne Ziel oder ohne Leadpreis */
  ueberZiel: number | null;
  zuTeuer: boolean;
};

const runde = (n: number) => Math.round(n * 100) / 100;

export function leadpreis(zeilen: KostenZeile[], ziel: number | null): Leadpreis {
  const ausgaben = runde(zeilen.reduce((s, z) => s + z.spend, 0));
  const leads = zeilen.reduce((s, z) => s + z.metaLeads, 0);
  const cpl = leads > 0 && ausgaben > 0 ? runde(ausgaben / leads) : null;
  const ueberZiel = cpl != null && ziel != null && ziel > 0 ? runde(cpl - ziel) : null;
  return { ausgaben, leads, cpl, ziel: ziel != null && ziel > 0 ? ziel : null, ueberZiel, zuTeuer: ueberZiel != null && ueberZiel > UEBER_ZIEL_EUR };
}

/** Teuerste zuerst; Konten ohne Leadpreis ans Ende (Reihenfolge sonst stabil). */
export function teuersteZuerst<T extends { leadpreis: Pick<Leadpreis, "cpl"> }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.leadpreis.cpl ?? -1) - (a.r.leadpreis.cpl ?? -1) || a.i - b.i)
    .map((x) => x.r);
}
