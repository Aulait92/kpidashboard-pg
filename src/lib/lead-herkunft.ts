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

// ─── Bestandskampagnen: Zuordnung von Abschlüssen (Ole, 14.11.2026) ─────────
// Ein Abschluss (Vertrag mit Abschlussdatum) zählt für eine Bestandskampagne, wenn er innerhalb von 60 Tagen
// nach dem Anschreiben kommt und der Lead aus der Kampagne stammt oder es derselbe Bestandskunde ist.
// Mehrere Kampagnen beim selben Kunden: die letzte vor dem Abschluss zählt. Empfehlungen bleiben Empfehlungen
// (keine Doppelzählung), und der erste Vertrag eines bezahlten Leads bleibt beim bezahlten Lead (Lead-Kosten).
// Zahlen und Gewinn nutzen die Herkunft je Vertrag (lib/vertraege → CustomerContract.origin/campaignId).

export const CAMPAIGN_ATTRIBUTION_DAYS = 60;

export type CampaignSend = { campaignId: string; sentAt: Date; channel?: string | null };

/** Versand, dem ein Abschluss zugeordnet wird (letzte Kampagne in den 60 Tagen davor), sonst null. */
export function attributedSend(signedAt: Date, sends: CampaignSend[], days = CAMPAIGN_ATTRIBUTION_DAYS): CampaignSend | null {
  let best: CampaignSend | null = null;
  for (const s of sends) {
    if (s.sentAt > signedAt) continue;
    if (signedAt.getTime() - s.sentAt.getTime() > days * 86_400_000) continue;
    if (!best || s.sentAt > best.sentAt) best = s;
  }
  return best;
}

/** Kampagne, der ein Abschluss zugeordnet wird (letzte Kampagne in den 60 Tagen davor), sonst null. */
export function attributeToCampaign(signedAt: Date, sends: CampaignSend[], days = CAMPAIGN_ATTRIBUTION_DAYS): string | null {
  return attributedSend(signedAt, sends, days)?.campaignId ?? null;
}

/** Herkunft eines Vertrags: Empfehlung bleibt Empfehlung, sonst zählt die Kampagne (außer erster Vertrag eines bezahlten Leads). */
export function contractOrigin(lead: LeadOrigin, c: { primary: boolean; campaignId: string | null }): LeadOrigin {
  if (lead === "empfehlung") return "empfehlung";
  if (c.campaignId && !(lead === "paid" && c.primary)) return "bestand";
  return lead;
}

/** Zuordnung für einen Vertrag: Kampagne (oder null), ihr Kanal und die Herkunft in einem Schritt. */
export function attributeContract(
  lead: LeadOrigin,
  c: { primary: boolean; signedAt: Date },
  sends: CampaignSend[],
): { campaignId: string | null; campaignChannel: string | null; origin: LeadOrigin } {
  if (lead === "empfehlung" || (lead === "paid" && c.primary)) return { campaignId: null, campaignChannel: null, origin: lead };
  const send = attributedSend(c.signedAt, sends);
  const campaignId = send?.campaignId ?? null;
  return { campaignId, campaignChannel: send?.channel ?? null, origin: contractOrigin(lead, { primary: c.primary, campaignId }) };
}
