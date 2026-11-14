// Herkunft eines Leads für Zahlen und Quoten (Ole, 14.11.2026): bezahlte Leads (Meta, Outbrain usw.),
// Empfehlungen (Empfehlungslink eines Kunden) und Bestandskunden (Antwort auf eine Bestandskampagne).
// Quoten, Trichter und Kosten pro Lead/Termin/Abschluss rechnen nur mit bezahlten Leads; Provision
// und Gewinn zählen alle Herkünfte. Reine Funktionen ohne Datenbank.
//
// Erweiterbar (z. B. Bestandskampagnen-Statistik): neue Herkunft in LEAD_ORIGINS ergänzen, in
// leadOrigin() erkennen und in originWhere() als Prisma-Filter abbilden. Alle Auswertungen laufen
// über diese beiden Funktionen.

export type LeadOrigin = "paid" | "empfehlung" | "bestand";

export const LEAD_ORIGINS: readonly { key: LeadOrigin; label: string; plural: string }[] = [
  { key: "paid", label: "Bezahlter Lead", plural: "bezahlte Leads" },
  { key: "empfehlung", label: "Empfehlung", plural: "Empfehlungen" },
  { key: "bestand", label: "Bestandskunde", plural: "Bestandskampagnen" },
];

export const EMPFEHLUNG_SOURCE = "Empfehlung";
export const BESTAND_SOURCE = "Bestandskunde";

export type LeadOriginInput = { source?: string | null; adChannel?: string | null; referralLinkId?: string | null };

/** Herkunft eines Leads. */
export function leadOrigin(l: LeadOriginInput): LeadOrigin {
  if (l.referralLinkId || l.source === EMPFEHLUNG_SOURCE || l.adChannel === EMPFEHLUNG_SOURCE) return "empfehlung";
  if (l.source === BESTAND_SOURCE) return "bestand";
  return "paid";
}

/** Felder, die leadOrigin() braucht (Prisma-select). */
export const LEAD_ORIGIN_SELECT = { source: true, adChannel: true, referralLinkId: true } as const;

/**
 * Prisma-Filter (Lead) für eine Herkunft. Achtung NULL: „nicht Empfehlung“ muss Leads ohne
 * Quelle/Kanal einschließen, deshalb die expliziten OR mit null.
 */
export function originWhere(origin: LeadOrigin) {
  if (origin === "empfehlung") {
    return { OR: [{ referralLinkId: { not: null } }, { source: EMPFEHLUNG_SOURCE }, { adChannel: EMPFEHLUNG_SOURCE }] };
  }
  if (origin === "bestand") {
    return { AND: [{ source: BESTAND_SOURCE }, { referralLinkId: null }, { OR: [{ adChannel: null }, { adChannel: { not: EMPFEHLUNG_SOURCE } }] }] };
  }
  return {
    AND: [
      { referralLinkId: null },
      { OR: [{ source: null }, { source: { notIn: [EMPFEHLUNG_SOURCE, BESTAND_SOURCE] } }] },
      { OR: [{ adChannel: null }, { adChannel: { not: EMPFEHLUNG_SOURCE } }] },
    ],
  };
}

/** Bezahlte Leads (Quoten, Kosten pro Lead, Funnel, Garantien). */
export const PAID_LEAD_WHERE = originWhere("paid");
