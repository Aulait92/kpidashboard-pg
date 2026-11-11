// Pay-per-Lead-Eingang aus Airtable (Tabelle „Leads“): jeder eingegangene Lead,
// auch die, die Airtable/Zapier nicht verteilt haben (Dublette, schwach, ohne
// Abnehmer …). Grundlage für „Eingang“ und „von uns abgelehnt“ in der
// PPL-Auswertung, solange die Verteilung noch in Airtable läuft.
//
// Ableitung an den echten Daten geprüft (11.11.2026): Ein Lead gilt als
// geliefert, sobald er einem Bezug/Käufer zugewiesen wurde (Zuweisungsdatum,
// liefer_status „ok“ oder Bezug-Link); ältere Leads haben teils keinen
// Bezug-Link mehr, aber ein Zuweisungsdatum.

import { prisma } from "@/lib/prisma";
import { FIRST_MONTH } from "@/lib/zahlen";
import { berlinMidnight } from "@/lib/ppl/periods";

/** Ab hier erfasst der Abgleich den Eingang vollständig (erster Monat der Zahlen, 00:00 Berlin). */
export const INTAKE_SINCE = berlinMidnight(Number(FIRST_MONTH.slice(0, 4)), Number(FIRST_MONTH.slice(5, 7)), 1);

export type IntakeOutcome = "geliefert" | "abgelehnt" | "offen";

export const INTAKE_REASONS = {
  dublette: "Dublette",
  weitergabe: "Weitergabe abgelehnt",
  beamter: "Beamter",
  schwach: "schwach",
  keinAbnehmer: "kein Abnehmer",
  wartet: "wartet auf Zustimmung",
  bearbeitung: "in Bearbeitung",
} as const;

export type IntakeFacts = {
  dublette: boolean;
  /** „Weitergabe-Zustimmung“: Zugestimmt | Ausstehend | Abgelehnt | null */
  consent: string | null;
  hasBezug: boolean;
  assigned: boolean;
  deliveryOk: boolean;
  hasBuyer: boolean;
  weak: boolean;
  civilServant: boolean;
  /** Stunden seit Eingang (für „in Bearbeitung“) */
  ageHours: number;
};

/** Ergebnis und Grund eines eingegangenen Leads (rein, getestet). */
export function classifyIntake(f: IntakeFacts): { outcome: IntakeOutcome; reason: string | null } {
  const consent = (f.consent ?? "").toLowerCase();
  const delivered = f.hasBezug || f.assigned || f.deliveryOk || f.hasBuyer;
  if (consent === "abgelehnt") return { outcome: "abgelehnt", reason: INTAKE_REASONS.weitergabe };
  if (delivered) {
    // zugewiesen, aber der Endkunde hat der Weitergabe noch nicht zugestimmt
    if (consent === "ausstehend" && !f.deliveryOk) return { outcome: "offen", reason: INTAKE_REASONS.wartet };
    return { outcome: "geliefert", reason: null };
  }
  if (f.dublette) return { outcome: "abgelehnt", reason: INTAKE_REASONS.dublette };
  if (consent === "ausstehend") return { outcome: "offen", reason: INTAKE_REASONS.wartet };
  if (f.ageHours < 6) return { outcome: "offen", reason: INTAKE_REASONS.bearbeitung };
  if (f.civilServant) return { outcome: "abgelehnt", reason: INTAKE_REASONS.beamter };
  if (f.weak) return { outcome: "abgelehnt", reason: INTAKE_REASONS.schwach };
  return { outcome: "abgelehnt", reason: INTAKE_REASONS.keinAbnehmer };
}

export type IntakeRow = {
  airtableId: string;
  receivedAt: Date;
  productKey: string | null;
  source: string | null;
  outcome: IntakeOutcome;
  reason: string | null;
  leadId: string | null;
};

/**
 * Eingang speichern: neue Zeilen gesammelt anlegen, nur geänderte aktualisieren
 * (ein Abgleich läuft alle paar Minuten über alle Airtable-Leads → kein N+1).
 */
export async function saveIntake(rows: IntakeRow[]): Promise<{ created: number; updated: number }> {
  if (!rows.length) return { created: 0, updated: 0 };
  const existing = new Map(
    (await prisma.pplIntake.findMany({ select: { airtableId: true, receivedAt: true, productKey: true, source: true, outcome: true, reason: true, leadId: true } })).map((r) => [r.airtableId, r]),
  );
  const fresh = rows.filter((r) => !existing.has(r.airtableId));
  const changed = rows.filter((r) => {
    const e = existing.get(r.airtableId);
    return (
      e &&
      (e.outcome !== r.outcome ||
        e.reason !== r.reason ||
        e.productKey !== r.productKey ||
        e.source !== r.source ||
        e.leadId !== r.leadId ||
        e.receivedAt.getTime() !== r.receivedAt.getTime())
    );
  });
  for (let i = 0; i < fresh.length; i += 500) {
    await prisma.pplIntake.createMany({ data: fresh.slice(i, i + 500), skipDuplicates: true });
  }
  for (let i = 0; i < changed.length; i += 100) {
    await prisma.$transaction(
      changed.slice(i, i + 100).map((r) =>
        prisma.pplIntake.update({
          where: { airtableId: r.airtableId },
          data: { receivedAt: r.receivedAt, productKey: r.productKey, source: r.source, outcome: r.outcome, reason: r.reason, leadId: r.leadId },
        }),
      ),
    );
  }
  return { created: fresh.length, updated: changed.length };
}
