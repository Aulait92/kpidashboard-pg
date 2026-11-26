// AGB eines Angebots (Ole, 26.11.2026): eine Stelle für Angebotsseite, PDF, Annahme-Link (/angebot/[token]/agb),
// Konto & Rechnungen → Ihr Vertrag und den Nachweis bei der Annahme. Nur die Abschnitte und Absätze, die für das
// Angebot gelten (lib/legal-texts.ts agbFuerAngebot, agbFiltern); Angebote vor GUARANTEES_UNTIL mit der archivierten
// Fassung „Stand 25.11.2026“, gefiltert nach denselben Merkmalen.

import { createHash } from "node:crypto";
import { AGB_2026_11_25, AGB_ARCHIV_STAND, agbMitGarantien } from "@/lib/agb-2026-11-25";
import { agbFiltern, agbFuerAngebot, agbMerkmaleGespeichert, LEGAL_VERSION, type AgbMerkmale, type LegalSection } from "@/lib/legal-texts";
import { kundenkontoAus } from "@/lib/ppl/kundenkonto";

export type AgbAngebotInput = {
  package: string;
  status?: string | null;
  createdAt: Date;
  garantieStichtag?: Date | null;
  leadAltBedingungen?: boolean | null;
  annualPrepay?: boolean | null;
  annualChoice?: boolean | null;
  pplProductKey?: string | null;
  pplProdukte?: unknown;
  pplModell?: string | null;
  seats?: number | null;
  seatsIncluded?: number | null;
  bestandMonthly?: unknown;
  empfehlungMonthly?: unknown;
  /** Bei der Annahme gespeicherte Merkmale (gehen bei angenommenen Angeboten vor) */
  agbMerkmale?: unknown;
};

export type AgbDesAngebots = {
  abschnitte: LegalSection[];
  besondere: LegalSection[] | null;
  /** Leadangebot mit eigenen Abschnitten (Nur Leads, Pay-per-Lead + Software) */
  lead: boolean;
  /** Archivierte Fassung mit Garantien */
  archiv: boolean;
  /** Stand der gezeigten Fassung (LEGAL_VERSION bzw. AGB_ARCHIV_STAND) */
  stand: string;
  merkmale: AgbMerkmale;
};

export function agbDesAngebots(o: AgbAngebotInput): AgbDesAngebots {
  const gespeichert = o.status === "accepted" ? agbMerkmaleGespeichert(o.agbMerkmale) : null;
  const a = agbFuerAngebot({
    package: o.package,
    kundenkonto: !!kundenkontoAus(o),
    leadAltBedingungen: !!o.leadAltBedingungen,
    zugaenge: o.seats != null && o.seatsIncluded != null,
    zusatzmodule: o.bestandMonthly != null || o.empfehlungMonthly != null,
    annualPrepay: o.annualPrepay,
    annualChoice: o.annualChoice,
    pplProductKey: o.pplProductKey,
    pplProdukte: o.pplProdukte,
    merkmale: gespeichert,
  });
  const archiv = agbMitGarantien(o);
  return {
    abschnitte: archiv ? agbFiltern(AGB_2026_11_25, a.merkmale) : a.agb,
    besondere: a.besondere,
    lead: a.lead,
    archiv,
    stand: archiv ? AGB_ARCHIV_STAND : LEGAL_VERSION,
    merkmale: a.merkmale,
  };
}

/**
 * Nachweis der gezeigten Fassung bei der Annahme (Offer.agbVersion, agbMerkmale, agbHash): Stand, Merkmale des Filters,
 * Titel der Abschnitte in Reihenfolge (Nummer = Position) und SHA-256 über den gezeigten Wortlaut (AGB und Besondere
 * Bedingungen). Mit Stand und Merkmalen lässt sich die Fassung aus dem Code der Version wiederherstellen, der Hash belegt sie.
 */
export function agbNachweis(o: AgbAngebotInput): { agbVersion: string; agbMerkmale: AgbMerkmale & { archiv: boolean; abschnitte: string[] }; agbHash: string } {
  const a = agbDesAngebots(o);
  const hash = createHash("sha256").update(JSON.stringify({ agb: a.abschnitte, besondere: a.besondere })).digest("hex");
  return {
    agbVersion: a.stand,
    agbMerkmale: { ...a.merkmale, archiv: a.archiv, abschnitte: a.abschnitte.map((s) => s.title) },
    agbHash: hash,
  };
}
