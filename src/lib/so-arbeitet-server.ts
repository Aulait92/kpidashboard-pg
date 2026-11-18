// „So arbeitet Ihr Assistent“ laden (Paket P8): Ansprache, Name des Vermittlers, gewähltes Produkt (gebuchte Produkte,
// Leadformulare, zuletzt genutzte; lib/testlead.ts) mit Formularangaben wie bei einem echten Lead, Policen-Modul.
// Rein in lib/so-arbeitet.ts; Oberfläche components/so-arbeitet.tsx.

import { prisma } from "@/lib/prisma";
import { a, asAnsprache } from "@/lib/ansprache";
import { advisorDisplayName, firmDisplayName } from "@/lib/advisor-name";
import { ansprechpartner } from "@/lib/lead-anrede";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { testLeadAnswers, testLeadProducts } from "@/lib/testlead";
import { assistentMomente, beispielVerlauf, type ChatZeile, type Moment } from "@/lib/so-arbeitet";

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
  const [customer, erst, produkteRoh, who] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, leadAddress: true, ...GESUNDHEIT_FREIGABE_SELECT } }),
    prisma.erstinformation.findUnique({ where: { customerId }, select: { firma: true } }).catch(() => null),
    testLeadProducts(customerId).catch(() => [] as string[]),
    ansprechpartner({ customerId }),
  ]);
  const an = asAnsprache(customer?.leadAddress);
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || advisorDisplayName(customer?.name) || a(an, "dein Berater", "Ihr Berater") });
  const produkte = produkteRoh.length ? produkteRoh : ["Privatschutz"];
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
    now,
  });
  return { momente: assistentMomente(an), zeilen, absender: firma || who.vermittler.name || person.nom, produkte, produkt };
}
