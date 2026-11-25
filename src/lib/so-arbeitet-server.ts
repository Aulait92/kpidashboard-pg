// „So arbeitet Ihr Assistent“ laden (Paket P8): Ansprache, Name des Vermittlers, gewähltes Produkt (gebuchte Produkte,
// Leadformulare, zuletzt genutzte; lib/testlead.ts) mit Formularangaben wie bei einem echten Lead, Policen-Modul.
// Rein in lib/so-arbeitet.ts; Oberfläche components/so-arbeitet.tsx.

import { prisma } from "@/lib/prisma";
import { a, asAnsprache } from "@/lib/ansprache";
import { advisorDisplayName, firmDisplayName } from "@/lib/advisor-name";
import { ansprechpartner } from "@/lib/lead-anrede";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { kundenProdukte, testLeadAnswers } from "@/lib/testlead";
import { DEFAULT_LEAD_TIMES, loadLeadTimes } from "@/lib/calendar/lead-times";
import { assistentMomente, beispielVerlauf, type ChatZeile, type Moment } from "@/lib/so-arbeitet";

/** Beispielprodukt, wenn der Kunde noch keine Produkte hat: allgemeine Anfrage ohne Sparte. */
export const OHNE_PRODUKT = "Versicherung";

export type SoArbeitetDaten = {
  momente: Moment[];
  zeilen: ChatZeile[];
  /** Absender im Chat-Kopf (Agentur bzw. Name) */
  absender: string;
  produkte: string[];
  produkt: string;
};

/** Daten für Zeitleiste und Beispielchat eines Kunden; wunsch = Produkt aus der Auswahl (?produkt=). */
export async function ladeSoArbeitet(customerId: string, wunsch?: string | null, now = new Date()): Promise<SoArbeitetDaten> {
  const { gesundheitFreigegeben, GESUNDHEIT_FREIGABE_SELECT } = await import("@/lib/policen/regeln");
  const [customer, erst, produkteRoh, who, leadTimes] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, leadAddress: true, ...GESUNDHEIT_FREIGABE_SELECT } }),
    prisma.erstinformation.findUnique({ where: { customerId }, select: { firma: true } }).catch(() => null),
    kundenProdukte(customerId).catch(() => [] as string[]),
    ansprechpartner({ customerId }),
    // Gleiche Lead-Zeiten wie bei echten Leads (Agentur-Kalender), damit die Vorschau keine Tage außerhalb anbietet
    loadLeadTimes(customerId).catch(() => DEFAULT_LEAD_TIMES),
  ]);
  const an = asAnsprache(customer?.leadAddress);
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || advisorDisplayName(customer?.name) || a(an, "dein Berater", "Ihr Berater") });
  // Ohne gebuchte oder genutzte Produkte kein fremdes Beispielprodukt („Privatschutz“), sondern eine allgemeine Anfrage
  // (Usability-Check 25.11.2026, KLEIN 3)
  const produkte = produkteRoh.length ? produkteRoh : [OHNE_PRODUKT];
  const produkt = produkte.find((p) => p === wunsch) ?? produkte[0];
  const firma = erst?.firma?.trim() || firmDisplayName(customer?.name) || null;
  const policen = await import("@/lib/policen/server").then((m) => m.policenAn()).catch(() => false);
  const zeilen = beispielVerlauf({
    an,
    person,
    vermittler: { name: who.vermittler.name, anrede: who.vermittler.anrede },
    produkt,
    formular: testLeadAnswers(produkt),
    firma,
    policen,
    gesundheitAn: gesundheitFreigegeben(customer),
    leadTimes,
    now,
  });
  return { momente: assistentMomente(an), zeilen, absender: firma || who.vermittler.name || person.nom, produkte, produkt };
}
